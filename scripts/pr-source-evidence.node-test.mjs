import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHarnessReport } from './harness.mjs';
import {
  sourceIdentity,
  canReuseSourceEvidence,
  decodeSourceArchive,
  findSourceEvidence,
  run,
} from './pr-source-evidence.mjs';

const sha = 'a'.repeat(40);
const expected = {
  schemaVersion: 1,
  repository: 'example/cili',
  pullRequest: '5',
  headSha: sha,
  baseSha: 'b'.repeat(40),
  mergeTree: 'c'.repeat(40),
  validatorDigest: `sha256:${'d'.repeat(64)}`,
  lockDigest: `sha256:${'e'.repeat(64)}`,
  nodeMajor: 24,
  runnerOS: 'Linux',
};
const actualReport = createHarnessReport({
  selection: 'affected',
  mode: 'github-actions',
  commitSha: 'f'.repeat(40),
  taskNames: ['affected'],
});
actualReport.outcome = 'passed';
actualReport.tasks[0].status = 'passed';
actualReport.tasks[0].exitCode = 0;
const report = Buffer.from(JSON.stringify(actualReport));
const evidence = {
  ...expected,
  workflowRunId: '30',
  workflowRunAttempt: '2',
  eventAction: 'synchronize',
  mergeCommit: 'f'.repeat(40),
  outcome: 'passed',
  harnessDigest: `sha256:${createHash('sha256').update(report).digest('hex')}`,
};

test('仅同内容、实际 Harness 成功且绑定 run attempt 的源码证据可复用', () => {
  assert.equal(canReuseSourceEvidence(expected, evidence, report), true);
  for (const change of [
    { headSha: '0'.repeat(40) },
    { baseSha: '0'.repeat(40) },
    { mergeTree: '0'.repeat(40) },
    { validatorDigest: `sha256:${'0'.repeat(64)}` },
    { lockDigest: `sha256:${'0'.repeat(64)}` },
    { schemaVersion: 0 },
    { outcome: 'failed' },
    { eventAction: 'edited' },
    { workflowRunAttempt: '0' },
    { nodeMajor: 22 },
    { harnessDigest: `sha256:${'0'.repeat(64)}` },
  ])
    assert.equal(canReuseSourceEvidence(expected, { ...evidence, ...change }, report), false);
  for (const outcome of ['blocked', 'failed', 'running'])
    assert.equal(
      canReuseSourceEvidence(expected, evidence, Buffer.from(JSON.stringify({ outcome }))),
      false,
    );
  for (const mode of ['local', 'run']) {
    const bytes = Buffer.from(JSON.stringify({ ...actualReport, mode }));
    const harnessDigest = digestFor(bytes);
    assert.equal(canReuseSourceEvidence(expected, { ...evidence, harnessDigest }, bytes), false);
  }
});

