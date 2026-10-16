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
