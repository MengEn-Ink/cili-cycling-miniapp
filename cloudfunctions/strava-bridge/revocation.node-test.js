'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decrypt, importRoute } = require('./core');
const { parseGpx } = require('./gpx');
const { ENV, NOW, OWNER, fixture, token, deferred } = require('./runtime-fixture');
const { loadRuntime } = require('./runtime-fixture');
const { createPrivacyService } = require('../profile/privacy');
const { createPrivacyStore } = require('../privacy-maintenance/store');
Object.assign(process.env, ENV);
const GPX = Buffer.from(
  '<gpx><trk><trkseg><trkpt lat="30" lon="120"><ele>10</ele></trkpt>' +
    '<trkpt lat="30.01" lon="120.01"><ele>20</ele></trkpt></trkseg></trk></gpx>',
);
const request = {
  openid: OWNER,
  routeUrl: 'https://www.strava.com/routes/42',
  requestId: 'synthetic-import',
};
async function connected(extra = {}) {
  const f = fixture();
  await f.finish(await f.start(), async () => new Response(JSON.stringify(token(extra))));
  return f;
}
async function withFetch(work, fetchImpl = async () => new Response('', { status: 503 })) {
  const original = global.fetch;
  global.fetch = fetchImpl;
  try {
    return await work();
  } finally {
    global.fetch = original;
  }
}
test('trusted owner status and disconnect remain available after admin eligibility is lost', async () => {
  const f = await connected();
  await f.db.collection('admins').doc(OWNER).remove();
  assert.equal((await f.call('status')).state, 'connected');
  await withFetch(async () => {
    const result = await f.call('disconnect', { owner_openid: 'attacker' });
    assert.equal(result.state, 'revocation_pending');
    assert.equal(result.import_ready, false);
    assert.equal(result.revocation_complete, false);
  });
  assert.equal(f.state.strava_credentials.size, 0);
  await assert.rejects(f.call('importRoute', request), { code: 'ADMIN_REQUIRED' });
});
test('disconnect durably retains only encrypted revoke material and duplicate calls are idempotent', async () => {
  const f = await connected();
  await withFetch(async () => {
    const first = await f.call('disconnect');
    const second = await f.call('disconnect');
    assert.equal(second.generation, first.generation);
    assert.equal(first.state, 'revocation_pending');
    assert.equal((await f.call('status')).state, 'revocation_pending');
    await assert.rejects(f.call('start'), { code: 'STRAVA_REVOCATION_PENDING' });
  });
  const rows = [...f.state.strava_revocations.values()];
  assert.equal(rows.length, 1);
  assert.equal(decrypt(rows[0].token_cipher, ENV.STRAVA_TOKEN_ENCRYPTION_KEY), 'synthetic-refresh');
  assert.doesNotMatch(JSON.stringify(rows), /synthetic-refresh|synthetic-access|Synthetic/);
  assert.equal(f.state.strava_credentials.size, 0);
  await assert.rejects(
    importRoute({ request, env: ENV, store: f.bridge.store, parseGpx, now: NOW }),
    { code: 'AUTHORIZATION_REVOKED' },
  );
});
test('official revoke uses Basic app auth and refresh token; empty/absent HTTP 200 is success', async () => {
  const f = await connected();
  let calls = 0;
  await withFetch(
    async () => {
      const result = await f.call('disconnect');
      assert.equal(result.state, 'disconnected');
      assert.equal(result.revocation_complete, true);
      assert.equal((await f.call('status')).import_ready, false);
      await f.call('disconnect');
    },
    async (url, options) => {
      calls += 1;
      assert.equal(url, 'https://www.strava.com/oauth/revoke');
      assert.equal(options.method, 'POST');
      assert.equal(
        options.headers.authorization,
        `Basic ${Buffer.from(`${ENV.STRAVA_CLIENT_ID}:${ENV.STRAVA_CLIENT_SECRET}`).toString('base64')}`,
      );
      assert.equal(new URLSearchParams(options.body).get('token'), 'synthetic-refresh');
      assert.ok(options.signal);
      return new Response('');
    },
  );
  assert.equal(calls, 1);
  assert.ok([...f.state.strava_revocations.values()].every((row) => !row.token_cipher));
});
for (const [status, expected] of [
  [401, 'manual_review'],
  [400, 'manual_review'],
  [503, 'revocation_pending'],
]) {
  test(`official HTTP ${status} must not claim completed revocation`, async () => {
    const f = await connected();
    await withFetch(
      async () => {
        const result = await f.call('disconnect');
        assert.equal(result.state, expected);
        assert.equal(result.revocation_complete, false);
        assert.equal(result.import_ready, false);
      },
      async () => new Response('sensitive upstream body', { status }),
    );
    assert.equal(f.state.strava_credentials.size, 0);
    assert.ok([...f.state.strava_revocations.values()].some((row) => row.token_cipher));
  });
}
test('disconnect invalidates unused OAuth state before token exchange', async () => {
  const f = fixture();
  const state = await f.start();
  await withFetch(() => f.call('disconnect'));
  await assert.rejects(
    f.finish(state, async () => assert.fail('must not mint')),
    {
      code: 'AUTHORIZATION_REVOKED',
    },
  );
  assert.equal(f.state.strava_credentials?.size || 0, 0);
});
test('late callback mint is retained for revocation and cannot resurrect normal credentials', async () => {
  const f = fixture();
  const state = await f.start();
  const entered = deferred();
  const release = deferred();
  const callback = f.finish(state, async () => {
    entered.resolve();
    return release.promise;
  });
  const rejected = assert.rejects(callback, { code: 'AUTHORIZATION_REVOKED' });
  await entered.promise;
  await withFetch(
    async () => {
      const result = await f.call('disconnect');
      assert.equal(result.state, 'revocation_pending');
      assert.equal(result.revocation_complete, false);
    },
    async () => new Response(''),
  );
  release.resolve(new Response(JSON.stringify(token({ refresh_token: 'late-refresh' }))));
  await rejected;
  assert.equal(f.state.strava_credentials?.size || 0, 0);
  assert.ok(
    [...f.state.strava_revocations.values()].some(
      (row) =>
        row.token_cipher &&
        decrypt(row.token_cipher, ENV.STRAVA_TOKEN_ENCRYPTION_KEY) === 'late-refresh',
    ),
  );
  await assert.rejects(f.call('start'), { code: 'STRAVA_REVOCATION_PENDING' });
});
test('late refresh rotation after old-token 200 absent must be separately revoked', async () => {
  const f = await connected({ expires_at: 1 });
  const entered = deferred();
  const release = deferred();
  const importing = importRoute({
    request,
    env: ENV,
    store: f.bridge.store,
    parseGpx,
    now: NOW,
    fetchImpl: async (url) => {
      assert.match(url, /oauth\/token$/);
      entered.resolve();
      return release.promise;
    },
  });
  const rejected = assert.rejects(importing, { code: 'AUTHORIZATION_REVOKED' });
  await entered.promise;
  await withFetch(
    async () => {
      assert.equal((await f.call('disconnect')).revocation_complete, false);
    },
    async () => new Response(''),
  );
  release.resolve(new Response(JSON.stringify(token({ refresh_token: 'rotated-refresh' }))));
  await rejected;
  assert.equal(f.state.strava_credentials.size, 0);
  assert.ok(
    [...f.state.strava_revocations.values()].some(
      (row) =>
        row.token_cipher &&
        decrypt(row.token_cipher, ENV.STRAVA_TOKEN_ENCRYPTION_KEY) === 'rotated-refresh',
    ),
  );
  assert.equal(f.state.route_previews?.size || 0, 0);
});

