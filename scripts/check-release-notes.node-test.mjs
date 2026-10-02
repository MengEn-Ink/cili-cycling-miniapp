import assert from 'node:assert/strict';
import test from 'node:test';

import { validateReleaseNotes } from './check-release-notes.mjs';

const validSource = `
const RELEASE_NOTES = [
  {
    version: '2026.10.02.1',
    latest: true,
  },
  {
    version: '2026.10.01.3',
    latest: false,
  },
];
`;

test('产品代码改动必须同步设置页功能升级日志', () => {
  assert.throws(
    () => validateReleaseNotes(['miniprogram/pages/activity-detail/index.ts'], validSource),
    /未更新 miniprogram\/pages\/settings\/index\.ts/,
  );
});

test('云函数改动同样必须同步设置页功能升级日志', () => {
  assert.throws(
    () => validateReleaseNotes(['cloudfunctions/registration/index.js'], validSource),
    /未更新 miniprogram\/pages\/settings\/index\.ts/,
  );
});

test('产品代码和设置页日志同时改动时通过', () => {
  assert.deepEqual(
    validateReleaseNotes(
      ['miniprogram/pages/activity-detail/index.ts', 'miniprogram/pages/settings/index.ts'],
      validSource,
    ),
    {
      required: true,
      productFiles: ['miniprogram/pages/activity-detail/index.ts'],
    },
  );
});

test('纯测试、文档和交付脚本改动无需新增应用日志', () => {
  assert.deepEqual(
    validateReleaseNotes(
      ['tests/settings-page.test.ts', 'docs/README.md', 'scripts/release.mjs'],
      validSource,
    ),
    { required: false, productFiles: [] },
  );
});

test('最新日志必须位于第一条且只能存在一条', () => {
  assert.throws(
    () =>
      validateReleaseNotes(
        ['miniprogram/pages/profile/index.ts', 'miniprogram/pages/settings/index.ts'],
        validSource.replace('latest: false', 'latest: true'),
      ),
    /必须且只能有一条/,
  );
  const staleSource = `
const RELEASE_NOTES = [
  {
    version: '2026.10.02.1',
    latest: false,
  },
  {
    version: '2026.10.01.3',
    latest: true,
  },
];
`;
  assert.throws(
    () =>
      validateReleaseNotes(
        ['miniprogram/pages/profile/index.ts', 'miniprogram/pages/settings/index.ts'],
        staleSource,
      ),
    /第一条必须标记/,
  );
});
