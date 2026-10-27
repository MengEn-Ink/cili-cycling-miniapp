import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PRODUCT_PATH = /^(?:miniprogram|cloudfunctions)\//;
const RELEASE_NOTES_PATH = 'miniprogram/pages/settings/index.ts';
const APP_WXSS_PATH = 'miniprogram/app.wxss';
const THEME_CONTRACT_PATH = 'miniprogram/config/theme-contract.json';
const THEME_MAPPING_PATH = 'docs/designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md';
const WXSS_PATH = /^miniprogram\/.+\.wxss$/;
const COLOR_LITERAL_PATTERN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;

export function parseContentChangedFiles(rawDiff) {
  const fields = rawDiff.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2 !== 0) throw new Error('无法解析 Git raw diff：记录不完整');

  const contentChangedFiles = [];
  for (let index = 0; index < fields.length; index += 2) {
    const metadata = fields[index];
    const file = fields[index + 1];
    const match = metadata.match(/^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) [A-Z]$/);
    if (!match) throw new Error(`无法解析 Git raw diff 元数据：${metadata}`);

    const [, oldMode, newMode, oldHash, newHash] = match;
    const executableModeOnly =
      oldHash === newHash &&
      ((oldMode === '100755' && newMode === '100644') ||
        (oldMode === '100644' && newMode === '100755'));
    if (!executableModeOnly) contentChangedFiles.push(file);
  }

  return contentChangedFiles;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function normalizeHex(value) {
  const digits = value.slice(1).toLowerCase();
  if (digits.length === 3 || digits.length === 4) {
    return `#${[...digits].map((digit) => `${digit}${digit}`).join('')}`;
  }
  return `#${digits}`;
}

function normalizeColor(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return normalizeHex(trimmed);
  return trimmed
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(?<=[:,(])\.(\d+)/g, '0.$1');
}

function normalizeColorLiterals(source) {
  return source.replace(COLOR_LITERAL_PATTERN, (value) => normalizeColor(value));
}

function parseCustomProperties(source) {
  const tokens = {};
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi;
  for (const match of stripComments(source).matchAll(pattern)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

function findClosingParenthesis(source, openingIndex) {
  let depth = 0;
  let quote = '';
  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitVarArguments(source) {
  let depth = 0;
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ',' && depth === 0) {
      return [source.slice(0, index).trim(), source.slice(index + 1).trim()];
    }
  }
  return [source.trim(), undefined];
}

function resolveCssVariables(source, tokens, stack = []) {
  let output = '';
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('var(', cursor);
    if (start === -1) {
      output += source.slice(cursor);
      break;
    }
    output += source.slice(cursor, start);
    const end = findClosingParenthesis(source, start + 3);
    if (end === -1) {
      output += source.slice(start);
      break;
    }
    const original = source.slice(start, end + 1);
    const [name, fallback] = splitVarArguments(source.slice(start + 4, end));
    let replacement = original;
    if (Object.hasOwn(tokens, name) && !stack.includes(name)) {
      replacement = resolveCssVariables(tokens[name], tokens, [...stack, name]);
    } else if (fallback !== undefined) {
      replacement = resolveCssVariables(fallback, tokens, stack);
    }
    output += replacement;
    cursor = end + 1;
  }
  return output;
}

