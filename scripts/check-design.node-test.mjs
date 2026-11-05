import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  LEGACY_BRAND_TEXT_TOKENS,
  appearanceContrastPairCount,
  collectAppearanceContrastIssues,
  collectBrandTextTokenViolations,
  collectStyleLiteralViolations,
  collectTokenReferenceIssues,
  contrastRatio,
  parseAppearanceSource,
  parseFontMigrationTable,
  parseMigrationTable,
  parseThemeAppearance,
  parseWxssTokens,
  resolvedTokenValue,
  runRepositoryCheck,
  validateContractSnapshot,
  validateDocumentedScripts,
  validateFontContract,
  validateMigrationRows,
  validateTokenArchitecture,
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
  assert.throws(
    () => parseWxssTokens('page { --color-a: #fff; --color-a: #000; }'),
    /duplicate root token: --color-a/,
  );
});

test('WXSS references must resolve from the root or the same file', () => {
  assert.deepEqual(
    collectTokenReferenceIssues(
      [
        ['miniprogram/app.wxss', 'page { --global: #fff; } .a { color: var(--global); }'],
        [
          'miniprogram/pages/a.wxss',
          '.a { --local: var(--global); color: var(--local); border: var(--missing); }',
        ],
      ],
      { '--global': '#ffffff' },
    ).map(({ path, token }) => ({ path, token })),
    [{ path: 'miniprogram/pages/a.wxss', token: '--missing' }],
  );
});

