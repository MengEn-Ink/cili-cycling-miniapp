'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./core.cjs');
const { createStravaStore, MINT_LEASE_MS, REVOKE_LEASE_MS, MAX_ATTEMPTS } = require('./store.cjs');
const {
  ENV,
  NOW,
  OWNER,
  privacy,
  database,
  fixture,
  connected,
  token,
  deferred,
} = require('./fixture.cjs');
const later = (ms) => new Date(NOW.getTime() + ms);
const auth = (f) => f.state.strava_authorizations.get(OWNER);
const rows = (f) => [...(f.state.strava_revocations?.values() || [])];
const refresh = async (f) => f.store.beginRefresh(await f.store.getCredential(OWNER), NOW);
const drain = (f, status = 200, now = NOW) =>
  f.store.drainRevocations({
    now,
    owner: OWNER,
    fetchImpl: async () => new Response('', { status }),
  });
const snapshot = (f) => structuredClone(f.state);

test('store requires all three privacy exports with no permissive fallback', () => {
  for (const value of [
    undefined,
    {},
    { ...privacy, profileGeneration: undefined },
    { ...privacy, isProfileDeleted: undefined },
    { ...privacy, assertProfileWritable: undefined },
  ])
    assert.throws(() => createStravaStore(database().db, { env: ENV, privacy: value }), {
      code: 'STRAVA_PRIVACY_CONTRACT_REQUIRED',
    });
});

test('disconnect retains encrypted material and duplicate calls preserve generation', async () => {
  const f = await connected();
  const first = await f.store.disconnect(OWNER, NOW);
  assert.deepEqual(await f.store.disconnect(OWNER, NOW), first);
  assert.equal(first.state, 'revocation_pending');
  assert.equal(first.revocation_complete, false);
  assert.equal(f.state.strava_credentials.size, 0);
  assert.equal(
    core.decrypt(rows(f)[0].token_cipher, ENV.STRAVA_TOKEN_ENCRYPTION_KEY),
    'synthetic-refresh',
  );
  assert.doesNotMatch(JSON.stringify(rows(f)), /synthetic-refresh|synthetic-access|Synthetic/);
  await assert.rejects(f.start(), { code: 'STRAVA_REVOCATION_PENDING' });
});

for (const status of [400, 401]) {
  test(`late definitive refresh HTTP ${status} preserves the pending revocation barrier`, async () => {
    const f = await connected({ expires_at: 1 });
    const entered = deferred();
    const release = deferred();
    const pending = core.accessToken({
      credential: await f.store.getCredential(OWNER),
      env: ENV,
      store: f.store,
      now: NOW,
      fetchImpl: async () => {
        entered.resolve();
        return release.promise;
      },
    });
    const rejected = assert.rejects(pending, { code: 'STRAVA_TOKEN_INVALID' });
    await entered.promise;
    const before = await f.store.disconnect(OWNER, NOW);
    release.resolve(new Response('', { status }));
    await rejected;
    const after = await f.store.status(OWNER, NOW);
    assert.equal(after.generation, before.generation);
    assert.equal(after.state, 'revocation_pending');
    assert.equal(after.revocation_complete, false);
    assert.equal(auth(f).pending_count, 1);
    assert.equal(rows(f).length, 1);
    assert.equal(rows(f)[0].status, 'pending');
  });
}

test('late rejection preserves manual material and does not remove unrelated credentials', async () => {
  const f = await connected();
  const fence = await refresh(f);
  await f.store.disconnect(OWNER, NOW);
  await drain(f, 401);
  await f.store.failMint(OWNER, fence, false, NOW);
  assert.equal((await f.store.status(OWNER, NOW)).state, 'manual_review');
  assert.equal(auth(f).manual_count, 1);
  assert.equal(auth(f).pending_count, 1);
});

test('current definitive rejection removes only stale credential and permits reconnect', async () => {
  const f = await connected();
  const fence = await refresh(f);
  await f.store.failMint(OWNER, fence, false, NOW);
  assert.equal((await f.store.status(OWNER, NOW)).state, 'disconnected');
  assert.equal(f.state.strava_credentials.size, 0);
  await f.start();
});