function digestFor(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fixture(overrides = {}) {
  const run = {
    id: 30,
    run_attempt: 2,
    workflow_id: 10,
    path: '.github/workflows/ci.yml',
    repository: { full_name: expected.repository },
    head_sha: sha,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'failure',
    pull_requests: [{ number: 5 }],
    ...overrides,
  };
  const archive = Buffer.from('fixture archive');
  const artifact = {
    id: 50,
    name: 'pr-source-evidence-5-2',
    expired: false,
    digest: `sha256:${createHash('sha256').update(archive).digest('hex')}`,
    workflow_run: { id: 30, head_sha: sha },
  };
  const job = {
    name: 'affected-pr',
    conclusion: 'success',
    steps: [{ name: 'Run affected pull request checks through Harness', conclusion: 'success' }],
  };
  const api = (path) => {
    if (path.endsWith('/workflows/ci.yml')) return { id: 10 };
    if (path.includes('/workflows/ci.yml/runs')) return { workflow_runs: [run] };
    if (path.includes('/runs/30/attempts/2/jobs')) return { jobs: [job] };
    if (path.includes('/runs/30/attempts/2')) return run;
    if (path.includes('/runs/30/artifacts')) return { artifacts: [artifact] };
    throw new Error('unexpected API');
  };
  return {
    expected,
    action: 'edited',
    fork: false,
    currentRunId: '40',
    api,
    download: () => archive,
    decode: () => ({ evidence, report }),
  };
}

test('描述失败但源码 job 成功后可复用，不要求旧运行整体验证成功', () => {
  assert.equal(findSourceEvidence(fixture())?.workflowRunId, '30');
});

test('fork、source 事件、取消、错仓库/attempt、缺失/篡改 artifact 均回退 affected', () => {
  for (const override of [
    { fork: true },
    { action: 'synchronize' },
    { action: 'opened' },
    {
      api: () => {
        throw new Error('missing');
      },
    },
    { download: () => Buffer.from('tampered') },
    { decode: () => ({ evidence: { ...evidence, workflowRunAttempt: '1' }, report }) },
  ])
    assert.equal(findSourceEvidence({ ...fixture(), ...override }), null);
  for (const run of [
    { conclusion: 'cancelled' },
    { status: 'in_progress' },
    { repository: { full_name: 'other/repo' } },
    { workflow_id: 11 },
  ])
    assert.equal(findSourceEvidence(fixture(run)), null);
});

test('失败或取消的源码 job、未实际执行 Harness 不可复用', () => {
  for (const job of [
    { name: 'affected-pr', conclusion: 'failure', steps: [] },
    {
      name: 'affected-pr',
      conclusion: 'success',
      steps: [{ name: 'Run affected pull request checks through Harness', conclusion: 'skipped' }],
    },
  ]) {
    const options = fixture();
    const api = options.api;
    options.api = (path) => (path.endsWith('/jobs?per_page=100') ? { jobs: [job] } : api(path));
    assert.equal(findSourceEvidence(options), null);
  }
});

test('真实 merge tree 身份跟随 validator 与 lock 内容，普通源码修改也改变 tree', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'cili-pr-identity-'));
  t.after(() => rmSync(cwd, { force: true, recursive: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(cwd, 'package.json'), '{}');
  writeFileSync(join(cwd, 'package-lock.json'), '{}');
  git('add', '.');
  git('commit', '-qm', 'A');
  const A = git('rev-parse', 'HEAD');
  const identity = () =>
    sourceIdentity({ ...expected, cwd, headSha: git('rev-parse', 'HEAD'), baseSha: A });
  const original = identity();
  writeFileSync(join(cwd, 'package-lock.json'), '{"changed":true}');
  git('add', '.');
  git('commit', '-qm', 'B');
  const changed = identity();
  assert.notEqual(changed.mergeTree, original.mergeTree);
  assert.notEqual(changed.lockDigest, original.lockDigest);
  assert.equal(changed.validatorDigest, original.validatorDigest);
  writeFileSync(join(cwd, 'package.json'), '{"scripts":{"test":"changed"}}');
  git('add', '.');
  git('commit', '-qm', 'C');
  assert.notEqual(identity().validatorDigest, original.validatorDigest);
  assert.throws(() => sourceIdentity({ ...expected, cwd, baseSha: A }), /checkout|合并/);
  assert.throws(
    () => sourceIdentity({ ...expected, cwd, headSha: git('rev-parse', 'HEAD') }),
    /checkout|合并/,
  );
});

test('CLI 生成实际 Harness 与源码证据，真实 zip 核验后可复用', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'cili-pr-evidence-cli-'));
  t.after(() => rmSync(cwd, { force: true, recursive: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(cwd, 'package.json'), '{}');
  git('add', '.');
  git('commit', '-qm', 'fixture');
  const commit = git('rev-parse', 'HEAD');
  mkdirSync(join(cwd, 'artifacts/harness'), { recursive: true });
  writeFileSync(
    join(cwd, 'artifacts/harness/harness-report.json'),
    JSON.stringify({ ...JSON.parse(report), commitSha: commit }),
  );
  run(
    ['create'],
    {
      RUNNER_TEMP: cwd,
      GITHUB_REPOSITORY: expected.repository,
      PR_NUMBER: '5',
      PR_HEAD_SHA: commit,
      PR_BASE_SHA: commit,
      PR_ACTION: 'synchronize',
      GITHUB_RUN_ID: '30',
      GITHUB_RUN_ATTEMPT: '2',
    },
    cwd,
  );
  const dir = join(cwd, 'pr-source-evidence');
  execFileSync('zip', ['-q', 'evidence.zip', 'source-evidence.json', 'harness-report.json'], {
    cwd: dir,
  });
  const decoded = decodeSourceArchive(readFileSync(join(dir, 'evidence.zip')));
  assert.equal(
    canReuseSourceEvidence(
      sourceIdentity({
        repository: expected.repository,
        pullRequest: '5',
        headSha: commit,
        baseSha: commit,
        cwd,
      }),
      decoded.evidence,
      decoded.report,
    ),
    true,
  );
});
