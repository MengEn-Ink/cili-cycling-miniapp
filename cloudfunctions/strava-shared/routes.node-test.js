'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { encrypt } = require('./core');
const {
  extractRouteId,
  parseGpx,
  popularClimbs,
  routePreviewFlow,
  routeGpxFlow,
} = require('./routes');
const key = crypto.randomBytes(32).toString('base64');
const env = {
  STRAVA_CLIENT_ID: '123',
  STRAVA_CLIENT_SECRET: 'secret',
  STRAVA_TOKEN_ENCRYPTION_KEY: key,
  STRAVA_CALLBACK_URL: 'https://example.test/callback',
};
const gpx = (points) =>
  Buffer.from(
    `<gpx><trk><trkseg>${points.map(([lat, lon, ele]) => `<trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele></trkpt>`).join('')}</trkseg></trk></gpx>`,
  );
function credential(overrides = {}) {
  return {
    openid: 'user',
    athlete_id: '7',
    athlete_name: 'Rider',
    access_token_cipher: encrypt('access', key),
    refresh_token_cipher: encrypt('refresh', key),
    token_expires_at: new Date(Date.now() + 3600000),
    scopes: ['read'],
    ...overrides,
  };
}
test('仅提取严格 Strava 路线 URL，兼容地区前缀', () => {
  assert.equal(extractRouteId('https://www.strava.com/routes/12345'), '12345');
  assert.equal(extractRouteId('https://www.strava.com/zh-CN/routes/987/'), '987');
  for (const value of [
    'http://www.strava.com/routes/1',
    'https://strava.com/routes/1',
    'https://www.strava.com/routes/1?x=1',
    'https://www.strava.com/athletes/1',
  ])
    assert.throws(() => extractRouteId(value), { code: 'ROUTE_URL_INVALID' });
});
test('GPX 计算 haversine、正向总爬升、bounds 并均匀抽稀至 80 点', () => {
  const points = Array.from({ length: 101 }, (_, index) => [
    22 + index * 0.001,
    114,
    index % 2 ? 20 : 10,
  ]);
  const result = parseGpx(gpx(points));
  assert.equal(result.elevation_profile.length, 80);
  assert.equal(result.elevation_profile[0].distance_km, 0);
  assert.equal(result.elevation_profile.at(-1).elevation_m, 10);
  assert.equal(result.elevation_m, 500);
  assert.ok(result.distance_km > 11 && result.distance_km < 12);
  assert.deepEqual(result.route_bounds, { south: 22, west: 114, north: 22.1, east: 114 });
});
test('赛段最多请求 5 个详情并按收藏排序取 3', async () => {
  let details = 0;
  const result = await popularClimbs(
    {
      exploreSegments: async () => ({ segments: [1, 2, 3, 4, 5, 6].map((id) => ({ id })) }),
      segment: async (_token, id) => {
        details += 1;
        return {
          id,
          name: `坡${id}`,
          distance: 1000,
          star_count: id,
          athlete_count: 99,
          effort_count: 999,
        };
      },
    },
    'token',
    { south: 1, west: 2, north: 3, east: 4 },
  );
  assert.equal(details, 5);
  assert.deepEqual(
    result.map((item) => item.id),
    ['5', '4', '3'],
  );
  assert.equal(result[0].popularity_label, '5 收藏');
});
test('star_count 全部缺失时按 athlete_count 回退并诚实标注', async () => {
  const result = await popularClimbs(
    {
      exploreSegments: async () => ({ segments: [{ id: 1 }, { id: 2 }] }),
      segment: async (_token, id) => ({
        id,
        name: `坡${id}`,
        athlete_count: id * 10,
        effort_count: 100,
      }),
    },
    'token',
    { south: 1, west: 2, north: 3, east: 4 },
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ['2', '1'],
  );
  assert.equal(result[0].popularity_label, '20 位骑手');
});
test('routePreview 复用刷新令牌并保存服务端可信预览', async () => {
  let savedCredential;
  let savedPreview;
  const result = await routePreviewFlow({
    openid: 'user',
    routeUrl: 'https://www.strava.com/routes/42',
    env,
    store: {
      getCredential: async () => credential({ token_expires_at: new Date(0) }),
      saveCredential: async (value) => {
        savedCredential = value;
      },
      saveRoutePreview: async (_openid, value) => {
        savedPreview = value;
      },
    },
    api: {
      refresh: async () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
      routeGpx: async (token) => {
        assert.equal(token, 'new-access');
        return gpx([
          [22, 114, 10],
          [22.01, 114, 20],
        ]);
      },
      exploreSegments: async () => ({ segments: [] }),
      segment: async () => ({}),
    },
  });
  assert.equal(result.strava_route_id, '42');
  assert.equal(savedPreview.strava_route_id, '42');
  assert.deepEqual(savedCredential.scopes, ['read']);
});
test('routeGpx 拒绝草稿、不匹配路线与缺失归属，并始终使用路线创建者凭证', async () => {
  const base = {
    openid: 'participant',
    activityId: 'a1',
    routeId: '99',
    env,
    api: {},
    now: new Date(),
  };
  await assert.rejects(
    routeGpxFlow({
      ...base,
      store: { getActivity: async () => ({ status: 'draft', route: { strava_route_id: '99' } }) },
    }),
    { code: 'ROUTE_NOT_AVAILABLE' },
  );
  await assert.rejects(
    routeGpxFlow({
      ...base,
      store: {
        getActivity: async () => ({ status: 'published', route: { strava_route_id: '100' } }),
      },
    }),
    { code: 'FORBIDDEN_ROUTE' },
  );
  await assert.rejects(
    routeGpxFlow({
      ...base,
      store: {
        getActivity: async () => ({ status: 'published', route: { strava_route_id: '99' } }),
      },
    }),
    { code: 'ROUTE_NOT_AVAILABLE' },
  );
  let credentialOwner;
  let requested;
  const result = await routeGpxFlow({
    ...base,
    store: {
      getActivity: async () => ({
        status: 'published',
        strava_route_owner_openid: 'route-owner',
        route: { strava_route_id: '99' },
      }),
      getCredential: async (openid) => {
        credentialOwner = openid;
        return credential({ openid });
      },
      saveCredential: async () => {},
    },
    api: {
      routeGpx: async (_token, id) => {
        requested = id;
        return Buffer.from('<gpx/>');
      },
    },
  });
  assert.equal(credentialOwner, 'route-owner');
  assert.equal(requested, '99');
  assert.equal(result.filename, 'a1-strava-route-99.gpx');
});
