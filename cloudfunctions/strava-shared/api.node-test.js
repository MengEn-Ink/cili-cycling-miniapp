'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { requestJson } = require('./api');
test('HTTP 失败会有限重试并最终成功', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return calls < 3 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ ok: true }) };
  };
  try {
    assert.deepEqual(await requestJson('https://example.test', {}, 2, 100), { ok: true });
    assert.equal(calls, 3);
  } finally {
    global.fetch = original;
  }
});
test('HTTP 客户端在有限重试后返回安全错误', async () => {
  const original = global.fetch;
  global.fetch = async () => {
    throw new Error('network secret detail');
  };
  try {
    await assert.rejects(requestJson('https://example.test', {}, 1, 100), {
      code: 'STRAVA_API_FAILED',
      message: 'Strava API 暂时不可用',
    });
  } finally {
    global.fetch = original;
  }
});
