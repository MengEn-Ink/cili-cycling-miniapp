#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const COLOR_LITERAL_PATTERN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const FONT_DECLARATION_PATTERN = /font-family\s*:\s*([^;]+);/g;
const TOKEN_PATTERN = /((--[\w-]+)\s*:\s*([^;]+);)/g;
const TOKEN_REFERENCE_PATTERN = /var\(\s*(--[\w-]+)/g;
const DEFAULT_ALLOWED_LITERAL_FILES = new Set(['miniprogram/app.wxss']);
/** Fill/border tokens stay on the brand red; small text must use --color-brand-text. */
export const LEGACY_BRAND_TEXT_TOKENS = new Set([
  '--color-brand',
  '--color-brand-fill',
  '--color-brand-active',
  '--color-action',
  '--color-action-active',
]);
const COLOR_DECLARATION_PATTERN = /(?<![-\w])color\s*:\s*var\(\s*(--[\w-]+)\s*\)/g;

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function normalizeValue(value) {
  const normalized = String(value).trim();
  if (/^#[0-9a-fA-F]+$/.test(normalized)) {
    const lower = normalized.toLowerCase();
    return lower === '#fff' ? '#ffffff' : lower;
  }
  return normalized;
}

function normalizeFontValue(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function stripCode(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('`') && trimmed.endsWith('`')) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function locate(source, index) {
  const before = source.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function tokenValue(tokens, name) {
  if (tokens instanceof Map) return tokens.get(name);
  return tokens[name];
}

export function resolvedTokenValue(tokens, name, stack = []) {
  if (stack.includes(name)) {
    throw new Error(`CSS token cycle: ${[...stack, name].join(' -> ')}`);
  }
  const value = tokenValue(tokens, name);
  if (value === undefined) return undefined;
  const reference = String(value)
    .trim()
    .match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!reference) return normalizeValue(value);
  return resolvedTokenValue(tokens, reference[1], [...stack, name]);
}

function assertEqual(errors, label, actual, expected) {
  if (normalizeValue(actual) !== normalizeValue(expected)) {
    errors.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

const STRING_MAP_PATTERN = /(?:(['"])([^'"]+)\1|([\w-]+))\s*:\s*(['"])([^'"]*)\4/g;
const RAW_MAP_PATTERN = /([\w]+)\s*:\s*([^,\n]+),?/g;
const TEXT_STYLE_COLORS = { white: '#ffffff', black: '#000000' };
const APPEARANCE_SECTIONS = ['navigation', 'tabBar', 'background'];

function stripLineComments(source) {
  return source.replace(/\/\/[^\n]*/g, '');
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('unterminated object literal');
}

function objectBody(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error(`missing ${marker.trim()} object`);
  const open = source.indexOf('{', markerIndex);
  if (open === -1) throw new Error(`missing ${marker.trim()} opening brace`);
  return source.slice(open + 1, findMatchingBrace(source, open));
}

export function parseStringMap(source) {
  const entries = {};
  for (const match of stripLineComments(source).matchAll(STRING_MAP_PATTERN)) {
    entries[match[2] || match[3]] = normalizeValue(match[5]);
  }
  return entries;
}

function parseThemeMap(source, colors) {
  const entries = {};
  for (const match of stripLineComments(source).matchAll(RAW_MAP_PATTERN)) {
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    const reference = value.match(/^THEME_COLORS\.([\w]+)$/);
    if (reference) {
      if (colors[reference[1]] === undefined) {
        throw new Error(`theme.ts: unresolved THEME_COLORS.${reference[1]}`);
      }
      entries[key] = colors[reference[1]];
      continue;
    }
    const literal = value.match(/^['"]([^'"]+)['"]$/);
    if (!literal) throw new Error(`theme.ts: unsupported appearance value ${value}`);
    entries[key] = normalizeValue(literal[1]);
  }
  return entries;
}

function parseThemeColors(themeSource) {
  const block = themeSource.match(/THEME_COLORS\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (!block) throw new Error('theme.ts: missing THEME_COLORS');
  const colors = {};
  for (const match of block[1].matchAll(/([\w]+)\s*:\s*['"]([^'"]+)['"]/g)) {
    colors[match[1]] = normalizeValue(match[2]);
  }
  return colors;
}

export function parseThemeAppearance(themeSource) {
  const colors = parseThemeColors(themeSource);
  const body = objectBody(themeSource, 'APP_APPEARANCE =');
  const native = {};
  for (const section of APPEARANCE_SECTIONS) {
    native[section] = parseThemeMap(objectBody(body, `${section}:`), colors);
  }
  return { colors, native };
}

/** Runtime appearance tokens and the light-mode native configuration. */
export function parseAppearanceSource(source) {
  const common = parseStringMap(objectBody(source, 'const common ='));
  const tokensBody = objectBody(source, 'APPEARANCE_TOKENS =');
  const tokens = {
    dark: { ...common, ...parseStringMap(objectBody(tokensBody, 'dark:')) },
    light: { ...common, ...parseStringMap(objectBody(tokensBody, 'light:')) },
  };
  const lightBody = objectBody(source, 'LIGHT_APPEARANCE =');
  const native = {};
  for (const section of APPEARANCE_SECTIONS) {
    native[section] = parseStringMap(objectBody(lightBody, `${section}:`));
  }
  return { tokens, native };
}

function parseRuntimeTabBar(themeSource) {
  const colors = parseThemeColors(themeSource);
  const body = objectBody(themeSource, 'APP_APPEARANCE =');
  return parseThemeMap(objectBody(body, 'tabBar:'), colors);
}

function registeredPagePaths(appJson) {
  const pages = [...(appJson.pages || [])];
  for (const subpackage of appJson.subpackages || []) {
    for (const page of subpackage.pages || []) pages.push(`${subpackage.root}/${page}`);
  }
  return pages;
}

function collectFilesRecursively(root, suffix) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(entry.parentPath || entry.path || root, entry.name))
    .sort();
}

export function parseWxssTokens(source) {
  const pageBlock = source.match(/page\s*\{([\s\S]*?)\}/);
  if (!pageBlock) return {};
  const tokens = {};
  for (const match of pageBlock[1].matchAll(TOKEN_PATTERN)) {
    if (Object.prototype.hasOwnProperty.call(tokens, match[2])) {
      throw new Error(`duplicate root token: ${match[2]}`);
    }
    tokens[match[2]] = normalizeValue(match[3]);
  }
  return tokens;
}

function declaredTokenNames(source) {
  return new Set([...source.matchAll(TOKEN_PATTERN)].map((match) => match[2]));
}

export function collectTokenReferenceIssues(entries, globalTokens) {
  const globals = new Set(Object.keys(globalTokens));
  const issues = [];
  for (const [rawPath, source] of entries) {
    const path = normalizePath(rawPath);
    const localTokens = declaredTokenNames(source);
    for (const match of source.matchAll(TOKEN_REFERENCE_PATTERN)) {
      const token = match[1];
      if (globals.has(token) || localTokens.has(token)) continue;
      issues.push({ path, token, ...locate(source, match.index) });
    }
  }
  return issues;
}

function architectureComponentTokens(componentGroups) {
  return (componentGroups || []).flatMap((group) => [
    ...(group.tokens || []),
    ...Object.values(group.states || {}).flat(),
  ]);
}

export function validateTokenArchitecture({ architecture, tokens, styleEntries, documentText }) {
  const errors = [];
  if (!architecture?.document) errors.push('token architecture: document is required');

  const requiredTokens = [
    ...(architecture?.primitive || []),
    ...(architecture?.semantic || []),
    ...architectureComponentTokens(architecture?.components),
  ];
  const seen = new Set();
  for (const token of requiredTokens) {
    if (seen.has(token)) errors.push(`token architecture: duplicate required token ${token}`);
    seen.add(token);
    if (tokenValue(tokens, token) === undefined) {
      errors.push(`token architecture: missing ${token}`);
      continue;
    }
    try {
      if (resolvedTokenValue(tokens, token) === undefined) {
        errors.push(`token architecture: unresolved ${token}`);
      }
    } catch (error) {
      errors.push(`token architecture: ${error.message}`);
    }
  }

  const styleText = (styleEntries || []).map(([, source]) => source).join('\n');
  for (const token of architectureComponentTokens(architecture?.components)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`var\\(\\s*${escaped}(?:\\s*[,)]|\\s*$)`).test(styleText)) {
      errors.push(`token architecture: component token is not consumed ${token}`);
    }
  }

  for (const match of String(documentText || '').matchAll(TOKEN_REFERENCE_PATTERN)) {
    const token = match[1];
    if (tokenValue(tokens, token) === undefined) {
      errors.push(`design document: undefined token ${token}`);
      continue;
    }
    try {
      resolvedTokenValue(tokens, token);
    } catch (error) {
      errors.push(`design document: ${error.message}`);
    }
  }

  if (errors.length) throw new Error(errors.join('\n'));
}

/**
 * Brand red used as a text color fails 4.5:1 in light mode. Only the dedicated
 * text token may be used for `color:`; borders, fills and gradients keep the
 * legacy tokens under the 3:1 non-text rule.
 */
export function collectBrandTextTokenViolations(entries) {
  const issues = [];
  for (const [rawPath, source] of entries) {
    const path = normalizePath(rawPath);
    for (const match of source.matchAll(COLOR_DECLARATION_PATTERN)) {
      if (!LEGACY_BRAND_TEXT_TOKENS.has(match[1])) continue;
      issues.push({ path, token: match[1], ...locate(source, match.index) });
    }
  }
  return issues;
}

export function collectStyleLiteralViolations(
  entries,
  allowedLiteralFiles = DEFAULT_ALLOWED_LITERAL_FILES,
) {
  const allowed =
    allowedLiteralFiles instanceof Set ? allowedLiteralFiles : new Set(allowedLiteralFiles);
  const issues = [];
  for (const [rawPath, source] of entries) {
    const path = normalizePath(rawPath);
    if (allowed.has(path)) continue;
    for (const match of source.matchAll(COLOR_LITERAL_PATTERN)) {
      const position = locate(source, match.index);
      issues.push({
        path,
        kind: 'color',
        literal: match[0],
        ...position,
      });
    }
    for (const match of source.matchAll(FONT_DECLARATION_PATTERN)) {
      if (/\bvar\s*\(/.test(match[1])) continue;
      const position = locate(source, match.index);
      issues.push({
        path,
        kind: 'font-family',
        literal: match[1].trim(),
        ...position,
      });
    }
  }
  return issues;
}

export function parseMigrationTable(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(stripCode);
    if (cells.length !== 6 || !/^\d+$/.test(cells[0])) continue;
    rows.push({
      number: Number(cells[0]),
      location: cells[1],
      literal: cells[2],
      type: cells[3],
      token: cells[4],
      tokenCurrentValue: normalizeValue(cells[5]),
    });
  }
  return rows;
}

export function parseFontMigrationTable(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(stripCode);
    if (cells.length !== 4 || !/^miniprogram\/.+:\d+$/.test(cells[0])) continue;
    rows.push({
      location: cells[0],
      literal: cells[1],
      token: cells[2],
      tokenCurrentValue: cells[3],
    });
  }
  return rows;
}

export function validateMigrationRows(
  rows,
  tokens,
  { requireCurrentTokens = true, requireCurrentTokenValues = true } = {},
) {
  const errors = [];
  const numbers = new Set(rows.map((row) => row.number));
  const directRows = rows.filter((row) => row.type === 'direct');
  const fallbackRows = rows.filter((row) => row.type === 'fallback-only');
  if (rows.length !== 53) errors.push(`迁移表必须恰好 53 行，实际 ${rows.length}`);
  if (numbers.size !== rows.length) errors.push('迁移表编号必须唯一');
  if ([...numbers].some((number) => number < 1 || number > 53))
    errors.push('迁移表编号必须覆盖 1..53');
  if (directRows.length !== 49)
    errors.push(`迁移表必须恰好 49 行 direct，实际 ${directRows.length}`);
  if (fallbackRows.length !== 4)
    errors.push(`迁移表必须恰好 4 行 fallback-only，实际 ${fallbackRows.length}`);

  for (const row of rows) {
    const currentTokenValue = tokenValue(tokens, row.token);
    if (requireCurrentTokens && currentTokenValue === undefined) {
      errors.push(
        `${row.location}: ${row.type === 'fallback-only' ? 'fallback' : 'direct'} token ${row.token} 不存在`,
      );
    }
    if (
      currentTokenValue !== undefined &&
      requireCurrentTokenValues &&
      normalizeValue(currentTokenValue) !== normalizeValue(row.tokenCurrentValue)
    ) {
      errors.push(
        `${row.location}: token ${row.token} 保值失败，映射为 ${row.tokenCurrentValue}，实际为 ${currentTokenValue}`,
      );
    }
    if (
      row.type === 'direct' &&
      normalizeValue(row.literal) !== normalizeValue(row.tokenCurrentValue)
    ) {
      errors.push(
        `${row.location}: 历史 direct 字面量 ${row.literal} 与账本值 ${row.tokenCurrentValue} 不一致`,
      );
    }
    if (!['direct', 'fallback-only'].includes(row.type)) {
      errors.push(`${row.location}: 未知迁移类型 ${row.type}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

export function validateFontContract(rows, fonts, tokens) {
  const errors = [];
  if (rows.length !== 1) errors.push(`字体映射必须恰好 1 行，实际 ${rows.length}`);
  for (const [role, definition] of Object.entries(fonts || {})) {
    const actual = tokenValue(tokens, definition.token);
    if (actual === undefined) {
      errors.push(`字体保值失败：${role} token ${definition.token} 不存在`);
    } else if (normalizeFontValue(actual) !== normalizeFontValue(definition.value)) {
      errors.push(
        `字体保值失败：${role} ${definition.token} 期望 ${definition.value}，实际 ${actual}`,
      );
    }
  }
  if (rows.length === 1) {
    const row = rows[0];
    const editorialToken = fonts?.editorial?.token;
    const actual = tokenValue(tokens, row.token);
    if (row.token !== editorialToken) {
      errors.push(`字体映射必须指向 ${editorialToken}，实际 ${row.token}`);
    }
    if (
      actual === undefined ||
      normalizeFontValue(row.literal) !== normalizeFontValue(actual) ||
      normalizeFontValue(row.tokenCurrentValue) !== normalizeFontValue(actual)
    ) {
      errors.push(
        `${row.location}: 字体保值失败，${row.literal} → ${row.token}=${actual ?? 'missing'}`,
      );
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

export function validateContractSnapshot({
  contract,
  appJson,
  pageJsons,
  themeSource,
  appearanceSource,
  tokens,
}) {
  const errors = [];
  if (![2, 3, 4, 5].includes(contract.schemaVersion)) {
    errors.push('contract: schemaVersion must be 2, 3, 4 or 5');
  }
  if (contract.schemaVersion >= 5 && !contract.native?.lightRuntimeTabBar) {
    errors.push('contract: schema v5 requires native.lightRuntimeTabBar');
  }

  for (const [key, expected] of Object.entries(contract.native.appWindow || {})) {
    assertEqual(errors, `app.json window.${key}`, appJson.window?.[key], expected);
  }
  for (const [key, expected] of Object.entries(contract.native.appTabBar || {})) {
    assertEqual(errors, `app.json tabBar.${key}`, appJson.tabBar?.[key], expected);
  }
  for (const [path, pageJson] of pageJsons || []) {
    for (const [key, expected] of Object.entries(contract.native.page || {})) {
      assertEqual(errors, `${path} ${key}`, pageJson[key], expected);
    }
  }

  let themeColors = {};
  let runtimeTabBar = {};
  try {
    themeColors = parseThemeColors(themeSource);
    runtimeTabBar = parseRuntimeTabBar(themeSource);
  } catch (error) {
    errors.push(error.message);
  }
  for (const [key, expected] of Object.entries(contract.native.runtimeTabBar || {})) {
    assertEqual(errors, `theme.ts runtime tabBar.${key}`, runtimeTabBar[key], expected);
  }
  if (contract.native?.lightRuntimeTabBar) {
    if (typeof appearanceSource !== 'string') {
      errors.push('contract: appearance.ts source is required for the light tabBar snapshot');
    } else {
      let lightTabBar = {};
      try {
        lightTabBar = parseAppearanceSource(appearanceSource).native.tabBar;
      } catch (error) {
        errors.push(error.message);
      }
      for (const [key, expected] of Object.entries(contract.native.lightRuntimeTabBar)) {
        assertEqual(errors, `appearance.ts light tabBar.${key}`, lightTabBar[key], expected);
      }
    }
  }
  for (const binding of contract.equivalentRoles || []) {
    const themeValue = themeColors[binding.themeTs];
    let wxssValue;
    try {
      wxssValue = resolvedTokenValue(tokens, binding.wxss);
    } catch (error) {
      errors.push(error.message);
      continue;
    }
    assertEqual(errors, `theme.ts ${binding.role}`, themeValue, wxssValue);
  }

  const appSelectedColor = contract.native.appTabBar?.selectedColor;
  const runtimeSelectedColor = contract.native.runtimeTabBar?.selectedColor;
  const selectedDifference = (contract.sourceSpecificDifferences || []).find(
    (item) => item.role === 'selectedColor',
  );
  const hasSelectedColorDifference =
    normalizeValue(appSelectedColor) !== normalizeValue(runtimeSelectedColor);
  if (hasSelectedColorDifference && !selectedDifference?.reason) {
    errors.push('contract: selectedColor source-specific difference requires a reason');
  }
  if (!hasSelectedColorDifference && selectedDifference) {
    errors.push('contract: selectedColor source-specific difference is stale');
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

export function validateDocumentedScripts(documentText, scripts) {
  const issues = [];
  const commands = new Set(
    [...documentText.matchAll(/npm\s+run\s+([\w:-]+)/g)].map((match) => match[1]),
  );
  for (const command of [...commands].sort()) {
    if (!scripts[command]) issues.push(`npm run ${command}: missing package script`);
  }
  return issues;
}

export function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const normalized = normalizeValue(hex);
    if (!/^#[0-9a-f]{6}$/.test(normalized)) {
      throw new Error(`contrast requires six-digit hex, got ${hex}`);
    }
    const channels = [1, 3, 5].map((offset) =>
      Number.parseInt(normalized.slice(offset, offset + 2), 16),
    );
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(4));
}

function resolveContrastReference(reference, context) {
  if (typeof reference !== 'string') {
    throw new Error(`invalid contrast reference ${reference}`);
  }
  if (reference.startsWith('--')) {
    const value = resolvedTokenValue(context.tokens, reference);
    if (value === undefined) throw new Error(`undefined appearance token ${reference}`);
    return normalizeValue(value);
  }
  const parts = reference.split('.');
  if (parts.length !== 3 || !['native', 'appJson'].includes(parts[0])) {
    throw new Error(`unsupported contrast reference ${reference}`);
  }
  const source = parts[0] === 'native' ? context.native : context.appJson;
  const value = source?.[parts[1]]?.[parts[2]];
  if (value === undefined) throw new Error(`missing contrast reference ${reference}`);
  return TEXT_STYLE_COLORS[value] || normalizeValue(value);
}

export function appearanceContrastPairCount(contract) {
  const config = contract?.appearanceContrast;
  if (!config) return 0;
  return (
    2 * ((config.tokenPairs || []).length + (config.runtimeNativePairs || []).length) +
    (config.startupNativePairs || []).length
  );
}

/**
 * Check the runtime appearance overlays and the native navigation/tab bars in
 * dark, light and startup states. Static root tokens alone cannot catch a
 * light-mode TabBar selected color that fails the documented 4.5:1 rule.
 */
export function collectAppearanceContrastIssues({
  contract,
  appJson,
  themeSource,
  appearanceSource,
}) {
  const config = contract?.appearanceContrast;
  if (!config) return ['appearance contrast: contract section missing'];
  const issues = [];
  for (const mode of ['dark', 'light', 'startup']) {
    if (!(config.requiredModes || []).includes(mode)) {
      issues.push(`appearance contrast: requiredModes must declare ${mode}`);
    }
  }
  if (typeof appearanceSource !== 'string') {
    issues.push('appearance contrast: appearance.ts source is required');
  }
  if (typeof themeSource !== 'string') {
    issues.push('appearance contrast: theme.ts source is required');
  }
  if (issues.length) return issues;

  let appearance;
  let theme;
  try {
    appearance = parseAppearanceSource(appearanceSource);
  } catch (error) {
    return [`appearance contrast: ${error.message}`];
  }
  try {
    theme = parseThemeAppearance(themeSource);
  } catch (error) {
    return [`appearance contrast: ${error.message}`];
  }

  const contexts = {
    dark: { tokens: appearance.tokens.dark, native: theme.native, appJson },
    light: { tokens: appearance.tokens.light, native: appearance.native, appJson },
    startup: { tokens: {}, native: {}, appJson },
  };
  const groups = [
    ...['dark', 'light'].flatMap((mode) => [
      ...(config.tokenPairs || []).map((pair) => ({ ...pair, mode })),
      ...(config.runtimeNativePairs || []).map((pair) => ({ ...pair, mode })),
    ]),
    ...(config.startupNativePairs || []).map((pair) => ({ ...pair, mode: 'startup' })),
  ];
  if (!groups.length) issues.push('appearance contrast: no pairs declared');

  const seen = new Set();
  const foregrounds = new Set();
  for (const pair of groups) {
    const label = `${pair.mode}/${pair.name}`;
    if (seen.has(label)) issues.push(`appearance contrast: duplicate pair ${label}`);
    seen.add(label);
    foregrounds.add(pair.foreground);
    const minimum = config.minimums?.[pair.minimum];
    if (typeof minimum !== 'number') {
      issues.push(`appearance contrast: ${label} has unknown minimum ${pair.minimum}`);
      continue;
    }
    try {
      const context = contexts[pair.mode];
      if (!context) throw new Error(`unknown mode ${pair.mode}`);
      const foreground = resolveContrastReference(pair.foreground, context);
      const background = resolveContrastReference(pair.background, context);
      const ratio = contrastRatio(foreground, background);
      if (ratio < minimum) {
        issues.push(
          `appearance contrast: ${label} ${ratio}:1 below ${minimum} for ${foreground}/${background}`,
        );
      }
    } catch (error) {
      issues.push(`appearance contrast: ${label} ${error.message}`);
    }
  }
  for (const reference of config.requiredForegrounds || []) {
    if (!foregrounds.has(reference)) {
      issues.push(`appearance contrast: required foreground is not checked ${reference}`);
    }
  }
  return issues;
}

function loadRepositorySnapshot(root, contract) {
  const source = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
  const appJson = readJson(join(root, contract.sources.appJson));
  const pageJsons = registeredPagePaths(appJson).map((pagePath) => {
    const jsonPath = `miniprogram/${pagePath}.json`;
    return [jsonPath, readJson(join(root, jsonPath))];
  });
  return {
    appJson,
    pageJsons,
    themeSource: source(contract.sources.themeTs),
    appearanceSource: source(contract.sources.appearanceTs),
    tokens: parseWxssTokens(source(contract.sources.wxss)),
  };
}

export function runRepositoryCheck(root = process.cwd()) {
  const contractPath = join(root, 'miniprogram/config/theme-contract.json');
  if (!existsSync(contractPath))
    throw new Error('theme contract missing: miniprogram/config/theme-contract.json');
  const contract = readJson(contractPath);
  if (contract.schemaVersion >= 5 && !contract.appearanceContrast) {
    throw new Error('contract: schema v5 requires appearanceContrast');
  }
  const mappingPath = join(root, contract.sources.migrationMap);
  if (!existsSync(mappingPath))
    throw new Error(`migration map missing: ${contract.sources.migrationMap}`);

  const snapshot = loadRepositorySnapshot(root, contract);
  validateContractSnapshot({ contract, ...snapshot });

  const mappingMarkdown = readFileSync(mappingPath, 'utf8');
  const rows = parseMigrationTable(mappingMarkdown);
  const fontRows = parseFontMigrationTable(mappingMarkdown);
  validateFontContract(fontRows, contract.fonts, snapshot.tokens);
  const miniprogramRoot = join(root, 'miniprogram');
  const styleEntries = collectFilesRecursively(miniprogramRoot, '.wxss').map((path) => [
    normalizePath(relative(root, path)),
    readFileSync(path, 'utf8'),
  ]);
  const tokenReferenceIssues = collectTokenReferenceIssues(styleEntries, snapshot.tokens);
  const brandTextIssues = collectBrandTextTokenViolations(styleEntries);
  const designDocumentPath = contract.tokenArchitecture?.document;
  if (!designDocumentPath) throw new Error('token architecture document missing from contract');
  const absoluteDesignDocumentPath = join(root, designDocumentPath);
  if (!existsSync(absoluteDesignDocumentPath)) {
    throw new Error(`design document missing: ${designDocumentPath}`);
  }
  validateTokenArchitecture({
    architecture: contract.tokenArchitecture,
    tokens: snapshot.tokens,
    styleEntries,
    documentText: readFileSync(absoluteDesignDocumentPath, 'utf8'),
  });
  const literalIssues = collectStyleLiteralViolations(
    styleEntries,
    new Set(contract.literalPolicy.allowedWxssLiteralFiles),
  );
  const colorIssues = literalIssues.filter((issue) => issue.kind === 'color');
  const fontIssues = literalIssues.filter((issue) => issue.kind === 'font-family');

  const migrationTokens = { ...snapshot.tokens };
  if (literalIssues.length) {
    for (const row of rows) {
      if (row.type === 'direct' && migrationTokens[row.token] === undefined) {
        migrationTokens[row.token] = row.tokenCurrentValue;
      }
    }
  }
  const migrationLedgerMode = contract.literalPolicy.migrationLedgerMode || 'frozen';
  if (!['frozen', 'historical'].includes(migrationLedgerMode)) {
    throw new Error(`unknown migration ledger mode: ${migrationLedgerMode}`);
  }
  validateMigrationRows(rows, migrationTokens, {
    requireCurrentTokens: migrationLedgerMode === 'frozen',
    requireCurrentTokenValues: migrationLedgerMode === 'frozen',
  });

  const packageJson = readJson(join(root, 'package.json'));
  const documentedText = [
    readFileSync(join(root, 'README.md'), 'utf8'),
    readFileSync(join(root, 'docs/verification/wechat-devtools-e2e.md'), 'utf8'),
  ].join('\n');
  const packageScripts = packageJson.scripts || {};
  const designScriptsWired = ['test:design', 'check:design'].every(
    (script) => packageScripts[script],
  );
  const scriptIssues = designScriptsWired
    ? validateDocumentedScripts(documentedText, packageScripts)
    : [];

  const contrastIssues = [];
  for (const pair of contract.contrastPairs || []) {
    try {
      const foreground = resolvedTokenValue(snapshot.tokens, pair.foreground);
      const background = resolvedTokenValue(snapshot.tokens, pair.background);
      if (contrastRatio(foreground, background) < pair.minimum) {
        contrastIssues.push(
          `${pair.name}: contrast below ${pair.minimum} for ${pair.foreground}/${pair.background}`,
        );
      }
    } catch (error) {
      contrastIssues.push(`${pair.name}: ${error.message}`);
    }
  }
  contrastIssues.push(...collectAppearanceContrastIssues({ contract, ...snapshot }));

  if (
    literalIssues.length ||
    tokenReferenceIssues.length ||
    brandTextIssues.length ||
    scriptIssues.length ||
    contrastIssues.length
  ) {
    const issueLines = literalIssues
      .map(
        (issue) =>
          `${issue.path}:${issue.line}:${issue.column} ${issue.kind} literal ${issue.literal}`,
      )
      .sort();
    const tokenIssueLines = tokenReferenceIssues
      .map((issue) => `${issue.path}:${issue.line}:${issue.column} undefined token ${issue.token}`)
      .sort();
    const brandTextIssueLines = brandTextIssues
      .map(
        (issue) =>
          `${issue.path}:${issue.line}:${issue.column} brand text must use --color-brand-text, got ${issue.token}`,
      )
      .sort();
    throw new Error(
      [
        `design contract failed: ${colorIssues.length} color literals, ${fontIssues.length} font-family literals, ${brandTextIssues.length} legacy brand text colors`,
        ...issueLines,
        ...tokenIssueLines,
        ...brandTextIssueLines,
        ...scriptIssues.sort(),
        ...contrastIssues.sort(),
      ].join('\n'),
    );
  }

  return {
    colorLiteralCount: 0,
    fontLiteralCount: 0,
    brandTextViolations: 0,
    migrationRows: rows.length,
    nativePageConfigs: snapshot.pageJsons.length,
    requiredComponentTokens: architectureComponentTokens(contract.tokenArchitecture.components)
      .length,
    appearanceContrastPairs: appearanceContrastPairCount(contract),
  };
}

function runCli() {
  try {
    const result = runRepositoryCheck();
    console.log(
      `设计契约校验通过：${result.migrationRows} 条历史颜色迁移账本、${result.nativePageConfigs} 个页面原生配置、${result.requiredComponentTokens} 个核心组件 token、${result.appearanceContrastPairs} 组浅暗/启动态对比度、0 个未定义 token、0 个页面颜色/字体字面量`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();
