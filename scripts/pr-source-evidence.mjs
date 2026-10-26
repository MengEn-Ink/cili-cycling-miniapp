#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const ID = /^[1-9][0-9]{0,19}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SOURCE_ACTIONS = ['opened', 'synchronize', 'reopened', 'ready_for_review'];
const FIELDS = [
  'schemaVersion',
  'repository',
  'pullRequest',
  'headSha',
  'baseSha',
  'mergeTree',
  'validatorDigest',
  'lockDigest',
  'nodeMajor',
  'runnerOS',
];
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function sourceIdentity({
  repository,
  pullRequest,
  headSha,
  baseSha,
  cwd = process.cwd(),
  nodeMajor = Number(process.versions.node.split('.')[0]),
  runnerOS = process.env.RUNNER_OS || process.platform,
}) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository || '') ||
    !ID.test(pullRequest || '') ||
    !SHA.test(headSha || '') ||
    !SHA.test(baseSha || '')
  )
    throw new Error('PR source identity 输入无效');
  const git = (...args) =>
    execFileSync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }).toString('utf8');
  const [commit, ...parents] = git('rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ');
  if (commit === headSha) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', baseSha, headSha], {
        cwd,
        stdio: 'pipe',
      });
    } catch {
      throw new Error('PR checkout 未包含预期 base');
    }
  } else if (parents.length !== 2 || parents[0] !== baseSha || parents[1] !== headSha) {
    throw new Error('PR checkout 合并父提交与 head/base 不匹配');
  }
  const entries = git('ls-tree', '-r', '-z', 'HEAD').split('\0').filter(Boolean);
  const pathOf = (entry) => entry.slice(entry.indexOf('\t') + 1);
  const validator = entries.filter((entry) =>
    /^(scripts\/|tests\/|\.github\/workflows\/|package\.json$|eslint\.|tsconfig|vitest|\.prettier)/.test(
      pathOf(entry),
    ),
  );
  const locks = entries.filter((entry) =>
    /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(
      pathOf(entry),
    ),
  );
  return {
    schemaVersion: 1,
    repository,
    pullRequest,
    headSha,
    baseSha,
    mergeTree: git('rev-parse', 'HEAD^{tree}').trim(),
    validatorDigest: digest(validator.join('\0')),
    lockDigest: digest(locks.join('\0')),
    nodeMajor,
    runnerOS,
  };
}

export function canReuseSourceEvidence(expected, evidence, bytes) {
  try {
    if (
      expected.schemaVersion !== 1 ||
      FIELDS.some((key) => expected[key] !== evidence?.[key]) ||
      ![evidence.headSha, evidence.baseSha, evidence.mergeTree, evidence.mergeCommit].every(
        (value) => SHA.test(value || ''),
      ) ||
      ![evidence.validatorDigest, evidence.lockDigest, evidence.harnessDigest].every((value) =>
        DIGEST.test(value || ''),
      ) ||
      !ID.test(evidence.workflowRunId || '') ||
      !ID.test(evidence.workflowRunAttempt || '') ||
      !SOURCE_ACTIONS.includes(evidence.eventAction) ||
      evidence.outcome !== 'passed' ||
      !Buffer.isBuffer(bytes) ||
      bytes.length > 128 * 1024 ||
      digest(bytes) !== evidence.harnessDigest
    )
      return false;
    const report = JSON.parse(bytes.toString('utf8'));
    return (
      report.schemaVersion === 2 &&
      report.selection === 'affected' &&
      report.mode === 'run' &&
      report.commitSha === evidence.mergeCommit &&
      report.outcome === 'passed' &&
      report.tasks?.length === 1 &&
      report.tasks[0].name === 'affected' &&
      report.tasks[0].status === 'passed' &&
      report.tasks[0].exitCode === 0
    );
  } catch {
    return false;
  }
}

