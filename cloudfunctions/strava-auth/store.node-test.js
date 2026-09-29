'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

Object.assign(require('./oauth/core'), require('../strava-shared/core'));
const { createReadinessStore } = require('./store');

function fakeDb(seed = {}) {
  const REMOVE = Symbol('remove');
  const SERVER_DATE = Symbol('server-date');
  const state = {};
  for (const [name, values] of Object.entries(seed)) {
    state[name] = new Map(Object.entries(values));
  }
  const calls = [];
  const ensure = (name) => (state[name] ||= new Map());
  const applyData = (current, data) => {
    const next = { ...current };
    for (const [key, value] of Object.entries(data)) {
      if (value === REMOVE) delete next[key];
      else next[key] = value;
    }
    return next;
  };
  const collection = (name, scope) => ({
    doc(id) {
      return {
        async get() {
          calls.push({ scope, operation: 'get', collection: name, id });
          if (!ensure(name).has(id)) throw { errCode: -502001, errMsg: 'document not found' };
          return { data: ensure(name).get(id) };
        },
        async set({ data }) {
          calls.push({ scope, operation: 'set', collection: name, id });
          ensure(name).set(id, { ...data });
        },
        async update({ data }) {
          calls.push({ scope, operation: 'update', collection: name, id });
          ensure(name).set(id, applyData(ensure(name).get(id) || {}, data));
        },
        async remove() {
          calls.push({ scope, operation: 'remove', collection: name, id });
          ensure(name).delete(id);
        },
      };
    },
    async add({ data }) {
      calls.push({ scope, operation: 'add', collection: name });
      ensure(name).set(`audit-${ensure(name).size + 1}`, { ...data });
    },
    where(query) {
      calls.push({ scope, operation: 'where', collection: name, query });
      return {
        limit(limit) {
          return {
            async get() {
              const values = [...ensure(name).values()].filter((value) => {
                if (value.openid !== query.openid) return false;
                if (query.expires_at?.kind === 'gt' && !(value.expires_at > query.expires_at.value))
                  return false;
                if (query.consumed_at?.kind === 'exists' && query.consumed_at.value === false)
                  return !Object.hasOwn(value, 'consumed_at');
                return true;
              });
              return { data: values.slice(0, limit) };
            },
          };
        },
      };
    },
  });
  const db = {
    command: {
      gt: (value) => ({ kind: 'gt', value }),
      exists: (value) => ({ kind: 'exists', value }),
      remove: () => REMOVE,
    },
    collection: (name) => collection(name, 'db'),
    serverDate: () => SERVER_DATE,
    async runTransaction(work) {
      calls.push({ scope: 'db', operation: 'transaction' });
      return work({ collection: (name) => collection(name, 'tx') });
    },
  };
  return { db, state, calls, SERVER_DATE };
}

const audit = (action) => ({
  actor_openid: 'user-1',
  action,
  target_id: 'user-1',
  created_at: new Date('2026-09-29T04:00:00.000Z'),
  detail: {},
});

test('readReadiness 只把当前用户未过期未消费 state 视为 active', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const { db } = fakeDb({
    oauth_states: {
      active: { openid: 'user-1', expires_at: new Date(now.getTime() + 1) },
      expired: { openid: 'user-1', expires_at: new Date(now.getTime() - 1) },
      consumed: { openid: 'user-1', expires_at: new Date(now.getTime() + 1), consumed_at: now },
      other: { openid: 'user-2', expires_at: new Date(now.getTime() + 1) },
    },
  });
  const result = await createReadinessStore(db).readReadiness('user-1', now);
  assert.equal(result.credential, undefined);
  assert.equal(result.snapshot, undefined);
  assert.equal(result.hasActiveOAuthState, true);
});

