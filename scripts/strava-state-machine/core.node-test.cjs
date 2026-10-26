'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('./core.cjs');
const KEY = Buffer.alloc(32, 7).toString('base64');
const ENV = {
  STRAVA_CLIENT_ID: '12345',
  STRAVA_CLIENT_SECRET: 'synthetic-secret',
  STRAVA_TOKEN_ENCRYPTION_KEY: KEY,
  STRAVA_CALLBACK_URL: 'https://example.test/strava/callback',
};
const NOW = new Date('2026-10-26T00:00:00Z');
const token = (extra = {}) => ({
  access_token: 'synthetic-access',
  refresh_token: 'synthetic-refresh',
  expires_at: NOW.getTime() / 1000 + 3600,
  athlete: { id: 42, firstname: 'Synthetic' },
  ...extra,
});
const fence = { operation_id: 'synthetic-operation', oauth_generation: 2, profile_generation: 1 };
const response = (value) => new Response(JSON.stringify(value));

test('strict config and authenticated encryption retain v1 compatibility', () => {
  assert.equal(core.config(ENV).callbackUrl, ENV.STRAVA_CALLBACK_URL);
  for (const change of [
    { STRAVA_CLIENT_ID: 'x' },
    { STRAVA_CLIENT_SECRET: '' },
    { STRAVA_CALLBACK_URL: 'http://example.test/callback' },
    { STRAVA_CALLBACK_URL: 'https://user:pass@example.test/callback' },
    { STRAVA_TOKEN_ENCRYPTION_KEY: `${KEY.slice(0, 10)} ${KEY.slice(10)}` },
  ]) {
    assert.throws(() => core.config({ ...ENV, ...change }), { code: 'STRAVA_CONFIG_INVALID' });
  }
  const cipher = core.encrypt('synthetic-refresh', KEY);
  assert.equal(cipher.v, 1);
  assert.equal(core.decrypt(cipher, KEY), 'synthetic-refresh');
  assert.doesNotMatch(JSON.stringify(cipher), /synthetic-refresh/);
  assert.throws(() => core.encrypt('x', 'bad-key'), { code: 'STRAVA_CONFIG_INVALID' });
  assert.throws(() => core.decrypt({ ...cipher, tag: Buffer.alloc(16).toString('base64') }, KEY), {
    code: 'STRAVA_TOKEN_INVALID',
  });
});

test('state is hashed and authorization URL contains only explicit OAuth fields', () => {
  const state = core.createState(NOW.getTime(), () => Buffer.alloc(32, 3));
  assert.equal(core.hashState(state.raw), state.hash);
  assert.notEqual(state.raw, state.hash);
  assert.equal(state.expiresAt.getTime(), NOW.getTime() + core.OAUTH_STATE_TTL_MS);
  assert.throws(() => core.hashState('invalid'), { code: 'OAUTH_STATE_INVALID' });
  const url = new URL(core.authorizationUrl(core.config(ENV), state.raw));
  assert.equal(url.origin, 'https://www.strava.com');
  assert.equal(url.searchParams.get('state'), state.raw);
  assert.equal(url.searchParams.get('scope'), 'read');
  assert.equal(url.searchParams.get('approval_prompt'), 'force');
  assert.equal(url.searchParams.has('client_secret'), false);
});

test('route parser rejects nonstandard URLs and canonicalizes accepted routes', () => {
  assert.deepEqual(core.parseRouteUrl('https://strava.com/zh-CN/routes/42/'), {
    routeId: '42',
    url: 'https://www.strava.com/routes/42',
  });
  for (const url of [
    'http://strava.com/routes/42',
    'https://evil.test/routes/42',
    'https://strava.com/routes/0',
    'https://strava.com/routes/42/export_gpx',
    'https://strava.com/routes/42#x',
    'https://user:pass@strava.com/routes/42',
  ])
    assert.throws(() => core.parseRouteUrl(url), { code: 'STRAVA_ROUTE_URL_INVALID' });
});

