'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

let subject = {};
try {
  subject = require('./store');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const createCleanupStore = subject.createCleanupStore || (() => ({}));

function mutationDatabase(seed) {
  const REMOVE = Symbol('remove');
  const state = Object.fromEntries(
    Object.entries(seed).map(([name, records]) => [name, new Map(Object.entries(records))]),
  );
  const ensure = (name) => (state[name] ||= new Map());
  const apply = (current, data) => {
    const next = { ...(current || {}) };
    for (const [key, value] of Object.entries(data)) {
      if (value === REMOVE) delete next[key];
      else next[key] = value;
    }
    return next;
  };
  const collection = (name) => ({
    doc: (id) => ({
      get: async () => ({ data: ensure(name).get(id) }),
      update: async ({ data }) => ensure(name).set(id, apply(ensure(name).get(id), data)),
    }),
  });
  return {
    state,
    db: {
      command: { lte: (value) => ({ $lte: value }), remove: () => REMOVE },
      collection,
      runTransaction: (work) => work({ collection }),
    },
  };
}

test('到期 leased intent 原子终止并仅释放自己的 credential lease', async () => {
  const now = new Date('2026-09-29T12:00:00.000Z');
  const fixture = mutationDatabase({
    profile_media_imports: {
      'intent-old': {
        _id: 'intent-old',
        owner_openid: 'owner',
        status: 'leased',
        cleanup_after: new Date('2026-09-29T11:59:59.000Z'),
      },
    },
    profiles: { owner: { _id: 'owner' } },
    strava_credentials: {
      owner: {
        _id: 'owner',
        avatar_import_lease_id: 'intent-old',
        avatar_import_started_at: new Date('2026-09-29T11:49:59.000Z'),
        avatar_import_lease_expires_at: new Date('2026-09-29T11:59:59.000Z'),
      },
    },
  });

  const result = await createCleanupStore(
    fixture.db,
    'profile-media-secret-for-tests-32-bytes',
  ).claimImportIntent('intent-old', { leaseId: 'cleanup', now });

  assert.equal(result.aborted, true);
  assert.equal(fixture.state.profile_media_imports.get('intent-old').status, 'aborted');
  assert.equal(fixture.state.strava_credentials.get('owner').avatar_import_lease_id, undefined);
  assert.equal(
    fixture.state.strava_credentials.get('owner').avatar_import_lease_expires_at,
    undefined,
  );
});

test('lost recovery 只有 owner 路径未被 profile 引用时才能重建删除 fence', async () => {
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const owner = 'owner';
  const alias = crypto.createHmac('sha256', secret).update(owner).digest('hex').slice(0, 32);
  const cloudPath = `profiles/${alias}/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const fileId = `cloud://env/${cloudPath}`;
  const now = new Date('2026-09-29T12:00:00.000Z');
  const leaseExpiresAt = new Date('2026-09-29T12:05:00.000Z');
  const fixture = mutationDatabase({
    profile_media_imports: {
      intent: {
        _id: 'intent',
        owner_openid: owner,
        cloud_path: cloudPath,
        status: 'deleted',
        delete_attempts: 2,
      },
    },
    profiles: { owner: { _id: owner, photos: [] } },
  });
  const store = createCleanupStore(fixture.db, secret);

  assert.equal(await store.isImportRecoveryLeaseCurrent('intent', { leaseId: 'old', now }), false);
  assert.equal(
    await store.reclaimImportDeleteTarget('intent', {
      leaseId: 'old',
      now,
      fileId,
      ownerOpenid: owner,
      cloudPath,
      leaseExpiresAt,
    }),
    true,
  );
  assert.deepEqual(fixture.state.profile_media_imports.get('intent'), {
    _id: 'intent',
    owner_openid: owner,
    cloud_path: cloudPath,
    status: 'deleting',
    delete_attempts: 2,
    file_id: fileId,
    recovery_delete_pending: true,
    delete_lease_id: 'old',
    delete_claimed_at: now,
    delete_lease_expires_at: leaseExpiresAt,
    cleanup_after: now,
    updated_at: now,
  });

  assert.equal(
    await store.markImportDeleted('intent', {
      leaseId: 'old',
      now,
      deferCompletion: true,
      confirmAfter: new Date('2026-09-29T12:10:00.000Z'),
    }),
    true,
  );
  assert.equal(fixture.state.profile_media_imports.get('intent').status, 'delete_confirming');
  assert.equal(fixture.state.profile_media_imports.get('intent').delete_attempts, 0);

  fixture.state.profiles.set(owner, { _id: owner, avatar_file_id: fileId });
  assert.equal(
    await store.reclaimImportDeleteTarget('intent', {
      leaseId: 'new',
      now,
      fileId,
      ownerOpenid: owner,
      cloudPath,
      leaseExpiresAt,
    }),
    false,
  );
});

test('discovery 使用 status/cleanup_after 索引条件、排序和硬上限', async () => {
  const calls = [];
  let status = '';
  const chain = {
    where(value) {
      status = value.status;
      calls.push(['where', value]);
      return this;
    },
    orderBy(field, direction) {
      calls.push(['orderBy', field, direction]);
      return this;
    },
    limit(value) {
      calls.push(['limit', value]);
      return this;
    },
    async get() {
      return {
        data:
          status === 'unreferenced'
            ? Array.from({ length: 20 }, (_, index) => ({ _id: `media-unreferenced-${index}` }))
            : [{ _id: `media-${status}` }],
      };
    },
  };
  const db = {
    command: { lte: (value) => ({ $lte: value }) },
    collection(name) {
      assert.equal(name, 'profile_media');
      return chain;
    },
  };
  const result = await createCleanupStore(db).listEligible(
    new Date('2026-09-29T12:00:00.000Z'),
    20,
  );
  assert.equal(result.length, 20);
  assert.equal(result.includes('media-deleting'), true);
  assert.equal(result.includes('media-delete_failed'), true);
  assert.equal(result.filter((id) => id.startsWith('media-unreferenced-')).length, 18);
  assert.deepEqual(calls, [
    [
      'where',
      {
        status: 'unreferenced',
        cleanup_after: { $lte: new Date('2026-09-29T12:00:00.000Z') },
      },
    ],
    ['orderBy', 'cleanup_after', 'asc'],
    ['limit', 20],
    [
      'where',
      {
        status: 'deleting',
        delete_lease_expires_at: { $lte: new Date('2026-09-29T12:00:00.000Z') },
      },
    ],
    ['orderBy', 'delete_lease_expires_at', 'asc'],
    ['limit', 20],
    [
      'where',
      {
        status: 'delete_failed',
        retry_at: { $lte: new Date('2026-09-29T12:00:00.000Z') },
      },
    ],
    ['orderBy', 'retry_at', 'asc'],
    ['limit', 20],
  ]);
});

test('cleanup discovery 同时覆盖到期的 avatar import intent 状态', async () => {
  const statuses = [];
  const chain = {
    where(value) {
      statuses.push(value.status);
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      return this;
    },
    async get() {
      return { data: [{ _id: `intent-${statuses.at(-1)}` }] };
    },
  };
  const db = {
    command: { lte: (value) => ({ $lte: value }) },
    collection(name) {
      assert.equal(name, 'profile_media_imports');
      return chain;
    },
  };

  const result = await createCleanupStore(db).listImportIntents(
    new Date('2026-09-29T12:00:00.000Z'),
    20,
  );

  assert.deepEqual(statuses, [
    'leased',
    'prepared',
    'uploaded',
    'orphaned',
    'delete_confirming',
    'recovering',
    'deleting',
    'delete_failed',
  ]);
  assert.equal(result.length, 8);
});

test('avatar import intent discovery 在 prepared 持续满额时仍公平返回失败状态', async () => {
  const db = {
    command: { lte: (value) => ({ $lte: value }) },
    collection(name) {
      assert.equal(name, 'profile_media_imports');
      return {
        where({ status }) {
          return {
            orderBy() {
              return this;
            },
            limit() {
              return this;
            },
            async get() {
              return {
                data:
                  status === 'prepared'
                    ? Array.from({ length: 20 }, (_, index) => ({ _id: `prepared-${index}` }))
                    : [{ _id: `${status}-1` }],
              };
            },
          };
        },
      };
    },
  };

  const result = await createCleanupStore(db).listImportIntents(
    new Date('2026-09-29T12:00:00.000Z'),
    20,
  );

  assert.equal(result.length, 20);
  assert.equal(result.includes('orphaned-1'), true);
  assert.equal(result.includes('delete_failed-1'), true);
});
