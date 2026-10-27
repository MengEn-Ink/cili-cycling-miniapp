import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  collectStyleLiteralViolations,
  contrastRatio,
  parseFontMigrationTable,
  parseMigrationTable,
  parseWxssTokens,
  runRepositoryCheck,
  validateContractSnapshot,
  validateDocumentedScripts,
  validateFontContract,
  validateMigrationRows,
} from './check-design.mjs';

function createMigrationFixture() {
  const rows = [
    '| # | file:line | current literal | migration type | token | token current value |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (let index = 1; index <= 49; index += 1) {
    rows.push(
      `| ${index} | miniprogram/pages/direct-${index}.wxss:${index} | #fff | direct | --token-direct-${index} | #ffffff |`,
    );
  }
  for (let index = 50; index <= 53; index += 1) {
    rows.push(
      `| ${index} | miniprogram/pages/fallback-${index}.wxss:${index} | rgba(192, 50, 31, 0.08) | fallback-only | --token-fallback-${index} | #fff2c7 |`,
    );
  }
  return rows.join('\n');
}

const mappingMarkdownFixture = createMigrationFixture();
const tokensFixture = Object.fromEntries([
  ...Array.from({ length: 49 }, (_, index) => [`--token-direct-${index + 1}`, '#ffffff']),
  ...Array.from({ length: 4 }, (_, index) => [`--token-fallback-${index + 50}`, '#fff2c7']),
]);
const parsedRows = parseMigrationTable(mappingMarkdownFixture);
const directMismatchRows = parsedRows.map((row, index) =>
  index === 0 ? { ...row, tokenCurrentValue: '#000000' } : row,
);
const missingFallbackTokenRows = parsedRows;
const missingFallbackTokens = { ...tokensFixture };
delete missingFallbackTokens['--token-fallback-50'];

const native = {
  page: {
    navigationBarBackgroundColor: '#fbf5ea',
    navigationBarTextStyle: 'black',
    backgroundColor: '#fbf5ea',
    backgroundColorTop: '#fbf5ea',
    backgroundColorBottom: '#fbf5ea',
  },
  appWindow: {
    navigationBarBackgroundColor: '#fbf5ea',
    navigationBarTextStyle: 'black',
    backgroundColor: '#fbf5ea',
    backgroundColorTop: '#fbf5ea',
    backgroundColorBottom: '#fbf5ea',
  },
  appTabBar: {
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    color: '#6f675d',
    selectedColor: '#c0321f',
  },
  runtimeTabBar: {
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    color: '#6f675d',
    selectedColor: '#211f1c',
  },
};

const validContract = {
  schemaVersion: 2,
  native,
  equivalentRoles: [
    { role: 'brand', themeTs: 'brand', wxss: '--color-brand' },
    { role: 'background', themeTs: 'background', wxss: '--color-bg' },
    { role: 'surface', themeTs: 'surface', wxss: '--color-surface' },
    { role: 'ink', themeTs: 'ink', wxss: '--color-text' },
    { role: 'muted', themeTs: 'muted', wxss: '--color-muted' },
  ],
  sourceSpecificDifferences: [
    {
      role: 'selectedColor',
      sources: ['appTabBar', 'runtimeTabBar'],
      reason: 'PR B preserves startup and runtime values; alignment requires a later visual slice',
    },
  ],
};
const validAppJson = {
  window: native.appWindow,
  tabBar: native.appTabBar,
};
const validThemeSource = `
export const THEME_COLORS = {
  brand: '#e13b2b',
  background: '#fbf5ea',
  surface: '#ffffff',
  ink: '#211f1c',
  muted: '#6f675d',
} as const;
export const APP_APPEARANCE = {
  tabBar: {
    backgroundColor: THEME_COLORS.surface,
    borderStyle: 'white',
    color: THEME_COLORS.muted,
    selectedColor: THEME_COLORS.ink,
  },
} as const;
`;
const validSnapshot = {
  contract: validContract,
  appJson: validAppJson,
  pageJsons: [['miniprogram/pages/a/index.json', native.page]],
  themeSource: validThemeSource,
  tokens: {
    '--color-brand': '#e13b2b',
    '--color-bg': '#fbf5ea',
    '--color-surface': '#ffffff',
    '--color-text': '#211f1c',
    '--color-muted': '#6f675d',
  },
};
const badApp = {
  ...validAppJson,
  tabBar: { ...validAppJson.tabBar, selectedColor: '#211f1c' },
};
const badTheme = validThemeSource.replace("brand: '#e13b2b'", "brand: '#000000'");