function api(path, binary = false) {
  const bytes = execFileSync('gh', ['api', path], {
    timeout: 15_000,
    maxBuffer: binary ? 2 * 1024 * 1024 : 5 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return binary ? bytes : JSON.parse(bytes.toString('utf8'));
}

export function decodeSourceArchive(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024)
    throw new Error('source archive 超限');
  const dir = mkdtempSync(join(tmpdir(), 'cili-source-evidence-'));
  const file = join(dir, 'evidence.zip');
  try {
    writeFileSync(file, bytes, { mode: 0o600 });
    const options = { timeout: 5_000, maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'] };
    const names = execFileSync('unzip', ['-Z1', file], options)
      .toString('utf8')
      .trim()
      .split('\n')
      .sort();
    if (names.join(',') !== 'harness-report.json,source-evidence.json')
      throw new Error('source archive 文件清单无效');
    return {
      evidence: JSON.parse(
        execFileSync('unzip', ['-p', file, 'source-evidence.json'], options).toString('utf8'),
      ),
      report: execFileSync('unzip', ['-p', file, 'harness-report.json'], options),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function findSourceEvidence(input) {
  const options = {
    api,
    download: (path) => api(path, true),
    decode: decodeSourceArchive,
    ...input,
  };
  if (!['edited', 'labeled'].includes(options.action) || options.fork) return null;
  const { expected } = options;
  const root = `repos/${expected.repository}/actions`;
  const deadline = Date.now() + 60_000;
  try {
    const workflowId = options.api(`${root}/workflows/ci.yml`).id;
    const runs = options.api(
      `${root}/workflows/ci.yml/runs?event=pull_request&head_sha=${expected.headSha}&per_page=100`,
    ).workflow_runs;
    // A bounded search keeps metadata edits cheap; older/missing evidence simply runs affected.
    for (const listed of runs.slice(0, 10)) {
      if (Date.now() >= deadline) return null;
      if (
        String(listed.id) === String(options.currentRunId) ||
        listed.status !== 'completed' ||
        listed.conclusion === 'cancelled' ||
        listed.repository?.full_name !== expected.repository ||
        listed.workflow_id !== workflowId ||
        listed.path !== '.github/workflows/ci.yml' ||
        listed.head_sha !== expected.headSha ||
        listed.event !== 'pull_request' ||
        !listed.pull_requests?.some((pr) => String(pr.number) === expected.pullRequest)
      )
        continue;
      const attempt = `${root}/runs/${listed.id}/attempts/${listed.run_attempt}`;
      const run = options.api(attempt);
      if (
        run.id !== listed.id ||
        run.run_attempt !== listed.run_attempt ||
        run.status !== 'completed' ||
        run.conclusion === 'cancelled' ||
        run.workflow_id !== workflowId ||
        run.repository?.full_name !== expected.repository ||
        run.head_sha !== expected.headSha ||
        run.path !== '.github/workflows/ci.yml' ||
        run.event !== 'pull_request'
      )
        continue;
      const job = options
        .api(`${attempt}/jobs?per_page=100`)
        .jobs.find((item) => item.name === 'affected-pr');
      if (
        job?.conclusion !== 'success' ||
        !job.steps?.some(
          (step) =>
            step.name === 'Run affected pull request checks through Harness' &&
            step.conclusion === 'success',
        )
      )
        continue;
      const artifacts = options
        .api(`${root}/runs/${run.id}/artifacts?per_page=100`)
        .artifacts.filter(
          (item) =>
            item.name === `pr-source-evidence-${expected.pullRequest}-${run.run_attempt}` &&
            !item.expired,
        );
      if (artifacts.length !== 1) continue;
      const artifact = artifacts[0];
      if (artifact.workflow_run?.id !== run.id || artifact.workflow_run?.head_sha !== run.head_sha)
        continue;
      const bytes = options.download(`${root}/artifacts/${artifact.id}/zip`);
      if (artifact.digest !== digest(bytes)) continue;
      const { evidence, report } = options.decode(bytes);
      if (
        evidence.workflowRunId !== String(run.id) ||
        evidence.workflowRunAttempt !== String(run.run_attempt) ||
        !canReuseSourceEvidence(expected, evidence, report)
      )
        continue;
      return {
        workflowRunId: evidence.workflowRunId,
        workflowRunAttempt: evidence.workflowRunAttempt,
        harnessDigest: evidence.harnessDigest,
      };
    }
  } catch {
    // No error from untrusted or unavailable evidence may turn into a successful bypass.
  }
  return null;
}

export function run(argv = process.argv.slice(2), env = process.env, cwd = process.cwd()) {
  const [command] = argv;
  const dir = resolve(env.RUNNER_TEMP, 'pr-source-evidence');
  const expected = sourceIdentity({
    repository: env.GITHUB_REPOSITORY,
    pullRequest: env.PR_NUMBER,
    headSha: env.PR_HEAD_SHA,
    baseSha: env.PR_BASE_SHA,
    cwd,
  });
  if (command === 'prepare') {
    const reused = findSourceEvidence({
      expected,
      action: env.PR_ACTION,
      fork: env.PR_FORK !== 'false',
      currentRunId: env.GITHUB_RUN_ID,
    });
    writeFileSync(
      resolve(env.RUNNER_TEMP, 'pr-source-reuse.json'),
      `${JSON.stringify({ expected, reuse: Boolean(reused), source: reused })}\n`,
    );
    appendFileSync(env.GITHUB_OUTPUT, `reuse=${Boolean(reused)}\n`);
    console.log(
      reused
        ? `复用成功源码检查：run ${reused.workflowRunId} attempt ${reused.workflowRunAttempt}`
        : '无同内容可信证据，执行正常 affected 检查',
    );
    return;
  }
  if (command !== 'create') throw new Error('usage: pr-source-evidence.mjs prepare|create');
  const report = readFileSync(resolve(cwd, 'artifacts/harness/harness-report.json'));
  const evidence = {
    ...expected,
    workflowRunId: env.GITHUB_RUN_ID,
    workflowRunAttempt: env.GITHUB_RUN_ATTEMPT,
    eventAction: env.PR_ACTION,
    mergeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
    outcome: 'passed',
    harnessDigest: digest(report),
  };
  if (!canReuseSourceEvidence(expected, evidence, report))
    throw new Error('实际 Harness 证据不满足成功源码契约');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, 'source-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(join(dir, 'harness-report.json'), report);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    run();
  } catch {
    console.error('PR 源码证据生成失败');
    process.exitCode = 1;
  }
}
