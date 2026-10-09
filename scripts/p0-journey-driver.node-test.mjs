import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compensateJourney,
  evaluateJourneyPreflight,
  runReconciledWrite,
  sanitizeJourneyAudits,
  waitForPageReady,
} from './p0-journey-driver.mjs';

const scriptPath = fileURLToPath(new URL('./p0-journey-driver.mjs', import.meta.url));

function readyPreflight() {
  return {
    schemaVersion: 1,
    environment: { kind: 'test', deployed: true },
    member: {
      available: true,
      role: 'member',
      profileReady: true,
      stravaConnected: true,
      stravaReady: true,
      oauthFresh: true,
    },
    routeFixture: {
      available: true,
      ownedByMember: true,
      previewReady: true,
      gpxReady: true,
    },
  };
}

test('完整普通成员和路线夹具预检通过', () => {
  assert.deepEqual(evaluateJourneyPreflight(readyPreflight()), {
    outcome: 'ready',
    blockers: [],
  });
});

test('所有缺失前置条件按稳定顺序标记为未执行', () => {
  const value = readyPreflight();
  value.environment = { kind: 'production', deployed: false };
  value.member = {
    available: false,
    role: 'admin',
    profileReady: false,
    stravaConnected: false,
    stravaReady: false,
    oauthFresh: false,
  };
  value.routeFixture = {
    available: false,
    ownedByMember: false,
    previewReady: false,
    gpxReady: false,
  };

  assert.deepEqual(evaluateJourneyPreflight(value), {
    outcome: 'not_executed',
    blockers: [
      'ENVIRONMENT_NOT_TEST',
      'DEPLOYMENT_NOT_READY',
      'MEMBER_UNAVAILABLE',
      'MEMBER_ROLE_INVALID',
      'MEMBER_PROFILE_NOT_READY',
      'STRAVA_NOT_CONNECTED',
      'STRAVA_NOT_READY',
      'OAUTH_NOT_FRESH',
      'ROUTE_FIXTURE_UNAVAILABLE',
      'ROUTE_FIXTURE_OWNER_MISMATCH',
      'ROUTE_PREVIEW_NOT_READY',
      'ROUTE_GPX_NOT_READY',
    ],
  });
});

test('预检拒绝未知根字段、敏感嵌套字段和错误类型', () => {
  assert.throws(
    () => evaluateJourneyPreflight({ ...readyPreflight(), openid: 'ROOT_OPENID_SENTINEL' }),
    (error) =>
      error.code === 'PREFLIGHT_SCHEMA_INVALID' && !error.message.includes('ROOT_OPENID_SENTINEL'),
  );

  assert.throws(
    () =>
      evaluateJourneyPreflight({
        ...readyPreflight(),
        member: { ...readyPreflight().member, accessToken: 'ACCESS_TOKEN_SENTINEL' },
      }),
    (error) =>
      error.code === 'PREFLIGHT_SCHEMA_INVALID' && !error.message.includes('ACCESS_TOKEN_SENTINEL'),
  );

  assert.throws(
    () =>
      evaluateJourneyPreflight({
        ...readyPreflight(),
        routeFixture: { ...readyPreflight().routeFixture, available: 'yes' },
      }),
    (error) => error.code === 'PREFLIGHT_SCHEMA_INVALID',
  );
});

