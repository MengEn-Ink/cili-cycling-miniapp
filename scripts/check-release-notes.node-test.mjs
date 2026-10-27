import assert from 'node:assert/strict';
import test from 'node:test';

import * as releaseNotes from './check-release-notes.mjs';
import * as themePreservation from './theme-preservation-policy.mjs';

const { validateReleaseNotes } = releaseNotes;

const validSource = `
const RELEASE_NOTES = [
  {
    version: CLIENT_RELEASE_VERSION,
    latest: true,
  },
];
Page({ data: { currentRelease: RELEASE_NOTES[0] } });
`;

const changedProductFiles = [
  'miniprogram/pages/profile/index.ts',
  'miniprogram/pages/settings/index.ts',
];

function createThemeMigrationFixture() {
  const literal = 'rgba(12, 10, 7, 0.68)';
  const baseDirectRules = [];
  const headDirectRules = [];
  const addedTokens = [];
  for (let index = 1; index <= 49; index += 1) {
    baseDirectRules.push(`.direct-${index} { color: ${literal}; }`);
    headDirectRules.push(`.direct-${index} { color: var(--pr-b-direct-${index}); }`);
    addedTokens.push(`--pr-b-direct-${index}: ${literal};`);
  }

  const baseApp = `
page {
  --color-status-warning-soft: #fff2c7;
  --color-on-media: #ffffff;
  --font-family-editorial: 'Songti SC', STSong, serif;
}
`;
  const headApp = baseApp.replace('\n}', `\n  ${addedTokens.join('\n  ')}\n}`);
  const basePage = `${baseDirectRules.join('\n')}
.fallback-1 { color: var(--color-status-warning-soft, rgba(192, 50, 31, 0.08)); }
.fallback-2 { color: var(--color-status-warning-soft, rgba(192, 50, 31, 0.08)); }
.fallback-3 { color: var(--color-status-warning-soft, rgba(192, 50, 31, 0.08)); }
.fallback-4 { color: var(--color-on-media, #fff); }
`;
  const headPage = `${headDirectRules.join('\n')}
.fallback-1 { color: var(--color-status-warning-soft); }
.fallback-2 { color: var(--color-status-warning-soft); }
.fallback-3 { color: var(--color-status-warning-soft); }
.fallback-4 { color: var(--color-on-media); }
`;
  const fontBase = `.title { font-family: 'Songti SC', STSong, serif; }\n`;
  const fontHead = `.title { font-family: var(--font-family-editorial); }\n`;
  const themeContractPath = 'miniprogram/config/theme-contract.json';
  const mappingPath = 'docs/designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md';
  const appPath = 'miniprogram/app.wxss';
  const pagePath = 'miniprogram/pages/activities/index.wxss';
  const componentPath = 'miniprogram/components/activity-card/index.wxss';
  const mappingRows = [];
  for (let index = 1; index <= 49; index += 1) {
    mappingRows.push(
      `| ${index} | \`${pagePath}:${index}\` | \`${literal}\` | \`direct\` | \`--pr-b-direct-${index}\` | \`${literal}\` |`,
    );
  }
  for (let index = 1; index <= 3; index += 1) {
    mappingRows.push(
      `| ${49 + index} | \`${pagePath}:${49 + index}\` | \`rgba(192, 50, 31, 0.08)\` | \`fallback-only\` | \`--color-status-warning-soft\` | \`#fff2c7\` |`,
    );
  }
  mappingRows.push(
    `| 53 | \`${pagePath}:53\` | \`#fff\` | \`fallback-only\` | \`--color-on-media\` | \`#ffffff\` |`,
  );
  const mappingMarkdown = `${mappingRows.join('\n')}

| Source | Literal | Token | Token current value |
| --- | --- | --- | --- |
| \`${componentPath}:1\` | \`'Songti SC', STSong, serif\` | \`--font-family-editorial\` | \`'Songti SC', STSong, serif\` |
`;

  return {
    base: 'c0bd3b56ebe8ea44e8d5b3c7203d765e52b8b826',
    changedFiles: [appPath, pagePath, componentPath, themeContractPath],
    baseFiles: {
      [appPath]: baseApp,
      [pagePath]: basePage,
      [componentPath]: fontBase,
    },
    headFiles: {
      [appPath]: headApp,
      [pagePath]: headPage,
      [componentPath]: fontHead,
      [themeContractPath]: '{"schemaVersion":2}\n',
      [mappingPath]: mappingMarkdown,
    },
    runtimeThemeContractReferences: [],
  };
}

const themeMigrationFixture = createThemeMigrationFixture();

