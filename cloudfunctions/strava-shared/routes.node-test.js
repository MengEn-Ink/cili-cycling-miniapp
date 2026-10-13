'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { encrypt } = require('./core');
const {
  extractRouteId,
  parseGpx,
  popularClimbs,
  publicRoutePreviewFlow,
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
    credential_generation: 1,
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
function canonicalHtml(id = '42', title = '周末环湖') {
  return (
    '<script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify({
      page: '/routes/[id]',
      query: { id },
      pageProps: {
        routeId: id,
        routeName: title,
        ogImage: { url: 'https://dgtzuqphqg23d.cloudfront.net/example.png' },
      },
    }) +
    '</script>'
  );
}
function embedHtml({
  id = '42',
  title = '周末环湖',
  distance = '87.7 km',
  elevation = '961 m',
  coordinates = [
    [114, 22, 10],
    [114.01, 22.01, 20],
  ],
  routeData,
} = {}) {
  const fallback = encodeURIComponent(`https://strava.com/routes/${id}?utm_medium=web_embed`);
  return (
    '<div class="strava-embed-root">' +
    `<a target="_blank" href="https://strava.app.link/example?%24fallback_url=${fallback}&amp;strava_deeplink_url=strava%3A%2F%2Froutes%2F${id}" class="title-and-description no-description">` +
    `<h1 class="title">${title}</h1></a>` +
    '<div class="stats">' +
    '<div class="stat"><div class="stat-label">Type</div><div class="stat-value"><svg><title>Ride</title></svg></div></div>' +
    `<div class="stat"><div class="stat-label">Distance</div><div class="stat-value">${distance}</div></div>` +
    `<div class="stat"><div class="stat-label">Elev Gain</div><div class="stat-value">${elevation}</div></div>` +
    '</div></div>' +
    '<script id="__ROUTE_DATA__" type="application/json">' +
    (routeData === undefined ? JSON.stringify({ coordinates }) : routeData) +
    '</script>'
  );
}
function htmlResponse(url, html, overrides = {}) {
  return {
    ok: true,
    status: 200,
    redirected: false,
    url,
    headers: { get: () => null },
    text: async () => html,
    ...overrides,
  };
}
function publicFetch({ canonical = canonicalHtml(), embed = embedHtml(), override } = {}) {
  return async (url, options) => {
    if (override) {
      const response = override(url, options);
      if (response) return response;
    }
    if (url === 'https://www.strava.com/routes/42') return htmlResponse(url, canonical);
    if (url === 'https://strava-embeds.com/route/42') return htmlResponse(url, embed);
    assert.fail(`unexpected URL: ${url}`);
  };
}

test('并行读取真实结构的 canonical 与 embed，抽稀坐标并保存可信完整预览', async () => {
  const calls = [];
  let saved;
  const now = new Date('2026-10-13T01:00:00.000Z');
  const coordinates = Array.from({ length: 101 }, (_, index) => [
    114 + index * 0.001,
    22 + index * 0.001,
    10 + index,
  ]);
  const fetchImpl = publicFetch({
    embed: embedHtml({ coordinates }),
  });
  const result = await publicRoutePreviewFlow({
    openid: 'admin-1',
    routeUrl: 'https://www.strava.com/zh-CN/routes/42/',
    store: {
      saveRoutePreview: async (...args) => {
        saved = args;
      },
    },
    now,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return fetchImpl(url, options);
    },
  });

  assert.deepEqual(calls.map(({ url }) => url).sort(), [
    'https://strava-embeds.com/route/42',
    'https://www.strava.com/routes/42',
  ]);
  for (const { options } of calls) {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.headers.cookie, undefined);
  }
  assert.equal(result.distance_km, 87.7);
  assert.equal(result.elevation_m, 961);
  assert.equal(result.estimated_moving_time_seconds, Math.round((87.7 / 22 + 961 / 600) * 3600));
  assert.equal(result.elevation_profile.length, 80);
  assert.deepEqual(result.elevation_profile[0], { distance_km: 0, elevation_m: 10 });
  assert.deepEqual(result.elevation_profile.at(-1), { distance_km: 87.7, elevation_m: 110 });
  assert.deepEqual(result.route_bounds, { south: 22, west: 114, north: 22.1, east: 114.1 });
  assert.deepEqual(result.popular_climbs, []);
  assert.equal(result.strava_gpx_available, false);
  assert.equal(result.route_name, '周末环湖');
  assert.equal(result.preview_image_url, 'https://dgtzuqphqg23d.cloudfront.net/example.png');
  assert.deepEqual(saved, ['admin-1', result, now]);
});