test('token documents encrypt both tokens and reject incomplete responses', () => {
  const row = core.tokenDocument('synthetic-owner', token(), KEY, NOW);
  assert.equal(row.owner_openid, 'synthetic-owner');
  assert.equal(core.decrypt(row.refresh_token_cipher, KEY), 'synthetic-refresh');
  assert.equal(row.access_token, undefined);
  for (const change of [{ refresh_token: '' }, { expires_at: 'x' }, { athlete: null }])
    assert.throws(() => core.tokenDocument('synthetic-owner', token(change), KEY, NOW), {
      code: 'OAUTH_TOKEN_INVALID',
    });
});

test('callback consumes state once before saving fenced encrypted credentials', async () => {
  const state = core.createState(NOW.getTime());
  let used = false;
  let saved;
  const store = {
    consumeState: async (hash, _now, mint) => {
      assert.equal(hash, state.hash);
      assert.equal(mint, true);
      if (used) return undefined;
      used = true;
      return { owner_openid: 'synthetic-owner', expires_at: state.expiresAt, ...fence };
    },
    finishMint: async (owner, supplied, value, material) => {
      assert.equal(owner, 'synthetic-owner');
      assert.equal(supplied.operation_id, fence.operation_id);
      assert.equal(core.decrypt(material, KEY), 'synthetic-refresh');
      saved = value;
      return true;
    },
  };
  const input = {
    query: { state: state.raw, code: 'synthetic-code', scope: 'read' },
    env: ENV,
    store,
    now: NOW,
    fetchImpl: async (_url, options) => {
      assert.ok(options.signal);
      assert.equal(new URLSearchParams(options.body).get('grant_type'), 'authorization_code');
      return response(token());
    },
  };
  assert.deepEqual(await core.callbackFlow(input), { connected: true });
  assert.equal(saved.access_token, undefined);
  await assert.rejects(core.callbackFlow(input), { code: 'OAUTH_STATE_INVALID' });
});

for (const [status, uncertain, code] of [
  [400, false, 'STRAVA_TOKEN_INVALID'],
  [401, false, 'STRAVA_TOKEN_INVALID'],
  [429, true, 'STRAVA_UNAVAILABLE'],
  [503, true, 'STRAVA_UNAVAILABLE'],
]) {
  test(`token HTTP ${status} settles only with the appropriate uncertainty`, async () => {
    let failed;
    await assert.rejects(
      core.callbackFlow({
        query: {
          state: core.createState(NOW.getTime()).raw,
          code: 'synthetic-code',
          scope: 'read',
        },
        env: ENV,
        now: NOW,
        store: {
          consumeState: async () => ({
            owner_openid: 'synthetic-owner',
            expires_at: new Date(NOW.getTime() + 1000),
            ...fence,
          }),
          failMint: async (_owner, supplied, unknown) => {
            failed = [supplied, unknown];
          },
        },
        fetchImpl: async () => new Response('private-upstream-body', { status }),
      }),
      { code },
    );
    assert.deepEqual(failed, [expectFence(), uncertain]);
  });
}
function expectFence() {
  return { owner_openid: 'synthetic-owner', expires_at: new Date(NOW.getTime() + 1000), ...fence };
}

test('DB settlement failures propagate instead of returning callback success', async () => {
  const failure = new Error('synthetic-db-failure');
  await assert.rejects(
    core.callbackFlow({
      query: {
        state: core.createState(NOW.getTime()).raw,
        code: 'synthetic-code',
        scope: 'read',
      },
      env: ENV,
      now: NOW,
      store: {
        consumeState: async () => expectFence(),
        finishMint: async () => {
          throw failure;
        },
      },
      fetchImpl: async () => response(token()),
    }),
    (error) => error === failure,
  );
});

