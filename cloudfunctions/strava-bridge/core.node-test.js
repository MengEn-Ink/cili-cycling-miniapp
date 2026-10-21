'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAX_GPX_BYTES,
  accessToken,
  callbackFlow,
  createState,
  decrypt,
  encrypt,
  hashState,
  importRoute,
  parseRouteUrl,
  StravaError,
  tokenDocument,
} = require('./core');
const { parseGpx } = require('./gpx');

const KEY = Buffer.alloc(32, 7).toString('base64');
const ENV = {
  STRAVA_CLIENT_ID: '12345',
  STRAVA_CLIENT_SECRET: 'client-secret',
  STRAVA_TOKEN_ENCRYPTION_KEY: KEY,
  STRAVA_CALLBACK_URL: 'https://example.com/strava/callback',
};
const NOW = new Date('2026-10-21T02:57:00.000Z');
const GPX = Buffer.from(
  '<?xml version="1.0"?><gpx><metadata><name>授权路线</name></metadata><trk><trkseg>' +
    '<trkpt lat="30" lon="120"><ele>10</ele></trkpt>' +
    '<trkpt lat="30.01" lon="120.01"><ele>30</ele></trkpt>' +
    '<trkpt lat="30.02" lon="120.02"><ele>15</ele></trkpt>' +
    '</trkseg></trk></gpx>',
);

function token(overrides = {}) {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: Math.floor(NOW.getTime() / 1000) + 3600,
    athlete: { id: 42, firstname: 'Route', lastname: 'Owner' },
    ...overrides,
  };
}

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers });
}

test('严格解析标准 Strava route URL 与路由 ID', () => {
  assert.deepEqual(parseRouteUrl('https://www.strava.com/routes/123456/'), {
    routeId: '123456',
    url: 'https://www.strava.com/routes/123456',
  });
  assert.deepEqual(parseRouteUrl('https://strava.com/zh-CN/routes/9'), {
    routeId: '9',
    url: 'https://www.strava.com/routes/9',
  });
  for (const invalid of [
    'http://www.strava.com/routes/1',
    'https://evil.example/routes/1',
    'https://www.strava.com/routes/0',
    'https://www.strava.com/routes/1/export_gpx',
    'https://www.strava.com/routes/1#token',
  ])
    assert.throws(() => parseRouteUrl(invalid), { code: 'STRAVA_ROUTE_URL_INVALID' });
});

test('OAuth state 随机、只持久化哈希且 token 使用 AES-256-GCM', () => {
  const state = createState(NOW.getTime(), () => Buffer.alloc(32, 3));
  assert.equal(state.hash, hashState(state.raw));
  assert.notEqual(state.raw, state.hash);
  assert.equal(state.expiresAt.getTime(), NOW.getTime() + 10 * 60 * 1000);
  const envelope = encrypt('secret-token', KEY, () => Buffer.alloc(12, 5));
  assert.equal(envelope.alg, 'A256GCM');
  assert.equal(decrypt(envelope, KEY), 'secret-token');
  assert.throws(() => decrypt({ ...envelope, ciphertext: 'AAAA' }, KEY), {
    code: 'STRAVA_TOKEN_INVALID',
  });
});

test('callback 原子单次消费 state 并把加密凭证保存到对应 OPENID', async () => {
  const state = createState(NOW.getTime(), () => Buffer.alloc(32, 4));
  let consumed = false;
  let saved;
  const store = {
    consumeState: async (hash) => {
      assert.equal(hash, state.hash);
      if (consumed) return undefined;
      consumed = true;
      return { owner_openid: 'openid-a', expires_at: state.expiresAt, consumed_at: null };
    },
    saveCredential: async (openid, value) => {
      saved = { openid, value };
    },
  };
  const fetchImpl = async (_url, options) => {
    assert.doesNotMatch(String(options.body), /openid-a/);
    return response(JSON.stringify(token()), 200, { 'content-type': 'application/json' });
  };
  await callbackFlow({
    query: { code: 'code-1', state: state.raw },
    env: ENV,
    store,
    fetchImpl,
    now: NOW,
  });
  assert.equal(saved.openid, 'openid-a');
  assert.equal(saved.value.owner_openid, 'openid-a');
  assert.equal(decrypt(saved.value.access_token_cipher, KEY), 'access-token');
  assert.equal(saved.value.access_token, undefined);
  await assert.rejects(
    callbackFlow({
      query: { code: 'code-1', state: state.raw },
      env: ENV,
      store,
      fetchImpl,
      now: NOW,
    }),
    { code: 'OAUTH_STATE_INVALID' },
  );
});

