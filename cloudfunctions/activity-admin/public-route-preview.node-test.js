'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_PUBLIC_ROUTE_HTML_BYTES,
  extractRouteId,
  parseCanonicalHtml,
  previewId,
  previewPublicRoute,
} = require('./public-route-preview');
const { saveActivity } = require('./use-cases');

const owner = 'admin-openid';
const routeId = '2995569663284766500';
const routeUrl = `https://www.strava.com/routes/${routeId}`;
const now = new Date('2026-10-13T12:00:00.000Z');
const canonicalHtml = `<script id="__NEXT_DATA__">${JSON.stringify({
  page: '/routes/[id]',
  query: { id: routeId },
  pageProps: { routeId, routeName: '周末环湖' },
})}</script>`;
const embedHtml = `
<a href="https://strava.app.link/?$fallback_url=${encodeURIComponent(`https://strava.com/routes/${routeId}`)}"><h1 class="title">周末环湖</h1></a>
<div class="stats">
  <div class="stat-label">Type</div><div class="stat-value">Ride</div>
  <div class="stat-label">Distance</div><div class="stat-value">42.5 km</div>
  <div class="stat-label">Elev Gain</div><div class="stat-value">860 m</div>
</div><script id="__ROUTE_DATA__" type="application/json">${JSON.stringify({
  coordinates: [
    [114, 22, 20],
    [114.1, 22.1, 120],
    [114.2, 22.2, 60],
  ],
})}</script>`;

function response(url, html, overrides = {}) {
  return {
    ok: true,
    status: 200,
    redirected: false,
    url,
    headers: { get: () => String(Buffer.byteLength(html)) },
    text: async () => html,
    ...overrides,
  };
}

function deps(fetchImpl) {
  return {
    getAdmin: async () => ({ _id: owner, enabled: true }),
    getPreview: async () => undefined,
    putPreview: async () => {},
    fetchImpl,
  };
}

test('公开路线 URL 仅接受规范 Strava HTTPS host 且拒绝查询、凭据与其他 host', () => {
  assert.equal(extractRouteId(`https://www.strava.com/zh-CN/routes/${routeId}`), routeId);
  for (const value of [
    `http://www.strava.com/routes/${routeId}`,
    `https://strava.com/routes/${routeId}`,
    `https://www.strava.com.evil.test/routes/${routeId}`,
    `https://www.strava.com/routes/${routeId}?x=1`,
    `https://user@www.strava.com/routes/${routeId}`,
  ])
    assert.throws(() => extractRouteId(value), { code: 'ROUTE_URL_INVALID' });
});

test('路线标题仅解码一层 HTML 实体并保留双重编码文本', () => {
  const html = `<script id="__NEXT_DATA__">${JSON.stringify({
    page: '/routes/[id]',
    query: { id: routeId },
    pageProps: { routeId },
  })}</script><h1 class="EntityCallToAction">“<em>周末</em> A > B、A < 10、A<B、A</B &amp;lt;script&amp;gt; &amp; &#x8DEF;&#32447; &#9999999;”</h1>`;

  assert.equal(
    parseCanonicalHtml(html, routeId),
    '周末 A > B、A < 10、A<B、A</B &lt;script&gt; & 路线 &#9999999;',
  );
});

test('路线标题只解码合法 Unicode 标量值', () => {
  const html = `<script id="__NEXT_DATA__">${JSON.stringify({
    page: '/routes/[id]',
    query: { id: routeId },
    pageProps: { routeId },
  })}</script><h1 class="EntityCallToAction">“&#55295; &#55296; &#xDFFF; &#xE000; &#1114111;”</h1>`;

  assert.equal(
    parseCanonicalHtml(html, routeId),
    `${String.fromCodePoint(0xd7ff)} &#55296; &#xDFFF; ${String.fromCodePoint(0xe000)} ${String.fromCodePoint(0x10ffff)}`,
  );
});

test('免 OAuth 解析只请求固定 host、禁重定向且不发送 Cookie/Authorization', async () => {
  const calls = [];
  let saved;
  const result = await previewPublicRoute(
    {
      ...deps(async (url, options) => {
        calls.push({ url, options });
        return response(
          url,
          new URL(url).hostname === 'strava-embeds.com' ? embedHtml : canonicalHtml,
        );
      }),
      putPreview: async (_id, value) => {
        saved = value;
      },
    },
    { openid: owner, routeUrl },
    now,
  );
  assert.deepEqual(
    calls.map((call) => call.url),
    [routeUrl, `https://strava-embeds.com/route/${routeId}`],
  );
  for (const call of calls) {
    assert.equal(call.options.redirect, 'manual');
    assert.equal(call.options.headers.cookie, undefined);
    assert.equal(call.options.headers.authorization, undefined);
  }
  assert.equal(result.preview_id, previewId(owner, routeId));
  assert.equal(result.route_name, '周末环湖');
  assert.equal(result.distance_km, 42.5);
  assert.equal(result.elevation_m, 860);
  assert.equal(result.route_outline.length, 3);
  assert.equal(result.elevation_profile.length, 3);
  assert.equal(result.strava_gpx_available, false);
  assert.equal(saved.kind, 'public_strava');
  assert.equal(saved.owner_openid, owner);
});

