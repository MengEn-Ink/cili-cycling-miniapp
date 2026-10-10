import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  buildUploadDecision,
  shouldUploadMiniProgram,
  validateUploadDecision,
} from './miniprogram-upload-decision.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('./miniprogram-upload-decision.mjs', import.meta.url));

test('小程序产物和上传链路变更需要上传开发版', () => {
  for (const path of [
    'miniprogram/app.ts',
    './cloudfunctions/profile/index.js',
    'tools/miniprogram-ci/package-lock.json',
    'scripts/upload-miniprogram-ci.mjs',
    'scripts/miniprogram-upload-decision.mjs',
    '.github/workflows/deploy-miniprogram.yml',
    '.github/workflows/promote-miniprogram-experience.yml',
    'project.config.json',
    'project.private.config.json',
    'package.json',
    'package-lock.json',
  ]) {
    assert.equal(shouldUploadMiniProgram([path]), true, path);
  }
});

test('纯文档、测试和无关工作流变更不上传开发版', () => {
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

test('CLI 按完整提交区间创建并校验上传判定', async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), 'cili-upload-decision-'));
  await execFileAsync('git', ['init'], { cwd: repository });
  await execFileAsync('git', ['config', 'user.email', 'ci@example.com'], { cwd: repository });
  await execFileAsync('git', ['config', 'user.name', 'CI'], { cwd: repository });

  await mkdir(path.join(repository, 'docs'));
  await writeFile(path.join(repository, 'docs', 'readme.md'), 'first\n');
  await execFileAsync('git', ['add', '.'], { cwd: repository });
  await execFileAsync('git', ['commit', '-m', 'docs: first'], { cwd: repository });
  const { stdout: firstStdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
  });
  const before = firstStdout.trim();

  await mkdir(path.join(repository, 'miniprogram'));
  await writeFile(path.join(repository, 'miniprogram', 'app.ts'), 'export {};\n');
  await writeFile(path.join(repository, 'docs', 'readme.md'), 'second\n');
  await execFileAsync('git', ['add', '.'], { cwd: repository });
  await execFileAsync('git', ['commit', '-m', 'feat: app'], { cwd: repository });
  const { stdout: secondStdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
  });
  const sha = secondStdout.trim();
  const output = path.join(repository, 'decision.json');

  await execFileAsync(
    process.execPath,
    [scriptPath, 'create', '--before', before, '--sha', sha, '--output', output],
    { cwd: repository },
  );
  const decision = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(decision.matchedPaths, ['miniprogram/app.ts']);

  const verified = await execFileAsync(
    process.execPath,
    [scriptPath, 'verify', '--input', output, '--sha', sha],
    { cwd: repository },
  );
  assert.equal(verified.stdout.trim(), 'should_upload=true');

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [scriptPath, 'verify', '--input', output, '--sha', 'c'.repeat(40)],
      { cwd: repository },
    ),
    /SHA/,
  );
});