test('过期 state 被拒绝且已消费标记不会回滚为可重放', async () => {
  const state = createState(NOW.getTime() - 20 * 60 * 1000, () => Buffer.alloc(32, 6));
  let consumes = 0;
  await assert.rejects(
    callbackFlow({
      query: { code: 'code', state: state.raw },
      env: ENV,
      store: {
        consumeState: async () => {
          consumes += 1;
          return { owner_openid: 'openid-a', expires_at: state.expiresAt };
        },
        saveCredential: async () => assert.fail('must not save'),
      },
      fetchImpl: async () => assert.fail('must not fetch'),
      now: NOW,
    }),
    { code: 'OAUTH_STATE_EXPIRED' },
  );
  assert.equal(consumes, 1);
});

test('到期 token 自动刷新、保存轮换密文且不把 token 返回前端模型', async () => {
  const credential = tokenDocument('openid-a', token({ expires_at: 1 }), KEY, NOW);
  let saved;
  const value = await accessToken({
    credential,
    env: ENV,
    store: { saveCredential: async (_openid, next) => (saved = next) },
    fetchImpl: async (_url, options) => {
      assert.match(String(options.body), /grant_type=refresh_token/);
      assert.match(String(options.body), /refresh_token=refresh-token/);
      return response(
        JSON.stringify(
          token({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_at: 2_000_000_000,
          }),
        ),
      );
    },
    now: NOW,
  });
  assert.equal(value, 'new-access');
  assert.equal(decrypt(saved.refresh_token_cipher, KEY), 'new-refresh');
  assert.equal(saved.access_token, undefined);
});

test('Strava 下载 Buffer 直接复用当前 parseGpx 并生成可消费 route_previews 票据', async () => {
  const credential = tokenDocument('openid-a', token(), KEY, NOW);
  let uploaded;
  let preview;
  const store = {
    getCredential: async (openid) => (openid === 'openid-a' ? credential : undefined),
    saveCredential: async () => {},
    getPreview: async () => undefined,
    uploadFile: async (input) => {
      uploaded = input;
      return { fileID: `cloud://env/${input.cloudPath}` };
    },
    putPreview: async (_id, value) => (preview = value),
  };
  const result = await importRoute({
    request: {
      openid: 'openid-a',
      routeUrl: 'https://www.strava.com/routes/123',
      requestId: 'route_request_123',
    },
    env: ENV,
    store,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://www.strava.com/api/v3/routes/123/export_gpx');
      assert.equal(options.headers.authorization, 'Bearer access-token');
      return response(GPX, 200, { 'content-type': 'application/gpx+xml' });
    },
    parseGpx,
    now: NOW,
  });
  assert.deepEqual(uploaded.fileContent, GPX);
  assert.match(uploaded.cloudPath, /^activity-routes\/openid-a\/[a-f0-9]{64}\.gpx$/);
  assert.deepEqual(preview.summary, parseGpx(GPX, { fileName: 'strava-route-123.gpx' }));
  assert.equal(result.route_name, '授权路线');
  assert.equal(result.external_route_id, '123');
  assert.equal(preview.owner_openid, 'openid-a');
});

test('OPENID 隔离、下载错误映射与 4 MiB 上限关闭失败', async () => {
  const credential = tokenDocument('openid-b', token(), KEY, NOW);
  const base = {
    request: {
      openid: 'openid-a',
      routeUrl: 'https://www.strava.com/routes/123',
      requestId: 'route_request_123',
    },
    env: ENV,
    parseGpx,
    now: NOW,
  };
  await assert.rejects(
    importRoute({
      ...base,
      store: { getCredential: async () => credential },
      fetchImpl: async () => assert.fail('must not fetch'),
    }),
    { code: 'STRAVA_AUTH_REQUIRED' },
  );
  for (const [status, code] of [
    [403, 'STRAVA_ROUTE_FORBIDDEN'],
    [404, 'STRAVA_ROUTE_NOT_FOUND'],
    [429, 'STRAVA_RATE_LIMITED'],
  ]) {
    await assert.rejects(
      importRoute({
        ...base,
        store: {
          getCredential: async () => ({ ...credential, owner_openid: 'openid-a' }),
          saveCredential: async () => {},
        },
        fetchImpl: async () => response('', status),
      }),
      { code },
    );
  }
  await assert.rejects(
    importRoute({
      ...base,
      store: {
        getCredential: async () => ({ ...credential, owner_openid: 'openid-a' }),
        saveCredential: async () => {},
      },
      fetchImpl: async () => response('', 200, { 'content-length': String(MAX_GPX_BYTES + 1) }),
    }),
    { code: 'GPX_TOO_LARGE' },
  );
});

test('token 密钥必须是严格 base64 的 32 字节值', () => {
  assert.throws(() => encrypt('x', 'not-a-key'), StravaError);
});
