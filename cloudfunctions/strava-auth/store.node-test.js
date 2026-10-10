'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const crypto = require('node:crypto');

Object.assign(require('./oauth/core'), require('../strava-shared/core'));
const { createReadinessStore } = require('./store');

function fakeDb(
  seed = {},
  {
    queryBatchLimit = Number.POSITIVE_INFINITY,
    transactionWriteLimit = Number.POSITIVE_INFINITY,
    failProfileMediaDbUpdateAt = Number.POSITIVE_INFINITY,
    missingDocumentError = { errCode: -502001, errMsg: 'document not found' },
  } = {},
) {
  const REMOVE = Symbol('remove');
  const SERVER_DATE = Symbol('server-date');
  const state = {};
  for (const [name, values] of Object.entries(seed)) {
    state[name] = new Map(Object.entries(values));
  }
  const calls = [];
  let transactionWrites = 0;
  let profileMediaDbUpdates = 0;
  let profileMediaFailureInjected = false;
  const beforeWrite = (name, scope, operation) => {
    if (scope === 'tx' && ++transactionWrites > transactionWriteLimit)
      throw Object.assign(new Error('transaction write limit exceeded'), {
        code: 'TRANSACTION_WRITE_LIMIT_EXCEEDED',
      });
    if (
      name === 'profile_media' &&
      scope === 'db' &&
      operation === 'update' &&
      ++profileMediaDbUpdates === failProfileMediaDbUpdateAt &&
      !profileMediaFailureInjected
    ) {
      profileMediaFailureInjected = true;
      throw Object.assign(new Error('injected profile media update failure'), {
        code: 'PROFILE_MEDIA_UPDATE_FAILED',
      });
    }
  };
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
          if (!ensure(name).has(id)) throw { ...missingDocumentError };
          return { data: ensure(name).get(id) };
        },
        async set({ data }) {
          beforeWrite(name, scope, 'set');
          calls.push({ scope, operation: 'set', collection: name, id });
          ensure(name).set(id, { ...data });
        },
        async update({ data }) {
          beforeWrite(name, scope, 'update');
          calls.push({ scope, operation: 'update', collection: name, id });
          ensure(name).set(id, applyData(ensure(name).get(id) || {}, data));
        },
        async remove() {
          beforeWrite(name, scope, 'remove');
          calls.push({ scope, operation: 'remove', collection: name, id });
          ensure(name).delete(id);
        },
      };
    },
    async add({ data }) {
      beforeWrite(name, scope, 'add');
      calls.push({ scope, operation: 'add', collection: name });
      ensure(name).set(`audit-${ensure(name).size + 1}`, { ...data });
    },
    where(query) {
      calls.push({ scope, operation: 'where', collection: name, query });
      const matches = () =>
        [...ensure(name).entries()].filter(([, value]) => {
          for (const [key, expected] of Object.entries(query)) {
            if (expected?.kind === 'gt') {
              if (!(value[key] > expected.value)) return false;
            } else if (expected?.kind === 'exists') {
              if (Object.hasOwn(value, key) !== expected.value) return false;
            } else if (value[key] !== expected) return false;
          }
          return true;
        });
      const queryBuilder = (order, requestedLimit) => ({
        async get() {
          let values = matches().map(([, value]) => value);
          if (order) {
            const direction = order.direction === 'desc' ? -1 : 1;
            values.sort(
              (left, right) =>
                String(left[order.field]).localeCompare(String(right[order.field])) * direction,
            );
          }
          const limit = Math.min(requestedLimit ?? queryBatchLimit, queryBatchLimit);
          return { data: values.slice(0, limit) };
        },
        async update({ data }) {
          beforeWrite(name, scope, 'updateWhere');
          calls.push({ scope, operation: 'updateWhere', collection: name, query });
          const matched = matches();
          for (const [id, value] of matched) ensure(name).set(id, applyData(value, data));
          return { stats: { updated: matched.length } };
        },
        orderBy(field, direction) {
          return queryBuilder({ field, direction }, requestedLimit);
        },
        limit(limit) {
          return queryBuilder(order, limit);
        },
      });
      return queryBuilder();
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
const usableCredential = (overrides = {}) => ({
  _id: 'user-1',
  athlete_id: 'athlete-current',
  token_expires_at: new Date('2026-09-29T06:00:00.000Z'),
  sync_status: 'failed',
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

test('readReadiness 把平台明确缺文档的 -1 视为空 attempt', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const credential = usableCredential();
  const snapshot = { _id: 'user-1', athlete_id: 'athlete-current' };
  const { db } = fakeDb(
    {
      strava_credentials: { 'user-1': credential },
      strava_snapshots: { 'user-1': snapshot },
    },
    {
      missingDocumentError: {
        errCode: -1,
        errMsg: 'document with _id user-1 does not exist',
      },
    },
  );

  const result = await createReadinessStore(db).readReadiness('user-1', now);

  assert.equal(result.credential, credential);
  assert.equal(result.snapshot, snapshot);
  assert.equal(result.hasActiveOAuthState, false);
  assert.equal(result.authorizationErrorCode, undefined);
});

test('readReadiness 对通用 -1 数据库错误保持失败关闭', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const { db } = fakeDb(
    {},
    {
      missingDocumentError: {
        errCode: -1,
        errMsg: 'database request fail',
      },
    },
  );

  await assert.rejects(createReadinessStore(db).readReadiness('user-1', now), {
    errCode: -1,
    errMsg: 'database request fail',
  });
});

test('cancelAuthorization 只使当前用户未过期 state 失效', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const fixture = fakeDb({
    oauth_states: {
      active: { openid: 'user-1', expires_at: new Date(now.getTime() + 1) },
      expired: { openid: 'user-1', expires_at: new Date(now.getTime() - 1) },
      other: { openid: 'user-2', expires_at: new Date(now.getTime() + 1) },
    },
  });

  const result = await createReadinessStore(fixture.db).cancelAuthorization('user-1', now);

  assert.equal(result.cancelled, 1);
  assert.equal(fixture.state.oauth_states.get('active').cancelled_at, fixture.SERVER_DATE);
  assert.equal(fixture.state.oauth_states.get('active').consumed_at, fixture.SERVER_DATE);
  assert.equal(fixture.state.oauth_states.get('expired').consumed_at, undefined);
  assert.equal(fixture.state.oauth_states.get('other').consumed_at, undefined);
});

