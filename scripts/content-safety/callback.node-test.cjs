'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const KEY = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const CONFIG = Object.freeze({
  token: 'synthetic-cili-callback-token',
  encodingAesKey: KEY.toString('base64').slice(0, -1),
  appId: `wx${'1'.repeat(16)}`,
  timestamp: '1793000000',
  nonce: 'synthetic-nonce',
});
const PASS = Object.freeze({
  MsgType: 'event',
  Event: 'wxa_media_check',
  appid: CONFIG.appId,
  trace_id: 'trace-1',
  version: 2,
  errcode: 0,
  result: { suggest: 'pass' },
});

// The optional override runs the same synthetic fixtures against a read-only source module.
const contract = () => require(process.env.CILI_CALLBACK_CONTRACT || './callback.cjs');
const signature = (...parts) =>
  crypto.createHash('sha1').update(parts.map(String).sort().join('')).digest('hex');

function messageFrame(message, embeddedAppId = CONFIG.appId) {
  const bytes = Buffer.from(message);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([Buffer.alloc(16, 0x5a), length, bytes, Buffer.from(embeddedAppId)]);
}

function padded(bytes) {
  const padding = 32 - (bytes.length % 32);
  return Buffer.concat([bytes, Buffer.alloc(padding, padding)]);
}

function signedCiphertext(encrypted) {
  return {
    ...CONFIG,
    encrypted,
    msgSignature: signature(CONFIG.token, CONFIG.timestamp, CONFIG.nonce, encrypted),
  };
}

function safeEnvelope(payload = PASS, options = {}) {
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, KEY.subarray(0, 16));
  cipher.setAutoPadding(false);
  const plaintext =
    options.plaintext ||
    padded(messageFrame(options.message ?? JSON.stringify(payload), options.embeddedAppId));
  return signedCiphertext(
    Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64'),
  );
}

function expectCode(work, code) {
  const { CallbackError } = contract();
  assert.throws(work, (error) => error instanceof CallbackError && error.code === code);
}

const OFFICIAL_URL_VECTOR = Object.freeze({
  token: ['QD', 'G6eK'].join(''),
  encodingAesKey: ['jWmYm7qr5nMo', 'AUwZRjGtBxmz', '3KA1tkAj3ykk', 'R6q2B2C'].join(''),
  appId: 'wx5823bf96d3bd56c7',
  timestamp: '1409659589',
  nonce: '263014780',
  msgSignature: '5c45ff5e21c57e6ad56bac8758b79b1d9ac89fd3',
  encryptedEcho:
    'P9nAzCzyDtyTWESHep1vC5X9xho/qYX3Zpb4yKa9SKld1DsH3Iyt3tP3zNdtp+4RPcs8TgAE7OaBO+FZXvnaqQ==',
});

test('published safe-mode URL vector verifies, decrypts, and binds the AppID', () => {
  assert.equal(contract().parseEncryptedEcho(OFFICIAL_URL_VECTOR), '1616140317555161061');
  expectCode(
    () =>
      contract().parseEncryptedEcho({
        ...OFFICIAL_URL_VECTOR,
        msgSignature: '0'.repeat(40),
      }),
    'CALLBACK_SIGNATURE_INVALID',
  );
  expectCode(
    () =>
      contract().parseEncryptedEcho({
        ...OFFICIAL_URL_VECTOR,
        appId: 'wx-not-the-vector-app',
      }),
    'CALLBACK_APPID_MISMATCH',
  );
});

test('safe-mode URL verification rejects authenticated malformed ciphertext', () => {
  const encryptedEcho = 'AAAA';
  expectCode(
    () =>
      contract().parseEncryptedEcho({
        ...OFFICIAL_URL_VECTOR,
        encryptedEcho,
        msgSignature: signature(
          OFFICIAL_URL_VECTOR.token,
          OFFICIAL_URL_VECTOR.timestamp,
          OFFICIAL_URL_VECTOR.nonce,
          encryptedEcho,
        ),
      }),
    'CALLBACK_DECRYPT_INVALID',
  );
});

