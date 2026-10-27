'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createHandler } = require('./index');

const ENV = Object.freeze({
  WECHAT_CALLBACK_TOKEN: 'A'.repeat(32),
  WECHAT_CALLBACK_AES_KEY: 'A'.repeat(43),
  WECHAT_APP_ID: 'wx-test',
});
const OFFICIAL_URL_VECTOR = Object.freeze({
  env: {
    WECHAT_CALLBACK_TOKEN: ['QD', 'G6eK'].join(''),
    WECHAT_CALLBACK_AES_KEY: ['jWmYm7qr5nMo', 'AUwZRjGtBxmz', '3KA1tkAj3ykk', 'R6q2B2C'].join(''),
    WECHAT_APP_ID: 'wx5823bf96d3bd56c7',
  },
  query: {
    msg_signature: '5c45ff5e21c57e6ad56bac8758b79b1d9ac89fd3',
    timestamp: '1409659589',
    nonce: '263014780',
    echostr:
      'P9nAzCzyDtyTWESHep1vC5X9xho/qYX3Zpb4yKa9SKld1DsH3Iyt3tP3zNdtp+4RPcs8TgAE7OaBO+FZXvnaqQ==',
  },
  plaintext: '1616140317555161061',
});

test('GET URL verification validates and decrypts the published safe-mode vector', async () => {
  const handler = createHandler({ env: OFFICIAL_URL_VECTOR.env, store: {} });
  const verified = await handler({
    httpMethod: 'GET',
    queryStringParameters: OFFICIAL_URL_VECTOR.query,
  });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.body, OFFICIAL_URL_VECTOR.plaintext);

  const wrongSignature = await handler({
    httpMethod: 'GET',
    queryStringParameters: { ...OFFICIAL_URL_VECTOR.query, msg_signature: '0'.repeat(40) },
  });
  assert.equal(wrongSignature.statusCode, 403);
  assert.equal(wrongSignature.body, 'bad request');

  const legacySignature = await handler({
    httpMethod: 'GET',
    queryStringParameters: {
      ...OFFICIAL_URL_VECTOR.query,
      msg_signature: undefined,
      signature: 'x',
    },
  });
  assert.equal(legacySignature.statusCode, 400);
});

test('GET safe-mode URL verification rejects an AppID mismatch', async () => {
  const handler = createHandler({
    env: { ...OFFICIAL_URL_VECTOR.env, WECHAT_APP_ID: 'wx-not-the-vector-app' },
    store: {},
  });
  const rejected = await handler({
    httpMethod: 'GET',
    queryStringParameters: OFFICIAL_URL_VECTOR.query,
  });
  assert.equal(rejected.statusCode, 400);
  assert.equal(rejected.body, 'bad request');
});

test('HTTP safe-mode callback passes only verified decision into transactional consumer', async () => {
  const calls = [];
  const handler = createHandler({
    env: ENV,
    store: {},
    parseCallback: (value) => {
      calls.push(['parse', value]);
      return { traceId: 'trace-1', outcome: 'decision', suggest: 'pass', detail: [] };
    },
    applyDecision: async (_store, decision) => {
      calls.push(['apply', decision]);
      return { status: 'pass' };
    },
  });
  const response = await handler({
    httpMethod: 'POST',
    queryStringParameters: {
      timestamp: '1714112445',
      nonce: '415670741',
      msg_signature: 'a'.repeat(40),
    },
    body: JSON.stringify({ Encrypt: 'public-ciphertext' }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'success');
  assert.equal(calls[0][0], 'parse');
  assert.equal(calls[0][1].encrypted, 'public-ciphertext');
  assert.deepEqual(calls[1], [
    'apply',
    { traceId: 'trace-1', outcome: 'decision', suggest: 'pass', detail: [] },
  ]);
});

test('verification failures are 4xx while retryable races and storage faults remain 5xx', async () => {
  const failure = (code, retryable = false) => {
    const error = new Error(code);
    error.code = code;
    error.retryable = retryable;
    return error;
  };
  const baseEvent = {
    httpMethod: 'POST',
    queryStringParameters: {
      timestamp: '1714112445',
      nonce: '415670741',
      msg_signature: 'a'.repeat(40),
    },
    body: JSON.stringify({ Encrypt: 'public-ciphertext' }),
  };

  const rejected = createHandler({
    env: ENV,
    store: {},
    parseCallback: () => {
      throw failure('CALLBACK_SIGNATURE_INVALID');
    },
  });
  assert.equal((await rejected(baseEvent)).statusCode, 400);

  const notReady = createHandler({
    env: ENV,
    store: {},
    parseCallback: () => ({ traceId: 'trace-1', outcome: 'decision', suggest: 'pass', detail: [] }),
    applyDecision: async () => {
      throw failure('CALLBACK_TRACE_NOT_READY', true);
    },
  });
  assert.equal((await notReady(baseEvent)).statusCode, 503);

  const storageFault = createHandler({
    env: ENV,
    store: {},
    parseCallback: () => ({ traceId: 'trace-1', outcome: 'decision', suggest: 'pass', detail: [] }),
    applyDecision: async () => {
      throw new Error('database unavailable');
    },
  });
  assert.equal((await storageFault(baseEvent)).statusCode, 500);
});

test('ordinary cloud events and missing callback secrets cannot masquerade as decisions', async () => {
  let decisions = 0;
  const applyDecision = async () => {
    decisions += 1;
  };
  const configured = createHandler({
    env: ENV,
    store: {},
    parseCallback: () => ({ traceId: 'forged', suggest: 'pass', detail: [] }),
    applyDecision,
  });
  assert.equal(
    (await configured({ Event: 'wxa_media_check', trace_id: 'forged' })).statusCode,
    405,
  );
  const unconfigured = createHandler({
    env: {},
    store: {},
    parseCallback: () => ({ traceId: 'forged', suggest: 'pass', detail: [] }),
    applyDecision,
  });
  assert.equal(
    (
      await unconfigured({
        httpMethod: 'POST',
        queryStringParameters: {},
        body: '{}',
      })
    ).statusCode,
    503,
  );
  assert.equal(decisions, 0);
});