test('refresh rotates tokens and fresh access avoids token exchange', async () => {
  const credential = core.tokenDocument('synthetic-owner', token(), KEY, NOW);
  const store = { checkFence: async () => {} };
  assert.equal(
    await core.accessToken({
      credential,
      env: ENV,
      store,
      now: NOW,
      fetchImpl: async () => assert.fail('fresh token must not exchange'),
    }),
    'synthetic-access',
  );
  credential.token_expires_at = new Date(0);
  store.beginRefresh = async () => fence;
  store.finishMint = async (_owner, _fence, value) => {
    assert.equal(core.decrypt(value.refresh_token_cipher, KEY), 'rotated-refresh');
    return true;
  };
  assert.equal(
    await core.accessToken({
      credential,
      env: ENV,
      store,
      now: NOW,
      fetchImpl: async () =>
        response(token({ access_token: 'rotated-access', refresh_token: 'rotated-refresh' })),
    }),
    'rotated-access',
  );
});

test('refresh decrypts material before reserving a credential operation', async () => {
  const credential = core.tokenDocument('synthetic-owner', token(), KEY, NOW);
  credential.token_expires_at = new Date(0);
  credential.refresh_token_cipher = {
    ...credential.refresh_token_cipher,
    tag: Buffer.alloc(16).toString('base64'),
  };
  let reservations = 0;
  await assert.rejects(
    core.accessToken({
      credential,
      env: ENV,
      now: NOW,
      store: {
        checkFence: async () => {},
        beginRefresh: async () => {
          reservations += 1;
          return fence;
        },
      },
      fetchImpl: async () => assert.fail('invalid material must not call Strava'),
    }),
    { code: 'STRAVA_TOKEN_INVALID' },
  );
  assert.equal(reservations, 0);
});

test('callback requires read scope before reserving or exchanging a token', async () => {
  const state = core.createState(NOW.getTime());
  let mint;
  let calls = 0;
  await assert.rejects(
    core.callbackFlow({
      query: { state: state.raw, code: 'synthetic-code', scope: 'activity:write' },
      env: ENV,
      now: NOW,
      store: {
        consumeState: async (_hash, _now, shouldMint) => {
          mint = shouldMint;
          return {
            owner_openid: 'synthetic-owner',
            expires_at: state.expiresAt,
            ...fence,
          };
        },
        finishMint: async () => true,
      },
      fetchImpl: async () => {
        calls += 1;
        return response(token());
      },
    }),
    { code: 'OAUTH_SCOPE_REQUIRED' },
  );
  assert.equal(mint, false);
  assert.equal(calls, 0);
});

test('revoke uses refresh material and Basic app auth; empty 200 is complete', async () => {
  const result = await core.revokeToken('synthetic-refresh', ENV, async (url, options) => {
    assert.equal(url, 'https://www.strava.com/oauth/revoke');
    assert.equal(new URLSearchParams(options.body).get('token'), 'synthetic-refresh');
    assert.equal(
      options.headers.authorization,
      `Basic ${Buffer.from(`${ENV.STRAVA_CLIENT_ID}:${ENV.STRAVA_CLIENT_SECRET}`).toString('base64')}`,
    );
    assert.ok(options.signal);
    return new Response('');
  });
  assert.deepEqual(result, { state: 'completed', code: '' });
  for (const [status, state] of [
    [400, 'manual'],
    [401, 'manual'],
    [429, 'pending'],
    [503, 'pending'],
  ])
    assert.equal(
      (await core.revokeToken('synthetic-refresh', ENV, async () => new Response('', { status })))
        .state,
      state,
    );
  assert.equal(
    (
      await core.revokeToken('synthetic-refresh', ENV, async () => {
        throw new Error('network');
      })
    ).state,
    'pending',
  );
});

