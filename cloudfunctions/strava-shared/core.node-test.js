'use strict';
const test = require('node:test');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {
  SNAPSHOT_MAX_AGE_MS,
  SYNC_LEASE_MS,
  config,
  encrypt,
  decrypt,
  createState,
  hashState,
  authorizationUrl,
  consumeState,
  tokenDocument,
  deriveReadiness,
  statistics,
  fetchActivityWindow,
  fetchActivities,
  callbackFlow,
  syncFlow,
  disconnectFlow,
  writableDocument,
} = require('./core');
const key = crypto.randomBytes(32).toString('base64');
const fakeSecret = crypto.randomBytes(24).toString('hex');
const fakeAccess = crypto.randomBytes(24).toString('hex');
const fakeRefresh = crypto.randomBytes(24).toString('hex');
const env = {
  STRAVA_CLIENT_ID: '36717',
  STRAVA_CLIENT_SECRET: fakeSecret,
  STRAVA_TOKEN_ENCRYPTION_KEY: key,
  STRAVA_CALLBACK_URL: 'https://example.test/callback',
};
const token = (expires = Math.floor(Date.now() / 1000) + 3600) => ({
  access_token: fakeAccess,
  refresh_token: fakeRefresh,
  expires_at: expires,
  scope: 'read,activity:read_all',
  athlete: { id: 42, firstname: 'Test', lastname: 'Rider' },
});
test('配置缺失 fail closed 且授权 URL 不含 secret', () => {
  assert.throws(() => config({ ...env, STRAVA_CLIENT_SECRET: '' }), {
    code: 'STRAVA_CONFIG_INVALID',
  });
  const state = createState(0, () => Buffer.alloc(32, 1));
  const url = authorizationUrl('36717', env.STRAVA_CALLBACK_URL, state.raw);
  assert.match(url, /client_id=36717/);
  assert.equal(url.includes(fakeSecret), false);
  assert.equal(state.expiresAt.toISOString(), '1970-01-01T00:10:00.000Z');
  assert.equal(hashState(state.raw), state.hash);
});
test('token 使用 AES-GCM 且不保留明文', () => {
  const doc = tokenDocument('openid', token(), key, new Date());
  assert.equal(decrypt(doc.access_token_cipher, key), fakeAccess);
  assert.equal(JSON.stringify(doc).includes(fakeAccess), false);
  assert.throws(() => decrypt({ ...doc.access_token_cipher, tag: 'AAAA' }, key), {
    code: 'STRAVA_TOKEN_INVALID',
  });
});
test('state 防 CSRF、过期和重放', async () => {
  const state = createState();
  let used = false;
  const store = {
    consumeState: async (hash) => {
      assert.equal(hash, state.hash);
      if (used) return undefined;
      used = true;
      return { openid: 'o', expires_at: new Date(Date.now() + 1000) };
    },
  };
  assert.equal((await consumeState(store, state.raw)).openid, 'o');
  await assert.rejects(consumeState(store, state.raw), { code: 'OAUTH_STATE_INVALID' });
  await assert.rejects(
    consumeState(
      {
        consumeState: async () => ({
          openid: 'o',
          expires_at: new Date(Date.now() + 1000),
          consumed_at: new Date(),
        }),
      },
      state.raw,
    ),
    { code: 'OAUTH_STATE_INVALID' },
  );
  await assert.rejects(
    consumeState(
      { consumeState: async () => ({ openid: 'o', expires_at: new Date(0) }) },
      state.raw,
    ),
    { code: 'OAUTH_STATE_EXPIRED' },
  );
  await assert.rejects(consumeState(store, 'bad'), { code: 'OAUTH_STATE_INVALID' });
});
test('callback 校验错误并安全保存加密 token', async () => {
  const state = createState();
  let saved;
  const store = {
    consumeState: async () => ({ openid: 'o', expires_at: new Date(Date.now() + 1000) }),
    saveCredential: async (v) => {
      saved = v;
    },
  };
  await assert.rejects(callbackFlow({ code: '', state: state.raw, env, store, api: {} }), {
    code: 'OAUTH_CODE_MISSING',
  });
  const result = await callbackFlow({
    code: 'code',
    state: state.raw,
    env,
    store,
    api: { exchange: async () => token() },
  });
  assert.equal(result.connected, true);
  assert.equal(decrypt(saved.refresh_token_cipher, key), fakeRefresh);
});
test('分页最多拉取限制页数并在短页停止', async () => {
  let calls = 0;
  const full = Array.from({ length: 200 }, () => ({ sport_type: 'Ride' }));
  const api = {
    activities: async () => {
      calls += 1;
      return calls < 3 ? full : [];
    },
  };
  assert.equal((await fetchActivities(api, 'token', 0, 5)).length, 400);
  assert.equal(calls, 3);
  calls = 0;
  await fetchActivities(
    {
      activities: async () => {
        calls += 1;
        return full;
      },
    },
    'token',
    0,
    2,
  );
  assert.equal(calls, 2);
});
test('readiness 常量和 fresh canonical snapshot 快路径', () => {
  assert.equal(SNAPSHOT_MAX_AGE_MS, 86_400_000);
  assert.equal(SYNC_LEASE_MS, 120_000);
  const now = new Date('2026-09-29T04:00:00.000Z');
  const credential = { athlete_name: 'Rider', sync_status: 'failed' };
  const snapshot = { synced_at: new Date(now.getTime() - SNAPSHOT_MAX_AGE_MS + 1) };
  assert.deepEqual(deriveReadiness({ credential, snapshot, hasActiveOAuthState: false }, now), {
    state: 'ready',
    can_register: true,
    athlete_name: 'Rider',
    snapshot,
    error: null,
  });
});
test('readiness 从服务端 active state 派生 authorizing', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  assert.equal(
    deriveReadiness({ credential: undefined, snapshot: undefined, hasActiveOAuthState: true }, now)
      .state,
    'authorizing',
  );
  assert.equal(
    deriveReadiness({ credential: undefined, snapshot: undefined, hasActiveOAuthState: false }, now)
      .state,
    'disconnected',
  );
});
test('pending、running 和 stale ready 都派生 syncing', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  for (const sync_status of ['pending', 'running', 'ready']) {
    assert.equal(
      deriveReadiness(
        {
          credential: { athlete_name: 'Rider', sync_status },
          snapshot: { synced_at: new Date(now.getTime() - SNAPSHOT_MAX_AGE_MS) },
          hasActiveOAuthState: false,
        },
        now,
      ).state,
      'syncing',
    );
  }
});
test('failed credential 没有 fresh snapshot 时返回稳定安全错误', () => {
  const result = deriveReadiness(
    {
      credential: {
        athlete_name: 'Rider',
        sync_status: 'failed',
        sync_error_code: 'STRAVA_API_INVALID',
      },
      snapshot: undefined,
      hasActiveOAuthState: false,
    },
    new Date('2026-09-29T04:00:00.000Z'),
  );
  assert.deepEqual(result.error, {
    code: 'STRAVA_API_INVALID',
    message: 'Strava 数据准备失败，请重试',
    retryable: true,
  });
  assert.equal(result.state, 'failed');
  assert.equal(result.can_register, false);
});
test('非法时间不可报名且 legacy credential 可由 fresh snapshot 推导 ready', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  assert.equal(
    deriveReadiness(
      {
        credential: { athlete_name: 'Rider', sync_status: 'ready' },
        snapshot: { synced_at: 'invalid' },
        hasActiveOAuthState: false,
      },
      now,
    ).state,
    'syncing',
  );
  assert.equal(
    deriveReadiness(
      {
        credential: { athlete_name: 'Legacy Rider' },
        snapshot: { synced_at: new Date(now.getTime() - 1) },
        hasActiveOAuthState: false,
      },
      now,
    ).state,
    'ready',
  );
});
test('第五个满页把 90 天窗口标记为不完整', async () => {
  const calls = [];
  const api = {
    activities: async (_token, query) => {
      calls.push(query);
      return Array.from({ length: 200 }, () => ({ sport_type: 'Ride' }));
    },
  };
  const result = await fetchActivityWindow(api, 'token', {
    after: 1,
    before: 2,
    maxPages: 5,
  });
  assert.equal(result.activities.length, 1000);
  assert.equal(result.coverageComplete, false);
  assert.deepEqual(calls[0], { after: 1, before: 2, page: 1, per_page: 200 });
  assert.deepEqual(calls[4], { after: 1, before: 2, page: 5, per_page: 200 });
});
test('短页把 90 天窗口标记为完整', async () => {
  let calls = 0;
  const result = await fetchActivityWindow(
    {
      activities: async () => {
        calls += 1;
        return calls === 1 ? Array.from({ length: 200 }, () => ({})) : [];
      },
    },
    'token',
    { after: 1, before: 2 },
  );
  assert.equal(result.activities.length, 200);
  assert.equal(result.coverageComplete, true);
  assert.equal(calls, 2);
});
test('完整空窗口统计为零而不完整窗口统计为未知', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const coverageFrom = new Date('2026-07-01T04:00:00.000Z');
  const complete = statistics([], { now, coverageFrom, coverageTo: now, coverageComplete: true });
  assert.deepEqual(complete, {
    total_km: 0,
    activities_90d: 0,
    longest_km: 0,
    total_elevation_m: 0,
    weighted_avg_speed_kmh: 0,
    latest_activity_at: null,
    synced_at: now,
    coverage_from: coverageFrom,
    coverage_to: now,
    coverage_complete: true,
  });
  const partial = statistics([{ sport_type: 'Ride', distance: 1000 }], {
    now,
    coverageFrom,
    coverageTo: now,
    coverageComplete: false,
  });
  assert.equal(partial.total_km, null);
  assert.equal(partial.activities_90d, null);
  assert.equal(partial.weighted_avg_speed_kmh, null);
  assert.equal(partial.coverage_complete, false);
});
test('完整窗口中缺失 API 字段的对应统计保持未知', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const result = statistics([{ sport_type: 'Ride', distance: 1000 }], {
    now,
    coverageFrom: new Date('2026-07-01T04:00:00.000Z'),
    coverageTo: now,
    coverageComplete: true,
  });
  assert.equal(result.total_km, 1);
  assert.equal(result.activities_90d, 1);
  assert.equal(result.longest_km, 1);
  assert.equal(result.total_elevation_m, null);
  assert.equal(result.weighted_avg_speed_kmh, null);
  assert.equal(result.latest_activity_at, null);
});
test('90 天骑行统计排除通勤/训练并按距离加权', () => {
  const now = new Date('2026-09-03T00:00:00Z');
  const coverageFrom = new Date('2026-06-05T00:00:00Z');
  const stats = statistics(
    [
      {
        sport_type: 'Ride',
        distance: 10000,
        moving_time: 1800,
        total_elevation_gain: 100,
        start_date: '2026-09-01T00:00:00Z',
      },
      {
        type: 'Ride',
        distance: 50000,
        moving_time: 7200,
        total_elevation_gain: 500,
        start_date: '2026-09-02T00:00:00Z',
      },
      { sport_type: 'Run', distance: 100000, moving_time: 1 },
      { sport_type: 'Ride', commute: true, distance: 99999 },
    ],
    { now, coverageFrom, coverageTo: now, coverageComplete: true },
  );
  assert.deepEqual(stats, {
    total_km: 60,
    activities_90d: 2,
    longest_km: 50,
    total_elevation_m: 600,
    weighted_avg_speed_kmh: 24,
    latest_activity_at: '2026-09-02T00:00:00.000Z',
    synced_at: now,
    coverage_from: coverageFrom,
    coverage_to: now,
    coverage_complete: true,
  });
});
test('sync 临期刷新 token、保存快照且不调用外网', async () => {
  const old = tokenDocument('o', token(1), key, new Date(0));
  let credentials = 0,
    snapshots = 0;
  const api = {
    refresh: async () => token(Math.floor(Date.now() / 1000) + 3600),
    activities: async () => [
      {
        sport_type: 'Ride',
        distance: 1000,
        moving_time: 100,
        total_elevation_gain: 10,
        start_date: '2026-09-01T00:00:00Z',
      },
    ],
  };
  const store = {
    saveCredential: async () => {
      credentials += 1;
    },
    saveSnapshot: async () => {
      snapshots += 1;
    },
  };
  const result = await syncFlow({ openid: 'o', env, credential: old, api, store, now: new Date() });
  assert.equal(result.snapshot.total_km, 1);
  assert.equal(credentials, 1);
  assert.equal(snapshots, 1);
});
test('disconnect 原子委托删除凭证/快照并写审计', async () => {
  let captured;
  const result = await disconnectFlow({
    openid: 'o',
    store: {
      disconnect: async (...args) => {
        captured = args;
      },
    },
    now: new Date(0),
  });
  assert.deepEqual(result, { connected: false });
  assert.equal(captured[1].action, 'strava.disconnect');
  assert.equal(captured[1].detail.constructor, Object);
});

test('CloudBase 写入会移除保留字段 _id', () => {
  const source = { _id: 'openid', openid: 'openid' };
  assert.deepEqual(writableDocument(source), { openid: 'openid' });
  assert.equal(source._id, 'openid');
});
