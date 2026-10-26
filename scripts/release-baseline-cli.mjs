#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findReleaseBaseline, findTargetCi } from './release-baseline-github.mjs';
import {
  configuredReleaseEnvironment,
  cumulativeReleaseScope,
  releaseContentIdentity,
  validateReleaseReceipt,
} from './release-baseline.mjs';

function write(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export function run(argv = process.argv.slice(2), env = process.env, cwd = process.cwd()) {
  const [command, kind, targetSha, output] = argv;
  if (
    !['scope', 'finalize'].includes(command) ||
    !['cloudbase', 'miniprogram'].includes(kind) ||
    !/^[0-9a-f]{40}$/.test(targetSha || '') ||
    !output
  )
    throw new Error(
      'usage: release-baseline-cli.mjs scope|finalize cloudbase|miniprogram SHA output',
    );
  const environment = configuredReleaseEnvironment(kind, cwd);
  if (kind === 'cloudbase' && env.CLOUDBASE_ENV_ID !== environment.id)
    throw new Error('发布环境与源码配置不一致');
  const base = {
    schemaVersion: 1,
    kind,
    repository: env.GITHUB_REPOSITORY,
    workflow: `.github/workflows/deploy-${kind}.yml`,
    targetSha,
    toolingSha: env.TOOLING_SHA || env.TARGET_SHA,
    workflowRunId: env.GITHUB_RUN_ID,
    workflowRunAttempt: env.GITHUB_RUN_ATTEMPT,
    environment,
  };
  const scopePath = resolve(env.RUNNER_TEMP, `${kind}-release-scope.json`);
  if (command === 'scope') {
    const main = execFileSync('git', ['rev-parse', 'origin/main'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    const stale = base.toolingSha !== main || (env.RESTORE_MODE !== 'true' && targetSha !== main);
    if (stale) {
      const value = {
        ...base,
        shouldDeploy: false,
        shouldUpload: false,
        applyInfrastructure: false,
        functions: [],
        reason: 'stale-target',
      };
      write(output, value);
      return value;
    }
    const ci = findTargetCi({ repository: base.repository, targetSha });
    const history = findReleaseBaseline({
      repository: base.repository,
      kind,
      environment,
      cwd,
      currentRunId: base.workflowRunId,
      currentRunAttempt: base.workflowRunAttempt,
    });
    let baseline = history.baseline;
    if (baseline) {
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', baseline.targetSha, targetSha], {
          cwd,
          stdio: 'pipe',
        });
      } catch {
        baseline = null;
      }
    }
    const config = JSON.parse(readFileSync(resolve(cwd, 'cloudbaserc.json'), 'utf8'));
    const value = {
      ...base,
      ...ci,
      ...releaseContentIdentity(targetSha, cwd),
      ...cumulativeReleaseScope({
        kind,
        baseline,
        targetSha,
        cwd,
        config,
        force:
          history.forceReconcile ||
          env.FORCE_ALL === 'true' ||
          (kind === 'miniprogram' && env.EVENT_NAME === 'workflow_dispatch'),
      }),
    };
    write(output, value);
    return value;
  }
  const scope = existsSync(scopePath) ? JSON.parse(readFileSync(scopePath, 'utf8')) : base;
  const sideEffectsStarted = existsSync(resolve(env.RUNNER_TEMP, `${kind}-release-started`));
  const succeeded = env.RELEASE_SUCCESS === 'true';
  const outcome = succeeded ? (sideEffectsStarted ? 'SUCCEEDED' : 'SKIPPED') : 'UNKNOWN';
  const value = {
    ...base,
    outcome,
    sideEffectsStarted,
    createdAt: new Date().toISOString(),
  };
  if (outcome === 'SUCCEEDED') {
    if (scope.targetSha !== base.targetSha || scope.toolingSha !== base.toolingSha)
      throw new Error('release scope 与实际目标或工具链不匹配');
    const deployed = resolve(env.RUNNER_TEMP, 'cloudbase-actual-functions.txt');
    const receipt = {
      ...scope,
      ...value,
      checks: { deployment: true, readback: true, cleanup: true },
      functions:
        kind === 'cloudbase' && existsSync(deployed)
          ? [...new Set(readFileSync(deployed, 'utf8').split('\n').filter(Boolean))].sort()
          : [],
      applyInfrastructure: kind === 'cloudbase' && scope.applyInfrastructure === true,
      ...(kind === 'miniprogram' ? { version: env.MINIPROGRAM_VERSION } : {}),
    };
    validateReleaseReceipt(receipt, { repository: base.repository, kind, environment });
    write(resolve(env.RUNNER_TEMP, 'release-receipt.json'), receipt);
  }
  write(output, value);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : '发布证据处理失败');
    process.exitCode = 1;
  }
}
