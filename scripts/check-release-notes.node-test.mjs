import assert from 'node:assert/strict';
import test from 'node:test';

import { validateReleaseNotes } from './check-release-notes.mjs';

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
