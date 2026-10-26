import assert from 'node:assert/strict';
import test from 'node:test';
import { finishReport, runWithReport } from './e2e-report.mjs';

test('异常、关闭失败后仍保存报告且不能判为通过', async () => {
  let saved;
  const report = { checks: [{ ok: true }], exceptions: [], blockers: [] };
  await runWithReport({
    report,
    execute: async () => {
      throw new Error('cloud request failed');
    },
    close: async () => {
      throw new Error('socket closed');
    },
    save: (value) => {
      saved = value;
    },
  });
  assert.equal(saved.outcome, 'failed');
  assert.equal(saved.exceptions.length, 2);
  assert.equal(saved.passed, 1);
  assert.ok(saved.finishedAt);
});
test('缺少样本是 blocked，不是 pass；没有检查不能通过', () => {
  assert.equal(finishReport({ checks: [], exceptions: [], blockers: [] }).outcome, 'blocked');
  assert.equal(
    finishReport({ checks: [{ ok: true }], exceptions: [], blockers: ['member'] }).outcome,
    'blocked',
  );
  assert.equal(
    finishReport({ checks: [{ ok: false }], exceptions: [], blockers: [] }).outcome,
    'failed',
  );
  assert.equal(
    finishReport({ checks: [{ ok: true }], exceptions: [], blockers: [] }).outcome,
    'passed',
  );
});

test('启动三态与产品 verdict 独立派生', () => {
  const clean = finishReport({
    startupOutcome: 'PASS',
    productVerdict: 'NOT_EXECUTED',
    checks: [{ ok: true }],
    exceptions: [],
    blockers: [],
  });
  assert.equal(clean.outcome, 'passed');
  assert.equal(clean.productVerdict, 'PASS');

  const recovered = finishReport({
    startupOutcome: 'PASS_WITH_STARTUP_RECOVERY',
    productVerdict: 'NOT_EXECUTED',
    checks: [{ ok: true }],
    exceptions: [],
    blockers: [],
  });
  assert.equal(recovered.outcome, 'passed_with_startup_recovery');
  assert.equal(recovered.productVerdict, 'PASS');

  const blocked = finishReport({
    startupOutcome: 'BLOCKED',
    productVerdict: 'NOT_EXECUTED',
    checks: [],
    exceptions: [],
    blockers: ['DEVTOOLS_STARTUP_BLOCKED'],
  });
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.productVerdict, 'NOT_EXECUTED');
});

test('执行与关闭错误都通过调用方脱敏器保存', async () => {
  let saved;
  await runWithReport({
    report: { checks: [], exceptions: [], blockers: [] },
    execute: async () => {
      throw new Error('/secret/path');
    },
    close: async () => {
      throw new Error('token=secret');
    },
    serializeError: (phase) => ({ phase, message: '[redacted]' }),
    save: (value) => {
      saved = value;
    },
  });
  assert.deepEqual(saved.exceptions, [
    { phase: 'execute', message: '[redacted]' },
    { phase: 'close', message: '[redacted]' },
  ]);
});
