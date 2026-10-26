import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as release from './release-baseline.mjs';

const repository = 'example/cili';
const environment = { id: 'fixture-env', region: 'fixture-region' };
const sha = 'a'.repeat(40);
const run = {
  id: 101,
  run_attempt: 2,
  workflow_id: 10,
  path: '.github/workflows/deploy-cloudbase.yml',
  head_sha: sha,
  head_branch: 'main',
  event: 'workflow_dispatch',
  status: 'completed',
  conclusion: 'success',
  repository: { full_name: repository },
};
const receipt = {
  schemaVersion: 1,
  kind: 'cloudbase',
  repository,
  workflow: run.path,
  targetSha: sha,
  toolingSha: sha,
  sourceTree: 'b'.repeat(40),
  infrastructureDigest: `sha256:${'c'.repeat(64)}`,
  workflowRunId: '101',
  workflowRunAttempt: '2',
  ciRunId: '90',
  ciRunAttempt: '1',
  environment,
  outcome: 'SUCCEEDED',
  functions: ['profile'],
  applyInfrastructure: false,
  checks: { deployment: true, readback: true, cleanup: true },
  createdAt: '2026-10-26T00:00:00.000Z',
};
const ci = {
  ...run,
  id: 90,
  run_attempt: 1,
  workflow_id: 20,
  path: '.github/workflows/ci.yml',
  event: 'push',
};

test('成功发布 receipt 校验实际目标、环境和完整完成条件', () => {
  assert.deepEqual(
    release.validateReleaseReceipt(receipt, { repository, kind: 'cloudbase', environment }),
    receipt,
  );
  for (const outcome of ['SKIPPED', 'PARTIAL', 'UNKNOWN']) {
    assert.throws(() => release.validateReleaseReceipt({ ...receipt, outcome }), /成功|SUCCEEDED/);
  }
  assert.throws(
    () =>
      release.validateReleaseReceipt({ ...receipt, checks: { ...receipt.checks, cleanup: false } }),
    /完整|cleanup/,
  );
  assert.throws(
    () => release.validateReleaseReceipt(receipt, { environment: { ...environment, id: 'other' } }),
    /环境/,
  );
});

test('真实发布目标必须具有同 SHA、main push 的成功 CI', () => {
  assert.doesNotThrow(() => release.verifyTargetCi(ci, sha, repository, 20));
  for (const invalid of [
    { head_sha: 'd'.repeat(40) },
    { conclusion: 'failure' },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { workflow_id: 21 },
    { repository: { full_name: 'other/repo' } },
  ])
    assert.throws(
      () => release.verifyTargetCi({ ...ci, ...invalid }, sha, repository, 20),
      /CI|SHA/,
    );
});

test('artifact 绑定可信工作流运行、attempt 与下载摘要；任何篡改阻断', () => {
  const archive = Buffer.from('fixture archive');
  const artifact = {
    name: `cloudbase-release-receipt-${sha}-2`,
    expired: false,
    digest: `sha256:${createHash('sha256').update(archive).digest('hex')}`,
    workflow_run: { id: 101, head_sha: sha },
  };
  const expected = { repository, kind: 'cloudbase', environment, workflowId: 10 };
  assert.deepEqual(
    release.verifyReceiptArtifact({ run, artifact, archive, receipt, expected }),
    receipt,
  );
  for (const invalid of [
    { receipt: { ...receipt, workflowRunAttempt: '1' } },
    { receipt: { ...receipt, toolingSha: 'e'.repeat(40) } },
    { artifact: { ...artifact, digest: `sha256:${'0'.repeat(64)}` } },
    { artifact: { ...artifact, expired: true } },
    { run: { ...run, conclusion: 'cancelled' } },
    { run: { ...run, workflow_id: 20 } },
  ])
    assert.throws(
      () =>
        release.verifyReceiptArtifact({ run, artifact, archive, receipt, expected, ...invalid }),
      /receipt|artifact|运行|摘要|工作流/,
    );
});

