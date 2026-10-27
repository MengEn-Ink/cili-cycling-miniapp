import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseFontMigrationTable, parseMigrationTable } from './check-design.mjs';

const PRODUCT_PATH = /^(?:miniprogram|cloudfunctions)\//;
const APP_WXSS_PATH = 'miniprogram/app.wxss';
const THEME_CONTRACT_PATH = 'miniprogram/config/theme-contract.json';
export const THEME_MAPPING_PATH = 'docs/designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md';
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

function maskComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
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

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function fallbackRanges(source) {
  const ranges = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('var(', cursor);
    if (start === -1) break;
    const end = findClosingParenthesis(source, start + 3);
    if (end === -1) break;
    const bodyStart = start + 4;
    const body = source.slice(bodyStart, end);
    let depth = 0;
    let quote = '';
    for (let index = 0; index < body.length; index += 1) {
      const character = body[index];
      if (quote) {
        if (character === quote && body[index - 1] !== '\\') quote = '';
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      else if (character === ',' && depth === 0) {
        ranges.push([bodyStart + index + 1, end]);
        break;
      }
    }
    cursor = start + 4;
  }
  return ranges;
}

function colorOccurrenceKeys(file, source) {
  const masked = maskComments(source);
  const ranges = fallbackRanges(masked);
  return [...masked.matchAll(COLOR_LITERAL_PATTERN)].map((match) => {
    const type = ranges.some(([start, end]) => match.index >= start && match.index < end)
      ? 'fallback-only'
      : 'direct';
    return `${file}:${lineNumberAt(masked, match.index)}\0${normalizeColor(match[0])}\0${type}`;
  });
}

function mapRowKey(row) {
  return `${row.location}\0${normalizeColor(row.literal)}\0${row.type}`;
}

function multisetsEqual(left, right) {
  const counts = new Map();
  for (const value of left) counts.set(value, (counts.get(value) || 0) + 1);
  for (const value of right) counts.set(value, (counts.get(value) || 0) - 1);
  return [...counts.values()].every((count) => count === 0);
}

function validateMapping(snapshot, changedWxss, headTokens) {
  const markdown = snapshot.headFiles[THEME_MAPPING_PATH];
  if (typeof markdown !== 'string') throw new Error('migration map is missing');
  const rows = parseMigrationTable(markdown);
  const fontRows = parseFontMigrationTable(markdown);
  if (rows.length !== 53 || fontRows.length !== 1) {
    throw new Error('migration map must contain 53 color rows and one font row');
  }

  const numbers = new Set(rows.map((row) => row.number));
  if (numbers.size !== 53 || [...numbers].some((number) => number < 1 || number > 53)) {
    throw new Error('migration map numbers must cover 1..53');
  }
  if (rows.filter((row) => row.type === 'direct').length !== 49) {
    throw new Error('migration map direct count must be 49');
  }
  if (rows.filter((row) => row.type === 'fallback-only').length !== 4) {
    throw new Error('migration map fallback count must be 4');
  }

  const actualOccurrences = changedWxss.flatMap((file) =>
    colorOccurrenceKeys(file, snapshot.baseFiles[file]),
  );
  if (!multisetsEqual(actualOccurrences, rows.map(mapRowKey))) {
    throw new Error('migration map rows do not exactly cover base literals');
  }

  for (const row of rows) {
    const separator = row.location.lastIndexOf(':');
    const file = row.location.slice(0, separator);
    const headSource = snapshot.headFiles[file] || '';
    if (!headSource.includes(`var(${row.token})`)) {
      throw new Error(`migration map token not used at ${row.location}`);
    }
    const tokenValue = headTokens[row.token];
    if (tokenValue === undefined) throw new Error(`migration map token missing: ${row.token}`);
    if (
      normalizeCssWhitespace(normalizeColorLiterals(tokenValue)) !==
      normalizeCssWhitespace(normalizeColorLiterals(row.tokenCurrentValue))
    ) {
      throw new Error(`migration map token value drifted: ${row.token}`);
    }
    if (row.type === 'direct' && normalizeColor(row.literal) !== normalizeColor(tokenValue)) {
      throw new Error(`migration map direct value drifted: ${row.location}`);
    }
  }

  const fontRow = fontRows[0];
  const separator = fontRow.location.lastIndexOf(':');
  const fontFile = fontRow.location.slice(0, separator);
  const fontLine = Number(fontRow.location.slice(separator + 1));
  const baseLine = snapshot.baseFiles[fontFile]?.split('\n')[fontLine - 1] || '';
  const headLine = snapshot.headFiles[fontFile]?.split('\n')[fontLine - 1] || '';
  const fontTokenValue = headTokens[fontRow.token];
  if (
    !baseLine.includes(fontRow.literal) ||
    !headLine.includes(`var(${fontRow.token})`) ||
    fontTokenValue === undefined ||
    normalizeCssWhitespace(fontRow.literal) !== normalizeCssWhitespace(fontTokenValue) ||
    normalizeCssWhitespace(fontRow.tokenCurrentValue) !== normalizeCssWhitespace(fontTokenValue)
  ) {
    throw new Error('font migration map does not exactly match the base and head');
  }
  return { rows, fontRows };
}