test('产品代码改动必须同步设置页 App 更新', () => {
  assert.throws(
    () => validateReleaseNotes(['miniprogram/pages/activity-detail/index.ts'], validSource),
    /未更新 miniprogram\/pages\/settings\/index\.ts/,
  );
});

test('云函数改动同样必须同步设置页 App 更新', () => {
  assert.throws(
    () => validateReleaseNotes(['cloudfunctions/registration/index.js'], validSource),
    /未更新 miniprogram\/pages\/settings\/index\.ts/,
  );
});

test('产品代码和当前版本 App 更新同时改动时通过', () => {
  assert.deepEqual(validateReleaseNotes(changedProductFiles, validSource), {
    required: true,
    productFiles: ['miniprogram/pages/profile/index.ts'],
  });
});

test('纯测试、文档和交付脚本改动无需新增 App 更新', () => {
  assert.deepEqual(
    validateReleaseNotes(
      ['tests/settings-page.test.ts', 'docs/README.md', 'scripts/release.mjs'],
      validSource,
    ),
    { required: false, productFiles: [] },
  );
});

test('纯 Git mode 变更不触发产品发布说明', () => {
  assert.equal(typeof releaseNotes.parseContentChangedFiles, 'function');

  const modeOnlyHash = 'a'.repeat(40);
  const oldContentHash = 'b'.repeat(40);
  const newContentHash = 'c'.repeat(40);
  const rawDiff = [
    `:100755 100644 ${modeOnlyHash} ${modeOnlyHash} M\0miniprogram/pages/profile/index.ts\0`,
    `:100644 100644 ${oldContentHash} ${newContentHash} M\0cloudfunctions/registration/index.js\0`,
  ].join('');

  assert.deepEqual(releaseNotes.parseContentChangedFiles(rawDiff), [
    'cloudfunctions/registration/index.js',
  ]);
});

test('App 更新保留历史版本且首条使用统一版本号', () => {
  const withHistory = validSource.replace(
    '];',
    "  { version: '2026.10.16.73', latest: false },\n];",
  );
  assert.deepEqual(validateReleaseNotes(changedProductFiles, withHistory), {
    required: true,
    productFiles: ['miniprogram/pages/profile/index.ts'],
  });
  assert.throws(
    () =>
      validateReleaseNotes(
        changedProductFiles,
        validSource.replace('CLIENT_RELEASE_VERSION', "'2026.10.16.73'"),
      ),
    /首条版本必须使用 CLIENT_RELEASE_VERSION/,
  );
});

test('设置页必须将当前版本作为唯一 App 更新展示', () => {
  assert.throws(
    () =>
      validateReleaseNotes(
        changedProductFiles,
        validSource.replace('latest: true', 'latest: false'),
      ),
    /latest: true/,
  );
  assert.throws(
    () =>
      validateReleaseNotes(
        changedProductFiles,
        validSource.replace('currentRelease', 'releaseNotes'),
      ),
    /只展示当前版本/,
  );
});

test('PR B 形态的 49 direct + 4 fallback + 1 font 保值迁移可显式豁免', () => {
  const classification =
    themePreservation.classifyValuePreservingThemeMigration(themeMigrationFixture);
  const evidence = {
    eligible: true,
    base: themeMigrationFixture.base,
    mappingPath: 'docs/designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md',
    migratedColorCount: 53,
    directCount: 49,
    fallbackCount: 4,
    fontCount: 1,
  };
  assert.deepEqual(classification, evidence);

  const result = validateReleaseNotes(themeMigrationFixture.changedFiles, validSource, {
    themeMigration: classification,
  });
  assert.deepEqual(result, {
    required: false,
    productFiles: themeMigrationFixture.changedFiles,
    exemption: evidence,
  });
  assert.match(
    releaseNotes.formatReleaseNotesResult(result),
    /base=c0bd3b56.*map=docs\/designs\/2026-10-27-ui-revamp-v1\/pr-b-literal-token-map\.md.*colors=53.*direct=49.*fallback=4.*font=1/,
  );
});

test('映射位置绑定 base 字面量，head 等价声明被格式化为多行仍可迁移', () => {
  const fixture = structuredClone(themeMigrationFixture);
  const pagePath = 'miniprogram/pages/activities/index.wxss';
  fixture.headFiles[pagePath] = fixture.headFiles[pagePath].replace(
    '.direct-1 { color: var(--pr-b-direct-1); }',
    `.direct-1 {
  color: var(--pr-b-direct-1);
}`,
  );

  assert.equal(themePreservation.classifyValuePreservingThemeMigration(fixture).eligible, true);
});