test('saveRefreshedCredential 仅替换匹配版本并保留同步租约', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const current = usableCredential({
    openid: 'user-1',
    credential_generation: 3,
    token_refresh_lease_id: 'refresh-owner',
    token_refresh_started_at: now,
    sync_status: 'running',
    sync_lease_id: 'lease-current',
  });
  const fixture = fakeDb({ strava_credentials: { 'user-1': current } });
  const refreshed = usableCredential({
    openid: 'user-1',
    athlete_name: 'Refreshed Rider',
    token_expires_at: new Date('2026-09-29T10:00:00.000Z'),
    access_token_cipher: { ...current.access_token_cipher, ciphertext: 'new-access' },
    refresh_token_cipher: { ...current.refresh_token_cipher, ciphertext: 'new-refresh' },
    sync_status: 'pending',
  });

  const saved = await createReadinessStore(fixture.db).saveRefreshedCredential(
    'user-1',
    current,
    refreshed,
    now,
    'refresh-owner',
  );
  assert.equal(saved.saved, true);
  assert.equal(saved.credential.sync_status, 'running');
  assert.equal(saved.credential.sync_lease_id, 'lease-current');
  assert.equal(saved.credential.access_token_cipher.ciphertext, 'new-access');

  const stale = await createReadinessStore(fixture.db).saveRefreshedCredential(
    'user-1',
    current,
    usableCredential({
      access_token_cipher: { ...current.access_token_cipher, ciphertext: 'stale' },
    }),
    now,
    'refresh-owner',
  );
  assert.equal(stale.saved, false);
  assert.equal(stale.credential.access_token_cipher.ciphertext, 'new-access');

  for (const [id, invalidCurrent, expected] of [
    [
      'invalid-generation',
      usableCredential({
        _id: 'invalid-generation',
        openid: 'invalid-generation',
        credential_generation: 0,
        token_refresh_lease_id: 'refresh-owner',
      }),
      undefined,
    ],
    [
      'expected-other-owner',
      usableCredential({
        _id: 'expected-other-owner',
        openid: 'expected-other-owner',
        credential_generation: 5,
        token_refresh_lease_id: 'refresh-owner',
      }),
      { _id: 'other-user', openid: 'other-user' },
    ],
  ]) {
    const guardedFixture = fakeDb({ strava_credentials: { [id]: invalidCurrent } });
    const guardedStore = createReadinessStore(guardedFixture.db);
    const guardedExpected = expected ? { ...invalidCurrent, ...expected } : invalidCurrent;
    const rejected = await guardedStore.saveRefreshedCredential(
      id,
      guardedExpected,
      refreshed,
      now,
      'refresh-owner',
    );
    assert.equal(rejected.saved, false);
    assert.equal(
      guardedFixture.state.strava_credentials.get(id).access_token_cipher.ciphertext,
      'access-ciphertext',
    );
  }
});