function ineligible(reason) {
  return { eligible: false, reason };
}

export function classifyValuePreservingThemeMigration(snapshot) {
  try {
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
    const contract = JSON.parse(snapshot.headFiles[THEME_CONTRACT_PATH]);
    if (contract.schemaVersion !== 2) return ineligible('theme contract schema is not v2');

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

    const changedWxss = productFiles.filter(
      (file) => WXSS_PATH.test(file) && file !== APP_WXSS_PATH,
    );
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

    const { rows } = validateMapping(snapshot, changedWxss, headTokens);
    const mappingTokenNames = new Set(rows.map((row) => row.token));
    const directColorValues = new Set(baseColors);
    for (const name of addedTokenNames) {
      const value = normalizeCssWhitespace(
        normalizeColorLiterals(resolveCssVariables(headTokens[name], headTokens)),
      );
      if (!directColorValues.has(value)) {
        return ineligible(`new token value is not traceable: ${name}`);
      }
      if (!mappingTokenNames.has(name)) return ineligible(`new token is not mapped: ${name}`);
      if (!headWxss.includes(`var(${name})`)) {
        return ineligible(`new token is not consumed: ${name}`);
      }
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
  } catch (error) {
    return ineligible(error instanceof Error ? error.message : String(error));
  }
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function readGitFile(root, base, file) {
  try {
    return execFileSync('git', ['show', `${base}:${file}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return undefined;
  }
}

export function changedContentFilesSinceBase(base, root = process.cwd()) {
  const rawDiff = execFileSync(
    'git',
    ['diff', '--raw', '--no-abbrev', '--no-renames', '-z', base],
    { cwd: root, encoding: 'utf8' },
  );
  return parseContentChangedFiles(rawDiff);
}

export function collectThemeMigrationSnapshot(base, changedFiles, root = process.cwd()) {
  const relevantFiles = new Set([
    ...changedFiles.filter((file) => PRODUCT_PATH.test(file)),
    THEME_MAPPING_PATH,
  ]);
  const baseFiles = {};
  const headFiles = {};
  for (const file of relevantFiles) {
    baseFiles[file] = readGitFile(root, base, file);
    const path = join(root, file);
    headFiles[file] = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  }
  const runtimeThemeContractReferences = git(root, ['ls-files', 'miniprogram'])
    .split('\n')
    .filter(Boolean)
    .filter((file) => file !== THEME_CONTRACT_PATH)
    .filter((file) => /\.(?:js|json|ts|wxml|wxss)$/.test(file))
    .filter((file) => {
      try {
        return readFileSync(join(root, file), 'utf8').includes('theme-contract');
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
