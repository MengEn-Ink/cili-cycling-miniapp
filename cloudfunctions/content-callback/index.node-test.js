'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createHandler } = require('./index');
const { sha1Signature } = require('./callback-contract');

const ENV = Object.freeze({
  WECHAT_CALLBACK_TOKEN: 'A'.repeat(32),
  WECHAT_CALLBACK_AES_KEY: 'A'.repeat(43),
  WECHAT_APP_ID: 'wx-test',
});

test('GET URL verification returns echostr only for the official three-part signature', async () => {
  const handler = createHandler({ env: ENV, store: {} });
  const query = {
    timestamp: '1714036504',
    nonce: '1514711492',
    echostr: '4375120948345356249',
  };
  query.signature = sha1Signature(ENV.WECHAT_CALLBACK_TOKEN, query.timestamp, query.nonce);

  const verified = await handler({ httpMethod: 'GET', queryStringParameters: query });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.body, query.echostr);

  const rejected = await handler({
    httpMethod: 'GET',
    queryStringParameters: { ...query, signature: '0'.repeat(40) },
  });
  assert.equal(rejected.statusCode, 403);
  assert.equal(rejected.body, 'forbidden');
});

test('HTTP safe-mode callback passes only verified decision into transactional consumer', async () => {
  const calls = [];
  const handler = createHandler({
    env: ENV,
    store: {},
    parseCallback: (value) => {
      calls.push(['parse', value]);
      return { traceId: 'trace-1', suggest: 'pass', detail: [] };
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
  assert.deepEqual(calls[1], ['apply', { traceId: 'trace-1', suggest: 'pass', detail: [] }]);
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
    parseCallback: () => ({ traceId: 'trace-1', suggest: 'pass', detail: [] }),
    applyDecision: async () => {
      throw failure('CALLBACK_TRACE_NOT_READY', true);
    },
  });
  assert.equal((await notReady(baseEvent)).statusCode, 503);

  const storageFault = createHandler({
    env: ENV,
    store: {},
    parseCallback: () => ({ traceId: 'trace-1', suggest: 'pass', detail: [] }),
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