test('download limits reject both advertised and streamed excess bytes', async () => {
  await assert.rejects(
    core.boundedBody(
      new Response('', { headers: { 'content-length': String(core.MAX_GPX_BYTES + 1) } }),
    ),
    { code: 'GPX_TOO_LARGE' },
  );
  await assert.rejects(core.boundedBody(new Response(Buffer.alloc(core.MAX_GPX_BYTES + 1))), {
    code: 'GPX_TOO_LARGE',
  });
  assert.equal((await core.boundedBody(new Response('gpx'))).toString(), 'gpx');
  for (const [status, code] of [
    [401, 'STRAVA_AUTH_REQUIRED'],
    [403, 'STRAVA_ROUTE_FORBIDDEN'],
    [404, 'STRAVA_ROUTE_NOT_FOUND'],
    [429, 'STRAVA_RATE_LIMITED'],
    [500, 'STRAVA_UNAVAILABLE'],
  ])
    assert.equal(core.mapDownloadError(status).code, code);
});

test('import preserves bytes, parser summary, source fence and idempotent preview', async () => {
  const credential = { ...core.tokenDocument('synthetic-owner', token(), KEY, NOW), ...fence };
  const bytes = Buffer.from('<gpx>synthetic-route</gpx>');
  let preview;
  let uploads = 0;
  const store = {
    getCredential: async () => credential,
    checkFence: async () => {},
    getPreview: async () => preview,
    reserveRouteSource: async (_owner, path, supplied) => {
      assert.match(path, /^activity-routes\/synthetic-owner\/[a-f0-9]{64}\.gpx$/);
      assert.equal(supplied.oauth_generation, fence.oauth_generation);
    },
    uploadFile: async ({ cloudPath, fileContent }) => {
      uploads += 1;
      assert.deepEqual(fileContent, bytes);
      return { fileID: `cloud://synthetic/${cloudPath}` };
    },
    putPreview: async (_id, row) => (preview = row),
  };
  const input = {
    request: {
      openid: 'synthetic-owner',
      routeUrl: 'https://strava.com/routes/42',
      requestId: 'synthetic-request',
    },
    env: ENV,
    store,
    now: NOW,
    parseGpx: (data, { fileName }) => {
      assert.deepEqual(data, bytes);
      return { route_name: fileName };
    },
    fetchImpl: async () => new Response(bytes),
  };
  const first = await core.importRoute(input);
  assert.deepEqual(await core.importRoute(input), first);
  assert.equal(uploads, 1);
  assert.equal(first.route_name, 'strava-route-42.gpx');
  assert.equal(preview.oauth_generation, fence.oauth_generation);
  assert.equal(core.routePreviewId('a', 'b', 'c').length, 64);
});

test('route 401 refreshes once and starts revocation after repeated unauthorized responses', async () => {
  let credential = { ...core.tokenDocument('synthetic-owner', token(), KEY, NOW), ...fence };
  let routeCalls = 0;
  let tokenCalls = 0;
  let disconnects = 0;
  const store = {
    getCredential: async () => credential,
    checkFence: async () => {},
    beginRefresh: async () => ({ ...fence, kind: 'refresh' }),
    finishMint: async (_owner, supplied, value) => {
      credential = { ...value, ...supplied };
      return true;
    },
    disconnect: async () => {
      disconnects += 1;
    },
  };
  await assert.rejects(
    core.importRoute({
      request: {
        openid: 'synthetic-owner',
        routeUrl: 'https://strava.com/routes/42',
        requestId: 'synthetic-request',
      },
      env: ENV,
      store,
      now: NOW,
      parseGpx: () => assert.fail('unauthorized response must not be parsed'),
      fetchImpl: async (url) => {
        if (url === 'https://www.strava.com/oauth/token') {
          tokenCalls += 1;
          return response(token({ access_token: 'rotated-access' }));
        }
        routeCalls += 1;
        return new Response('', { status: 401 });
      },
    }),
    { code: 'STRAVA_AUTH_REQUIRED' },
  );
  assert.equal(routeCalls, 2);
  assert.equal(tokenCalls, 1);
  assert.equal(disconnects, 1);
});