test('refresh lease：活跃 owner 唯一、过期 lease 可接管且旧 owner 不可完成', async () => {
  const now = new Date('2026-10-01T04:00:00.000Z');
  const fixture = fakeDb({
    strava_credentials: {
      'user-1': usableCredential({
        openid: 'user-1',
        credential_generation: 4,
        token_refresh_lease_id: 'stale-owner',
        token_refresh_started_at: new Date(now.getTime() - 60_001),
      }),
    },
  });
  const store = createReadinessStore(fixture.db);
  const expected = fixture.state.strava_credentials.get('user-1');
  const rejected = await store.acquireCredentialRefreshLease('user-1', {
    leaseId: 'wrong-version-owner',
    now,
    staleBefore: new Date(now.getTime() - 60_000),
    expected: {
      ...expected,
      refresh_token_cipher: { ...expected.refresh_token_cipher, ciphertext: 'other-version' },
    },
  });
  assert.equal(rejected.acquired, false);
  assert.equal(rejected.credential.token_refresh_lease_id, 'stale-owner');
  const foreignExpected = await store.acquireCredentialRefreshLease('user-1', {
    leaseId: 'foreign-owner',
    now,
    staleBefore: new Date(now.getTime() - 60_000),
    expected: { ...expected, _id: 'other-user', openid: 'other-user' },
  });
  assert.equal(foreignExpected.acquired, false);
  assert.equal(foreignExpected.credential.token_refresh_lease_id, 'stale-owner');

  const claim = await store.acquireCredentialRefreshLease('user-1', {
    leaseId: 'new-owner',
    now,
    staleBefore: new Date(now.getTime() - 60_000),
    expected,
  });
  assert.equal(claim.acquired, true);
  assert.equal(claim.credential.token_refresh_lease_id, 'new-owner');

  const stale = await store.saveRefreshedCredential(
    'user-1',
    claim.credential,
    usableCredential({ access_token_cipher: { ciphertext: 'stale-access' } }),
    now,
    'stale-owner',
  );
  assert.equal(stale.saved, false);
  assert.equal(fixture.state.strava_credentials.get('user-1').token_refresh_lease_id, 'new-owner');

  const legacyCredential = usableCredential({ _id: 'legacy-user', openid: 'legacy-user' });
  const legacyFixture = fakeDb({ strava_credentials: { 'legacy-user': legacyCredential } });
  const legacyClaim = await createReadinessStore(legacyFixture.db).acquireCredentialRefreshLease(
    'legacy-user',
    {
      leaseId: 'legacy-owner',
      now,
      staleBefore: new Date(now.getTime() - 60_000),
      expected: legacyCredential,
    },
  );
  assert.equal(legacyClaim.acquired, true);
  assert.equal(legacyClaim.credential.credential_generation, 1);
  assert.equal(legacyFixture.state.strava_credentials.get('legacy-user').credential_generation, 1);

  for (const invalidGeneration of [0, -1, 1.5, '1', null]) {
    const invalidCredential = usableCredential({
      openid: 'invalid-user',
      credential_generation: invalidGeneration,
    });
    const invalidFixture = fakeDb({
      strava_credentials: { 'invalid-user': invalidCredential },
    });
    const invalidClaim = await createReadinessStore(
      invalidFixture.db,
    ).acquireCredentialRefreshLease('invalid-user', {
      leaseId: 'invalid-owner',
      now,
      staleBefore: new Date(now.getTime() - 60_000),
      expected: invalidCredential,
    });
    assert.equal(invalidClaim.acquired, false);
    assert.equal(
      invalidFixture.state.strava_credentials.get('invalid-user').credential_generation,
      invalidGeneration,
    );
    assert.equal(
      invalidFixture.state.strava_credentials.get('invalid-user').token_refresh_lease_id,
      undefined,
    );
  }
});