test('definitive refresh rejection clears stale credentials and requires reconnect', async () => {
  const f = await connected({ expires_at: 1 });
  await assert.rejects(
    importRoute({
      request,
      env: ENV,
      store: f.bridge.store,
      parseGpx,
      now: NOW,
      fetchImpl: async (url) => {
        assert.match(url, /oauth\/token$/);
        return new Response('', { status: 400 });
      },
    }),
    { code: 'STRAVA_TOKEN_INVALID' },
  );
  assert.equal(f.state.strava_credentials.size, 0);
  assert.deepEqual(await f.call('status'), {
    state: 'disconnected',
    generation: 2,
    athlete_name: '',
    import_ready: false,
    revocation_complete: true,
  });
});

test('disconnect during download fences the real preview store without deleting bound activity GPX', async () => {
  const f = await connected();
  const bound = `cloud://synthetic/activity-routes/${OWNER}/${'a'.repeat(64)}.gpx`;
  await f.db
    .collection('activities')
    .doc('bound')
    .set({ data: { route: { gpx_file_id: bound } } });
  const entered = deferred();
  const release = deferred();
  const importing = importRoute({
    request,
    env: ENV,
    store: f.bridge.store,
    parseGpx,
    now: NOW,
    fetchImpl: async () => {
      entered.resolve();
      return release.promise;
    },
  });
  const rejected = assert.rejects(importing, { code: 'AUTHORIZATION_REVOKED' });
  await entered.promise;
  await withFetch(() => f.call('disconnect'));
  release.resolve(new Response(GPX));
  await rejected;
  assert.equal(f.state.route_previews?.size || 0, 0);
  assert.equal(f.state.activities.get('bound').route.gpx_file_id, bound);
});
test('actual activity GPX re-preview cannot launder a revoked Strava source using another request ID', async () => {
  const f = await connected();
  const preview = await importRoute({
    request,
    env: ENV,
    store: f.bridge.store,
    parseGpx,
    now: NOW,
    fetchImpl: async () => new Response(GPX),
  });
  await withFetch(() => f.call('disconnect'));
  f.cloud.downloadFile = async () => ({ fileContent: GPX });
  const activity = loadRuntime('../activity-admin/index', f.cloud);
  const result = await activity.main({
    action: 'previewRouteGpx',
    gpxFileId: preview.gpx_file_id,
    gpxSha256: preview.gpx_sha256,
    fileName: 'route.gpx',
    requestId: 'another-request',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'AUTHORIZATION_REVOKED');
  assert.equal(f.state.route_previews.size, 1);
});
test('profile deletion atomically removes import access and cannot complete before external revocation', async () => {
  const f = await connected();
  const privacy = createPrivacyService(f.db);
  const deletion = await privacy.requestDeletion(
    OWNER,
    {
      requestId: 'synthetic-deletion',
      policyVersion: '2026-10-21',
      scope: 'self-profile-and-personal-media',
      confirmed: true,
      generation: 1,
    },
    NOW,
  );
  assert.equal(f.state.strava_credentials.size, 0);
  const worker = createPrivacyStore(f.db, 'synthetic-media-secret-at-least-32-bytes');
  for (let n = 0; n < 12; n += 1) {
    const now = new Date(NOW.getTime() + n * 600000);
    const fence = { now, leaseId: `lease-${n}` };
    if (await worker.claim(deletion.requestId, fence))
      await worker.process(deletion.requestId, fence);
  }
  const row = f.state.privacy_requests.get(deletion.requestId);
  assert.notEqual(row.status, 'completed');
  assert.equal(row.phase, 'strava_revocation');
  await f.bridge.store.drainRevocations({
    now: new Date(NOW.getTime() + 7200000),
    fetchImpl: async () => new Response(''),
  });
  const fence = { now: new Date(NOW.getTime() + 7800000), leaseId: 'final' };
  assert.equal(await worker.claim(deletion.requestId, fence), true);
  await worker.process(deletion.requestId, fence);
  assert.equal(f.state.privacy_requests.get(deletion.requestId).status, 'completed');
});

test('restored old deletion treats a newer explicit authorization as already fenced without revoking it', async () => {
  const f = await connected();
  const auth = f.state.strava_authorizations.get(OWNER);
  const credential = f.state.strava_credentials.get(OWNER);
  f.state.profiles.get(OWNER).generation = 2;
  auth.profile_generation = 2;
  credential.profile_generation = 2;
  const stale = await f.db.runTransaction((tx) => f.bridge.store.disconnectTx(tx, OWNER, NOW, 1));
  assert.equal(f.state.strava_credentials.has(OWNER), true);
  const status = await f.db.runTransaction((tx) =>
    f.bridge.store.deletionStatusTx(tx, OWNER, stale.generation, 1),
  );
  assert.equal(status.revocation_complete, true);
  assert.equal(f.state.strava_credentials.has(OWNER), true);
});

test('configured privacy Timer retries pending revocation without another user action', async () => {
  const f = await connected();
  await withFetch(() => f.call('disconnect'));
  assert.equal((await f.call('status')).state, 'revocation_pending');
  for (const row of f.state.strava_revocations.values()) row.retry_at = new Date(0);
  f.cloud.getWXContext = () => ({ OPENID: '' });
  const worker = loadRuntime('../privacy-maintenance/index', f.cloud);
  await withFetch(
    async () => {
      const result = await worker.main({
        Type: 'Timer',
        TriggerName: 'privacy-maintenance-worker',
      });
      assert.equal(result.ok, true);
      assert.deepEqual(result.data.strava_revocations, {
        attempted: 1,
        completed: 1,
        uncertain: 0,
      });
    },
    async () => new Response(''),
  );
  assert.equal((await f.bridge.store.status(OWNER)).state, 'disconnected');
});

test('Timer clamps revocation work to two external calls within the function timeout budget', async () => {
  const f = await connected();
  await withFetch(() => f.call('disconnect'));
  const [first] = f.state.strava_revocations.values();
  first.retry_at = new Date(0);
  for (const id of ['second-material', 'third-material'])
    f.state.strava_revocations.set(id, {
      ...first,
      _id: id,
      attempts: 0,
      lease_id: '',
      lease_expires_at: null,
    });
  f.state.strava_authorizations.get(OWNER).pending_count = 3;
  let calls = 0;
  const result = await f.bridge.store.drainRevocations({
    now: new Date(NOW.getTime() + 60_000),
    limit: 99,
    fetchImpl: async () => {
      calls += 1;
      return new Response('', { status: 503 });
    },
  });
  assert.equal(result.attempted, 2);
  assert.equal(calls, 2);
});
