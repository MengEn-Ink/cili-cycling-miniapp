import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildExperienceReleaseManifest,
  validateExperienceReleaseManifest,
  validateExperienceReleaseTransition,
  validateRollbackTarget,
  verifyReleaseDirectory,
} from './miniprogram-experience-release.mjs';

const SHA = 'a'.repeat(40);
const baseInput = {
  stage: 'candidate',
  mode: 'promote',
  mainSha: SHA,
  version: '0.0.81.1',
  operationId: '12345',
  entryPath: 'pages/activities/index',
  ciRunUrl: 'https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/1',
  uploadRunUrl: 'https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/2',
  smokeEvidence: 'https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/3',
  smokeOutcome: 'passed',
  operator: 'release-owner',
  occurredAt: '2026-10-11T00:45:00.000Z',
};

test('候选清单固定版本、主分支 SHA、入口和门禁证据', () => {
  const manifest = buildExperienceReleaseManifest(baseInput);
  assert.equal(manifest.releaseId, `experience-promote-0.0.81.1-${SHA.slice(0, 12)}-12345`);
  assert.equal(manifest.entryPath, 'pages/activities/index');
  assert.equal(manifest.smokeOutcome, 'passed');
  assert.equal(manifest.platformEvidence, null);
  assert.match(manifest.digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(validateExperienceReleaseManifest(manifest), manifest);
});

test('未通过 smoke 的构建不能生成体验版清单', () => {
  assert.throws(
    () => buildExperienceReleaseManifest({ ...baseInput, smokeOutcome: 'failed' }),
    /只有 smokeOutcome=passed/,
  );
});

test('非法发布字段在生成清单前被拒绝', () => {
  for (const [field, value, pattern] of [
    ['stage', 'done', /stage 必须是/],
    ['mode', 'replace', /mode 必须是/],
    ['mainSha', 'abc', /40 位十六进制/],
    ['version', 'bad version', /version 格式无效/],
    ['entryPath', 'activities/index', /entryPath 格式无效/],
    ['ciRunUrl', 'http://example.com/run', /必须使用 HTTPS/],
    ['occurredAt', '2026-10-11 00:45:00', /必须是 UTC ISO 时间/],
  ]) {
    assert.throws(() => buildExperienceReleaseManifest({ ...baseInput, [field]: value }), pattern);
  }
  assert.throws(() => validateExperienceReleaseManifest(null), /必须是对象/);
  assert.throws(() => validateExperienceReleaseManifest([]), /必须是对象/);
});

test('smoke 与平台回读证据必须绑定可信来源和当前发布', () => {
  assert.throws(
    () =>
      buildExperienceReleaseManifest({
        ...baseInput,
        smokeEvidence: 'https://example.com/actions/runs/3',
      }),
    /必须是本仓库已核验的 GitHub Actions run/,
  );
  const candidate = buildExperienceReleaseManifest(baseInput);
  assert.throws(
    () =>
      buildExperienceReleaseManifest({
        ...baseInput,
        stage: 'verified',
        candidateDigest: candidate.digest,
        platformEvidence: 'wechat-admin:experience:0.0.99.1:wrong:pages/activities/index',
      }),
    /平台回读声明/,
  );
});

test('verified 清单必须包含微信公众平台回读证据', () => {
  assert.throws(
    () => buildExperienceReleaseManifest({ ...baseInput, stage: 'verified' }),
    /必须提供微信公众平台回读证据/,
  );
  assert.throws(
    () =>
      buildExperienceReleaseManifest({
        ...baseInput,
        stage: 'verified',
        platformEvidence:
          'wechat-admin:experience:0.0.81.1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:pages/activities/index',
      }),
    /必须关联有效 candidateDigest/,
  );
  const candidate = buildExperienceReleaseManifest(baseInput);
  const manifest = buildExperienceReleaseManifest({
    ...baseInput,
    stage: 'verified',
    candidateDigest: candidate.digest,
    platformEvidence:
      'wechat-admin:experience:0.0.81.1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:pages/activities/index',
  });
  assert.equal(manifest.stage, 'verified');
  assert.equal(manifest.candidateDigest, candidate.digest);
  assert.equal(validateExperienceReleaseTransition(candidate, manifest).digest, manifest.digest);
  assert.throws(
    () => validateExperienceReleaseTransition(manifest, candidate),
    /必须由 candidate 进入 verified/,
  );
  assert.throws(
    () => validateExperienceReleaseTransition(candidate, { ...manifest, operator: 'changed' }),
    /摘要不匹配/,
  );
  const differentCandidate = buildExperienceReleaseManifest({ ...baseInput, version: '0.0.80.1' });
  assert.throws(
    () => validateExperienceReleaseTransition(differentCandidate, manifest),
    /未绑定当前 candidate 摘要/,
  );
  const mismatched = buildExperienceReleaseManifest({
    ...baseInput,
    stage: 'verified',
    entryPath: 'pages/profile/index',
    candidateDigest: candidate.digest,
    platformEvidence:
      'wechat-admin:experience:0.0.81.1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:pages/profile/index',
  });
  assert.throws(
    () => validateExperienceReleaseTransition(candidate, mismatched),
    /字段 releaseId|字段 entryPath/,
  );
});

test('回退清单必须指向上一稳定版本并说明原因', () => {
  assert.throws(
    () => buildExperienceReleaseManifest({ ...baseInput, mode: 'rollback' }),
    /回退必须提供有效 previousReleaseId 和 rollbackReason/,
  );
  const manifest = buildExperienceReleaseManifest({
    ...baseInput,
    mode: 'rollback',
    previousReleaseId: `experience-promote-0.0.80.1-${'b'.repeat(12)}-999`,
    rollbackReason: '真机核心流程回归失败',
  });
  assert.equal(manifest.mode, 'rollback');
  assert.equal(manifest.releaseId, `experience-rollback-0.0.81.1-${SHA.slice(0, 12)}-12345`);
  assert.notEqual(manifest.releaseId, buildExperienceReleaseManifest(baseInput).releaseId);
});

test('篡改或注入清单字段后校验失败', () => {
  const manifest = buildExperienceReleaseManifest(baseInput);
  assert.throws(
    () => validateExperienceReleaseManifest({ ...manifest, version: '0.0.99.1' }),
    /摘要不匹配/,
  );
  assert.throws(
    () => validateExperienceReleaseManifest({ ...manifest, approved: true }),
    /字段集合不匹配/,
  );
});

test('回退目标必须绑定仓库内已验证的稳定晋级清单', () => {
  const candidate = buildExperienceReleaseManifest(baseInput);
  const verified = buildExperienceReleaseManifest({
    ...baseInput,
    stage: 'verified',
    candidateDigest: candidate.digest,
    platformEvidence:
      'wechat-admin:experience:0.0.81.1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:pages/activities/index',
  });
  assert.equal(
    validateRollbackTarget(verified, {
      mainSha: SHA,
      version: baseInput.version,
      releaseId: verified.releaseId,
    }).digest,
    verified.digest,
  );
  assert.throws(
    () =>
      validateRollbackTarget(verified, {
        mainSha: 'b'.repeat(40),
        version: baseInput.version,
        releaseId: verified.releaseId,
      }),
    /不一致/,
  );
  assert.throws(
    () =>
      validateRollbackTarget(verified, {
        mainSha: SHA,
        version: baseInput.version,
        releaseId: verified.releaseId,
        ciRunUrl: baseInput.ciRunUrl,
        uploadRunUrl: baseInput.uploadRunUrl,
        smokeEvidence: 'https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/wrong',
      }),
    /验收证据不一致/,
  );
  assert.throws(
    () =>
      validateRollbackTarget(candidate, {
        mainSha: SHA,
        version: baseInput.version,
        releaseId: candidate.releaseId,
      }),
    /必须是已验证的稳定晋级清单/,
  );
});

test('长期体验版记录只允许新增同名 verified 清单', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cili-experience-repository-'));
  const directory = path.join(root, 'docs/releases/experience');
  await mkdir(directory, { recursive: true });
  const candidate = buildExperienceReleaseManifest(baseInput);
  const verified = buildExperienceReleaseManifest({
    ...baseInput,
    stage: 'verified',
    candidateDigest: candidate.digest,
    platformEvidence:
      'wechat-admin:experience:0.0.81.1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:pages/activities/index',
  });
  const manifestPath = path.join(directory, `${verified.releaseId}.json`);
  await writeFile(manifestPath, `${JSON.stringify(verified, null, 2)}\n`);
  await verifyReleaseDirectory({ directory });
  const wrongName = path.join(directory, 'wrong.json');
  await writeFile(wrongName, `${JSON.stringify(verified)}\n`);
  await assert.rejects(verifyReleaseDirectory({ directory }), /必须是同名 verified 清单/);
  await unlink(wrongName);

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Release Test'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'baseline'], { cwd: root });
  const { stdout: base } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });

  const changed = buildExperienceReleaseManifest({
    ...baseInput,
    stage: 'verified',
    candidateDigest: candidate.digest,
    operator: 'another-release-owner',
    platformEvidence:
      'wechat-admin:experience:0.0.81.1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:pages/activities/index',
  });
  await writeFile(manifestPath, `${JSON.stringify(changed, null, 2)}\n`);
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'mutate'], { cwd: root });
  await assert.rejects(
    verifyReleaseDirectory({
      directory: 'docs/releases/experience',
      base: base.trim(),
      cwd: root,
    }),
    /只允许新增/,
  );
});

