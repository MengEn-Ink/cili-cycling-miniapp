import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUploadDecision,
  shouldUploadMiniProgram,
  validateUploadDecision,
} from './miniprogram-upload-decision.mjs';

test('小程序产物和上传链路变更需要上传开发版', () => {
  for (const path of [
    'miniprogram/app.ts',
    './cloudfunctions/profile/index.js',
    'tools/miniprogram-ci/package-lock.json',
    'scripts/upload-miniprogram-ci.mjs',
    'scripts/miniprogram-upload-decision.mjs',
    'project.config.json',
    'project.private.config.json',
    'package.json',
    'package-lock.json',
  ]) {
    assert.equal(shouldUploadMiniProgram([path]), true, path);
  }
});

test('纯文档、测试和工作流变更不上传开发版', () => {
  assert.equal(
    shouldUploadMiniProgram([
      'docs/verification/2026-10-09.md',
      'tests/profile-page.test.ts',
      'scripts/check-release-notes.mjs',
      '.github/workflows/ci.yml',
    ]),
    false,
  );
});

test('任一匹配路径即可触发上传', () => {
  assert.equal(
    shouldUploadMiniProgram(['docs/README.md', 'tests/profile-page.test.ts', 'miniprogram/app.ts']),
    true,
  );
});

test('判定只保留去重后的匹配路径并绑定提交区间', () => {
  const before = 'a'.repeat(40);
  const sha = 'b'.repeat(40);
  const decision = buildUploadDecision({
    before,
    sha,
    paths: [
      'docs/readme.md',
      './miniprogram/app.ts',
      'miniprogram/app.ts',
      'cloudfunctions/profile/index.js',
    ],
  });

  assert.deepEqual(decision, {
    schemaVersion: 1,
    before,
    sha,
    shouldUpload: true,
    matchedPaths: ['miniprogram/app.ts', 'cloudfunctions/profile/index.js'],
  });
  assert.deepEqual(validateUploadDecision(decision, sha), decision);
});

test('判定拒绝非法 schema 和不匹配的提交', () => {
  const decision = {
    schemaVersion: 1,
    before: 'a'.repeat(40),
    sha: 'b'.repeat(40),
    shouldUpload: true,
    matchedPaths: ['miniprogram/app.ts'],
  };

  assert.throws(
    () => validateUploadDecision({ ...decision, shouldUpload: 'true' }, decision.sha),
    /shouldUpload/,
  );
  assert.throws(() => validateUploadDecision(decision, 'c'.repeat(40)), /SHA/);
  assert.throws(
    () => buildUploadDecision({ before: 'not-a-sha', sha: decision.sha, paths: [] }),
    /before/,
  );
});