test('公开路线兼容 mi/ft 单位并按 22km/h 加 600m/h 估算时间', async () => {
  const result = await publicRoutePreviewFlow({
    routeUrl: 'https://www.strava.com/routes/42',
    fetchImpl: publicFetch({ embed: embedHtml({ distance: '10 mi', elevation: '1,000 ft' }) }),
  });

  assert.equal(result.distance_km, 16.09);
  assert.equal(result.elevation_m, 304.8);
  assert.equal(result.estimated_moving_time_seconds, Math.round((16.09 / 22 + 304.8 / 600) * 3600));
});

test('公开路线解析拒绝重定向、声明或流式超大响应', async () => {
  const call = (override) =>
    publicRoutePreviewFlow({
      routeUrl: 'https://www.strava.com/routes/42',
      fetchImpl: publicFetch({ override }),
    });
  await assert.rejects(
    call((url) =>
      url.includes('strava-embeds.com')
        ? { ok: false, status: 302, headers: { get: () => null } }
        : undefined,
    ),
    { code: 'PUBLIC_ROUTE_UNAVAILABLE' },
  );
  await assert.rejects(
    call((url) =>
      url.includes('strava-embeds.com')
        ? { ok: true, status: 200, headers: { get: () => String(1024 * 1024 + 1) } }
        : undefined,
    ),
    { code: 'PUBLIC_ROUTE_TOO_LARGE' },
  );
  let cancelled = false;
  await assert.rejects(
    call((url) =>
      url.includes('strava-embeds.com')
        ? {
            ok: true,
            status: 200,
            redirected: false,
            url,
            headers: { get: () => null },
            body: {
              getReader: () => ({
                read: async () => ({ done: false, value: new Uint8Array(600 * 1024) }),
                cancel: async () => {
                  cancelled = true;
                },
              }),
            },
          }
        : undefined,
    ),
    { code: 'PUBLIC_ROUTE_TOO_LARGE' },
  );
  assert.equal(cancelled, true);
});

test('公开路线解析拒绝坏 JSON、不匹配 route id/title 与非法坐标', async () => {
  const call = (options) =>
    publicRoutePreviewFlow({
      routeUrl: 'https://www.strava.com/routes/42',
      fetchImpl: publicFetch(options),
    });
  await assert.rejects(call({ embed: embedHtml({ routeData: '{broken}' }) }), {
    code: 'PUBLIC_ROUTE_INVALID',
  });
  await assert.rejects(call({ embed: embedHtml({ id: '43' }) }), {
    code: 'PUBLIC_ROUTE_INVALID',
  });
  await assert.rejects(call({ embed: embedHtml({ title: '另一条路线' }) }), {
    code: 'PUBLIC_ROUTE_INVALID',
  });
  await assert.rejects(
    call({
      embed: embedHtml({
        coordinates: [
          [114, 22, 10],
          [181, 23, 20],
        ],
      }),
    }),
    { code: 'PUBLIC_ROUTE_INVALID' },
  );
});

test('routePreview 复用刷新令牌并保存服务端可信预览', async () => {
  let savedCredential;
  let savedPreview;
  let current = credential({ token_expires_at: new Date(0) });
  const result = await routePreviewFlow({
    openid: 'user',
    routeUrl: 'https://www.strava.com/routes/42',
    env,
    store: {
      getCredential: async () => current,
      acquireCredentialRefreshLease: async (_openid, { leaseId, now }) => {
        current = {
          ...current,
          token_refresh_lease_id: leaseId,
          token_refresh_started_at: now,
        };
        return { acquired: true, credential: current };
      },
      saveRefreshedCredential: async (_openid, _expected, refreshed) => {
        const { token_refresh_lease_id, token_refresh_started_at, ...withoutLease } = current;
        void token_refresh_lease_id;
        void token_refresh_started_at;
        current = {
          ...withoutLease,
          access_token_cipher: refreshed.access_token_cipher,
          refresh_token_cipher: refreshed.refresh_token_cipher,
          token_expires_at: refreshed.token_expires_at,
          scopes: refreshed.scopes,
        };
        savedCredential = current;
        return { saved: true, credential: current };
      },
      releaseCredentialRefreshLease: async () => false,
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
      route: async (token) => {
        assert.equal(token, 'new-access');
        return { estimated_moving_time: 5400 };
      },
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
  assert.equal(result.estimated_moving_time_seconds, 5400);
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
