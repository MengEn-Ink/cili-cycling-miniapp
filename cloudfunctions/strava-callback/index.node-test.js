'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCredentialStore } = require('./index');

function memoryDatabase({ failProfileSet = false } = {}) {
  const state = {
    strava_credentials: new Map([['openid', { athlete_id: 'old-athlete' }]]),
    strava_snapshots: new Map([['openid', { athlete_id: 'old-athlete' }]]),
    profiles: new Map([['openid', { _id: 'openid', nickname: 'Rider' }]]),
  };
  let transactionCount = 0;
  const calls = [];
  const collectionFor = (target, name, scope) => ({
    doc: (id) => ({
      get: async () => {
        calls.push({ scope, operation: 'get', collection: name, id });
        return { data: target[name].get(id) };
      },
      set: async ({ data }) => {
        calls.push({ scope, operation: 'set', collection: name, id });
        if (failProfileSet && name === 'profiles') throw new Error('profile update failed');
        target[name].set(id, { ...data });
      },
      remove: async () => {
        calls.push({ scope, operation: 'remove', collection: name, id });
        target[name].delete(id);
      },
      update: async ({ data }) => {
        calls.push({ scope, operation: 'update', collection: name, id });
        target[name].set(id, { ...target[name].get(id), ...data });
      },
    }),
  });
  return {
    state,
    get transactionCount() {
      return transactionCount;
    },
    calls,
    serverDate: () => new Date('2026-09-29T04:00:00.000Z'),
    collection: (name) => collectionFor(state, name, 'db'),
    runTransaction: async (work) => {
      transactionCount += 1;
      calls.push({ scope: 'db', operation: 'transaction' });
      const draft = {
        strava_credentials: new Map(state.strava_credentials),
        strava_snapshots: new Map(state.strava_snapshots),
        profiles: new Map(state.profiles),
      };
      const tx = { collection: (name) => collectionFor(draft, name, 'tx') };
      const result = await work(tx);
      state.strava_credentials = draft.strava_credentials;
      state.strava_snapshots = draft.strava_snapshots;
      state.profiles = draft.profiles;
      return result;
    },
  };
}

test('保存新 OAuth credential 在同一事务删除旧账号 snapshot', async () => {
  const database = memoryDatabase();
  const store = createCredentialStore(database);

  await store.saveCredential({
    _id: 'openid',
    openid: 'openid',
    athlete_id: 'new-athlete',
  });

  assert.equal(database.transactionCount, 1);
  assert.equal(database.state.strava_credentials.get('openid').athlete_id, 'new-athlete');
  assert.equal(database.state.strava_snapshots.has('openid'), false);
  assert.deepEqual(database.state.profiles.get('openid'), {
    nickname: 'Rider',
    strava: { status: 'connected' },
    updated_at: new Date('2026-09-29T04:00:00.000Z'),
  });
  assert.deepEqual(database.calls, [
    { scope: 'db', operation: 'transaction' },
    { scope: 'tx', operation: 'get', collection: 'profiles', id: 'openid' },
    { scope: 'tx', operation: 'set', collection: 'strava_credentials', id: 'openid' },
    { scope: 'tx', operation: 'remove', collection: 'strava_snapshots', id: 'openid' },
    { scope: 'tx', operation: 'set', collection: 'profiles', id: 'openid' },
  ]);
});

test('profile compatibility cache 写失败会回滚 credential 和 snapshot', async () => {
  const database = memoryDatabase({ failProfileSet: true });
  const store = createCredentialStore(database);

  await assert.rejects(
    store.saveCredential({
      _id: 'openid',
      openid: 'openid',
      athlete_id: 'new-athlete',
    }),
    /profile update failed/,
  );

  assert.deepEqual(database.state.strava_credentials.get('openid'), {
    athlete_id: 'old-athlete',
  });
  assert.deepEqual(database.state.strava_snapshots.get('openid'), {
    athlete_id: 'old-athlete',
  });
  assert.deepEqual(database.state.profiles.get('openid'), {
    _id: 'openid',
    nickname: 'Rider',
  });
});