for (const [query, code] of [
  [{ error: 'access_denied' }, 'OAUTH_ACCESS_DENIED'],
  [{}, 'OAUTH_CALLBACK_INVALID'],
]) {
  test(`matching ${code} ends only the unminted attempt and permits explicit start`, async () => {
    const f = fixture();
    const state = await f.start();
    await assert.rejects(
      f.callback({ state, ...query }, async () => assert.fail('must not exchange')),
      { code },
    );
    assert.equal((await f.store.status(OWNER, NOW)).state, 'disconnected');
    assert.equal(auth(f).mode, 'disconnected');
    assert.equal(auth(f).authorization_state_hash, '');
    assert.ok(f.state.oauth_states.get(core.hashState(state)).consumed_at);
    await f.start();
  });
}

test('only one live unminted attempt is allowed', async () => {
  const f = fixture();
  await f.start();
  const before = snapshot(f);
  await assert.rejects(f.start(), { code: 'STRAVA_AUTHORIZATION_PENDING' });
  assert.deepEqual(f.state, before);
});

test('expired callback is consumed and does not mint or keep authorizing', async () => {
  const f = fixture();
  const state = await f.start();
  await assert.rejects(
    f.finish(state, async () => assert.fail('must not mint'), later(core.OAUTH_STATE_TTL_MS)),
    { code: 'OAUTH_STATE_EXPIRED' },
  );
  assert.equal(auth(f).mode, 'disconnected');
  await f.start(later(core.OAUTH_STATE_TTL_MS));
});

for (const method of ['status', 'start']) {
  test(`expiry on ${method} lazily invalidates the old unminted state`, async () => {
    const f = fixture();
    const state = await f.start();
    const nextNow = later(core.OAUTH_STATE_TTL_MS);
    if (method === 'status')
      assert.equal((await f.store.status(OWNER, nextNow)).state, 'disconnected');
    else await f.start(nextNow);
    assert.ok(f.state.oauth_states.get(core.hashState(state)).consumed_at);
    await assert.rejects(f.finish(state), { code: 'OAUTH_STATE_INVALID' });
  });
}

test('invalid expiry recovers without minting', async () => {
  const f = fixture();
  const state = await f.start();
  f.state.oauth_states.get(core.hashState(state)).expires_at = 'invalid-date';
  auth(f).authorization_expires_at = 'invalid-date';
  await assert.rejects(
    f.finish(state, async () => assert.fail('must not mint')),
    { code: 'OAUTH_STATE_EXPIRED' },
  );
  assert.equal(auth(f).mode, 'disconnected');
});

test('stale denial after disconnect or a newer attempt cannot clear current state', async () => {
  const f = fixture();
  const state = await f.start();
  await f.store.disconnect(OWNER, NOW);
  const before = snapshot(f);
  await assert.rejects(f.callback({ state, error: 'access_denied' }), {
    code: 'AUTHORIZATION_REVOKED',
  });
  assert.deepEqual(f.state, before);
  const fresh = await f.start();
  const current = snapshot(f);
  await assert.rejects(f.callback({ state, error: 'access_denied' }), {
    code: 'AUTHORIZATION_REVOKED',
  });
  assert.deepEqual(f.state, current);
  await f.finish(fresh);
});

test('reserved callback remains a barrier beyond state expiry and cannot be denied twice', async () => {
  const f = fixture();
  const state = await f.start();
  const operation = await f.store.consumeState(core.hashState(state), NOW);
  assert.equal(
    (await f.store.status(OWNER, later(core.OAUTH_STATE_TTL_MS))).revocation_complete,
    false,
  );
  assert.equal(auth(f).operation_id, operation.operation_id);
  await assert.rejects(f.callback({ state, error: 'access_denied' }), {
    code: 'OAUTH_STATE_INVALID',
  });
});

test('late success rotation is separately queued after the old material was revoked', async () => {
  const f = await connected();
  const fence = await refresh(f);
  await f.store.disconnect(OWNER, NOW);
  await drain(f);
  assert.equal((await f.store.status(OWNER, NOW)).revocation_complete, false);
  const material = core.encrypt('rotated-refresh', ENV.STRAVA_TOKEN_ENCRYPTION_KEY);
  const value = core.tokenDocument(
    OWNER,
    token({ refresh_token: 'rotated-refresh' }),
    ENV.STRAVA_TOKEN_ENCRYPTION_KEY,
    NOW,
  );
  assert.equal(await f.store.finishMint(OWNER, fence, value, material, NOW), false);
  assert.equal(f.state.strava_credentials.size, 0);
  assert.equal(rows(f).length, 2);
  assert.equal(rows(f).filter((row) => row.status === 'pending').length, 1);
  assert.equal(await f.store.finishMint(OWNER, fence, value, material, NOW), false);
  assert.equal(rows(f).length, 2);
  await drain(f);
  assert.equal((await f.store.status(OWNER, NOW)).revocation_complete, true);
});

