'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCredentialStore } = require('./index');

function memoryDatabase() {
  const state = {
    strava_credentials: new Map([['openid', { athlete_id: 'old-athlete' }]]),
    strava_snapshots: new Map([['openid', { athlete_id: 'old-athlete' }]]),
    profiles: new Map([['openid', { _id: 'openid', nickname: 'Rider' }]]),
  };
  let transactionCount = 0;
  const collectionFor = (target, name) => ({
    doc: (id) => ({
      get: async () => ({ data: target[name].get(id) }),
      set: async ({ data }) => target[name].set(id, { ...data }),
      remove: async () => target[name].delete(id),
      update: async ({ data }) => target[name].set(id, { ...target[name].get(id), ...data }),
    }),
  });
  return {
    state,
    get transactionCount() {
      return transactionCount;
    },
    serverDate: () => new Date('2026-09-29T04:00:00.000Z'),
    collection: (name) => collectionFor(state, name),
    runTransaction: async (work) => {
      transactionCount += 1;
      const draft = {
        strava_credentials: new Map(state.strava_credentials),
        strava_snapshots: new Map(state.strava_snapshots),
        profiles: new Map(state.profiles),
      };
      const tx = { collection: (name) => collectionFor(draft, name) };
      const result = await work(tx);
      state.strava_credentials = draft.strava_credentials;
      state.strava_snapshots = draft.strava_snapshots;
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
});