test('acquireSyncLease 在事务内重读且 fresh snapshot 不产生写入', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const { db, calls } = fakeDb({
    strava_credentials: { 'user-1': { _id: 'user-1', sync_status: 'failed' } },
    strava_snapshots: { 'user-1': { _id: 'user-1', synced_at: new Date(now.getTime() - 1) } },
  });
  const result = await createReadinessStore(db).acquireSyncLease('user-1', {
    leaseId: 'lease-new',
    now,
    staleBefore: new Date(now.getTime() - 120_000),
    audit: audit('strava.sync.started'),
  });
  assert.equal(result.acquired, false);
  assert.equal(
    calls.some((call) => call.scope === 'tx' && call.operation === 'get'),
    true,
  );
  assert.equal(
    calls.some((call) => ['set', 'update', 'add'].includes(call.operation)),
    false,
  );
});

test('未过期 running lease 不能覆盖，恰好两分钟和更旧 lease 可接管', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const active = fakeDb({
    strava_credentials: {
      'user-1': {
        _id: 'user-1',
        sync_status: 'running',
        sync_lease_id: 'lease-current',
        sync_started_at: new Date(now.getTime() - 119_999),
      },
    },
  });
  const blocked = await createReadinessStore(active.db).acquireSyncLease('user-1', {
    leaseId: 'lease-new',
    now,
    staleBefore: new Date(now.getTime() - 120_000),
    audit: audit('strava.sync.started'),
  });
  assert.equal(blocked.acquired, false);
  assert.equal(active.state.audit_logs?.size || 0, 0);

  for (const age of [120_000, 120_001]) {
    const fixture = fakeDb({
      strava_credentials: {
        'user-1': {
          _id: 'user-1',
          sync_status: 'running',
          sync_lease_id: 'lease-old',
          sync_error_code: 'STRAVA_API_FAILED',
          sync_started_at: new Date(now.getTime() - age),
        },
      },
    });
    const claimed = await createReadinessStore(fixture.db).acquireSyncLease('user-1', {
      leaseId: 'lease-new',
      now,
      staleBefore: new Date(now.getTime() - 120_000),
      audit: audit('strava.sync.started'),
    });
    assert.equal(claimed.acquired, true);
    assert.equal(fixture.state.strava_credentials.get('user-1').sync_lease_id, 'lease-new');
    assert.equal(fixture.state.strava_credentials.get('user-1').sync_error_code, undefined);
    assert.equal(fixture.state.audit_logs.size, 1);
  }
});

test('completeSync 用 lease fencing 原子写 credential、snapshot、profile 和 audit', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const fixture = fakeDb({
    strava_credentials: {
      'user-1': {
        _id: 'user-1',
        athlete_name: 'Old',
        sync_status: 'running',
        sync_lease_id: 'lease-current',
        sync_error_code: 'STRAVA_API_FAILED',
      },
    },
    profiles: { 'user-1': { _id: 'user-1', nickname: 'Rider' } },
  });
  const store = createReadinessStore(fixture.db);
  const snapshot = {
    _id: 'user-1',
    openid: 'user-1',
    total_km: 0,
    synced_at: now,
    coverage_complete: true,
  };
  const value = {
    leaseId: 'lease-old',
    credential: { _id: 'user-1', openid: 'user-1', athlete_name: 'New' },
    snapshot,
    finishedAt: now,
    audit: audit('strava.sync.succeeded'),
  };
  assert.equal(await store.completeSync('user-1', value), false);
  assert.equal(fixture.state.strava_snapshots, undefined);
  assert.equal(fixture.state.audit_logs, undefined);

  assert.equal(await store.completeSync('user-1', { ...value, leaseId: 'lease-current' }), true);
  const savedCredential = fixture.state.strava_credentials.get('user-1');
  assert.equal(savedCredential._id, undefined);
  assert.equal(savedCredential.athlete_name, 'New');
  assert.equal(savedCredential.sync_status, 'ready');
  assert.equal(savedCredential.sync_lease_id, undefined);
  assert.equal(savedCredential.sync_error_code, undefined);
  assert.deepEqual(fixture.state.strava_snapshots.get('user-1'), {
    openid: 'user-1',
    total_km: 0,
    synced_at: now,
    coverage_complete: true,
  });
  assert.deepEqual(fixture.state.profiles.get('user-1').strava, {
    status: 'connected',
    snapshot,
  });
  assert.equal(fixture.state.audit_logs.size, 1);
});

