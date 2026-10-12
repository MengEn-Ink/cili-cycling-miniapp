'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('./index');

test('status 内部失败记录脱敏阶段诊断且保持通用客户端错误', async () => {
  assert.equal(typeof createHandler, 'function', 'createHandler must exist');

  const logs = [];
  const handler = createHandler({
    getOpenId: () => 'user-1',
    cleanup: async () => {
      throw Object.assign(new Error('query leaked openid=user-1 token=secret-token'), {
        errCode: -502001,
      });
    },
    readinessStore: {
      readReadiness: () => assert.fail('cleanup 失败后不得继续读取 readiness'),
    },
    logger: { error: (...parts) => logs.push(parts) },
  });

  const result = await handler({ action: 'status' });

  assert.deepEqual(result, {
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' },
  });
  assert.deepEqual(logs, [
    [
      'strava_auth_failed',
      {
        action: 'status',
        stage: 'cleanup-expired-states',
        code: '-502001',
      },
    ],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /user-1|secret-token|query leaked/);
});

test('publicRoutePreview 仅校验管理员且不要求 OAuth 凭证', async () => {
  let requested;
  const handler = createHandler({
    getOpenId: () => 'admin-1',
    readinessStore: {
      getAdmin: async () => ({ _id: 'admin-1', enabled: true }),
      getCredential: () => assert.fail('公开路线解析不得读取 OAuth 凭证'),
    },
    publicRoutePreview: async (input) => {
      requested = input;
      return {
        strava_route_id: '42',
        strava_route_url: 'https://www.strava.com/routes/42',
        route_name: '周末环湖',
      };
    },
  });

  const result = await handler({
    action: 'publicRoutePreview',
    routeUrl: 'https://www.strava.com/routes/42',
  });

  assert.deepEqual(requested, { routeUrl: 'https://www.strava.com/routes/42' });
  assert.equal(result.ok, true);
  assert.equal(result.data.route_name, '周末环湖');
});

test('publicRoutePreview 拒绝非管理员', async () => {
  const handler = createHandler({
    getOpenId: () => 'member-1',
    readinessStore: { getAdmin: async () => null },
    publicRoutePreview: () => assert.fail('非管理员不得发起公开路线抓取'),
  });

  const result = await handler({
    action: 'publicRoutePreview',
    routeUrl: 'https://www.strava.com/routes/42',
  });
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'ADMIN_REQUIRED', message: '仅管理员可以同步 Strava 路线' },
  });
});
