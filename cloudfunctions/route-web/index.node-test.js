'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('./index');

test('数字路线 ID 渲染 Strava 官方 Embed 与直接查看兜底', async () => {
  const response = await main({
    path: '/route/embed',
    queryStringParameters: { id: '42' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(response.body, /class="strava-embed-placeholder"/);
  assert.match(response.body, /data-embed-type="route"/);
  assert.match(response.body, /data-embed-id="42"/);
  assert.match(response.body, /src="https:\/\/strava-embeds\.com\/embed\.js"/);
  assert.match(response.body, /href="https:\/\/www\.strava\.com\/routes\/42"/);
  assert.match(response.body, />在 Strava 查看</);
  assert.doesNotMatch(response.body, /fetch\s*\(|XMLHttpRequest|api\/v3|__NEXT_DATA__/);
});

test('响应限制脚本来源且不允许缓存用户数据', async () => {
  const response = await main({
    path: '/route/embed',
    queryStringParameters: { id: '3401678123456789012' },
  });

  assert.match(
    response.headers['content-security-policy'],
    /script-src https:\/\/strava-embeds\.com/,
  );
  assert.match(response.headers['content-security-policy'], /object-src 'none'/);
  assert.match(response.headers['content-security-policy'], /base-uri 'none'/);
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['cache-control'], 'public, max-age=300');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
});

test('拒绝零、超长、带路径或非数字路线 ID', async () => {
  for (const id of ['', '0', '01', 'abc', '42/extra', '1'.repeat(21)]) {
    const response = await main({
      path: '/route/embed',
      queryStringParameters: { id },
    });
    assert.equal(response.statusCode, 400, id);
    assert.doesNotMatch(response.body, /strava-embed-placeholder/, id);
  }
});

test('未知路径返回 404 且不渲染 Embed', async () => {
  const response = await main({
    path: '/strava/callback',
    queryStringParameters: { id: '42' },
  });

  assert.equal(response.statusCode, 404);
  assert.doesNotMatch(response.body, /strava-embed-placeholder/);
});

test('CloudBase 声明公开 route-web 函数与固定 Embed 网关路径', () => {
  const config = require('../../cloudbaserc.json');
  assert.equal(
    config.functions.some((item) => item.name === 'route-web' && item.handler === 'index.main'),
    true,
  );
  assert.deepEqual(
    config.gateway.routes.find((item) => item.path === '/route/embed'),
    {
      path: '/route/embed',
      target: 'function:route-web',
      enableAuth: false,
      enablePathTransmission: true,
      domain: '*',
    },
  );
});