test('体验版工作流只生成证据，不自动上传或覆盖体验基线', async () => {
  const workflow = await readFile('.github/workflows/promote-miniprogram-experience.yml', 'utf8');
  const developmentWorkflow = await readFile('.github/workflows/deploy-miniprogram.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /options: \[candidate, verified\]/);
  assert.match(workflow, /environment: wechat-experience/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /gh run download "\$\{CANDIDATE_RUN_ID\}"/);
  assert.match(workflow, /miniprogram-upload-receipt-\$\{TARGET_SHA\}/);
  assert.match(workflow, /verify-transition/);
  assert.match(workflow, /verify-rollback/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /ref: main/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\.main_sha \}\}/);
  assert.doesNotMatch(workflow, /deploy:miniprogram|WECHAT_MINIPROGRAM_PRIVATE_KEY/);
  assert.match(developmentWorkflow, /echo "uploaded=true"/);
  assert.match(developmentWorkflow, /miniprogram-upload-receipt-/);
});

test('CLI 使用排他写入，避免覆盖既有发布证据', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cili-experience-release-'));
  const output = path.join(directory, 'manifest.json');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const script = path.resolve('scripts/miniprogram-experience-release.mjs');
  const args = [
    script,
    'create',
    '--stage',
    'candidate',
    '--mode',
    'promote',
    '--main-sha',
    SHA,
    '--version',
    '0.0.81.1',
    '--operation-id',
    '12345',
    '--entry-path',
    'pages/activities/index',
    '--ci-run-url',
    baseInput.ciRunUrl,
    '--upload-run-url',
    baseInput.uploadRunUrl,
    '--smoke-evidence',
    baseInput.smokeEvidence,
    '--smoke-outcome',
    'passed',
    '--operator',
    'release-owner',
    '--occurred-at',
    baseInput.occurredAt,
    '--output',
    output,
  ];
  await execFileAsync(process.execPath, args);
  const stored = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(stored.releaseId, `experience-promote-0.0.81.1-${SHA.slice(0, 12)}-12345`);
  const verifiedResult = await execFileAsync(process.execPath, [
    script,
    'verify',
    '--input',
    output,
  ]);
  assert.match(verifiedResult.stdout, /release_digest=sha256:/);
  const verifiedPath = path.join(directory, 'verified.json');
  const verifiedManifest = buildExperienceReleaseManifest({
    ...baseInput,
    stage: 'verified',
    candidateDigest: stored.digest,
    platformEvidence:
      'wechat-admin:experience:0.0.81.1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:pages/activities/index',
  });
  await writeFile(verifiedPath, `${JSON.stringify(verifiedManifest)}\n`);
  const transition = await execFileAsync(process.execPath, [
    script,
    'verify-transition',
    '--candidate',
    output,
    '--verified',
    verifiedPath,
  ]);
  assert.match(transition.stdout, /release_id=experience-promote-0\.0\.81\.1-/);
  const rollback = await execFileAsync(process.execPath, [
    script,
    'verify-rollback',
    '--input',
    verifiedPath,
    '--main-sha',
    SHA,
    '--version',
    baseInput.version,
    '--release-id',
    verifiedManifest.releaseId,
  ]);
  assert.match(rollback.stdout, /release_digest=sha256:/);
  const repository = await execFileAsync(process.execPath, [
    script,
    'verify-repository',
    '--directory',
    'docs/releases/experience',
  ]);
  assert.match(repository.stdout, /experience_release_repository=valid/);
  await assert.rejects(execFileAsync(process.execPath, args));
  await assert.rejects(execFileAsync(process.execPath, [script, 'unknown']));
  await assert.rejects(execFileAsync(process.execPath, [script, 'verify', '--input']));
  await assert.rejects(execFileAsync(process.execPath, [script, 'verify', 'input', output]));
  await assert.rejects(
    execFileAsync(process.execPath, [script, 'verify', '--input', output, '--unknown', 'x']),
  );
  await assert.rejects(
    execFileAsync(process.execPath, [script, 'verify', '--input', output, '--input', output]),
  );
});
