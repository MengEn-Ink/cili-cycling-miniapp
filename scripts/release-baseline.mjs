import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  configuredFunctions,
  createCloudBaseDeployDecision,
} from './cloudbase-deploy-decision.mjs';
import { shouldUploadMiniProgram } from './miniprogram-upload-decision.mjs';

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[1-9][0-9]{0,19}$/;
const WORKFLOWS = {
  cloudbase: '.github/workflows/deploy-cloudbase.yml',
  miniprogram: '.github/workflows/deploy-miniprogram.yml',
};
const INFRASTRUCTURE = [
  'cloudbaserc.json',
  'cloudstorage.rules.json',
  'scripts/bootstrap-cloudbase.mjs',
  'scripts/cloudbase-storage-rules.mjs',
  'scripts/cloudbase-function-env.mjs',
];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, maxBuffer: 20 * 1024 * 1024 });
}

function sameEnvironment(left, right) {
  return left?.id === right?.id && left?.region === right?.region;
}

export function validateReleaseReceipt(value, expected = {}) {
  requireValue(
    value && typeof value === 'object' && !Array.isArray(value),
    'release receipt 必须是对象',
  );
  requireValue(
    value.schemaVersion === 1 && WORKFLOWS[value.kind] === value.workflow,
    'release receipt schema 或工作流无效',
  );
  requireValue(
    typeof value.repository === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value.repository),
    'release receipt 仓库无效',
  );
  for (const field of ['targetSha', 'toolingSha', 'sourceTree']) {
    requireValue(
      typeof value[field] === 'string' && SHA.test(value[field]),
      `release receipt ${field} 无效`,
    );
  }
  requireValue(DIGEST.test(value.infrastructureDigest || ''), 'release receipt 基础设施摘要无效');
  for (const field of ['workflowRunId', 'workflowRunAttempt', 'ciRunId', 'ciRunAttempt']) {
    requireValue(
      typeof value[field] === 'string' && ID.test(value[field]),
      `release receipt ${field} 无效`,
    );
  }
  requireValue(value.outcome === 'SUCCEEDED', '只有完整成功 SUCCEEDED receipt 可以更新基线');
  for (const check of ['deployment', 'readback', 'cleanup']) {
    requireValue(value.checks?.[check] === true, `release receipt 未完整完成 ${check}`);
  }
  requireValue(
    value.environment &&
      typeof value.environment.id === 'string' &&
      value.environment.id.length > 0 &&
      typeof value.environment.region === 'string',
    'release receipt 环境无效',
  );
  requireValue(
    Array.isArray(value.functions) &&
      value.functions.every((name) => typeof name === 'string' && /^[a-z][a-z0-9-]*$/.test(name)) &&
      new Set(value.functions).size === value.functions.length,
    'release receipt 函数清单无效',
  );
  requireValue(typeof value.applyInfrastructure === 'boolean', 'release receipt 基础设施标志无效');
  requireValue(
    typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)),
    'release receipt 时间无效',
  );
  if (value.kind === 'miniprogram') {
    requireValue(
      value.functions.length === 0 && !value.applyInfrastructure,
      '小程序 receipt 不允许云范围',
    );
    requireValue(
      typeof value.version === 'string' && /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/.test(value.version),
      '小程序 receipt 版本无效',
    );
  }
  if (expected.repository)
    requireValue(value.repository === expected.repository, 'release receipt 仓库不匹配');
  if (expected.kind) requireValue(value.kind === expected.kind, 'release receipt 类型不匹配');
  if (expected.environment)
    requireValue(
      sameEnvironment(value.environment, expected.environment),
      'release receipt 环境不匹配',
    );
  return value;
}

export function verifyTargetCi(run, targetSha, repository, workflowId) {
  requireValue(SHA.test(targetSha), '目标 CI SHA 无效');
  requireValue(
    run?.head_sha === targetSha &&
      run.repository?.full_name === repository &&
      run.workflow_id === workflowId &&
      run.path === '.github/workflows/ci.yml' &&
      run.head_branch === 'main' &&
      run.event === 'push' &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      ID.test(String(run.id)) &&
      ID.test(String(run.run_attempt)),
    '发布目标没有同 SHA、可信 main push 的成功 CI',
  );
  return { ciRunId: String(run.id), ciRunAttempt: String(run.run_attempt) };
}