test('three-layer token architecture requires resolvable and consumed component states', () => {
  const architecture = {
    document: 'DESIGN.md',
    primitive: ['--palette-a'],
    semantic: ['--color-action'],
    components: [
      {
        name: 'button',
        tokens: ['--button-bg'],
        states: { active: ['--button-bg-active'] },
      },
    ],
  };
  const tokens = {
    '--palette-a': '#ffffff',
    '--color-action': 'var(--palette-a)',
    '--button-bg': 'var(--color-action)',
    '--button-bg-active': 'var(--palette-a)',
  };
  assert.doesNotThrow(() =>
    validateTokenArchitecture({
      architecture,
      tokens,
      styleEntries: [
        ['miniprogram/app.wxss', '.button { background: var(--button-bg); }'],
        ['miniprogram/app.wxss', '.button:active { background: var(--button-bg-active); }'],
      ],
      documentText: 'Use `var(--color-action)` for actions.',
    }),
  );
  assert.throws(
    () =>
      validateTokenArchitecture({
        architecture,
        tokens: { ...tokens, '--color-action': 'var(--missing)' },
        styleEntries: [['miniprogram/app.wxss', '.button { background: var(--button-bg); }']],
        documentText: 'Broken `var(--not-real)`.',
      }),
    /unresolved|not consumed|undefined token/,
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

test('historical migration ledger keeps its frozen evidence while current tokens may evolve', () => {
  const evolvedTokens = { ...tokensFixture, '--token-direct-1': '#0b0a0c' };
  assert.doesNotThrow(() =>
    validateMigrationRows(parsedRows, evolvedTokens, { requireCurrentTokenValues: false }),
  );
  assert.throws(
    () =>
      validateMigrationRows(
        parsedRows.map((row, index) =>
          index === 0 ? { ...row, tokenCurrentValue: '#0b0a0c' } : row,
        ),
        evolvedTokens,
        { requireCurrentTokenValues: false },
      ),
    /历史 direct/,
  );
});

test('semantic tokens resolve through primitive aliases and reject cycles', () => {
  assert.equal(
    resolvedTokenValue(
      {
        '--color-text': 'var(--palette-warm-50)',
        '--palette-warm-50': '#f7f4f2',
      },
      '--color-text',
    ),
    '#f7f4f2',
  );
  assert.throws(
    () => resolvedTokenValue({ '--a': 'var(--b)', '--b': 'var(--a)' }, '--a'),
    /CSS token cycle/,
  );
});

test('native source-specific values and declared equivalents are both enforced', () => {
  assert.doesNotThrow(() => validateContractSnapshot(validSnapshot));
  const alignedNative = {
    ...native,
    appTabBar: { ...native.appTabBar, selectedColor: native.runtimeTabBar.selectedColor },
  };
  assert.doesNotThrow(() =>
    validateContractSnapshot({
      ...validSnapshot,
      contract: {
        ...validContract,
        native: alignedNative,
        sourceSpecificDifferences: [],
      },
      appJson: { ...validAppJson, tabBar: alignedNative.appTabBar },
    }),
  );
  assert.throws(
    () =>
      validateContractSnapshot({
        ...validSnapshot,
        contract: { ...validContract, sourceSpecificDifferences: [] },
      }),
    /requires a reason/,
  );
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

test('repository resolves the current theme while retaining the historical migration ledger', () => {
  assert.deepEqual(runRepositoryCheck(), {
    colorLiteralCount: 0,
    fontLiteralCount: 0,
    brandTextViolations: 0,
    migrationRows: 53,
    nativePageConfigs: 17,
    requiredComponentTokens: 25,
    appearanceContrastPairs: 37,
  });
});

const repositorySources = {
  contract: JSON.parse(
    readFileSync(new URL('../miniprogram/config/theme-contract.json', import.meta.url), 'utf8'),
  ),
  appJson: JSON.parse(readFileSync(new URL('../miniprogram/app.json', import.meta.url), 'utf8')),
  themeSource: readFileSync(new URL('../miniprogram/config/theme.ts', import.meta.url), 'utf8'),
  appearanceSource: readFileSync(
    new URL('../miniprogram/config/appearance.ts', import.meta.url),
    'utf8',
  ),
};

const lightAppearanceFixture = `
const common = { '--page-gutter': '40rpx' };
export const APPEARANCE_TOKENS = {
  dark: { ...common, '--color-text': '#f4f3f1' },
  light: { ...common, '--color-text': '#1f2324' },
} as const;
export const LIGHT_APPEARANCE = {
  navigation: { backgroundColor: '#f7f6f2', frontColor: '#000000' },
  tabBar: { backgroundColor: '#f7f6f2', borderStyle: 'white', color: '#5c6467', selectedColor: '#b72c2c' },
  background: { backgroundColor: '#f7f6f2' },
} as const;
`;

test('appearance parsers resolve both runtime token sets and native configurations', () => {
  const appearance = parseAppearanceSource(repositorySources.appearanceSource);
  assert.equal(appearance.native.tabBar.selectedColor, '#b72c2c');
  assert.equal(appearance.tokens.light['--color-text'], '#1f2324');
  assert.equal(appearance.tokens.dark['--color-text'], '#f4f3f1');
  assert.equal(appearance.tokens.dark['--color-brand-text'], '#f06464');
  assert.equal(appearance.tokens.light['--color-brand-text'], '#b72c2c');
  assert.equal(
    appearance.tokens.light['--page-gutter'],
    appearance.tokens.dark['--page-gutter'],
    'shared tokens are merged into both modes',
  );
  const theme = parseThemeAppearance(repositorySources.themeSource);
  assert.equal(theme.native.tabBar.selectedColor, '#e54242');
  assert.equal(theme.native.navigation.frontColor, '#ffffff');
  assert.throws(
    () => parseAppearanceSource('export const APPEARANCE_TOKENS = {} as const;'),
    /missing/,
  );
});

test('light tabBar selected color regression is rejected by the contrast gate', () => {
  assert.deepEqual(collectAppearanceContrastIssues(repositorySources), []);
  assert.equal(appearanceContrastPairCount(repositorySources.contract), 37);
  const regressed = {
    ...repositorySources,
    appearanceSource: repositorySources.appearanceSource.replace(
      "selectedColor: '#b72c2c'",
      "selectedColor: '#e54242'",
    ),
  };
  const issues = collectAppearanceContrastIssues(regressed);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /light\/tabbar-selected/);
  assert.match(issues[0], /3\.742:1 below 4\.5/);
});

test('appearance contrast fails closed on missing sources, coverage and minimums', () => {
  const { contract } = repositorySources;
  const withContract = (appearanceContrast) => ({ ...contract, appearanceContrast });
  assert.match(
    collectAppearanceContrastIssues({
      ...repositorySources,
      contract: withContract(undefined),
    })[0],
    /contract section missing/,
  );
  assert.match(
    collectAppearanceContrastIssues({ ...repositorySources, appearanceSource: undefined })[0],
    /appearance\.ts source is required/,
  );
  assert.match(
    collectAppearanceContrastIssues({ ...repositorySources, themeSource: undefined })[0],
    /theme\.ts source is required/,
  );
  assert.ok(
    collectAppearanceContrastIssues({
      ...repositorySources,
      contract: withContract({ ...contract.appearanceContrast, runtimeNativePairs: [] }),
    }).some((issue) => issue.includes('native.tabBar.selectedColor')),
    'deleting native pairs cannot hide the TabBar regression',
  );
  assert.ok(
    collectAppearanceContrastIssues({
      ...repositorySources,
      contract: withContract({
        ...contract.appearanceContrast,
        requiredModes: ['dark', 'startup'],
      }),
    }).some((issue) => /requiredModes must declare light/.test(issue)),
  );
  const brokenMinimums = {
    ...contract.appearanceContrast,
    tokenPairs: contract.appearanceContrast.tokenPairs.map((pair, index) =>
      index === 0 ? { ...pair, minimum: 'missing' } : pair,
    ),
  };
  assert.ok(
    collectAppearanceContrastIssues({
      ...repositorySources,
      contract: withContract(brokenMinimums),
    }).some((issue) => /unknown minimum/.test(issue)),
  );
});

test('schema v5 pins the light runtime tabBar to the appearance source', () => {
  const lightRuntimeTabBar = {
    backgroundColor: '#f7f6f2',
    borderStyle: 'white',
    color: '#5c6467',
    selectedColor: '#b72c2c',
  };
  const lightContract = {
    ...validContract,
    schemaVersion: 5,
    native: { ...native, lightRuntimeTabBar },
  };
  const snapshot = {
    ...validSnapshot,
    contract: lightContract,
    appearanceSource: lightAppearanceFixture,
  };
  assert.doesNotThrow(() => validateContractSnapshot(snapshot));
  assert.throws(
    () =>
      validateContractSnapshot({
        ...snapshot,
        appearanceSource: lightAppearanceFixture.replace(
          "selectedColor: '#b72c2c'",
          "selectedColor: '#e54242'",
        ),
      }),
    /appearance\.ts light tabBar\.selectedColor/,
  );
  assert.throws(
    () => validateContractSnapshot({ ...snapshot, appearanceSource: undefined }),
    /appearance\.ts source is required/,
  );
  assert.throws(
    () => validateContractSnapshot({ ...snapshot, contract: { ...lightContract, native } }),
    /schema v5 requires/,
  );
});

test('light brand text regression is rejected on canvas, surface and raised', () => {
  const regressed = {
    ...repositorySources,
    appearanceSource: repositorySources.appearanceSource.replace(
      "'--color-brand-text': '#b72c2c'",
      "'--color-brand-text': '#e54242'",
    ),
  };
  const issues = collectAppearanceContrastIssues(regressed);
  assert.equal(issues.length, 3);
  for (const surface of ['canvas', 'surface', 'raised']) {
    assert.ok(
      issues.some((issue) => issue.includes(`light/brand-text-on-${surface}`)),
      `${surface} must be checked`,
    );
  }
  assert.ok(issues.every((issue) => /below 4\.5/.test(issue)));
});

test('brand red used as text must use the dedicated text token', () => {
  assert.equal(LEGACY_BRAND_TEXT_TOKENS.size, 5);
  const issues = collectBrandTextTokenViolations([
    [
      'miniprogram/pages/a.wxss',
      [
        '.a { color: var(--color-brand); }',
        '.b { color: var(--color-action) !important; }',
        '.c { border-color: var(--color-brand); background-color: var(--color-action); }',
        '.d { color: var(--color-brand-text); }',
        '.e { background: var(--color-action); color: var(--color-danger-text); }',
      ].join('\n'),
    ],
  ]);
  assert.deepEqual(
    issues.map(({ token, line }) => ({ token, line })),
    [
      { token: '--color-brand', line: 1 },
      { token: '--color-action', line: 2 },
    ],
  );
});