test('refresh lease release 仅允许当前 generation 的 owner', async () => {
  const now = new Date('2026-10-01T04:00:00.000Z');
  const fixture = fakeDb({
    strava_credentials: {
      'user-1': usableCredential({
        openid: 'user-1',
        credential_generation: 9,
        token_refresh_lease_id: 'current-owner',
        token_refresh_started_at: now,
      }),
    },
  });
  const store = createReadinessStore(fixture.db);
  const expected = fixture.state.strava_credentials.get('user-1');

  assert.equal(
    await store.releaseCredentialRefreshLease('user-1', {
      leaseId: 'other-owner',
      expected,
      finishedAt: now,
    }),
    false,
  );
  assert.equal(
    await store.releaseCredentialRefreshLease('user-1', {
      leaseId: 'current-owner',
      expected: { ...expected, credential_generation: 8 },
      finishedAt: now,
    }),
    false,
  );
  assert.equal(
    fixture.state.strava_credentials.get('user-1').token_refresh_lease_id,
    'current-owner',
  );
  assert.equal(
    await store.releaseCredentialRefreshLease('user-1', {
      leaseId: 'current-owner',
      expected: { ...expected, _id: 'other-user', openid: 'other-user' },
      finishedAt: now,
    }),
    false,
  );
  assert.equal(
    fixture.state.strava_credentials.get('user-1').token_refresh_lease_id,
    'current-owner',
  );
  assert.equal(
    await store.releaseCredentialRefreshLease('user-1', {
      leaseId: 'current-owner',
      expected: {
        ...expected,
        access_token_cipher: { ...expected.access_token_cipher, ciphertext: 'other-version' },
      },
      finishedAt: now,
    }),
    false,
  );
  assert.equal(
    fixture.state.strava_credentials.get('user-1').token_refresh_lease_id,
    'current-owner',
  );
  assert.equal(
    await store.releaseCredentialRefreshLease('user-1', {
      leaseId: 'current-owner',
      expected,
      finishedAt: now,
    }),
    true,
  );
  assert.equal(fixture.state.strava_credentials.get('user-1').token_refresh_lease_id, undefined);

  const invalidCredential = usableCredential({
    _id: 'invalid-user',
    openid: 'invalid-user',
    credential_generation: 0,
    token_refresh_lease_id: 'invalid-owner',
    token_refresh_started_at: now,
  });
  const invalidFixture = fakeDb({ strava_credentials: { 'invalid-user': invalidCredential } });
  assert.equal(
    await createReadinessStore(invalidFixture.db).releaseCredentialRefreshLease('invalid-user', {
      leaseId: 'invalid-owner',
      expected: invalidCredential,
      finishedAt: now,
    }),
    false,
  );
  assert.equal(
    invalidFixture.state.strava_credentials.get('invalid-user').token_refresh_lease_id,
    'invalid-owner',
  );
});