test('alpha 偷改、token 不等值和 V1 新叠层值都不能伪装成保值迁移', () => {
  const alphaDrift = structuredClone(themeMigrationFixture);
  alphaDrift.headFiles['miniprogram/app.wxss'] = alphaDrift.headFiles[
    'miniprogram/app.wxss'
  ].replace('rgba(12, 10, 7, 0.68)', 'rgba(12, 10, 7, 0.72)');

  const tokenMismatch = structuredClone(themeMigrationFixture);
  tokenMismatch.headFiles['miniprogram/app.wxss'] = tokenMismatch.headFiles[
    'miniprogram/app.wxss'
  ].replace('--pr-b-direct-1: rgba(12, 10, 7, 0.68)', '--pr-b-direct-1: #ffffff');

  const v1Value = structuredClone(themeMigrationFixture);
  v1Value.headFiles['miniprogram/app.wxss'] = v1Value.headFiles['miniprogram/app.wxss'].replace(
    '\n}',
    '\n  --scrim-cover-v1: rgba(17, 15, 12, 0.88);\n  --glass-v1: rgba(255, 255, 255, 0.88);\n}',
  );

  for (const fixture of [alphaDrift, tokenMismatch, v1Value]) {
    assert.equal(themePreservation.classifyValuePreservingThemeMigration(fixture).eligible, false);
  }
});

test('夹带 wxml ts 页面 json 或无关新功能文件时回退原发布说明门禁', () => {
  for (const path of [
    'miniprogram/pages/activities/index.wxml',
    'miniprogram/pages/profile/index.ts',
    'miniprogram/pages/activities/index.json',
    'miniprogram/pages/new-feature/index.wxml',
  ]) {
    const fixture = structuredClone(themeMigrationFixture);
    fixture.changedFiles.push(path);
    fixture.headFiles[path] = '<view>new feature</view>\n';
    assert.equal(themePreservation.classifyValuePreservingThemeMigration(fixture).eligible, false);
  }
});

test('选择器或属性变化与缺失全局 fallback token 都不能豁免', () => {
  const selectorChange = structuredClone(themeMigrationFixture);
  selectorChange.headFiles['miniprogram/pages/activities/index.wxss'] = selectorChange.headFiles[
    'miniprogram/pages/activities/index.wxss'
  ].replace('.direct-1', '.direct-renamed');

  const missingFallbackToken = structuredClone(themeMigrationFixture);
  missingFallbackToken.headFiles['miniprogram/app.wxss'] = missingFallbackToken.headFiles[
    'miniprogram/app.wxss'
  ].replace('  --color-status-warning-soft: #fff2c7;\n', '');

  assert.equal(
    themePreservation.classifyValuePreservingThemeMigration(selectorChange).eligible,
    false,
  );
  assert.equal(
    themePreservation.classifyValuePreservingThemeMigration(missingFallbackToken).eligible,
    false,
  );
});

test('映射表行数、位置或内容篡改不能伪装成保值迁移', () => {
  const mappingPath = 'docs/designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md';
  const missingRow = structuredClone(themeMigrationFixture);
  missingRow.headFiles[mappingPath] = missingRow.headFiles[mappingPath].replace(
    /^\| 49 \|.*\n/m,
    '',
  );

  const movedLocation = structuredClone(themeMigrationFixture);
  movedLocation.headFiles[mappingPath] = movedLocation.headFiles[mappingPath].replace(
    'pages/activities/index.wxss:1`',
    'pages/activities/index.wxss:2`',
  );

  const changedLiteral = structuredClone(themeMigrationFixture);
  changedLiteral.headFiles[mappingPath] = changedLiteral.headFiles[mappingPath].replace(
    '`rgba(12, 10, 7, 0.68)` | `direct`',
    '`rgba(12, 10, 7, 0.72)` | `direct`',
  );

  for (const fixture of [missingRow, movedLocation, changedLiteral]) {
    assert.equal(themePreservation.classifyValuePreservingThemeMigration(fixture).eligible, false);
  }
});

test('正常特性发布仍必须更新 App 更新', () => {
  const fixture = structuredClone(themeMigrationFixture);
  fixture.changedFiles = ['miniprogram/pages/profile/index.ts'];
  fixture.baseFiles = { 'miniprogram/pages/profile/index.ts': 'Page({});\n' };
  fixture.headFiles = {
    'miniprogram/pages/profile/index.ts': 'Page({ data: { feature: true } });\n',
  };
  assert.equal(themePreservation.classifyValuePreservingThemeMigration(fixture).eligible, false);
  assert.throws(
    () =>
      validateReleaseNotes(fixture.changedFiles, validSource, {
        themeMigration: themePreservation.classifyValuePreservingThemeMigration(fixture),
      }),
    /未更新 miniprogram\/pages\/settings\/index\.ts/,
  );
});