function history(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'cili-release-history-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(cwd, 'miniprogram'));
  mkdirSync(join(cwd, 'cloudfunctions/profile'), { recursive: true });
  mkdirSync(join(cwd, 'docs'));
  writeFileSync(join(cwd, 'miniprogram/old.ts'), 'same\n');
  writeFileSync(join(cwd, 'cloudfunctions/profile/old.js'), 'same\n');
  writeFileSync(join(cwd, 'cloudbaserc.json'), '{}\n');
  git('add', '.');
  git('commit', '-qm', 'A');
  const A = git('rev-parse', 'HEAD');
  renameSync(join(cwd, 'miniprogram/old.ts'), join(cwd, 'docs/moved.ts'));
  rmSync(join(cwd, 'cloudfunctions/profile/old.js'));
  git('add', '.');
  git('commit', '-qm', 'B');
  const B = git('rev-parse', 'HEAD');
  writeFileSync(join(cwd, 'docs/readme.md'), 'C\n');
  git('add', '.');
  git('commit', '-qm', 'C');
  return { cwd, git, A, B, C: git('rev-parse', 'HEAD') };
}

test('A 发布后 B 失败、C 仅文档：累计 diff 包含删除和跨目录 rename 两端', (t) => {
  const { cwd, A, C } = history(t);
  const paths = release.releaseChangedPaths(A, C, cwd);
  assert.deepEqual(paths.sort(), [
    'cloudfunctions/profile/old.js',
    'docs/moved.ts',
    'docs/readme.md',
    'miniprogram/old.ts',
  ]);
  assert.equal(
    release.cumulativeReleaseScope({
      kind: 'miniprogram',
      baseline: { ...receipt, targetSha: A },
      targetSha: C,
      cwd,
    }).shouldUpload,
    true,
  );
  const scope = release.cumulativeReleaseScope({
    kind: 'cloudbase',
    baseline: { ...receipt, targetSha: A },
    targetSha: C,
    cwd,
    config: { functions: [{ name: 'profile' }] },
  });
  assert.deepEqual(scope.functions, ['profile']);
});

test('缺失基线默认全量；非祖先基线拒绝，重复运行同目标不增加发布', (t) => {
  const { cwd, A, C } = history(t);
  const config = { functions: [{ name: 'profile' }, { name: 'auth' }] };
  const full = release.cumulativeReleaseScope({
    kind: 'cloudbase',
    baseline: null,
    targetSha: C,
    cwd,
    config,
  });
  assert.deepEqual(full.functions, ['profile', 'auth']);
  assert.equal(full.applyInfrastructure, true);
  assert.throws(
    () =>
      release.cumulativeReleaseScope({
        kind: 'cloudbase',
        baseline: { ...receipt, targetSha: 'f'.repeat(40) },
        targetSha: C,
        cwd,
        config,
      }),
    /祖先|基线/,
  );
  assert.equal(
    release.cumulativeReleaseScope({
      kind: 'miniprogram',
      baseline: { ...receipt, targetSha: C },
      targetSha: C,
      cwd,
    }).shouldUpload,
    false,
  );
  assert.equal(
    release.cumulativeReleaseScope({
      kind: 'miniprogram',
      baseline: { ...receipt, targetSha: A },
      targetSha: C,
      cwd,
      force: true,
    }).shouldUpload,
    true,
  );
});

test('基线 source tree 与基础设施摘要必须从目标 Git 内容回读一致', (t) => {
  const { cwd, A } = history(t);
  const bound = { ...receipt, targetSha: A, ...release.releaseContentIdentity(A, cwd) };
  assert.doesNotThrow(() => release.verifyReceiptContent(bound, cwd));
  assert.throws(
    () => release.verifyReceiptContent({ ...bound, sourceTree: 'f'.repeat(40) }, cwd),
    /内容|tree/,
  );
  assert.throws(
    () =>
      release.verifyReceiptContent(
        { ...bound, infrastructureDigest: `sha256:${'f'.repeat(64)}` },
        cwd,
      ),
    /内容|摘要/,
  );
});
