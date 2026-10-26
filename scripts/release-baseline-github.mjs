import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  verifyReceiptArtifact,
  verifyReceiptContent,
  verifyTargetCi,
} from './release-baseline.mjs';

export function githubApi(path, binary = false) {
  try {
    const bytes = execFileSync('gh', ['api', path], {
      timeout: 30_000,
      maxBuffer: binary ? 2 * 1024 * 1024 : 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return binary ? bytes : JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('GitHub evidence API 请求失败或超过有界限制');
  }
}

export function decodeArchive(bytes, filename) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024)
    throw new Error('release archive 超过大小限制');
  const dir = mkdtempSync(join(tmpdir(), 'cili-release-archive-'));
  const file = join(dir, 'evidence.zip');
  try {
    writeFileSync(file, bytes, { mode: 0o600 });
    const options = { timeout: 5_000, maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'] };
    const names = execFileSync('unzip', ['-Z1', file], options).toString('utf8').trim().split('\n');
    if (names.length !== 1 || names[0] !== filename) throw new Error('archive 文件清单无效');
    return JSON.parse(execFileSync('unzip', ['-p', file, filename], options).toString('utf8'));
  } catch {
    throw new Error('release archive 内容无效或超过有界限制');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function findTargetCi({ repository, targetSha, api = githubApi }) {
  const workflowId = api(`repos/${repository}/actions/workflows/ci.yml`).id;
  const runs = api(
    `repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${targetSha}&status=success&per_page=100`,
  ).workflow_runs;
  for (const run of runs) {
    if (run.head_sha !== targetSha) continue;
    const attempt = api(`repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}`);
    return verifyTargetCi(attempt, targetSha, repository, workflowId);
  }
  throw new Error('发布目标没有同 SHA 的成功 main CI');
}

function trustedRun(run, repository, workflowId, workflow) {
  return (
    run.repository?.full_name === repository &&
    run.workflow_id === workflowId &&
    run.path === workflow &&
    run.head_branch === 'main' &&
    ['workflow_run', 'workflow_dispatch', 'push'].includes(run.event)
  );
}

function safeSkip({ run, artifact, options }) {
  if (run.status !== 'completed' || run.conclusion !== 'success' || artifact.expired) return false;
  const bytes = options.download(
    `repos/${options.repository}/actions/artifacts/${artifact.id}/zip`,
  );
  if (artifact.digest !== `sha256:${createHash('sha256').update(bytes).digest('hex')}`)
    throw new Error('release outcome artifact 摘要不匹配');
  const value = options.decode(bytes, 'release-outcome.json');
  return (
    value.schemaVersion === 1 &&
    value.kind === options.kind &&
    value.repository === options.repository &&
    value.workflowRunId === String(run.id) &&
    value.workflowRunAttempt === String(run.run_attempt) &&
    value.toolingSha === run.head_sha &&
    value.environment?.id === options.environment.id &&
    value.environment?.region === options.environment.region &&
    value.outcome === 'SKIPPED' &&
    value.sideEffectsStarted === false &&
    artifact.workflow_run?.id === run.id &&
    artifact.workflow_run?.head_sha === run.head_sha
  );
}

export function findReleaseBaseline(input) {
  const options = {
    api: githubApi,
    download: (path) => githubApi(path, true),
    decode: decodeArchive,
    verifyContent: verifyReceiptContent,
    ...input,
  };
  const { api, repository, kind, currentRunId } = options;
  const workflow = `.github/workflows/deploy-${kind}.yml`;
  const workflowId = api(`repos/${repository}/actions/workflows/deploy-${kind}.yml`).id;
  // A retry can follow a partial attempt with the same run id.
  let forceReconcile = Number(options.currentRunAttempt || 1) > 1;
  const collected = [];
  for (let page = 1; page <= 10; page += 1) {
    const data = api(
      `repos/${repository}/actions/workflows/deploy-${kind}.yml/runs?branch=main&per_page=100&page=${page}`,
    );
    collected.push(...data.workflow_runs);
    if (data.workflow_runs.length < 100) break;
    if (page === 10 && data.total_count > collected.length) forceReconcile = true;
  }
  // GitHub paginates by creation, so retries must be ordered across all pages.
  const runs = collected.sort(
    (a, b) =>
      (Date.parse(b.updated_at) || Number(b.id)) - (Date.parse(a.updated_at) || Number(a.id)),
  );
  for (const listed of runs) {
    if (String(listed.id) === String(currentRunId)) continue;
    if (!trustedRun(listed, repository, workflowId, workflow)) continue;
    const artifacts = api(
      `repos/${repository}/actions/runs/${listed.id}/artifacts?per_page=100`,
    ).artifacts;
    const receipts = artifacts.filter(
      (item) =>
        item.name.startsWith(`${kind}-release-receipt-`) &&
        item.name.endsWith(`-${listed.run_attempt}`),
    );
    if (receipts.length > 1) throw new Error('release receipt artifact 不唯一');
    if (
      receipts.length === 1 &&
      !receipts[0].expired &&
      listed.status === 'completed' &&
      listed.conclusion === 'success'
    ) {
      const run = api(
        `repos/${repository}/actions/runs/${listed.id}/attempts/${listed.run_attempt}`,
      );
      const archive = options.download(
        `repos/${repository}/actions/artifacts/${receipts[0].id}/zip`,
      );
      const receipt = options.decode(archive, 'release-receipt.json');
      verifyReceiptArtifact({
        run,
        archive,
        artifact: receipts[0],
        receipt,
        expected: { repository, kind, environment: options.environment, workflowId },
      });
      const ciWorkflowId = api(`repos/${repository}/actions/workflows/ci.yml`).id;
      const ciRun = api(
        `repos/${repository}/actions/runs/${receipt.ciRunId}/attempts/${receipt.ciRunAttempt}`,
      );
      verifyTargetCi(ciRun, receipt.targetSha, repository, ciWorkflowId);
      options.verifyContent(receipt, options.cwd);
      return { baseline: receipt, forceReconcile };
    }
    const outcomes = artifacts.filter(
      (item) => item.name === `${kind}-release-outcome-${listed.run_attempt}`,
    );
    if (
      outcomes.length === 1 &&
      safeSkip({
        run: api(`repos/${repository}/actions/runs/${listed.id}/attempts/${listed.run_attempt}`),
        artifact: outcomes[0],
        options,
      })
    )
      continue;
    // Missing, partial, cancelled or unknown evidence cannot erase external effects.
    forceReconcile = true;
  }
  return { baseline: null, forceReconcile: true };
}