test('acquireSyncLease 在事务内重读且 fresh snapshot 不产生写入', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const { db, calls } = fakeDb({
    strava_credentials: { 'user-1': usableCredential() },
    strava_snapshots: {
      'user-1': {
        _id: 'user-1',
        athlete_id: 'athlete-current',
        synced_at: new Date(now.getTime() - 1),
      },
    },
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

test('fresh 但凭证不可用或 athlete 不匹配的 snapshot 会获取 lease 自愈', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const cases = [
    {
      credential: usableCredential({ refresh_token_cipher: undefined }),
      snapshot: { athlete_id: 'athlete-current' },
    },
    { credential: usableCredential(), snapshot: {} },
    { credential: usableCredential(), snapshot: { athlete_id: 'athlete-previous' } },
  ];

  for (const [index, value] of cases.entries()) {
    const fixture = fakeDb({
      strava_credentials: { 'user-1': value.credential },
      strava_snapshots: {
        'user-1': { _id: 'user-1', ...value.snapshot, synced_at: new Date(now.getTime() - 1) },
      },
    });
    const result = await createReadinessStore(fixture.db).acquireSyncLease('user-1', {
      leaseId: `lease-${index}`,
      now,
      staleBefore: new Date(now.getTime() - 120_000),
      audit: audit('strava.sync.started'),
    });

    assert.equal(result.acquired, true);
    assert.equal(fixture.state.strava_credentials.get('user-1').sync_lease_id, `lease-${index}`);
    assert.equal(fixture.state.audit_logs.size, 1);
  }
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

test('completeSync 不得用旧 credential 快照覆盖并发更新的 avatar import lease', async () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const fixture = fakeDb({
    strava_credentials: {
      'user-1': {
        _id: 'user-1',
        sync_status: 'running',
        sync_lease_id: 'sync-current',
        avatar_import_lease_id: 'avatar-new',
        avatar_import_started_at: now,
        avatar_import_lease_expires_at: new Date('2026-09-29T04:10:00.000Z'),
      },
    },
    profiles: { 'user-1': { _id: 'user-1' } },
  });
  const value = {
    leaseId: 'sync-current',
    credential: {
      _id: 'user-1',
      openid: 'user-1',
      avatar_import_lease_id: 'avatar-old',
      avatar_import_started_at: new Date('2026-09-29T03:00:00.000Z'),
      avatar_import_lease_expires_at: new Date('2026-09-29T03:10:00.000Z'),
    },
    snapshot: { _id: 'user-1', openid: 'user-1', synced_at: now },
    finishedAt: now,
    audit: audit('strava.sync.succeeded'),
  };

  assert.equal(await createReadinessStore(fixture.db).completeSync('user-1', value), true);
  assert.equal(fixture.state.strava_credentials.get('user-1').avatar_import_lease_id, 'avatar-new');
  assert.equal(fixture.state.strava_credentials.get('user-1').avatar_import_started_at, now);
  assert.deepEqual(
    fixture.state.strava_credentials.get('user-1').avatar_import_lease_expires_at,
    new Date('2026-09-29T04:10:00.000Z'),
  );
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
  const avatarFileId = 'cloud://env/profiles/owner/strava-avatar.jpg';
  const avatarMediaId = crypto.createHash('sha256').update(avatarFileId).digest('hex');
  const fixture = fakeDb({
    strava_credentials: { 'user-1': { _id: 'user-1' } },
    strava_snapshots: { 'user-1': { _id: 'user-1' } },
    profiles: {
      'user-1': {
        _id: 'user-1',
        nickname: 'Rider',
        avatar_source: 'strava',
        avatar_file_id: avatarFileId,
        avatar_revision: 4,
      },
    },
    profile_media: {
      [avatarMediaId]: {
        _id: avatarMediaId,
        file_id: avatarFileId,
        owner_openid: 'user-1',
        origin: 'strava',
        status: 'active',
      },
    },
  });
  await createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnect'));
  assert.equal(fixture.state.strava_credentials.has('user-1'), false);
  assert.equal(fixture.state.strava_snapshots.has('user-1'), false);
  assert.deepEqual(fixture.state.profiles.get('user-1').strava, { status: 'disconnected' });
  assert.equal(fixture.state.profiles.get('user-1').avatar_source, undefined);
  assert.equal(fixture.state.profiles.get('user-1').avatar_file_id, undefined);
  assert.equal(fixture.state.profiles.get('user-1').avatar_revision, 5);
  assert.deepEqual(fixture.state.profile_media.get(avatarMediaId), {
    _id: avatarMediaId,
    file_id: avatarFileId,
    owner_openid: 'user-1',
    origin: 'strava',
    status: 'unreferenced',
    referenced_at: null,
    cleanup_after: new Date('2026-09-30T04:00:00.000Z'),
    delete_lease_id: '',
    updated_at: fixture.SERVER_DATE,
  });
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

test('disconnect 保留非 Strava 头像', async () => {
  const fixture = fakeDb({
    strava_credentials: { 'user-1': { _id: 'user-1' } },
    strava_snapshots: { 'user-1': { _id: 'user-1' } },
    profiles: {
      'user-1': {
        _id: 'user-1',
        nickname: 'Rider',
        avatar_source: 'custom',
        avatar_file_id: 'cloud://custom-avatar',
      },
    },
  });
  await createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnect'));
  assert.equal(fixture.state.profiles.get('user-1').avatar_source, 'custom');
  assert.equal(fixture.state.profiles.get('user-1').avatar_file_id, 'cloud://custom-avatar');
});

test('disconnect 清除 Strava 头像槽位但不降级仍在 photos 中的媒体', async () => {
  const avatarFileId = 'cloud://env/profiles/owner/shared-strava-avatar.jpg';
  const avatarMediaId = crypto.createHash('sha256').update(avatarFileId).digest('hex');
  const fixture = fakeDb({
    strava_credentials: { 'user-1': { _id: 'user-1' } },
    strava_snapshots: { 'user-1': { _id: 'user-1' } },
    profiles: {
      'user-1': {
        _id: 'user-1',
        avatar_source: 'strava',
        avatar_file_id: avatarFileId,
        photos: [{ file_id: avatarFileId, category: 'other' }],
      },
    },
    profile_media: {
      [avatarMediaId]: {
        _id: avatarMediaId,
        file_id: avatarFileId,
        owner_openid: 'user-1',
        origin: 'strava',
        status: 'active',
      },
    },
  });

  await createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnect'));

  assert.equal(fixture.state.profiles.get('user-1').avatar_file_id, undefined);
  assert.equal(fixture.state.profile_media.get(avatarMediaId).status, 'active');
});

test('disconnect 清除 Strava 头像槽位但不降级仍在 background_photo 中的媒体', async () => {
  const avatarFileId = 'cloud://env/profiles/owner/shared-background.jpg';
  const avatarMediaId = crypto.createHash('sha256').update(avatarFileId).digest('hex');
  const fixture = fakeDb({
    strava_credentials: { 'user-1': { _id: 'user-1' } },
    strava_snapshots: { 'user-1': { _id: 'user-1' } },
    profiles: {
      'user-1': {
        _id: 'user-1',
        avatar_source: 'strava',
        avatar_file_id: avatarFileId,
        background_photo: { file_id: avatarFileId, category: 'other' },
        photos: [],
      },
    },
    profile_media: {
      [avatarMediaId]: {
        _id: avatarMediaId,
        file_id: avatarFileId,
        owner_openid: 'user-1',
        origin: 'strava',
        status: 'active',
      },
    },
  });

  await createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnect'));

  assert.equal(fixture.state.profiles.get('user-1').avatar_file_id, undefined);
  assert.equal(fixture.state.profile_media.get(avatarMediaId).status, 'active');
});

test('disconnect 不得让 avatar revision 越过安全整数上限', async () => {
  const fixture = fakeDb({
    strava_credentials: { 'user-1': usableCredential() },
    strava_snapshots: { 'user-1': { _id: 'user-1', athlete_id: 'athlete-current' } },
    profiles: {
      'user-1': {
        _id: 'user-1',
        avatar_source: 'strava',
        avatar_file_id: 'cloud://env/profiles/owner/avatar.jpg',
        avatar_revision: Number.MAX_SAFE_INTEGER,
      },
    },
  });

  await assert.rejects(
    createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnected')),
    { code: 'AVATAR_REVISION_EXHAUSTED' },
  );
});

test('status、ensureReady 与 cancelAuthorization 路由可用', async () => {
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
    const cancelled = await main({ action: 'cancelAuthorization' });
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.data.cancelled, 0);
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

test('disconnect 作废全部未消费 state 并推进 attempt generation', async () => {
  const fixture = fakeDb({
    oauth_attempts: {
      'user-1': { openid: 'user-1', attempt_generation: 4, status: 'authorizing' },
    },
    oauth_states: {
      current: { openid: 'user-1', attempt_generation: 4, expires_at: new Date('2099-01-01') },
      expired: { openid: 'user-1', attempt_generation: 3, expires_at: new Date('2000-01-01') },
      consumed: {
        openid: 'user-1',
        attempt_generation: 2,
        expires_at: new Date('2099-01-01'),
        consumed_at: new Date('2026-01-01'),
      },
      other: { openid: 'user-2', attempt_generation: 1, expires_at: new Date('2099-01-01') },
    },
  });

  await createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnect'));

  assert.equal(fixture.state.oauth_states.get('current').consumed_at, fixture.SERVER_DATE);
  assert.equal(fixture.state.oauth_states.get('expired').consumed_at, fixture.SERVER_DATE);
  assert.notEqual(fixture.state.oauth_states.get('consumed').consumed_at, fixture.SERVER_DATE);
  assert.equal(fixture.state.oauth_states.get('other').consumed_at, undefined);
  assert.deepEqual(fixture.state.oauth_attempts.get('user-1'), {
    openid: 'user-1',
    attempt_generation: 5,
    status: 'disconnected',
    error_code: null,
    updated_at: fixture.SERVER_DATE,
  });
});

test('disconnect 降级所有未被 profile 引用的 Strava 媒体', async () => {
  const retained = 'cloud://env/profiles/owner/retained.jpg';
  const orphan = 'cloud://env/profiles/owner/orphan.jpg';
  const fixture = fakeDb({
    profiles: { 'user-1': { _id: 'user-1', photos: [{ file_id: retained }] } },
    profile_media: {
      retained: {
        _id: 'retained',
        file_id: retained,
        owner_openid: 'user-1',
        origin: 'strava',
        status: 'active',
      },
      orphan: {
        _id: 'orphan',
        file_id: orphan,
        owner_openid: 'user-1',
        origin: 'strava',
        status: 'active',
      },
    },
  });

  await createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnect'));

  assert.equal(fixture.state.profile_media.get('retained').status, 'active');
  assert.equal(fixture.state.profile_media.get('orphan').status, 'unreferenced');
});

test('createAuthorizationAttempt 为并发 state 分配单调 generation', async () => {
  const fixture = fakeDb();
  const store = createReadinessStore(fixture.db);
  await store.createAuthorizationAttempt('user-1', {
    hash: 'state-1',
    expiresAt: new Date('2026-09-29T04:10:00.000Z'),
  });
  await store.createAuthorizationAttempt('user-1', {
    hash: 'state-2',
    expiresAt: new Date('2026-09-29T04:11:00.000Z'),
  });

  assert.equal(fixture.state.oauth_states.get('state-1').attempt_generation, 1);
  assert.equal(fixture.state.oauth_states.get('state-2').attempt_generation, 2);
  assert.equal(fixture.state.oauth_attempts.get('user-1').attempt_generation, 2);
});

test('disconnect 用稳定 _id 游标分页降级 profile 存在时超过单批上限的媒体', async () => {
  const profileMedia = Object.fromEntries(
    Array.from({ length: 205 }, (_, index) => {
      const id = `media-${String(index).padStart(3, '0')}`;
      return [
        id,
        {
          _id: id,
          file_id: `cloud://env/profiles/owner/${id}.jpg`,
          owner_openid: 'user-1',
          origin: 'strava',
          status: 'active',
        },
      ];
    }),
  );
  const fixture = fakeDb(
    {
      profiles: { 'user-1': { _id: 'user-1', photos: [] } },
      profile_media: profileMedia,
    },
    { transactionWriteLimit: 10 },
  );

  await createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnect'));

  assert.equal(
    [...fixture.state.profile_media.values()].every((media) => media.status === 'unreferenced'),
    true,
  );
  assert.equal(
    fixture.calls.some((call) => call.scope === 'tx' && call.collection === 'profile_media'),
    false,
  );
  assert.equal(
    fixture.calls
      .filter((call) => ['set', 'update', 'remove', 'add', 'updateWhere'].includes(call.operation))
      .filter((call) => call.scope === 'tx').length <= 10,
    true,
  );
});

test('disconnect 在 profile 缺失时分页降级超过单批上限的孤立 Strava 媒体', async () => {
  const profileMedia = Object.fromEntries(
    Array.from({ length: 101 }, (_, index) => {
      const id = `orphan-${String(index).padStart(3, '0')}`;
      return [
        id,
        {
          _id: id,
          file_id: `cloud://env/profiles/owner/${id}.jpg`,
          owner_openid: 'user-1',
          origin: 'strava',
          status: 'active',
        },
      ];
    }),
  );
  const fixture = fakeDb({ profile_media: profileMedia });

  await createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnect'));

  assert.equal(
    [...fixture.state.profile_media.values()].every((media) => media.status === 'unreferenced'),
    true,
  );
});

test('disconnect 分页游标在整页媒体都被 profile 保留时仍会前进', async () => {
  const profileMedia = Object.fromEntries(
    Array.from({ length: 101 }, (_, index) => {
      const id = `retained-${String(index).padStart(3, '0')}`;
      return [
        id,
        {
          _id: id,
          file_id: `cloud://env/profiles/owner/${id}.jpg`,
          owner_openid: 'user-1',
          origin: 'strava',
          status: 'active',
        },
      ];
    }),
  );
  const fixture = fakeDb({
    profiles: {
      'user-1': {
        _id: 'user-1',
        photos: Object.values(profileMedia).map((media) => ({ file_id: media.file_id })),
      },
    },
    profile_media: profileMedia,
  });

  await createReadinessStore(fixture.db).disconnect('user-1', audit('strava.disconnect'));

  assert.equal(
    [...fixture.state.profile_media.values()].every((media) => media.status === 'active'),
    true,
  );
});

test('disconnect 媒体清理中途失败时保留原子断开状态且重试可收敛', async () => {
  const profileMedia = Object.fromEntries(
    Array.from({ length: 135 }, (_, index) => {
      const id = `retry-${String(index).padStart(3, '0')}`;
      return [
        id,
        {
          _id: id,
          file_id: `cloud://env/profiles/owner/${id}.jpg`,
          owner_openid: 'user-1',
          origin: 'strava',
          status: 'active',
        },
      ];
    }),
  );
  const fixture = fakeDb(
    {
      oauth_attempts: {
        'user-1': { openid: 'user-1', attempt_generation: 3, status: 'connected' },
      },
      oauth_states: {
        current: { openid: 'user-1', attempt_generation: 3 },
      },
      strava_credentials: { 'user-1': { _id: 'user-1' } },
      strava_snapshots: { 'user-1': { _id: 'user-1' } },
      profiles: { 'user-1': { _id: 'user-1', photos: [] } },
      profile_media: profileMedia,
    },
    { failProfileMediaDbUpdateAt: 57 },
  );
  const store = createReadinessStore(fixture.db);

  await assert.rejects(store.disconnect('user-1', audit('strava.disconnect')), {
    code: 'PROFILE_MEDIA_UPDATE_FAILED',
  });

  assert.equal(fixture.state.strava_credentials.has('user-1'), false);
  assert.equal(fixture.state.strava_snapshots.has('user-1'), false);
  assert.equal(fixture.state.oauth_states.get('current').consumed_at, fixture.SERVER_DATE);
  assert.equal(fixture.state.oauth_attempts.get('user-1').status, 'disconnected');
  assert.deepEqual(fixture.state.profiles.get('user-1').strava, { status: 'disconnected' });
  assert.equal(
    [...fixture.state.profile_media.values()].some((media) => media.status === 'active'),
    true,
  );

  await store.disconnect('user-1', audit('strava.disconnect.retry'));

  assert.equal(
    [...fixture.state.profile_media.values()].every((media) => media.status === 'unreferenced'),
    true,
  );
  assert.equal(
    fixture.calls.some((call) => call.scope === 'tx' && call.collection === 'profile_media'),
    false,
  );
});