test('repeated resolved success and failure cannot replace credential or enqueue material', async () => {
  const f = await connected();
  const fence = await refresh(f);
  const value = core.tokenDocument(OWNER, token(), ENV.STRAVA_TOKEN_ENCRYPTION_KEY, NOW);
  const material = value.refresh_token_cipher;
  assert.equal(await f.store.finishMint(OWNER, fence, value, material, NOW), true);
  const before = snapshot(f);
  assert.equal(
    await f.store.finishMint(
      OWNER,
      fence,
      { ...value, athlete_name: 'replacement' },
      material,
      NOW,
    ),
    true,
  );
  await f.store.failMint(OWNER, fence, true, NOW);
  await f.store.failMint(OWNER, fence, false, NOW);
  assert.deepEqual(f.state, before);
});

for (const action of ['finishMint', 'failMint']) {
  test(`${action} rejects forged stored operation fences without mutation`, async () => {
    const f = await connected();
    const fence = await refresh(f);
    for (const change of [
      { oauth_generation: fence.oauth_generation + 1 },
      { profile_generation: 9 },
      { kind: 'callback' },
    ]) {
      const before = snapshot(f);
      const forged = { ...fence, ...change };
      await assert.rejects(
        action === 'finishMint'
          ? f.store.finishMint(
              OWNER,
              forged,
              core.tokenDocument(OWNER, token(), ENV.STRAVA_TOKEN_ENCRYPTION_KEY, NOW),
              core.encrypt('synthetic-refresh', ENV.STRAVA_TOKEN_ENCRYPTION_KEY),
              NOW,
            )
          : f.store.failMint(OWNER, forged, false, NOW),
        { code: 'STRAVA_OPERATION_INVALID' },
      );
      assert.deepEqual(f.state, before);
    }
    const before = snapshot(f);
    await assert.rejects(f.store.failMint('another-owner', fence, true, NOW), {
      code: 'STRAVA_OPERATION_INVALID',
    });
    assert.deepEqual(f.state, before);
  });
}

for (const mutate of [
  (f) => {
    auth(f).pending_count = 0;
  },
  (f) => {
    f.state.strava_operations.delete(auth(f).operation_id);
  },
  (f) => {
    auth(f).operation_id = '';
  },
]) {
  test('inconsistent ledger or missing operation cannot claim completed revocation', async () => {
    const f = await connected();
    await refresh(f);
    await f.store.disconnect(OWNER, NOW);
    mutate(f);
    const status = await f.store.status(OWNER, NOW);
    assert.equal(status.state, 'manual_review');
    assert.equal(status.revocation_complete, false);
    await assert.rejects(f.start(), { code: 'STRAVA_REVOCATION_PENDING' });
  });
}

for (const fetchImpl of [
  async () => {
    throw new Error('synthetic-network');
  },
  async () => new Response('not-json'),
  async () => new Response('{}'),
]) {
  test('unknown token result remains unresolved after known old token revocation', async () => {
    const f = await connected({ expires_at: 1 });
    await assert.rejects(
      core.accessToken({
        credential: await f.store.getCredential(OWNER),
        env: ENV,
        store: f.store,
        now: NOW,
        fetchImpl,
      }),
    );
    await drain(f);
    const status = await f.store.status(OWNER, NOW);
    assert.equal(status.state, 'manual_review');
    assert.equal(status.revocation_complete, false);
    assert.equal(f.state.strava_operations.get(auth(f).operation_id).status, 'uncertain');
  });
}