test('预检 CLI 使用固定退出码且不回显输入内容', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cili-journey-preflight-'));
  try {
    const readyPath = join(directory, 'ready.json');
    const blockedPath = join(directory, 'blocked.json');
    const invalidPath = join(directory, 'invalid.json');
    writeFileSync(readyPath, JSON.stringify(readyPreflight()));

    const blockedPreflight = readyPreflight();
    blockedPreflight.member.available = false;
    blockedPreflight.routeFixture.available = false;
    writeFileSync(blockedPath, JSON.stringify(blockedPreflight));
    writeFileSync(invalidPath, '{"accessToken":"CLI_TOKEN_SENTINEL"}');

    const ready = spawnSync(process.execPath, [scriptPath, 'preflight', '--input', readyPath], {
      encoding: 'utf8',
    });
    assert.equal(ready.status, 0);
    assert.equal(ready.stdout, 'P0 真实旅程预检通过\n');
    assert.equal(ready.stderr, '');

    const blocked = spawnSync(process.execPath, [scriptPath, 'preflight', '--input', blockedPath], {
      encoding: 'utf8',
    });
    assert.equal(blocked.status, 2);
    assert.equal(
      blocked.stderr,
      'P0 真实旅程预检未执行: MEMBER_UNAVAILABLE,ROUTE_FIXTURE_UNAVAILABLE\n',
    );
    assert.equal(blocked.stdout, '');

    const invalid = spawnSync(process.execPath, [scriptPath, 'preflight', '--input', invalidPath], {
      encoding: 'utf8',
    });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stderr, 'P0 真实旅程预检失败: 预检文件结构无效\n');
    assert.doesNotMatch(invalid.stderr, /CLI_TOKEN_SENTINEL/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('预检 CLI 拒绝额外参数且不打印堆栈', () => {
  const result = spawnSync(process.execPath, [scriptPath, 'preflight', '--unknown', 'value'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'P0 真实旅程预检失败: 预检命令参数无效\n');
  assert.doesNotMatch(result.stderr, /at .*p0-journey-driver/);
});

test('页面路径和业务数据在同一次读取中就绪才成功', async () => {
  const pages = [
    { path: '', data: null },
    { path: 'pages/activity/list', data: { registration: null } },
    { path: 'pages/activity/detail', data: { registration: null } },
    { path: 'pages/activity/detail', data: { registration: { status: 'pending' } } },
  ];
  let time = 0;

  const result = await waitForPageReady({
    readPage: async () => pages.shift(),
    expectedPath: 'pages/activity/detail',
    isDataReady: (data) => data?.registration?.status === 'pending',
    timeoutMs: 100,
    intervalMs: 10,
    now: () => time,
    wait: async (milliseconds) => {
      time += milliseconds;
    },
  });

  assert.deepEqual(result, { attempts: 4, elapsedMs: 30 });
  assert.equal(pages.length, 0);
});

test('页面等待超时使用固定错误且不泄露页面数据', async () => {
  let time = 0;
  let reads = 0;

  await assert.rejects(
    waitForPageReady({
      readPage: async () => {
        reads += 1;
        return { path: 'pages/old', data: { secret: 'PAGE_DATA_SENTINEL' } };
      },
      expectedPath: 'pages/target',
      isDataReady: () => false,
      timeoutMs: 20,
      intervalMs: 10,
      now: () => time,
      wait: async (milliseconds) => {
        time += milliseconds;
      },
    }),
    (error) =>
      error.code === 'PAGE_NOT_READY' &&
      error.message === '目标页面未就绪' &&
      !error.message.includes('PAGE_DATA_SENTINEL'),
  );
  assert.equal(reads, 3);
});

test('写调用成功后仍以只读回读确认提交', async () => {
  let writes = 0;
  let reconciliations = 0;
  const result = await runReconciledWrite({
    execute: async () => {
      writes += 1;
    },
    reconcile: async () => {
      reconciliations += 1;
      return 'committed';
    },
    timeoutMs: 0,
    intervalMs: 0,
  });

  assert.equal(writes, 1);
  assert.equal(reconciliations, 1);
  assert.deepEqual(result, {
    outcome: 'committed',
    source: 'write_confirmed',
    reconciliationAttempts: 1,
  });
});

test('写调用抛错但回读已提交时不重试写操作', async () => {
  let writes = 0;
  const result = await runReconciledWrite({
    execute: async () => {
      writes += 1;
      throw new Error('AUTOMATION_TIMEOUT_SENTINEL');
    },
    reconcile: async () => 'committed',
    timeoutMs: 0,
    intervalMs: 0,
  });

  assert.equal(writes, 1);
  assert.deepEqual(result, {
    outcome: 'committed',
    source: 'reconciled_after_error',
    reconciliationAttempts: 1,
  });
  assert.doesNotMatch(JSON.stringify(result), /AUTOMATION_TIMEOUT_SENTINEL/);
});

test('持续未提交时有界返回且不重试写操作', async () => {
  let writes = 0;
  let time = 0;
  const result = await runReconciledWrite({
    execute: async () => {
      writes += 1;
    },
    reconcile: async () => 'not_committed',
    timeoutMs: 20,
    intervalMs: 10,
    now: () => time,
    wait: async (milliseconds) => {
      time += milliseconds;
    },
  });

  assert.equal(writes, 1);
  assert.deepEqual(result, {
    outcome: 'not_committed',
    source: 'write_not_observed',
    reconciliationAttempts: 3,
  });
});

test('未知、非法或失败的回读使用固定错误且不重试写操作', async () => {
  for (const reconcile of [
    async () => 'unknown',
    async () => 'invalid',
    async () => {
      throw new Error('RECONCILIATION_SECRET_SENTINEL');
    },
  ]) {
    let writes = 0;
    await assert.rejects(
      runReconciledWrite({
        execute: async () => {
          writes += 1;
          throw new Error('WRITE_SECRET_SENTINEL');
        },
        reconcile,
        timeoutMs: 0,
        intervalMs: 0,
      }),
      (error) =>
        error.code === 'WRITE_OUTCOME_UNKNOWN' &&
        error.message === '写操作结果无法确认' &&
        !error.message.includes('SENTINEL'),
    );
    assert.equal(writes, 1);
  }
});

test('审计投影按时间排序并把真实目标替换为合成别名', () => {
  const result = sanitizeJourneyAudits({
    audits: [
      {
        action: 'registration.submitted',
        target_id: 'REAL_REGISTRATION_SENTINEL',
        created_at: '2026-10-09T01:01:00.000Z',
      },
      {
        action: 'strava.sync.succeeded',
        target_id: 'REAL_OPENID_SENTINEL',
        created_at: '2026-10-09T01:00:00.000Z',
      },
    ],
    subjectId: 'REAL_OPENID_SENTINEL',
    registrationId: 'REAL_REGISTRATION_SENTINEL',
    subjectAlias: 'user_test_P0_20261009_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    registrationAlias: 'reg_test_P0_20261009_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  });

  assert.deepEqual(result, [
    {
      action: 'strava.sync.succeeded',
      target_id: 'user_test_P0_20261009_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      created_at: '2026-10-09T01:00:00.000Z',
    },
    {
      action: 'registration.submitted',
      target_id: 'reg_test_P0_20261009_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      created_at: '2026-10-09T01:01:00.000Z',
    },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /REAL_.*_SENTINEL/);
});

test('审计投影拒绝未知动作、错误目标、额外字段、重复动作和非法时间', () => {
  const base = {
    audits: [
      {
        action: 'registration.submitted',
        target_id: 'real-registration',
        created_at: '2026-10-09T01:01:00.000Z',
      },
    ],
    subjectId: 'real-subject',
    registrationId: 'real-registration',
    subjectAlias: 'user_test_P0_20261009_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    registrationAlias: 'reg_test_P0_20261009_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  };
  const invalidInputs = [
    {
      ...base,
      audits: [{ ...base.audits[0], action: 'registration.secret.SENTINEL' }],
    },
    {
      ...base,
      audits: [{ ...base.audits[0], target_id: 'WRONG_TARGET_SENTINEL' }],
    },
    {
      ...base,
      audits: [{ ...base.audits[0], debug: 'EXTRA_FIELD_SENTINEL' }],
    },
    {
      ...base,
      audits: [base.audits[0], { ...base.audits[0] }],
    },
    {
      ...base,
      audits: [{ ...base.audits[0], created_at: '2026-10-09 01:01:00' }],
    },
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => sanitizeJourneyAudits(input),
      (error) =>
        error.code === 'AUDIT_SCHEMA_INVALID' &&
        error.message === '审计记录结构无效' &&
        !error.message.includes('SENTINEL'),
    );
  }
});

test('补偿只取消可取消报名并在结束活动后回读归零', async () => {
  const calls = [];
  let reads = 0;
  const result = await compensateJourney({
    readState: async () => {
      reads += 1;
      return reads === 1
        ? {
            activityStatus: 'published',
            registrations: [
              { id: 'r1', status: 'pending' },
              { id: 'r2', status: 'approved' },
              { id: 'r3', status: 'cancelled' },
              { id: 'r4', status: 'checked_in' },
            ],
          }
        : {
            activityStatus: 'finished',
            registrations: [
              { id: 'r1', status: 'cancelled' },
              { id: 'r2', status: 'cancelled' },
              { id: 'r3', status: 'cancelled' },
              { id: 'r4', status: 'checked_in' },
            ],
          };
    },
    cancelRegistration: async (id) => calls.push(`cancel:${id}`),
    finishActivity: async () => calls.push('finish'),
  });

  assert.deepEqual(calls, ['cancel:r1', 'cancel:r2', 'finish']);
  assert.equal(reads, 2);
  assert.deepEqual(result, {
    outcome: 'completed',
    cancelledCount: 2,
    activityFinished: true,
  });
});

test('单个补偿动作失败后继续执行并以最终回读为准', async () => {
  const calls = [];
  let reads = 0;
  const result = await compensateJourney({
    readState: async () => {
      reads += 1;
      return reads === 1
        ? {
            activityStatus: 'published',
            registrations: [
              { id: 'r1', status: 'waiting' },
              { id: 'r2', status: 'pending' },
            ],
          }
        : {
            activityStatus: 'finished',
            registrations: [
              { id: 'r1', status: 'cancelled' },
              { id: 'r2', status: 'cancelled' },
            ],
          };
    },
    cancelRegistration: async (id) => {
      calls.push(`cancel:${id}`);
      if (id === 'r1') throw new Error('CANCEL_ERROR_SENTINEL');
    },
    finishActivity: async () => {
      calls.push('finish');
      throw new Error('FINISH_ERROR_SENTINEL');
    },
  });

  assert.deepEqual(calls, ['cancel:r1', 'cancel:r2', 'finish']);
  assert.deepEqual(result, {
    outcome: 'completed',
    cancelledCount: 2,
    activityFinished: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /SENTINEL/);
});

test('最终仍有活跃报名或活动未结束时补偿失败且不泄露状态', async () => {
  let reads = 0;
  await assert.rejects(
    compensateJourney({
      readState: async () => {
        reads += 1;
        return {
          activityStatus: 'published',
          registrations: [{ id: 'COMPENSATION_ID_SENTINEL', status: 'approved' }],
        };
      },
      cancelRegistration: async () => {},
      finishActivity: async () => {},
    }),
    (error) =>
      error.code === 'COMPENSATION_INCOMPLETE' &&
      error.message === '失败补偿未完成' &&
      !error.message.includes('SENTINEL'),
  );
  assert.equal(reads, 2);
});

test('package scripts 和现场手册接入旅程驱动', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const guide = readFileSync(
    new URL('../docs/verification/p0-real-registration-journey.md', import.meta.url),
    'utf8',
  );

  assert.equal(
    packageJson.scripts['check:journey-preflight'],
    'node scripts/p0-journey-driver.mjs preflight',
  );
  assert.match(
    packageJson.scripts['test:journey-evidence'],
    /scripts\/p0-journey-driver\.node-test\.mjs/,
  );
  assert.match(guide, /check:journey-preflight/);
  assert.match(guide, /预检未通过.*未执行/s);
  assert.match(guide, /waitForPageReady/);
  assert.match(guide, /runReconciledWrite/);
  assert.match(guide, /sanitizeJourneyAudits/);
  assert.match(guide, /compensateJourney/);
  assert.match(guide, /不得.*删除数据库记录/s);
});
