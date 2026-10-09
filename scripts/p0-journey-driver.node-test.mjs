import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluateJourneyPreflight } from './p0-journey-driver.mjs';

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
