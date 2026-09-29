'use strict';
const test = require('node:test');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {
  SNAPSHOT_MAX_AGE_MS,
  SYNC_LEASE_MS,
  config,
  keyFrom,
  encrypt,
  decrypt,
  createState,
  hashState,
  authorizationUrl,
  consumeState,
  tokenDocument,
  isCredentialUsable,
  deriveReadiness,
  statistics,
  fetchActivityWindow,
  fetchActivities,
  callbackFlow,
  buildSyncResult,
  ensureReadyFlow,
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
const usableCredential = (overrides = {}) => ({
  athlete_id: '42',
  athlete_name: 'Rider',
  access_token_cipher: {
    alg: 'A256GCM',
    iv: 'access-iv',
    tag: 'access-tag',
    ciphertext: 'access-ciphertext',
  },
  refresh_token_cipher: {
    alg: 'A256GCM',
    iv: 'refresh-iv',
    tag: 'refresh-tag',
    ciphertext: 'refresh-ciphertext',
  },
  ...overrides,
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
test('Strava token key 只 trim 首尾空白并拒绝内部空白', () => {
  assert.deepEqual(keyFrom(`  \n${key}\t `), Buffer.from(key, 'base64'));
  assert.equal(config({ ...env, STRAVA_TOKEN_ENCRYPTION_KEY: `\n${key}  ` }).key, key);
  const middle = `${key.slice(0, 10)} ${key.slice(10)}`;
  assert.throws(() => keyFrom(middle), { code: 'STRAVA_KEY_INVALID' });
  assert.throws(() => config({ ...env, STRAVA_TOKEN_ENCRYPTION_KEY: middle }), {
    code: 'STRAVA_KEY_INVALID',
  });
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
  assert.equal(saved.sync_status, 'pending');
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
  const credential = usableCredential({ sync_status: 'failed' });
  const snapshot = {
    athlete_id: credential.athlete_id,
    synced_at: new Date(now.getTime() - SNAPSHOT_MAX_AGE_MS + 1),
  };
  assert.deepEqual(deriveReadiness({ credential, snapshot, hasActiveOAuthState: false }, now), {
    state: 'ready',
    can_register: true,
    athlete_name: 'Rider',
    snapshot: { ...snapshot, synced_at: snapshot.synced_at.toISOString() },
    error: null,
  });
});
test('readiness 对外响应统一序列化快照时间字段', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const credential = usableCredential();
  const snapshot = {
    athlete_id: credential.athlete_id,
    synced_at: now,
    latest_activity_at: new Date('2026-09-28T04:00:00.000Z'),
    coverage_from: new Date('2026-07-01T04:00:00.000Z'),
    coverage_to: new Date('2026-09-29T04:00:00.000Z'),
  };
  const readiness = deriveReadiness({ credential, snapshot, hasActiveOAuthState: false }, now);
  assert.deepEqual(
    {
      synced_at: readiness.snapshot.synced_at,
      latest_activity_at: readiness.snapshot.latest_activity_at,
      coverage_from: readiness.snapshot.coverage_from,
      coverage_to: readiness.snapshot.coverage_to,
    },
    {
      synced_at: '2026-09-29T04:00:00.000Z',
      latest_activity_at: '2026-09-28T04:00:00.000Z',
      coverage_from: '2026-07-01T04:00:00.000Z',
      coverage_to: '2026-09-29T04:00:00.000Z',
    },
  );
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
test('credential 必须同时包含结构有效的 access 和 refresh 加密信封', () => {
  assert.equal(isCredentialUsable(usableCredential()), true);
  assert.equal(isCredentialUsable(undefined), false);
  assert.equal(isCredentialUsable({}), false);
  assert.equal(isCredentialUsable(usableCredential({ refresh_token_cipher: undefined })), false);
  for (const field of ['iv', 'tag', 'ciphertext']) {
    assert.equal(
      isCredentialUsable(
        usableCredential({
          access_token_cipher: {
            alg: 'A256GCM',
            iv: 'access-iv',
            tag: 'access-tag',
            ciphertext: 'access-ciphertext',
            [field]: '',
          },
        }),
      ),
      false,
    );
  }
  assert.equal(
    isCredentialUsable(
      usableCredential({
        refresh_token_cipher: {
          alg: 'AES-CBC',
          iv: 'refresh-iv',
          tag: 'refresh-tag',
          ciphertext: 'refresh-ciphertext',
        },
      }),
    ),
    false,
  );
});
test('fresh snapshot 不能让缺失或畸形 token envelope 的 credential 变为 ready', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const snapshot = { athlete_id: '42', synced_at: new Date(now.getTime() - 1) };
  for (const credential of [
    { athlete_name: 'Missing' },
    usableCredential({ access_token_cipher: undefined }),
    usableCredential({ refresh_token_cipher: undefined }),
    usableCredential({
      access_token_cipher: {
        alg: 'AES-CBC',
        iv: 'iv',
        tag: 'tag',
        ciphertext: 'ciphertext',
      },
    }),
  ]) {
    const result = deriveReadiness({ credential, snapshot, hasActiveOAuthState: false }, now);
    assert.equal(result.state, 'syncing');
    assert.equal(result.can_register, false);
    assert.equal(result.snapshot, null);
  }
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
test('非法时间或缺少 athlete_id 的 legacy snapshot 不可报名', () => {
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
        credential: usableCredential({ athlete_name: 'Legacy Rider' }),
        snapshot: { synced_at: new Date(now.getTime() - 1) },
        hasActiveOAuthState: false,
      },
      now,
    ).state,
    'syncing',
  );
});
test('不同 Strava 账号的 fresh snapshot 不得复用为 ready', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const credential = usableCredential({ athlete_id: 'new-athlete' });
  const snapshot = {
    athlete_id: 'old-athlete',
    synced_at: new Date(now.getTime() - 1),
  };
  const result = deriveReadiness({ credential, snapshot, hasActiveOAuthState: false }, now);
  assert.equal(result.state, 'syncing');
  assert.equal(result.can_register, false);
  assert.equal(result.snapshot, null);
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
test('ensureReady 对 fresh snapshot 不获取 lease 且不访问 Strava', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  let claims = 0;
  let activityCalls = 0;
  const credential = usableCredential({ sync_status: 'failed' });
  const snapshot = { athlete_id: credential.athlete_id, synced_at: new Date(now.getTime() - 1) };
  const result = await ensureReadyFlow({
    openid: 'user-1',
    env,
    store: {
      readReadiness: async () => ({ credential, snapshot, hasActiveOAuthState: false }),
      acquireSyncLease: async () => {
        claims += 1;
        throw new Error('fresh snapshot must not acquire');
      },
    },
    api: {
      activities: async () => {
        activityCalls += 1;
        throw new Error('fresh snapshot must not fetch');
      },
    },
    now,
    randomUUID: () => 'lease-new',
  });
  assert.equal(result.state, 'ready');
  assert.equal(claims, 0);
  assert.equal(activityCalls, 0);
});
test('ensureReady 对有效 running lease 返回 syncing 且不访问 Strava', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const credential = {
    athlete_name: 'Rider',
    sync_status: 'running',
    sync_started_at: new Date(now.getTime() - SYNC_LEASE_MS + 1),
    sync_lease_id: 'lease-current',
  };
  let startedAudit;
  let activityCalls = 0;
  const result = await ensureReadyFlow({
    openid: 'user-1',
    env,
    store: {
      readReadiness: async () => ({ credential, snapshot: undefined, hasActiveOAuthState: false }),
      acquireSyncLease: async (_openid, claim) => {
        startedAudit = claim.audit;
        return { acquired: false, credential, snapshot: undefined };
      },
    },
    api: {
      activities: async () => {
        activityCalls += 1;
      },
    },
    now,
    randomUUID: () => 'lease-new',
  });
  assert.equal(result.state, 'syncing');
  assert.equal(activityCalls, 0);
  assert.equal(startedAudit.action, 'strava.sync.started');
  assert.deepEqual(startedAudit.detail, {});
});
test('并发 ensureReady 只有 lease winner 访问一次 Strava', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  let credential = tokenDocument('user-1', token(), key, now);
  credential.sync_status = 'pending';
  let snapshot;
  let claimed = false;
  let activityCalls = 0;
  const store = {
    readReadiness: async () => ({ credential, snapshot, hasActiveOAuthState: false }),
    acquireSyncLease: async (_openid, { leaseId }) => {
      if (claimed) return { acquired: false, credential, snapshot };
      claimed = true;
      credential = { ...credential, sync_status: 'running', sync_lease_id: leaseId };
      return { acquired: true, credential, snapshot };
    },
    completeSync: async (_openid, value) => {
      assert.equal(value.audit.action, 'strava.sync.succeeded');
      credential = { ...value.credential, sync_status: 'ready' };
      snapshot = value.snapshot;
      return true;
    },
    failSync: async () => {
      throw new Error('successful sync must not fail');
    },
  };
  const api = {
    activities: async () => {
      activityCalls += 1;
      return [];
    },
  };
  await Promise.all([
    ensureReadyFlow({
      openid: 'user-1',
      env,
      store,
      api,
      now,
      randomUUID: () => 'lease-one',
    }),
    ensureReadyFlow({
      openid: 'user-1',
      env,
      store,
      api,
      now,
      randomUUID: () => 'lease-two',
    }),
  ]);
  assert.equal(activityCalls, 1);
  assert.equal(
    deriveReadiness({ credential, snapshot, hasActiveOAuthState: false }, now).state,
    'ready',
  );
});
test('ensureReady 失败只持久化稳定错误码和安全审计', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  let credential = tokenDocument('user-1', token(), key, now);
  credential.sync_status = 'pending';
  let failure;
  const store = {
    readReadiness: async () => ({ credential, snapshot: undefined, hasActiveOAuthState: false }),
    acquireSyncLease: async (_openid, { leaseId }) => ({
      acquired: true,
      credential: { ...credential, sync_status: 'running', sync_lease_id: leaseId },
      snapshot: undefined,
    }),
    completeSync: async () => {
      throw new Error('failed sync must not complete');
    },
    failSync: async (_openid, value) => {
      failure = value;
      credential = {
        ...credential,
        sync_status: 'failed',
        sync_error_code: value.errorCode,
      };
      return true;
    },
  };
  const result = await ensureReadyFlow({
    openid: 'user-1',
    env,
    store,
    api: {
      activities: async () => {
        throw new Error(`upstream leaked ${fakeAccess}`);
      },
    },
    now,
    randomUUID: () => 'lease-new',
  });
  assert.equal(result.state, 'failed');
  assert.equal(failure.errorCode, 'STRAVA_API_FAILED');
  assert.equal(failure.audit.action, 'strava.sync.failed');
  assert.deepEqual(failure.audit.detail, { error_code: 'STRAVA_API_FAILED' });
  assert.equal(JSON.stringify(failure).includes(fakeAccess), false);
});
test('token refresh 只作为 fenced completion 的输入而不提前持久化', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const old = tokenDocument('user-1', token(1), key, new Date(0));
  const nextAccess = crypto.randomBytes(24).toString('hex');
  const nextRefresh = crypto.randomBytes(24).toString('hex');
  let refreshCalls = 0;
  const built = await buildSyncResult({
    openid: 'user-1',
    env,
    credential: old,
    api: {
      refresh: async () => {
        refreshCalls += 1;
        return {
          access_token: nextAccess,
          refresh_token: nextRefresh,
          expires_at: Math.floor(now.getTime() / 1000) + 3600,
          scope: 'read,activity:read_all',
        };
      },
      activities: async (accessToken) => {
        assert.equal(accessToken, nextAccess);
        return [];
      },
    },
    now,
  });
  assert.equal(refreshCalls, 1);
  assert.equal(decrypt(built.credential.access_token_cipher, key), nextAccess);
  assert.equal(decrypt(built.credential.refresh_token_cipher, key), nextRefresh);
  assert.equal(built.snapshot.athlete_id, '42');
  assert.equal(built.snapshot.coverage_complete, true);
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
