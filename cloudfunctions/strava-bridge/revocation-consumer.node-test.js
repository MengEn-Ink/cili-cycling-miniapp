'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('./core');
const { createStravaStore } = require('./store');
const privacy = require('./privacy-contract');
const { database, deferred } = require('../../scripts/strava-state-machine/fixture.cjs');

const OWNER = 'synthetic-owner';
const NOW = new Date('2026-10-27T12:00:00Z');
const ENV = {
  STRAVA_CLIENT_ID: '12345',
  STRAVA_CLIENT_SECRET: 'synthetic-secret',
  STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  STRAVA_CALLBACK_URL: 'https://example.test/strava/callback',
};

function token(refreshToken = 'synthetic-refresh', expiresAt = NOW.getTime() / 1000 + 3600) {
  return {
    access_token: `access-${refreshToken}`,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    athlete: { id: 42, firstname: 'Synthetic' },
  };
}

function fixture() {
  const data = database({
    profiles: [{ _id: OWNER, generation: 1, deletion_status: 'active' }],
  });
  const store = createStravaStore(data.db, {
    env: ENV,
    privacy,
    cloud: { uploadFile: async () => assert.fail('must not upload') },
  });
  return { ...data, store };
}

async function start(store) {
  const state = core.createState(NOW.getTime(), () => Buffer.alloc(32, 3));
  await store.start(OWNER, state, NOW, 1);
  return state;
}

async function connect(store) {
  const state = await start(store);
  await core.callbackFlow({
    query: { state: state.raw, code: 'synthetic-code', scope: 'read' },
    env: ENV,
    store,
    fetchImpl: async () => new Response(JSON.stringify(token())),
    now: NOW,
  });
}

test('真实 callback 消费者受 generation/operation 围栏保护，迟到换 token 不复活凭证', async () => {
  const f = fixture();
  const state = await start(f.store);
  const gate = deferred();
  const callback = core.callbackFlow({
    query: { state: state.raw, code: 'synthetic-code', scope: 'read' },
    env: ENV,
    store: f.store,
    fetchImpl: async () => gate.promise,
    now: NOW,
  });

  while (![...f.state.strava_operations.values()].length) await new Promise(setImmediate);
  await f.store.disconnect(OWNER, new Date(NOW.getTime() + 1));
  gate.resolve(new Response(JSON.stringify(token('late-callback-refresh'))));

  await assert.rejects(callback, { code: 'AUTHORIZATION_REVOKED' });
  assert.equal(f.state.strava_credentials?.has(OWNER) || false, false);
  const auth = f.state.strava_authorizations.get(OWNER);
  assert.equal(auth.mode, 'revoking');
  assert.equal(auth.generation, 3);
  const materials = [...f.state.strava_revocations.values()];
  assert.equal(materials.length, 1);
  assert.equal(
    core.decrypt(materials[0].token_cipher, ENV.STRAVA_TOKEN_ENCRYPTION_KEY),
    'access-late-callback-refresh',
  );
  assert.match(materials[0]._id, /^mint-/);
});

test('真实 refresh 消费者在撤销后只入材料账本，迟到轮换 token 不复活旧代凭证', async () => {
  const f = fixture();
  await connect(f.store);
  const credential = await f.store.getCredential(OWNER);
  credential.token_expires_at = new Date(0);
  const gate = deferred();
  const refresh = core.accessToken({
    credential,
    env: ENV,
    store: f.store,
    fetchImpl: async () => gate.promise,
    now: NOW,
  });

  while ([...f.state.strava_operations.values()].every((row) => row.kind !== 'refresh'))
    await new Promise(setImmediate);
  await f.store.disconnect(OWNER, new Date(NOW.getTime() + 1));
  gate.resolve(new Response(JSON.stringify(token('late-rotated-refresh'))));

  await assert.rejects(refresh, { code: 'AUTHORIZATION_REVOKED' });
  assert.equal(f.state.strava_credentials.has(OWNER), false);
  const materials = [...f.state.strava_revocations.values()];
  assert.equal(materials.length, 2);
  assert.deepEqual(
    materials.map((row) => core.decrypt(row.token_cipher, ENV.STRAVA_TOKEN_ENCRYPTION_KEY)).sort(),
    ['access-late-rotated-refresh', 'access-synthetic-refresh'],
  );
  assert.equal(f.state.strava_authorizations.get(OWNER).mode, 'revoking');
});
