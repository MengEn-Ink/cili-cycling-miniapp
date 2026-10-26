import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptPath = fileURLToPath(new URL('./check-devtools-e2e-batch.mjs', import.meta.url));

function runBatch(reports) {
  const directory = mkdtempSync(join(tmpdir(), 'cili-devtools-batch-'));
  try {
    const paths = reports.map((report, index) => {
      const reportPath = join(directory, `${index + 1}.json`);
      writeFileSync(reportPath, typeof report === 'string' ? report : JSON.stringify(report));
      return reportPath;
    });
    return spawnSync(process.execPath, [scriptPath, ...paths], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function report(startupOutcome, productVerdict = 'PASS') {
  return { startupOutcome, productVerdict };
}

function parseSummary(result) {
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('干净通过会重置单次启动恢复 streak', () => {
  const result = runBatch([report('PASS'), report('PASS_WITH_STARTUP_RECOVERY'), report('PASS')]);
  assert.equal(result.status, 0);
  assert.deepEqual(parseSummary(result), {
    outcome: 'PASS',
    recoveryStreak: 0,
    reports: 3,
  });
});

test('相邻两个恢复态升级为环境不稳定并退出 2', () => {
  const result = runBatch([
    report('PASS_WITH_STARTUP_RECOVERY'),
    report('PASS_WITH_STARTUP_RECOVERY'),
  ]);
  assert.equal(result.status, 2);
  assert.deepEqual(parseSummary(result), {
    outcome: 'BLOCKED_ENVIRONMENT_UNSTABLE',
    recoveryStreak: 2,
    reports: 2,
  });
});

test('runner blocked 立即退出 2', () => {
  const result = runBatch([report('BLOCKED', 'NOT_EXECUTED')]);
  assert.equal(result.status, 2);
  assert.deepEqual(parseSummary(result), {
    outcome: 'BLOCKED',
    recoveryStreak: 0,
    reports: 1,
  });
});

test('产品失败立即退出 1', () => {
  const result = runBatch([report('PASS', 'FAIL')]);
  assert.equal(result.status, 1);
  assert.deepEqual(parseSummary(result), {
    outcome: 'FAIL',
    productVerdict: 'FAIL',
    reports: 1,
  });
});

test('非法 JSON、缺失文件和空输入都 fail-closed 退出 2', () => {
  const invalid = runBatch(['{']);
  assert.equal(invalid.status, 2);
  assert.equal(parseSummary(invalid).outcome, 'BLOCKED');

  const missing = spawnSync(process.execPath, [scriptPath, '/tmp/cili-missing-e2e-report.json'], {
    encoding: 'utf8',
  });
  assert.equal(missing.status, 2);
  assert.equal(parseSummary(missing).outcome, 'BLOCKED');

  const empty = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.equal(empty.status, 2);
  assert.equal(parseSummary(empty).outcome, 'BLOCKED');
});