test('expired mint lease is uncertain, never completed by unrelated revoke success', async () => {
  const f = await connected();
  const fence = await refresh(f);
  await f.store.disconnect(OWNER, NOW);
  const result = await drain(f, 200, later(MINT_LEASE_MS));
  assert.equal(result.uncertain, 1);
  assert.equal(f.state.strava_operations.get(fence.operation_id).status, 'uncertain');
  assert.equal((await f.store.status(OWNER, later(MINT_LEASE_MS))).state, 'manual_review');
});

test('malformed token with usable material queues encrypted revoke and closes known operation', async () => {
  const f = fixture();
  await assert.rejects(
    f.finish(await f.start(), async () => new Response(JSON.stringify(token({ athlete: null })))),
    { code: 'OAUTH_TOKEN_INVALID' },
  );
  assert.equal(rows(f).length, 1);
  assert.equal(auth(f).operation_id, '');
  assert.equal((await f.store.status(OWNER, NOW)).state, 'revocation_pending');
});

for (const [name, action] of [
  ['strava_revocations', 'set'],
  ['strava_operations', 'set'],
  ['strava_authorizations', 'set'],
]) {
  test(`failed ${name} settlement rolls back and preserves the original operation`, async () => {
    const f = await connected();
    const fence = await refresh(f);
    await f.store.disconnect(OWNER, NOW);
    const before = snapshot(f);
    f.failNext(name, action);
    const material = core.encrypt('late-refresh', ENV.STRAVA_TOKEN_ENCRYPTION_KEY);
    await assert.rejects(
      f.store.finishMint(OWNER, fence, undefined, material, NOW),
      /synthetic-db-failure/,
    );
    assert.deepEqual(f.state, before);
    assert.equal((await f.store.status(OWNER, NOW)).revocation_complete, false);
    assert.equal(await f.store.finishMint(OWNER, fence, undefined, material, NOW), false);
    assert.equal(rows(f).length, 2);
  });
}

test('generic DB read and ledger query failures are not treated as absent rows', async () => {
  const f = await connected();
  await f.store.disconnect(OWNER, NOW);
  const error = Object.assign(new Error('synthetic-database-error'), {
    errCode: -1,
    errMsg: 'index not found',
  });
  f.failNext('strava_authorizations', 'get', error);
  await assert.rejects(f.store.status(OWNER, NOW), (value) => value === error);
  f.failNext('strava_revocations', 'query');
  await assert.rejects(f.store.status(OWNER, NOW), /synthetic-db-failure/);
});

test('document reads require explicit missing evidence before swallowing -502001', async () => {
  const f = await connected();
  const databaseError = Object.assign(new Error('synthetic-database-error'), {
    errCode: -502001,
    errMsg: 'database request fail',
  });
  f.failNext('strava_authorizations', 'get', databaseError);
  await assert.rejects(f.store.status(OWNER, NOW), (value) => value === databaseError);

  const missing = fixture();
  missing.failNext(
    'strava_authorizations',
    'get',
    Object.assign(new Error('synthetic-document-missing'), {
      errCode: -502001,
      errMsg: `document with _id ${OWNER} does not exist`,
    }),
  );
  assert.equal((await missing.store.status(OWNER, NOW)).state, 'disconnected');
});

test('revoke ACK failure never counts success and can retry the same encrypted material', async () => {
  const f = await connected();
  await f.store.disconnect(OWNER, NOW);
  f.failNext('strava_revocations', 'set');
  await assert.rejects(drain(f), /synthetic-db-failure/);
  assert.equal(rows(f)[0].status, 'pending');
  assert.ok(rows(f)[0].token_cipher);
  assert.equal((await f.store.status(OWNER, NOW)).revocation_complete, false);
  await drain(f, 200, later(REVOKE_LEASE_MS));
  assert.equal((await f.store.status(OWNER, later(REVOKE_LEASE_MS))).revocation_complete, true);
});

test('revoke ACK failures consume the bounded budget before another external call', async () => {
  const f = await connected();
  await f.store.disconnect(OWNER, NOW);
  let calls = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    f.failNext('strava_revocations', 'set');
    await assert.rejects(
      f.store.drainRevocations({
        now: later(attempt * (REVOKE_LEASE_MS + 1)),
        owner: OWNER,
        fetchImpl: async () => {
          calls += 1;
          return new Response('');
        },
      }),
      /synthetic-db-failure/,
    );
  }
  assert.equal(calls, MAX_ATTEMPTS);
  assert.equal(rows(f)[0].attempts, MAX_ATTEMPTS);

  const exhausted = await f.store.drainRevocations({
    now: later(MAX_ATTEMPTS * (REVOKE_LEASE_MS + 1)),
    owner: OWNER,
    fetchImpl: async () => {
      calls += 1;
      return new Response('');
    },
  });
  assert.equal(exhausted.completed, 0);
  assert.equal(calls, MAX_ATTEMPTS);
  assert.equal(rows(f)[0].status, 'manual');
  assert.equal((await f.store.status(OWNER, NOW)).state, 'manual_review');
});