test('failSync 用 lease fencing 且只保存稳定错误码', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const fixture = fakeDb({
    strava_credentials: {
      'user-1': {
        _id: 'user-1',
        sync_status: 'running',
        sync_lease_id: 'lease-current',
      },
    },
  });
  const store = createReadinessStore(fixture.db);
  const value = {
    leaseId: 'lease-old',
    errorCode: 'STRAVA_API_FAILED',
    finishedAt: now,
    audit: audit('strava.sync.failed'),
  };
  assert.equal(await store.failSync('user-1', value), false);
  assert.equal(fixture.state.audit_logs, undefined);
  assert.equal(await store.failSync('user-1', { ...value, leaseId: 'lease-current' }), true);
  const saved = fixture.state.strava_credentials.get('user-1');
  assert.equal(saved.sync_status, 'failed');
  assert.equal(saved.sync_error_code, 'STRAVA_API_FAILED');
  assert.equal(saved.sync_lease_id, undefined);
  assert.equal(JSON.stringify(saved).includes('message'), false);
  assert.equal(fixture.state.audit_logs.size, 1);
});

test('disconnect 通过 transaction 读取 profile 并原子删除 canonical 数据', async () => {
  const fixture = fakeDb({
    strava_credentials: { 'user-1': { _id: 'user-1' } },
    strava_snapshots: { 'user-1': { _id: 'user-1' } },
    profiles: { 'user-1': { _id: 'user-1', nickname: 'Rider' } },
  });
  await createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnect'));
  assert.equal(fixture.state.strava_credentials.has('user-1'), false);
  assert.equal(fixture.state.strava_snapshots.has('user-1'), false);
  assert.deepEqual(fixture.state.profiles.get('user-1').strava, { status: 'disconnected' });
  assert.equal(fixture.state.profiles.get('user-1').updated_at, fixture.SERVER_DATE);
  assert.equal(
    fixture.calls.some(
      (call) =>
        call.scope === 'tx' &&
        call.operation === 'get' &&
        call.collection === 'profiles' &&
        call.id === 'user-1',
    ),
    true,
  );
  assert.equal(fixture.state.audit_logs.size, 1);
});

test('status 与 ensureReady 路由都返回 canonical readiness DTO', async () => {
  const now = new Date();
  const fixture = fakeDb({
    strava_credentials: {
      'user-1': {
        _id: 'user-1',
        athlete_id: 'athlete-current',
        athlete_name: 'Rider',
        sync_status: 'ready',
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
      },
    },
    strava_snapshots: {
      'user-1': {
        _id: 'user-1',
        athlete_id: 'athlete-current',
        synced_at: new Date(now.getTime() - 1),
        total_km: 10,
      },
    },
  });
  fixture.db.command.lte = (value) => ({ kind: 'lte', value });
  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: 'dynamic',
    init() {},
    database: () => fixture.db,
    getWXContext: () => ({ OPENID: 'user-1' }),
  };
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return fakeCloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  let main;
  try {
    delete require.cache[require.resolve('./index')];
    main = require('./index').main;
  } finally {
    Module._load = originalLoad;
  }
  const previous = {
    clientId: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
    key: process.env.STRAVA_TOKEN_ENCRYPTION_KEY,
    callback: process.env.STRAVA_CALLBACK_URL,
  };
  Object.assign(process.env, {
    STRAVA_CLIENT_ID: '36717',
    STRAVA_CLIENT_SECRET: 'test-secret',
    STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    STRAVA_CALLBACK_URL: 'https://example.test/callback',
  });
  try {
    for (const action of ['status', 'ensureReady']) {
      const response = await main({ action });
      assert.equal(response.ok, true);
      assert.equal(response.data.state, 'ready');
      assert.equal(response.data.can_register, true);
      assert.equal(response.data.athlete_name, 'Rider');
    }
  } finally {
    for (const [name, value] of Object.entries({
      STRAVA_CLIENT_ID: previous.clientId,
      STRAVA_CLIENT_SECRET: previous.clientSecret,
      STRAVA_TOKEN_ENCRYPTION_KEY: previous.key,
      STRAVA_CALLBACK_URL: previous.callback,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    delete require.cache[require.resolve('./index')];
  }
});