test('page colors and literal font families fail closed', () => {
  const issues = collectStyleLiteralViolations([
    ['miniprogram/app.wxss', 'page{--x:#fff;--font-family-editorial:serif;}'],
    ['miniprogram/pages/a.wxss', '.a{color:#fff;background:rgba(0,0,0,.3);font-family:serif;}'],
  ]);
  assert.deepEqual(
    issues.map((item) => item.kind),
    ['color', 'color', 'font-family'],
  );
});

test('page token parser reads only the first page block and normalizes hex', () => {
  assert.deepEqual(
    parseWxssTokens('page { --color-a: #FFF; --font-family-body: sans-serif; } page { --x: red; }'),
    {
      '--color-a': '#ffffff',
      '--font-family-body': 'sans-serif',
    },
  );
});

test('53 rows require 49 direct and four fallback-only entries', () => {
  const rows = parseMigrationTable(mappingMarkdownFixture);
  assert.equal(rows.length, 53);
  assert.equal(rows.filter((row) => row.type === 'direct').length, 49);
  assert.equal(rows.filter((row) => row.type === 'fallback-only').length, 4);
  assert.doesNotThrow(() => validateMigrationRows(rows, tokensFixture));
});

test('font migration requires one exact value-preserving row', () => {
  const fontMarkdown = `
| file:line | current font family | token | token current value |
| --- | --- | --- | --- |
| miniprogram/components/activity-card/index.wxss:58 | 'Songti SC', STSong, serif | --font-family-editorial | 'Songti SC', STSong, serif |
`;
  const fontRows = parseFontMigrationTable(fontMarkdown);
  const fonts = {
    body: {
      token: '--font-family-body',
      value: '-apple-system, BlinkMacSystemFont, sans-serif',
    },
    editorial: {
      token: '--font-family-editorial',
      value: "'Songti SC', STSong, serif",
    },
    mono: {
      token: '--font-family-mono',
      value: 'ui-monospace, monospace',
    },
  };
  const tokens = {
    '--font-family-body': '-apple-system, BlinkMacSystemFont, sans-serif',
    '--font-family-editorial': "'Songti SC', STSong, serif",
    '--font-family-mono': 'ui-monospace, monospace',
  };
  assert.equal(fontRows.length, 1);
  assert.doesNotThrow(() => validateFontContract(fontRows, fonts, tokens));
  assert.throws(() => validateFontContract([], fonts, tokens), /字体映射/);
  assert.throws(
    () =>
      validateFontContract(fontRows, fonts, {
        ...tokens,
        '--font-family-editorial': 'serif',
      }),
    /字体保值/,
  );
});

test('direct values cannot drift and fallback effective tokens must exist', () => {
  assert.throws(() => validateMigrationRows(directMismatchRows, tokensFixture), /保值/);
  assert.throws(
    () => validateMigrationRows(missingFallbackTokenRows, missingFallbackTokens),
    /fallback/,
  );
});

test('native source-specific values and declared equivalents are both enforced', () => {
  assert.doesNotThrow(() => validateContractSnapshot(validSnapshot));
  assert.throws(() => validateContractSnapshot({ ...validSnapshot, appJson: badApp }), /tabBar/);
  assert.throws(
    () => validateContractSnapshot({ ...validSnapshot, themeSource: badTheme }),
    /theme\.ts/,
  );
});

test('documented npm commands must resolve', () => {
  assert.deepEqual(
    validateDocumentedScripts('npm run check:design', { 'check:design': 'node x' }),
    [],
  );
  assert.match(validateDocumentedScripts('npm run missing', {})[0], /missing/);
});

test('package scripts wire design tests and checker into validate', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    packageJson.scripts['test:design'],
    'node --test scripts/check-design.node-test.mjs',
  );
  assert.equal(packageJson.scripts['check:design'], 'node scripts/check-design.mjs');
  assert.match(packageJson.scripts.validate, /npm run test:ui-sync && npm run test:design/);
  assert.match(packageJson.scripts.validate, /npm run test:design && npm run check:design/);
});

test('contrast uses WCAG luminance', () => {
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.ok(contrastRatio('#211f1c', '#fbf5ea') >= 4.5);
});

test('migrated repository resolves all frozen literals through the contract', () => {
  assert.deepEqual(runRepositoryCheck(), {
    colorLiteralCount: 0,
    fontLiteralCount: 0,
    migrationRows: 53,
    nativePageConfigs: 17,
  });
});