test('only the matching revoke lease commits, and work is capped at two calls', async () => {
  const f = await connected();
  await f.store.disconnect(OWNER, NOW);
  const entered = deferred();
  const release = deferred();
  const first = f.store.drainRevocations({
    owner: OWNER,
    now: NOW,
    fetchImpl: async () => {
      entered.resolve();
      return release.promise;
    },
  });
  await entered.promise;
  assert.equal((await drain(f, 503, NOW)).completed, 0);
  assert.equal((await drain(f, 401, later(REVOKE_LEASE_MS))).completed, 0);
  release.resolve(new Response(''));
  assert.equal((await first).completed, 0);
  assert.equal(rows(f)[0].status, 'manual');
  const another = await connected();
  await another.store.disconnect(OWNER, NOW);
  const row = rows(another)[0];
  for (const id of ['second', 'third'])
    another.state.strava_revocations.set(id, { ...row, _id: id });
  auth(another).pending_count = 3;
  let calls = 0;
  const result = await another.store.drainRevocations({
    owner: OWNER,
    now: NOW,
    limit: 99,
    fetchImpl: async () => {
      calls += 1;
      return new Response('', { status: 503 });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.attempted, 2);
});

test('retryable revocation reaches manual review after bounded attempts', async () => {
  const f = await connected();
  await f.store.disconnect(OWNER, NOW);
  for (let n = 0; n < MAX_ATTEMPTS; n += 1) await drain(f, 503, later(n * 3600000));
  assert.equal(rows(f)[0].attempts, MAX_ATTEMPTS);
  assert.equal(rows(f)[0].status, 'manual');
  assert.equal((await f.store.status(OWNER, NOW)).state, 'manual_review');
});

test('revocation drain refuses a mismatched material ledger before any external call', async () => {
  const f = await connected();
  await f.store.disconnect(OWNER, NOW);
  auth(f).pending_count = 0;
  let calls = 0;
  const result = await f.store.drainRevocations({
    now: NOW,
    owner: OWNER,
    fetchImpl: async () => {
      calls += 1;
      return new Response('');
    },
  });
  assert.equal(result.completed, 0);
  assert.equal(calls, 0);
  assert.equal(rows(f)[0].status, 'pending');
  assert.equal(auth(f).pending_count, 0);
  assert.equal((await f.store.status(OWNER, NOW)).state, 'manual_review');
});

for (const [label, attempts] of [
  ['negative', -1],
  ['missing', undefined],
  ['non-finite', Number.NaN],
]) {
  test(`${label} revoke attempts fail closed before any external call`, async () => {
    const f = await connected();
    await f.store.disconnect(OWNER, NOW);
    rows(f)[0].attempts = attempts;
    let calls = 0;
    const result = await f.store.drainRevocations({
      now: NOW,
      owner: OWNER,
      fetchImpl: async () => {
        calls += 1;
        return new Response('');
      },
    });
    assert.equal(result.completed, 0);
    assert.equal(calls, 0);
    assert.equal(rows(f)[0].status, 'pending');
    assert.equal((await f.store.status(OWNER, NOW)).state, 'manual_review');
  });
}

for (const [label, mutate] of [
  ['missing retry time', (row) => delete row.retry_at],
  ['invalid retry time', (row) => (row.retry_at = 'invalid-date')],
  ['boolean retry time', (row) => (row.retry_at = false)],
  ['missing lease expiry', (row) => (row.lease_id = 'synthetic-lease')],
  [
    'invalid lease expiry',
    (row) => {
      row.lease_id = 'synthetic-lease';
      row.lease_expires_at = 'invalid-date';
    },
  ],
  [
    'boolean lease expiry',
    (row) => {
      row.lease_id = 'synthetic-lease';
      row.lease_expires_at = false;
    },
  ],
]) {
  test(`${label} fails closed before revocation`, async () => {
    const f = await connected();
    await f.store.disconnect(OWNER, NOW);
    mutate(rows(f)[0]);
    let calls = 0;
    const result = await f.store.drainRevocations({
      now: NOW,
      owner: OWNER,
      fetchImpl: async () => {
        calls += 1;
        return new Response('');
      },
    });
    assert.equal(result.completed, 0);
    assert.equal(calls, 0);
    assert.equal(rows(f)[0].status, 'pending');
    assert.equal((await f.store.status(OWNER, NOW)).state, 'manual_review');
  });
}

for (const [label, expiresAt] of [
  ['missing', undefined],
  ['invalid', 'invalid-date'],
  ['boolean', false],
]) {
  test(`${label} operation expiry remains a diagnostic barrier`, async () => {
    const f = await connected();
    const fence = await refresh(f);
    f.state.strava_operations.get(fence.operation_id).expires_at = expiresAt;
    assert.equal((await f.store.status(OWNER, NOW)).state, 'manual_review');
    const result = await drain(f, 200, later(MINT_LEASE_MS));
    assert.equal(result.uncertain, 0);
    assert.equal(f.state.strava_operations.get(fence.operation_id).status, 'in_flight');
    assert.equal((await f.store.status(OWNER, later(MINT_LEASE_MS))).state, 'manual_review');
  });
}

test('legacy credential adopts once and an orphan cannot revive a sentinel', async () => {
  const credential = core.tokenDocument(OWNER, token(), ENV.STRAVA_TOKEN_ENCRYPTION_KEY, NOW);
  const f = fixture({ strava_credentials: [credential] });
  assert.equal((await f.store.status(OWNER, NOW)).state, 'connected');
  assert.equal((await f.store.getCredential(OWNER)).oauth_generation, 1);
  await f.store.disconnect(OWNER, NOW);
  await drain(f);
  await f.db.collection('strava_credentials').doc(OWNER).set({ data: credential });
  assert.equal((await f.store.status(OWNER, NOW)).state, 'disconnected');
  await assert.rejects(f.store.getCredential(OWNER), { code: 'AUTHORIZATION_REVOKED' });
});

test('strict privacy generation and deletion are consumed by start and fences', async () => {
  const f = fixture();
  f.state.profiles.get(OWNER).generation = 2;
  await assert.rejects(f.store.start(OWNER, core.createState(NOW.getTime()), NOW), {
    code: 'PROFILE_GENERATION_MISMATCH',
  });
  await assert.rejects(f.start(NOW, 1), { code: 'PROFILE_GENERATION_MISMATCH' });
  await f.finish(await f.start(NOW, 2));
  const next = await connected();
  const credential = await next.store.getCredential(OWNER);
  next.state.profiles.get(OWNER).deletion_status = 'pending';
  await assert.rejects(next.store.checkFence(OWNER, credential), { code: 'AUTHORIZATION_REVOKED' });
  await assert.rejects(next.start(), { code: 'PROFILE_DELETION_IN_PROGRESS' });
});

test('deletion transaction returns the barrier and cannot finish pending or unknown operations', async () => {
  const f = await connected();
  const status = await f.db.runTransaction((tx) => f.store.disconnectTx(tx, OWNER, NOW, 1));
  const result = await f.db.runTransaction((tx) =>
    f.store.deletionStatusTx(tx, OWNER, status.generation, 1),
  );
  assert.equal(result.revocation_complete, false);
  await drain(f);
  assert.equal(
    (await f.db.runTransaction((tx) => f.store.deletionStatusTx(tx, OWNER, status.generation, 1)))
      .revocation_complete,
    true,
  );
  await f.finish(await f.start());
  assert.equal(
    (await f.db.runTransaction((tx) => f.store.deletionStatusTx(tx, OWNER, status.generation, 1)))
      .revocation_complete,
    true,
  );
});

for (const table of ['strava_revocations', 'strava_operations']) {
  test(`unknown ${table} status cannot disappear into a completed barrier`, async () => {
    const f = await connected();
    await f.store.disconnect(OWNER, NOW);
    await drain(f);
    f.state[table].set('unknown-row', {
      _id: 'unknown-row',
      owner_openid: OWNER,
      generation: auth(f).generation,
      status: 'unknown',
    });
    const status = await f.store.status(OWNER, NOW);
    assert.equal(status.state, 'manual_review');
    assert.equal(status.revocation_complete, false);
    await assert.rejects(f.start(), { code: 'STRAVA_REVOCATION_PENDING' });
  });
}

test('revoke transaction retry counts a committed material only once', async () => {
  const f = await connected();
  await f.store.disconnect(OWNER, NOW);
  const result = await f.store.drainRevocations({
    now: NOW,
    owner: OWNER,
    fetchImpl: async () => {
      f.retryNext();
      return new Response('');
    },
  });
  assert.equal(result.completed, 1);
  assert.equal(rows(f)[0].attempts, 1);
  assert.equal(auth(f).pending_count, 0);
});

test('mint transaction retry deduplicates material and settlement revision', async () => {
  const f = await connected();
  const fence = await refresh(f);
  const value = core.tokenDocument(OWNER, token(), ENV.STRAVA_TOKEN_ENCRYPTION_KEY, NOW);
  const revision = (await f.store.getCredential(OWNER)).revision;
  f.retryNext();
  assert.equal(
    await f.store.finishMint(OWNER, fence, value, value.refresh_token_cipher, NOW),
    true,
  );
  assert.equal((await f.store.getCredential(OWNER)).revision, revision + 1);
  const nextFence = await refresh(f);
  await f.store.disconnect(OWNER, NOW);
  f.retryNext();
  assert.equal(
    await f.store.finishMint(OWNER, nextFence, value, value.refresh_token_cipher, NOW),
    false,
  );
  assert.equal(rows(f).length, 2);
});

test('missing response material leaves the reserved operation uncertain', async () => {
  const f = await connected();
  const fence = await refresh(f);
  assert.equal(await f.store.finishMint(OWNER, fence, undefined, undefined, NOW), false);
  assert.equal(f.state.strava_operations.get(fence.operation_id).status, 'uncertain');
  await drain(f);
  assert.equal((await f.store.status(OWNER, NOW)).revocation_complete, false);
});

test('profile generation changes during mint never resurrect old credentials', async () => {
  const f = await connected();
  const fence = await refresh(f);
  f.state.profiles.get(OWNER).generation = 2;
  const value = core.tokenDocument(OWNER, token(), ENV.STRAVA_TOKEN_ENCRYPTION_KEY, NOW);
  assert.equal(
    await f.store.finishMint(OWNER, fence, value, value.refresh_token_cipher, NOW),
    false,
  );
  assert.equal(f.state.strava_credentials.size, 0);
  assert.equal((await f.store.status(OWNER, NOW)).revocation_complete, false);
});

test('source and preview transactions preserve OAuth fences without modifying published GPX', async () => {
  const f = await connected();
  const credential = await f.store.getCredential(OWNER);
  const cloudPath = `activity-routes/${OWNER}/${'a'.repeat(64)}.gpx`;
  await f.store.reserveRouteSource(OWNER, cloudPath, credential, NOW);
  const file = await f.store.uploadFile({ cloudPath, fileContent: Buffer.from('synthetic') });
  const source = await f.store.getRouteSource(file.fileID);
  assert.equal(source.oauth_generation, credential.oauth_generation);
  const preview = { _id: 'synthetic-preview', owner_openid: OWNER, source_file_id: file.fileID };
  const stored = await f.store.putPreview(preview._id, preview);
  assert.equal(stored.profile_generation, 1);
  assert.deepEqual(await f.store.putPreview(preview._id, preview), stored);
  await f.store.updatePreview(preview._id, { generated_file_id: 'synthetic-image' });
  assert.equal((await f.store.getPreview(preview._id)).generated_file_id, 'synthetic-image');
  await f.store.disconnect(OWNER, NOW);
  await assert.rejects(f.store.getRouteSource(file.fileID), { code: 'AUTHORIZATION_REVOKED' });
  await assert.rejects(f.store.updatePreview(preview._id, { generated_file_id: 'replacement' }), {
    code: 'AUTHORIZATION_REVOKED',
  });
  assert.equal((await f.store.getPreview(preview._id)).source_file_id, file.fileID);
});