export function verifyReceiptArtifact({ run, artifact, archive, receipt, expected }) {
  validateReleaseReceipt(receipt, expected);
  requireValue(
    run?.repository?.full_name === expected.repository &&
      run.workflow_id === expected.workflowId &&
      run.path === WORKFLOWS[expected.kind] &&
      run.head_branch === 'main' &&
      ['push', 'workflow_dispatch', 'workflow_run'].includes(run.event) &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'release receipt 来源运行或工作流不可信',
  );
  requireValue(
    receipt.workflowRunId === String(run.id) &&
      receipt.workflowRunAttempt === String(run.run_attempt) &&
      receipt.toolingSha === run.head_sha,
    'release receipt 与来源运行或 attempt 不匹配',
  );
  requireValue(
    artifact?.name ===
      `${expected.kind}-release-receipt-${receipt.targetSha}-${receipt.workflowRunAttempt}` &&
      artifact.expired === false &&
      artifact.workflow_run?.id === run.id &&
      artifact.workflow_run?.head_sha === run.head_sha,
    'release receipt artifact 与来源运行不匹配或已过期',
  );
  requireValue(
    Buffer.isBuffer(archive) &&
      artifact.digest === `sha256:${createHash('sha256').update(archive).digest('hex')}`,
    'release receipt artifact 下载摘要不匹配',
  );
  return receipt;
}

export function releaseContentIdentity(targetSha, cwd = process.cwd()) {
  requireValue(SHA.test(targetSha), '目标 SHA 无效');
  return {
    sourceTree: git(['rev-parse', `${targetSha}^{tree}`], cwd)
      .toString('utf8')
      .trim(),
    infrastructureDigest: `sha256:${createHash('sha256')
      .update(git(['ls-tree', '-r', '-z', targetSha, '--', ...INFRASTRUCTURE], cwd))
      .digest('hex')}`,
  };
}

export function verifyReceiptContent(receipt, cwd = process.cwd()) {
  const identity = releaseContentIdentity(receipt.targetSha, cwd);
  requireValue(identity.sourceTree === receipt.sourceTree, 'release receipt Git tree 内容不匹配');
  requireValue(
    identity.infrastructureDigest === receipt.infrastructureDigest,
    'release receipt 基础设施内容摘要不匹配',
  );
}

export function releaseChangedPaths(base, targetSha, cwd = process.cwd()) {
  requireValue(SHA.test(base) && SHA.test(targetSha), '累计基线与目标 SHA 无效');
  try {
    git(['merge-base', '--is-ancestor', base, targetSha], cwd);
  } catch {
    throw new Error('发布基线不是目标 SHA 的可解析祖先');
  }
  return git(['diff', '--no-renames', '--name-only', '-z', base, targetSha, '--'], cwd)
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

export function cumulativeReleaseScope({
  kind,
  baseline,
  targetSha,
  cwd = process.cwd(),
  config,
  force = false,
}) {
  requireValue(WORKFLOWS[kind], '发布类型无效');
  const paths = baseline ? releaseChangedPaths(baseline.targetSha, targetSha, cwd) : [];
  const full = force || !baseline;
  const scope =
    kind === 'miniprogram'
      ? { shouldUpload: full || shouldUploadMiniProgram(paths) }
      : full
        ? { shouldDeploy: true, applyInfrastructure: true, functions: configuredFunctions(config) }
        : createCloudBaseDeployDecision(paths, config);
  return {
    ...scope,
    kind,
    targetSha,
    baselineSha: baseline?.targetSha || null,
    full,
    changedPaths: paths,
  };
}

export function configuredReleaseEnvironment(kind, cwd = process.cwd()) {
  if (kind === 'miniprogram') {
    return { id: JSON.parse(readFileSync(`${cwd}/project.config.json`, 'utf8')).appid, region: '' };
  }
  const config = JSON.parse(readFileSync(`${cwd}/cloudbaserc.json`, 'utf8'));
  return { id: config.envId, region: process.env.CLOUDBASE_REGION || '' };
}
