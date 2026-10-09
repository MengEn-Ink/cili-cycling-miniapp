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

test('GPX 客户端支持 fetch 注入并限制响应为 4MB', async () => {
  const { requestGpx, MAX_GPX_BYTES } = require('./api');
  const headers = { get: () => null };
  await assert.rejects(
    requestGpx('https://example.test/route.gpx', 'token', {
      fetchImpl: async () => ({
        ok: true,
        headers,
        arrayBuffer: async () => Buffer.alloc(MAX_GPX_BYTES + 1),
      }),
    }),
    { code: 'GPX_TOO_LARGE' },
  );
});

test('429 不重试并保留 rate-limit 语义', async () => {
  let calls = 0;
  await assert.rejects(
    requestJson('https://example.test', {}, 2, 100, async () => {
      calls += 1;
      return { ok: false, status: 429 };
    }),
    { code: 'STRAVA_RATE_LIMITED' },
  );
  assert.equal(calls, 1);
});

test('JSON 响应体读取超时会中止请求并返回安全错误', async () => {
  let aborted = false;
  await assert.rejects(
    requestJson('https://example.test', {}, 0, 20, async (_url, options) => ({
      ok: true,
      json: () =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            aborted = true;
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    })),
    { code: 'STRAVA_API_FAILED', message: 'Strava API 暂时不可用' },
  );
  assert.equal(aborted, true);
});

test('JSON 响应体解析失败保留响应无效语义且不重试', async () => {
  let calls = 0;
  await assert.rejects(
    requestJson('https://example.test', {}, 2, 100, async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => {
          throw new SyntaxError('invalid json');
        },
      };
    }),
    { code: 'STRAVA_API_INVALID' },
  );
  assert.equal(calls, 1);
});

test('当前骑手资料使用 /athlete 与 Bearer token 请求官方接口', async () => {
  const { createStravaApi } = require('./api');
  let captured;
  const api = createStravaApi(async (url, options) => {
    captured = { url: String(url), options };
    return { ok: true, json: async () => ({ id: 42, created_at: '2019-05-18T09:30:00Z' }) };
  });

  const result = await api.athlete('access-token');

  assert.equal(captured.url, 'https://www.strava.com/api/v3/athlete');
  assert.equal(captured.options.headers.authorization, 'Bearer access-token');
  assert.equal(result.created_at, '2019-05-18T09:30:00Z');
});

test('累计骑行统计使用 athlete id 与 Bearer token 请求官方接口', async () => {
  const { createStravaApi } = require('./api');
  let captured;
  const api = createStravaApi(async (url, options) => {
    captured = { url: String(url), options };
    return { ok: true, json: async () => ({ all_ride_totals: { count: 1 } }) };
  });

  await api.athleteStats('access-token', '42');

  assert.equal(captured.url, 'https://www.strava.com/api/v3/athletes/42/stats');
  assert.equal(captured.options.headers.authorization, 'Bearer access-token');
});
