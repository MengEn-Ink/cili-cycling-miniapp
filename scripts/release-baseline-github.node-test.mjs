import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { findReleaseBaseline, findTargetCi, decodeArchive } from './release-baseline-github.mjs';

const sha = 'a'.repeat(40);
const repository = 'example/cili';
const environment = { id: 'fixture', region: 'fixture' };
const ci = {
  id: 10,
  run_attempt: 2,
  workflow_id: 1,
  path: '.github/workflows/ci.yml',
  repository: { full_name: repository },
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
};
const run = {
  ...ci,
  id: 20,
  run_attempt: 1,
  workflow_id: 2,
  path: '.github/workflows/deploy-cloudbase.yml',
  event: 'workflow_run',
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
  workflowRunId: '20',
  workflowRunAttempt: '1',
  ciRunId: '10',
  ciRunAttempt: '2',
  environment,
  outcome: 'SUCCEEDED',
  functions: ['profile'],
  applyInfrastructure: false,
  checks: { deployment: true, readback: true, cleanup: true },
  createdAt: '2026-10-26T00:00:00.000Z',
};

function fixture({ runs = [run], tamper = false, missing = false, skipped = false } = {}) {
  const archive = Buffer.from(
    JSON.stringify(
      skipped
        ? {
            schemaVersion: 1,
            kind: 'cloudbase',
            repository,
            workflowRunId: '21',
            workflowRunAttempt: '1',
            toolingSha: sha,
            environment,
            outcome: 'SKIPPED',
            sideEffectsStarted: false,
          }
        : receipt,
    ),
  );
  const artifacts = skipped
    ? [
        {
          id: 101,
          name: 'cloudbase-release-outcome-1',
          expired: false,
          workflow_run: { id: 21, head_sha: sha },
        },
      ]
    : [
        {
          id: 100,
          name: `cloudbase-release-receipt-${sha}-1`,
          expired: false,
          workflow_run: { id: 20, head_sha: sha },
        },
      ];
  for (const artifact of artifacts)
    artifact.digest = `sha256:${createHash('sha256').update(archive).digest('hex')}`;
  if (tamper) artifacts[0].digest = `sha256:${'0'.repeat(64)}`;
  const api = (path) => {
    if (path.endsWith('/workflows/ci.yml')) return { id: 1 };
    if (path.endsWith('/workflows/deploy-cloudbase.yml')) return { id: 2 };
    if (path.includes('/workflows/ci.yml/runs')) return { workflow_runs: [ci] };
    if (path.includes('/workflows/deploy-cloudbase.yml/runs'))
      return { workflow_runs: runs, total_count: runs.length };
    if (path.includes('/runs/10/attempts/2')) return ci;
    if (path.includes('/runs/20/attempts/1')) return run;
    if (path.includes('/runs/21/attempts/1')) return { ...run, id: 21 };
    if (path.includes('/runs/20/artifacts')) return { artifacts: missing ? [] : artifacts };
    if (path.includes('/runs/21/artifacts')) return { artifacts };
    throw new Error(`unexpected API ${path}`);
  };
  return {
    api,
    download: () => archive,
    decode: (bytes) => JSON.parse(bytes.toString()),
    verifyContent: () => {},
    repository,
    kind: 'cloudbase',
    environment,
    currentRunId: '30',
  };
}

test('同目标成功 main CI 必须回读实际 run attempt', () => {
  const options = fixture();
  assert.deepEqual(findTargetCi({ ...options, targetSha: sha }), {
    ciRunId: '10',
    ciRunAttempt: '2',
  });
  assert.throws(() => findTargetCi({ ...options, targetSha: 'd'.repeat(40) }), /CI|SHA/);
});

test('只有 artifact + attempt + CI + Git 内容校验完整的真实 receipt 可用', () => {
  assert.equal(findReleaseBaseline(fixture()).baseline.targetSha, sha);
  assert.throws(() => findReleaseBaseline(fixture({ tamper: true })), /摘要/);
  assert.throws(
    () =>
      findReleaseBaseline({
        ...fixture(),
        verifyContent: () => {
          throw new Error('Git 内容不匹配');
        },
      }),
    /内容/,
  );
});

test('missing receipt 和首次发布回退全量，不从成功运行 head 推进基线', () => {
  assert.deepEqual(findReleaseBaseline(fixture({ missing: true })), {
    baseline: null,
    forceReconcile: true,
  });
  assert.equal(findReleaseBaseline(fixture({ runs: [] })).forceReconcile, true);
});

test('B 部分失败后 C 回滚到 A 仍强制完整补偿；取消/未知同理', () => {
  for (const conclusion of ['failure', 'cancelled', 'success']) {
    const options = fixture({ runs: [{ ...run, id: 22, conclusion }, run] });
    const api = options.api;
    options.api = (path) => (path.includes('/runs/22/artifacts') ? { artifacts: [] } : api(path));
    const result = findReleaseBaseline(options);
    assert.equal(result.baseline.targetSha, sha);
    assert.equal(result.forceReconcile, true);
  }
});

test('有可校验无副作用 SKIPPED 证据不强制补偿，也不推进基线', () => {
  const skip = fixture({ runs: [{ ...run, id: 21 }, run], skipped: true });
  const good = fixture();
  const skipApi = skip.api;
  skip.api = (path) => (path.includes('/runs/20/') ? good.api(path) : skipApi(path));
  skip.download = (path) =>
    path.includes('/100/') ? good.download(path) : fixture({ skipped: true }).download(path);
  const result = findReleaseBaseline(skip);
  assert.equal(result.baseline.workflowRunId, '20');
  assert.equal(result.forceReconcile, false);
});

test('fork/非 main 不可用；同 run 重试保守完整补偿', () => {
  assert.equal(
    findReleaseBaseline(
      fixture({
        runs: [{ ...run, repository: { full_name: 'other/repo' } }],
      }),
    ).baseline,
    null,
  );
  assert.equal(
    findReleaseBaseline({
      ...fixture(),
      currentRunAttempt: '2',
    }).forceReconcile,
    true,
  );
});

test('archive 解析拒绝无效或过大压缩包', () => {
  assert.throws(() => decodeArchive(Buffer.from('not a zip'), 'release-receipt.json'), /archive/);
  assert.throws(
    () => decodeArchive(Buffer.alloc(2 * 1024 * 1024 + 1), 'release-receipt.json'),
    /archive/,
  );
});

test('较旧 run 在后页重试，但副作用时间晚于基线时仍强制补偿', () => {
  const options = fixture();
  const api = options.api;
  const newer = { ...run, updated_at: '2026-10-26T02:00:00Z' };
  const olderRetry = { ...run, id: 19, conclusion: 'failure', updated_at: '2026-10-26T03:00:00Z' };
  options.api = (path) => {
    if (path.includes('/workflows/deploy-cloudbase.yml/runs')) {
      return {
        workflow_runs: path.endsWith('page=1')
          ? [newer, ...Array.from({ length: 99 }, () => ({ ...run, head_branch: 'feature' }))]
          : [olderRetry],
        total_count: 101,
      };
    }
    if (path.includes('/runs/19/artifacts')) return { artifacts: [] };
    return api(path);
  };
  assert.equal(findReleaseBaseline(options).forceReconcile, true);
});