test('公开路线解析拒绝非管理员、运行时扩展字段和 HTTP 重定向', async () => {
  await assert.rejects(
    previewPublicRoute(
      { ...deps(async () => response(routeUrl, canonicalHtml)), getAdmin: async () => undefined },
      { openid: owner, routeUrl },
      now,
    ),
    { code: 'ADMIN_REQUIRED' },
  );
  await assert.rejects(
    previewPublicRoute(
      deps(async () => response(routeUrl, canonicalHtml)),
      { openid: owner, routeUrl, cookie: 'x' },
      now,
    ),
    { code: 'FORBIDDEN_FIELD' },
  );
  await assert.rejects(
    previewPublicRoute(
      deps(async (url) => response(url, canonicalHtml, { redirected: true })),
      { openid: owner, routeUrl },
      now,
    ),
    { code: 'PUBLIC_ROUTE_UNAVAILABLE' },
  );
});

test('公开路线解析在响应声明或实际内容超限时拒绝', async () => {
  await assert.rejects(
    previewPublicRoute(
      deps(async (url) =>
        response(url, canonicalHtml, {
          headers: { get: () => String(MAX_PUBLIC_ROUTE_HTML_BYTES + 1) },
        }),
      ),
      { openid: owner, routeUrl },
      now,
    ),
    { code: 'PUBLIC_ROUTE_TOO_LARGE' },
  );
});

test('保存活动以可信 public preview 覆盖伪造指标并原子消费', async () => {
  const id = previewId(owner, routeId);
  const summary = {
    external_provider: 'strava',
    external_route_id: routeId,
    external_route_url: routeUrl,
    strava_route_id: routeId,
    strava_route_url: routeUrl,
    route_name: '服务端可信路线',
    distance_km: 42.5,
    elevation_m: 860,
    elevation_loss_m: 800,
    elevation_min_m: 20,
    elevation_max_m: 220,
    estimated_moving_time_seconds: 9000,
    estimation_source: 'cili',
    elevation_profile: [
      { distance_km: 0, elevation_m: 20 },
      { distance_km: 42.5, elevation_m: 60 },
    ],
    route_outline: [
      { latitude: 22, longitude: 114 },
      { latitude: 22.2, longitude: 114.2 },
    ],
    route_bounds: { south: 22, west: 114, north: 22.2, east: 114.2 },
    popular_climbs: [],
    strava_gpx_available: false,
  };
  const preview = {
    _id: id,
    kind: 'public_strava',
    owner_openid: owner,
    summary,
    expires_at: new Date(now.getTime() + 60_000),
    consumed_at: null,
    attached_activity_id: '',
  };
  let written;
  let consumed;
  const result = await saveActivity(
    {
      msgSecCheck: async () => ({ errCode: 0, result: { suggest: 'pass' } }),
      transaction: (work) =>
        work({
          getAdmin: async () => ({ _id: owner, enabled: true }),
          getActivity: async () => undefined,
          getRoutePreviewById: async () => preview,
          consumeRoutePreview: async (...args) => {
            consumed = args;
          },
          createActivityId: async () => 'activity_public',
          putActivity: async (_id, value) => {
            written = value;
          },
          addAudit: async () => {},
        }),
    },
    {
      openid: owner,
      activity: {
        title: '公开路线活动',
        description: '',
        schedule: [],
        notices: [],
        equipment: [],
        status: 'draft',
        route: {
          start: '集合点',
          end: '',
          level: '',
          distance_km: 999,
          elevation_m: 999,
          public_route_preview_id: id,
          external_provider: 'strava',
          external_route_id: routeId,
          external_route_url: routeUrl,
        },
      },
    },
    now,
  );
  assert.equal(result.route.route_name, '服务端可信路线');
  assert.equal(result.route.distance_km, 42.5);
  assert.deepEqual(result.route.route_outline, summary.route_outline);
  assert.equal(written.route.strava_gpx_available, false);
  assert.deepEqual(consumed, [id, 'activity_public', now]);
});