test('authenticated download failure without result is retryable', () => {
  const { result: _result, ...payload } = PASS;
  assert.deepEqual(
    contract().parseMediaCheckCallback(safeEnvelope({ ...payload, errcode: -1008 })),
    { traceId: 'trace-1', outcome: 'retryable', errorCode: -1008 },
  );
});

test('authenticated download failure never uses a supplied pass result', () => {
  assert.deepEqual(contract().parseMediaCheckCallback(safeEnvelope({ ...PASS, errcode: -1008 })), {
    traceId: 'trace-1',
    outcome: 'retryable',
    errorCode: -1008,
  });
});

for (const suggest of ['pass', 'review', 'risky']) {
  test(`authenticated v2 ${suggest} returns only the decision union`, () => {
    const detail = [{ strategy: 'synthetic', suggest }];
    assert.deepEqual(
      contract().parseMediaCheckCallback(safeEnvelope({ ...PASS, result: { suggest }, detail })),
      { traceId: 'trace-1', outcome: 'decision', suggest, detail },
    );
  });
}

for (const [label, patch] of [
  ['string errcode zero', { errcode: '0' }],
  ['string version two', { version: '2' }],
  ['string download error', { errcode: '-1008' }],
  ['null errcode', { errcode: null }],
  ['boolean errcode', { errcode: false }],
  ['missing errcode', { errcode: undefined }],
  ['fractional errcode', { errcode: 0.5 }],
  ['unknown error with pass', { errcode: -1 }],
  ['unknown positive error with pass', { errcode: 44991 }],
  ['null version', { version: null }],
  ['missing version', { version: undefined }],
  ['wrong version', { version: 1 }],
  ['fractional version', { version: 2.5 }],
  ['retryable string version', { version: '2', errcode: -1008 }],
  ['missing trace', { trace_id: undefined }],
  ['numeric trace', { trace_id: 1 }],
  ['empty trace', { trace_id: '' }],
  ['blank trace', { trace_id: '  ' }],
  ['oversized trace', { trace_id: 't'.repeat(129) }],
  ['retryable missing trace', { trace_id: undefined, errcode: -1008 }],
  ['missing result', { result: undefined }],
  ['null result', { result: null }],
  ['empty result', { result: {} }],
  ['unknown suggest', { result: { suggest: 'unknown' } }],
  ['wrong case suggest', { result: { suggest: 'Pass' } }],
]) {
  test(`media callback rejects ${label}`, () => {
    expectCode(
      () => contract().parseMediaCheckCallback(safeEnvelope({ ...PASS, ...patch })),
      'CALLBACK_DECISION_INVALID',
    );
  });
}

test('trace normalization retains the 128-character boundary', () => {
  const traceId = 't'.repeat(128);
  assert.equal(
    contract().parseMediaCheckCallback(safeEnvelope({ ...PASS, trace_id: ` ${traceId} ` })).traceId,
    traceId,
  );
});

for (const detail of [undefined, null, 'not-an-array', {}]) {
  test(`non-array detail ${JSON.stringify(detail)} remains an empty diagnostic array`, () => {
    assert.deepEqual(
      contract().parseMediaCheckCallback(safeEnvelope({ ...PASS, detail })).detail,
      [],
    );
  });
}

for (const [label, patch] of [
  ['wrong MsgType', { MsgType: 'text' }],
  ['wrong Event', { Event: 'debug_demo' }],
  ['wrong payload AppID', { appid: `wx${'2'.repeat(16)}` }],
  ['missing payload AppID', { appid: undefined }],
  ['retryable wrong Event', { Event: 'debug_demo', errcode: -1008 }],
  ['retryable wrong payload AppID', { appid: `wx${'2'.repeat(16)}`, errcode: -1008 }],
]) {
  test(`media callback rejects ${label}`, () => {
    expectCode(
      () => contract().parseMediaCheckCallback(safeEnvelope({ ...PASS, ...patch })),
      'CALLBACK_EVENT_INVALID',
    );
  });
}

