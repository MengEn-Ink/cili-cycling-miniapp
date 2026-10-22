import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import test from 'node:test';

import { HARNESS_PROFILES, resolveHarnessTasks } from './harness-registry.mjs';
import {
  createHarnessReport,
  inspectHarnessEnvironment,
  parseHarnessArgs,
  runHarness,
} from './harness.mjs';

const reportPath = 'artifacts/harness/harness-test-report.json';

test.afterEach(() => rmSync(reportPath, { force: true }));

test('配置把验证任务收敛为稳定顺序', () => {
  assert.deepEqual(resolveHarnessTasks('verify'), ['validate', 'coverage']);
  assert.deepEqual(HARNESS_PROFILES.release, ['validate', 'coverage', 'audit']);
  assert.throws(() => resolveHarnessTasks('missing'), /未知 Harness 任务或配置/);
});

test('参数解析支持报告路径和失败后继续', () => {
  assert.deepEqual(
    parseHarnessArgs(['run', 'verify', '--report', reportPath, '--continue-on-failure']),
    {
      action: 'run',
      selection: 'verify',
      reportPath,
      continueOnFailure: true,
    },
  );
  assert.throws(() => parseHarnessArgs(['run', 'verify', '--unknown']), /未知参数/);
});

test('预检只校验所选任务的环境能力', () => {
  const validateChecks = inspectHarnessEnvironment({
    taskNames: ['validate'],
    env: {},
    platform: 'linux',
  });
  assert.equal(
    validateChecks.some((check) => check.id.includes('AFFECTED_BASE')),
    false,
  );

  const affectedChecks = inspectHarnessEnvironment({
    taskNames: ['affected'],
    env: {},
    platform: 'linux',
  });
  assert.equal(affectedChecks.find((check) => check.id.endsWith('AFFECTED_BASE'))?.ok, false);
  assert.equal(affectedChecks.find((check) => check.id.endsWith('AFFECTED_HEAD'))?.ok, false);

  const devtoolsChecks = inspectHarnessEnvironment({
    taskNames: ['devtools-e2e'],
    env: {},
    platform: 'linux',
  });
  assert.equal(devtoolsChecks.find((check) => check.id.endsWith(':platform'))?.ok, false);
});

test('报告固定绑定版本、模式和任务状态', () => {
  const report = createHarnessReport({
    selection: 'verify',
    taskNames: ['validate', 'coverage'],
    commitSha: 'abc123',
    mode: 'ci',
  });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.commitSha, 'abc123');
  assert.equal(report.mode, 'ci');
  assert.deepEqual(
    report.tasks.map((task) => task.status),
    ['pending', 'pending'],
  );
});

test('preflight 生成机器可读报告且不执行目标任务', () => {
  const exitCode = runHarness(['preflight', 'validate', '--report', reportPath]);
  assert.equal(exitCode, 0);
  assert.equal(existsSync(reportPath), true);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.outcome, 'passed');
  assert.equal(report.tasks[0].status, 'not_executed');
  assert.match(report.commitSha, /^[a-f0-9]{40}$/);
});
