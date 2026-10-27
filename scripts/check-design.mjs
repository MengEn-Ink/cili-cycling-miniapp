#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const COLOR_LITERAL_PATTERN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const FONT_DECLARATION_PATTERN = /font-family\s*:\s*([^;]+);/g;
const TOKEN_PATTERN = /((--[\w-]+)\s*:\s*([^;]+);)/g;
const DEFAULT_ALLOWED_LITERAL_FILES = new Set(['miniprogram/app.wxss']);

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

function assertEqual(errors, label, actual, expected) {
  if (normalizeValue(actual) !== normalizeValue(expected)) {
    errors.push(`${label}: expected ${expected}, got ${actual}`);
  }
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

function parseRuntimeTabBar(themeSource, colors) {
  const block = themeSource.match(/tabBar\s*:\s*\{([\s\S]*?)\n\s*\},/);
  if (!block) throw new Error('theme.ts: missing APP_APPEARANCE.tabBar');
  const tabBar = {};
  for (const match of block[1].matchAll(/([\w]+)\s*:\s*([^,\n]+),?/g)) {
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    const themeReference = value.match(/^THEME_COLORS\.([\w]+)$/);
    if (themeReference) tabBar[key] = colors[themeReference[1]];
    else {
      const literal = value.match(/^['"]([^'"]+)['"]$/);
      if (literal) tabBar[key] = normalizeValue(literal[1]);
    }
  }
  return tabBar;
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
    tokens[match[2]] = normalizeValue(match[3]);
  }
  return tokens;
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

export function validateMigrationRows(rows, tokens) {
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
    if (currentTokenValue === undefined) {
      errors.push(
        `${row.location}: ${row.type === 'fallback-only' ? 'fallback' : 'direct'} token ${row.token} 不存在`,
      );
      continue;
    }
    if (normalizeValue(currentTokenValue) !== normalizeValue(row.tokenCurrentValue)) {
      errors.push(
        `${row.location}: token ${row.token} 保值失败，映射为 ${row.tokenCurrentValue}，实际为 ${currentTokenValue}`,
      );
    }
    if (
      row.type === 'direct' &&
      normalizeValue(row.literal) !== normalizeValue(currentTokenValue)
    ) {
      errors.push(
        `${row.location}: direct 字面量 ${row.literal} 与 ${row.token}=${currentTokenValue} 不保值`,
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

export function validateContractSnapshot({ contract, appJson, pageJsons, themeSource, tokens }) {
  const errors = [];
  if (contract.schemaVersion !== 2) errors.push('contract: schemaVersion must be 2');

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
    runtimeTabBar = parseRuntimeTabBar(themeSource, themeColors);
  } catch (error) {
    errors.push(error.message);
  }
  for (const [key, expected] of Object.entries(contract.native.runtimeTabBar || {})) {
    assertEqual(errors, `theme.ts runtime tabBar.${key}`, runtimeTabBar[key], expected);
  }
  for (const binding of contract.equivalentRoles || []) {
    const themeValue = themeColors[binding.themeTs];
    const wxssValue = tokenValue(tokens, binding.wxss);
    assertEqual(errors, `theme.ts ${binding.role}`, themeValue, wxssValue);
  }

  const selectedDifference = (contract.sourceSpecificDifferences || []).find(
    (item) => item.role === 'selectedColor',
  );
  if (!selectedDifference?.reason) {
    errors.push('contract: selectedColor source-specific difference requires a reason');
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
    tokens: parseWxssTokens(source(contract.sources.wxss)),
  };
}

export function runRepositoryCheck(root = process.cwd()) {
  const contractPath = join(root, 'miniprogram/config/theme-contract.json');
  if (!existsSync(contractPath))
    throw new Error('theme contract missing: miniprogram/config/theme-contract.json');
  const contract = readJson(contractPath);
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
  validateMigrationRows(rows, migrationTokens);

  const packageJson = readJson(join(root, 'package.json'));
  const documentedText = [
    readFileSync(join(root, 'README.md'), 'utf8'),
    readFileSync(join(root, 'docs/verification/wechat-devtools-e2e.md'), 'utf8'),
  ].join('\n');
  const scriptIssues = validateDocumentedScripts(documentedText, packageJson.scripts || {});

  const contrastIssues = [];
  for (const pair of contract.contrastPairs || []) {
    const foreground = tokenValue(snapshot.tokens, pair.foreground);
    const background = tokenValue(snapshot.tokens, pair.background);
    if (contrastRatio(foreground, background) < pair.minimum) {
      contrastIssues.push(
        `${pair.name}: contrast below ${pair.minimum} for ${pair.foreground}/${pair.background}`,
      );
    }
  }

  if (literalIssues.length || scriptIssues.length || contrastIssues.length) {
    const issueLines = literalIssues
      .map(
        (issue) =>
          `${issue.path}:${issue.line}:${issue.column} ${issue.kind} literal ${issue.literal}`,
      )
      .sort();
    throw new Error(
      [
        `design contract failed: ${colorIssues.length} color literals, ${fontIssues.length} font-family literals`,
        ...issueLines,
        ...scriptIssues.sort(),
        ...contrastIssues.sort(),
      ].join('\n'),
    );
  }

  return {
    colorLiteralCount: 0,
    fontLiteralCount: 0,
    migrationRows: rows.length,
    nativePageConfigs: snapshot.pageJsons.length,
  };
}

function runCli() {
  try {
    const result = runRepositoryCheck();
    console.log(
      `设计契约校验通过：${result.migrationRows} 条颜色迁移、${result.nativePageConfigs} 个页面原生配置、0 个页面颜色/字体字面量`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();