for (const value of [null, [], 0, 'event']) {
  test(`authenticated non-event JSON ${JSON.stringify(value)} is rejected`, () => {
    expectCode(
      () =>
        contract().parseMediaCheckCallback(
          safeEnvelope(value, { message: `${JSON.stringify(value)} ` }),
        ),
      'CALLBACK_EVENT_INVALID',
    );
  });
}

test('authenticated invalid JSON is rejected without exposing plaintext', () => {
  expectCode(
    () => contract().parseMediaCheckCallback(safeEnvelope(PASS, { message: 'private-not-json' })),
    'CALLBACK_PAYLOAD_INVALID',
  );
});

test('embedded AppID is independently verified before parsing an authenticated retryable event', () => {
  expectCode(
    () =>
      contract().parseMediaCheckCallback(
        safeEnvelope({ ...PASS, errcode: -1008 }, { embeddedAppId: `wx${'2'.repeat(16)}` }),
      ),
    'CALLBACK_APPID_MISMATCH',
  );
});

test('a shorter embedded AppID is rejected', () => {
  expectCode(
    () => contract().parseMediaCheckCallback(safeEnvelope(PASS, { embeddedAppId: 'wx-short' })),
    'CALLBACK_APPID_MISMATCH',
  );
});

test('signature rejection precedes decryption and retryable classification', () => {
  for (const msgSignature of ['0'.repeat(40), '', 'bad', null]) {
    expectCode(
      () =>
        contract().parseMediaCheckCallback({
          ...safeEnvelope({ ...PASS, errcode: -1008 }),
          encodingAesKey: 'invalid',
          msgSignature,
        }),
      'CALLBACK_SIGNATURE_INVALID',
    );
  }
});

test('safe message AES-CBC round trip returns exact JSON bytes', () => {
  const { encrypted } = safeEnvelope();
  assert.equal(
    contract().decryptSafeMessage(encrypted, CONFIG.encodingAesKey, CONFIG.appId),
    JSON.stringify(PASS),
  );
});

for (const [label, change] of [
  [
    'zero padding',
    (bytes) => {
      bytes[bytes.length - 1] = 0;
    },
  ],
  [
    'padding above 32',
    (bytes) => {
      bytes[bytes.length - 1] = 33;
    },
  ],
  [
    'mismatched padding bytes',
    (bytes) => {
      bytes[bytes.length - 2] ^= 1;
    },
  ],
]) {
  test(`authenticated ${label} is rejected`, () => {
    const plaintext = padded(messageFrame(JSON.stringify(PASS)));
    change(plaintext);
    expectCode(
      () => contract().parseMediaCheckCallback(safeEnvelope(PASS, { plaintext })),
      'CALLBACK_DECRYPT_INVALID',
    );
  });
}

for (const [label, plaintext] of [
  ['short header', padded(Buffer.alloc(1))],
  ['empty message', padded(messageFrame(''))],
  [
    'oversized message length',
    (() => {
      const bytes = messageFrame('{}');
      bytes.writeUInt32BE(0xffffffff, 16);
      return padded(bytes);
    })(),
  ],
]) {
  test(`authenticated ${label} is rejected`, () => {
    expectCode(
      () => contract().parseMediaCheckCallback(safeEnvelope(PASS, { plaintext })),
      'CALLBACK_DECRYPT_INVALID',
    );
  });
}

test('PKCS#7 full 32-byte padding is accepted', () => {
  const message = JSON.stringify(PASS);
  const extra = (32 - (messageFrame(message).length % 32)) % 32;
  const aligned = `${message}${' '.repeat(extra)}`;
  assert.equal(messageFrame(aligned).length % 32, 0);
  assert.equal(
    contract().parseMediaCheckCallback(safeEnvelope(PASS, { message: aligned })).suggest,
    'pass',
  );
});