function normalizeCssWhitespace(source) {
  let output = '';
  let quote = '';
  let pendingSpace = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      output += character;
      if (character === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      if (pendingSpace && output && !/[{(:,;>+~]$/.test(output)) output += ' ';
      pendingSpace = false;
      quote = character;
      output += character;
      continue;
    }
    if (/\s/.test(character)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && output && !/[{(:,;>+~]$/.test(output) && !/[}),;>+~]/.test(character)) {
      output += ' ';
    }
    pendingSpace = false;
    output += character;
  }
  return output.trim();
}

function canonicalizeWxss(source, tokens) {
  const withoutComments = stripComments(source);
  const resolved = resolveCssVariables(withoutComments, tokens);
  return normalizeCssWhitespace(normalizeColorLiterals(resolved));
}

function extractColors(source) {
  return [...stripComments(source).matchAll(COLOR_LITERAL_PATTERN)].map((match) =>
    normalizeColor(match[0]),
  );
}

function countFallbackColors(source) {
  const withoutComments = stripComments(source);
  let count = 0;
  let cursor = 0;
  while (cursor < withoutComments.length) {
    const start = withoutComments.indexOf('var(', cursor);
    if (start === -1) break;
    const end = findClosingParenthesis(withoutComments, start + 3);
    if (end === -1) break;
    const [, fallback] = splitVarArguments(withoutComments.slice(start + 4, end));
    if (fallback !== undefined) count += extractColors(fallback).length;
    cursor = end + 1;
  }
  return count;
}

function countLiteralFontFamilies(source) {
  let count = 0;
  const pattern = /font-family\s*:\s*([^;{}]+)/gi;
  for (const match of stripComments(source).matchAll(pattern)) {
    if (!match[1].trim().startsWith('var(')) count += 1;
  }
  return count;
}

function removeAddedTokenDeclarations(source, tokenNames) {
  const names = new Set(tokenNames);
  return source.replace(/^\s*(--[a-z0-9-]+)\s*:\s*[^;{}]+;\s*$/gim, (line, name) =>
    names.has(name) ? '' : line,
  );
}

function ineligible(reason) {
  return { eligible: false, reason };
}

export function classifyValuePreservingThemeMigration(snapshot) {
  const productFiles = snapshot.changedFiles.filter((file) => PRODUCT_PATH.test(file));
  if (
    productFiles.length === 0 ||
    productFiles.some((file) => file !== THEME_CONTRACT_PATH && !WXSS_PATH.test(file))
  ) {
    return ineligible('product path outside the value-preserving theme whitelist');
  }
  if (!productFiles.includes(APP_WXSS_PATH) || !productFiles.includes(THEME_CONTRACT_PATH)) {
    return ineligible('theme migration requires app.wxss and the checker-only contract');
  }
  if ((snapshot.runtimeThemeContractReferences || []).length > 0) {
    return ineligible('theme contract is imported by runtime code');
  }
  if (snapshot.baseFiles[THEME_CONTRACT_PATH] !== undefined) {
    return ineligible('theme contract must be newly added');
  }
  try {
    const contract = JSON.parse(snapshot.headFiles[THEME_CONTRACT_PATH]);
    if (contract.schemaVersion !== 2) return ineligible('theme contract schema is not v2');
  } catch {
    return ineligible('theme contract is not valid JSON');
  }

  const baseApp = snapshot.baseFiles[APP_WXSS_PATH];
  const headApp = snapshot.headFiles[APP_WXSS_PATH];
  if (typeof baseApp !== 'string' || typeof headApp !== 'string') {
    return ineligible('app.wxss must exist at base and head');
  }
  const baseTokens = parseCustomProperties(baseApp);
  const headTokens = parseCustomProperties(headApp);
  const addedTokenNames = Object.keys(headTokens).filter(
    (name) => !Object.hasOwn(baseTokens, name),
  );
  for (const [name, value] of Object.entries(baseTokens)) {
    if (!Object.hasOwn(headTokens, name)) return ineligible(`existing token removed: ${name}`);
    const baseValue = normalizeCssWhitespace(
      normalizeColorLiterals(resolveCssVariables(value, baseTokens)),
    );
    const headValue = normalizeCssWhitespace(
      normalizeColorLiterals(resolveCssVariables(headTokens[name], headTokens)),
    );
    if (baseValue !== headValue) return ineligible(`existing token changed: ${name}`);
  }
  const strippedHeadApp = removeAddedTokenDeclarations(headApp, addedTokenNames);
  if (canonicalizeWxss(baseApp, baseTokens) !== canonicalizeWxss(strippedHeadApp, headTokens)) {
    return ineligible('app.wxss contains changes beyond traceable token additions');
  }

  const changedWxss = productFiles.filter((file) => WXSS_PATH.test(file) && file !== APP_WXSS_PATH);
  const baseColors = [];
  let fallbackCount = 0;
  let fontCount = 0;
  let headColorCount = 0;
  let headFontCount = 0;
  let headWxss = '';
  for (const file of changedWxss) {
    const baseSource = snapshot.baseFiles[file];
    const headSource = snapshot.headFiles[file];
    if (typeof baseSource !== 'string' || typeof headSource !== 'string') {
      return ineligible(`wxss must exist at base and head: ${file}`);
    }
    if (canonicalizeWxss(baseSource, baseTokens) !== canonicalizeWxss(headSource, headTokens)) {
      return ineligible(`computed wxss changed: ${file}`);
    }
    baseColors.push(...extractColors(baseSource));
    fallbackCount += countFallbackColors(baseSource);
    fontCount += countLiteralFontFamilies(baseSource);
    headColorCount += extractColors(headSource).length;
    headFontCount += countLiteralFontFamilies(headSource);
    headWxss += `\n${headSource}`;
  }
  const migratedColorCount = baseColors.length;
  const directCount = migratedColorCount - fallbackCount;
  if (
    migratedColorCount !== 53 ||
    directCount !== 49 ||
    fallbackCount !== 4 ||
    fontCount !== 1 ||
    headColorCount !== 0 ||
    headFontCount !== 0
  ) {
    return ineligible('migration counts do not match the frozen 53 + 1 contract');
  }

  const directColorValues = new Set(baseColors.slice(0));
  for (const name of addedTokenNames) {
    const value = normalizeCssWhitespace(
      normalizeColorLiterals(resolveCssVariables(headTokens[name], headTokens)),
    );
    if (!directColorValues.has(value))
      return ineligible(`new token value is not traceable: ${name}`);
    if (!headWxss.includes(`var(${name})`)) return ineligible(`new token is not consumed: ${name}`);
  }

  return {
    eligible: true,
    base: snapshot.base,
    mappingPath: THEME_MAPPING_PATH,
    migratedColorCount,
    directCount,
    fallbackCount,
    fontCount,
  };
}

export function validateReleaseNotes(changedFiles, source, options = {}) {
  const productFiles = changedFiles.filter(
    (file) => PRODUCT_PATH.test(file) && file !== RELEASE_NOTES_PATH,
  );

  if (productFiles.length === 0) return { required: false, productFiles };
  if (!changedFiles.includes(RELEASE_NOTES_PATH)) {
    if (options.themeMigration?.eligible) {
      return {
        required: false,
        productFiles,
        exemption: options.themeMigration,
      };
    }
    throw new Error(
      `检测到产品代码改动，但未更新 ${RELEASE_NOTES_PATH}：\n${productFiles.join('\n')}`,
    );
  }

  const latestMatches = source.match(/latest:\s*true/g) || [];
  if (latestMatches.length !== 1) {
    throw new Error('App 更新必须且只能有一条 latest: true');
  }

  if (!/version:\s*CLIENT_RELEASE_VERSION/.test(source)) {
    throw new Error('App 更新首条版本必须使用 CLIENT_RELEASE_VERSION');
  }
  if (!/currentRelease:\s*RELEASE_NOTES\[0\]/.test(source)) {
    throw new Error('设置页必须只展示当前版本的 App 更新');
  }

  const firstEntry = source.match(/const RELEASE_NOTES\s*=\s*\[\s*\{([\s\S]*?)\n\s*\},/);
  if (!firstEntry?.[1].includes('version: CLIENT_RELEASE_VERSION')) {
    throw new Error('App 更新首条版本必须使用 CLIENT_RELEASE_VERSION');
  }
  if (!firstEntry[1].includes('latest: true')) {
    throw new Error('App 更新的当前版本必须标记为 latest: true');
  }

  return { required: true, productFiles };
}

export function formatReleaseNotesResult(result) {
  if (result.exemption?.eligible) {
    const evidence = result.exemption;
    return [
      'App 更新保值迁移豁免通过：',
      `base=${evidence.base.slice(0, 8)}`,
      `map=${evidence.mappingPath}`,
      `colors=${evidence.migratedColorCount}`,
      `direct=${evidence.directCount}`,
      `fallback=${evidence.fallbackCount}`,
      `font=${evidence.fontCount}`,
    ].join(' ');
  }
  return result.required
    ? `App 更新校验通过：${result.productFiles.length} 个产品文件已记录`
    : 'App 更新校验通过：本次无产品代码改动';
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function resolveBase() {
  if (process.env.RELEASE_NOTES_BASE) return process.env.RELEASE_NOTES_BASE;

  try {
    return git(['merge-base', 'HEAD', 'origin/main']);
  } catch {
    return 'HEAD';
  }
}

function readGitFile(base, file) {
  try {
    return execFileSync('git', ['show', `${base}:${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return undefined;
  }
}

function collectThemeMigrationSnapshot(base, changedFiles) {
  const productFiles = changedFiles.filter((file) => PRODUCT_PATH.test(file));
  const baseFiles = {};
  const headFiles = {};
  for (const file of productFiles) {
    baseFiles[file] = readGitFile(base, file);
    headFiles[file] = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  }
  const runtimeThemeContractReferences = git(['ls-files', 'miniprogram'])
    .split('\n')
    .filter(Boolean)
    .filter((file) => file !== THEME_CONTRACT_PATH)
    .filter((file) => /\.(?:js|json|ts|wxml|wxss)$/.test(file))
    .filter((file) => {
      try {
        return readFileSync(file, 'utf8').includes('theme-contract');
      } catch {
        return false;
      }
    });
  return {
    base,
    changedFiles,
    baseFiles,
    headFiles,
    runtimeThemeContractReferences,
  };
}

export function run() {
  const base = resolveBase();
  const rawDiff = execFileSync(
    'git',
    ['diff', '--raw', '--no-abbrev', '--no-renames', '-z', base],
    { encoding: 'utf8' },
  );
  const changedFiles = parseContentChangedFiles(rawDiff);
  const source = readFileSync(RELEASE_NOTES_PATH, 'utf8');
  const themeMigration = classifyValuePreservingThemeMigration(
    collectThemeMigrationSnapshot(base, changedFiles),
  );
  const result = validateReleaseNotes(changedFiles, source, { themeMigration });

  console.log(formatReleaseNotesResult(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
