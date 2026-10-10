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