for (const encrypted of ['!!!', 'AAAA', `${safeEnvelope().encrypted}!`]) {
  test(`authenticated malformed ciphertext ${encrypted.slice(0, 8)} is rejected`, () => {
    expectCode(
      () => contract().parseMediaCheckCallback(signedCiphertext(encrypted)),
      'CALLBACK_DECRYPT_INVALID',
    );
  });
}

for (const encodingAesKey of [null, '', 'a'.repeat(42), '!'.repeat(43)]) {
  test(`invalid AES configuration ${JSON.stringify(encodingAesKey)} is rejected`, () => {
    expectCode(
      () => contract().parseMediaCheckCallback({ ...safeEnvelope(), encodingAesKey }),
      'CALLBACK_CONFIG_INVALID',
    );
  });
}

test('decrypt requires nonempty ciphertext and expected AppID', () => {
  for (const [encrypted, appId] of [
    ['', CONFIG.appId],
    [null, CONFIG.appId],
    [safeEnvelope().encrypted, ''],
  ]) {
    expectCode(
      () => contract().decryptSafeMessage(encrypted, CONFIG.encodingAesKey, appId),
      'CALLBACK_INPUT_INVALID',
    );
  }
});

test('SHA1 signature sorts parts and accepts uppercase hexadecimal signatures', () => {
  const { sha1Signature, verifyUrlSignature, verifyMessageSignature } = contract();
  assert.equal(sha1Signature('b', 'a', 9), crypto.createHash('sha1').update('9ab').digest('hex'));
  const urlSignature = signature(CONFIG.token, CONFIG.timestamp, CONFIG.nonce);
  assert.equal(
    verifyUrlSignature(CONFIG.token, CONFIG.timestamp, CONFIG.nonce, urlSignature),
    true,
  );
  const envelope = safeEnvelope();
  assert.equal(
    verifyMessageSignature(
      CONFIG.token,
      CONFIG.timestamp,
      CONFIG.nonce,
      envelope.encrypted,
      envelope.msgSignature.toUpperCase(),
    ),
    true,
  );
});

test('URL and message signatures reject tampered parts and missing inputs', () => {
  const { verifyUrlSignature, verifyMessageSignature } = contract();
  const urlSignature = signature(CONFIG.token, CONFIG.timestamp, CONFIG.nonce);
  for (const token of ['', null, 'different-token']) {
    assert.equal(verifyUrlSignature(token, CONFIG.timestamp, CONFIG.nonce, urlSignature), false);
    const envelope = safeEnvelope();
    assert.equal(
      verifyMessageSignature(
        token,
        CONFIG.timestamp,
        CONFIG.nonce,
        envelope.encrypted,
        envelope.msgSignature,
      ),
      false,
    );
  }
  assert.equal(verifyUrlSignature(CONFIG.token, '', CONFIG.nonce, urlSignature), false);
  assert.equal(verifyUrlSignature(CONFIG.token, CONFIG.timestamp, '', urlSignature), false);
  assert.equal(
    verifyUrlSignature(CONFIG.token, CONFIG.timestamp, CONFIG.nonce, '0'.repeat(40)),
    false,
  );
  assert.equal(verifyUrlSignature(CONFIG.token, CONFIG.timestamp, CONFIG.nonce, 'bad'), false);
  const envelope = safeEnvelope();
  assert.equal(
    verifyMessageSignature(CONFIG.token, CONFIG.timestamp, CONFIG.nonce, '', envelope.msgSignature),
    false,
  );
  assert.equal(
    verifyMessageSignature(
      CONFIG.token,
      CONFIG.timestamp,
      'different-nonce',
      envelope.encrypted,
      envelope.msgSignature,
    ),
    false,
  );
});
