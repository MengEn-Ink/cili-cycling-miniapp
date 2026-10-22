'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CallbackError,
  decryptSafeMessage,
  parseMediaCheckCallback,
  verifyUrlSignature,
  verifyMessageSignature,
} = require('./callback');

const VECTOR = Object.freeze({
  token: 'AAAAA',
  encodingAesKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  appId: 'wxba5fad812f8e6fb9',
  timestamp: '1714112445',
  nonce: '415670741',
  signature: '046e02f8204d34f8ba5fa3b1db94908f3df2e9b3',
  encrypted:
    '+qdx1OKCy+5JPCBFWw70tm0fJGb2Jmeia4FCB7kao+/Q5c/ohsOzQHi8khUOb05JCpj0JB4RvQMkUyus8TPxLKJGQqcvZqzDpVzazhZv6JsXUnnR8XGT740XgXZUXQ7vJVnAG+tE8NUd4yFyjPy7GgiaviNrlCTj+l5kdfMuFUPpRSrfMZuMcp3Fn2Pede2IuQrKEYwKSqFIZoNqJ4M8EajAsjLY2km32IIjdf8YL/P50F7mStwntrA2cPDrM1kb6mOcfBgRtWygb3VIYnSeOBrebufAlr7F9mFUPAJGj04=',
});

test('official safe-mode vector verifies signature, PKCS#7 and embedded AppID', () => {
  assert.equal(
    verifyMessageSignature(
      VECTOR.token,
      VECTOR.timestamp,
      VECTOR.nonce,
      VECTOR.encrypted,
      VECTOR.signature,
    ),
    true,
  );
  assert.equal(
    decryptSafeMessage(VECTOR.encrypted, VECTOR.encodingAesKey, VECTOR.appId),
    '{"ToUserName":"gh_97417a04a28d","FromUserName":"o9AgO5Kd5ggOC-bXrbNODIiE3bGY","CreateTime":1714112445,"MsgType":"event","Event":"debug_demo","debug_str":"hello world"}',
  );
  assert.throws(
    () => decryptSafeMessage(VECTOR.encrypted, VECTOR.encodingAesKey, 'wx-wrong'),
    (error) => error instanceof CallbackError && error.code === 'CALLBACK_APPID_MISMATCH',
  );
});

test('official URL verification vector checks token, timestamp and nonce only', () => {
  assert.equal(
    verifyUrlSignature(
      'AAAAA',
      '1714036504',
      '1514711492',
      'f464b24fc39322e44b38aa78f5edd27bd1441696',
    ),
    true,
  );
  assert.equal(verifyUrlSignature('AAAAA', '1714036504', '1514711492', '0'.repeat(40)), false);
});

test('media callback rejects bad signatures, debug events and malformed decisions', () => {
  assert.throws(
    () =>
      parseMediaCheckCallback({
        token: VECTOR.token,
        encodingAesKey: VECTOR.encodingAesKey,
        appId: VECTOR.appId,
        timestamp: VECTOR.timestamp,
        nonce: VECTOR.nonce,
        msgSignature: '0'.repeat(40),
        encrypted: VECTOR.encrypted,
      }),
    { code: 'CALLBACK_SIGNATURE_INVALID' },
  );
  assert.throws(
    () =>
      parseMediaCheckCallback({
        token: VECTOR.token,
        encodingAesKey: VECTOR.encodingAesKey,
        appId: VECTOR.appId,
        timestamp: VECTOR.timestamp,
        nonce: VECTOR.nonce,
        msgSignature: VECTOR.signature,
        encrypted: VECTOR.encrypted,
      }),
    { code: 'CALLBACK_EVENT_INVALID' },
  );
});
