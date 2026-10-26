'use strict';

const crypto = require('node:crypto');

class CallbackError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CallbackError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CallbackError(code, message);
}

function sha1Signature(...parts) {
  return crypto.createHash('sha1').update(parts.map(String).sort().join('')).digest('hex');
}

function signaturesEqual(expected, supplied) {
  if (typeof supplied !== 'string' || !/^[a-f0-9]{40}$/iu.test(supplied)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

function verifyUrlSignature(token, timestamp, nonce, signature) {
  if (![token, timestamp, nonce].every((value) => typeof value === 'string' && value)) return false;
  return signaturesEqual(sha1Signature(token, timestamp, nonce), signature);
}

function verifyMessageSignature(token, timestamp, nonce, encrypted, signature) {
  if (![token, timestamp, nonce, encrypted].every((value) => typeof value === 'string' && value))
    return false;
  return signaturesEqual(sha1Signature(token, timestamp, nonce, encrypted), signature);
}

function aesKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}$/u.test(value))
    fail('CALLBACK_CONFIG_INVALID', 'Invalid callback AES configuration');
  return Buffer.from(`${value}=`, 'base64');
}

function removePkcs7(bytes) {
  if (!bytes.length) fail('CALLBACK_DECRYPT_INVALID', 'Invalid callback ciphertext');
  const padding = bytes.at(-1);
  if (padding < 1 || padding > 32 || bytes.length < padding)
    fail('CALLBACK_DECRYPT_INVALID', 'Invalid callback ciphertext');
  if (
    !crypto.timingSafeEqual(bytes.subarray(bytes.length - padding), Buffer.alloc(padding, padding))
  )
    fail('CALLBACK_DECRYPT_INVALID', 'Invalid callback ciphertext');
  return bytes.subarray(0, bytes.length - padding);
}

function decryptSafeMessage(encrypted, encodingAesKey, expectedAppId) {
  if (
    typeof encrypted !== 'string' ||
    !encrypted ||
    typeof expectedAppId !== 'string' ||
    !expectedAppId
  )
    fail('CALLBACK_INPUT_INVALID', 'Invalid callback parameters');
  let plaintext;
  try {
    const key = aesKey(encodingAesKey);
    const ciphertext = Buffer.from(encrypted, 'base64');
    if (ciphertext.toString('base64') !== encrypted)
      fail('CALLBACK_DECRYPT_INVALID', 'Invalid callback ciphertext');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
    decipher.setAutoPadding(false);
    plaintext = removePkcs7(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  } catch (error) {
    if (error instanceof CallbackError) throw error;
    fail('CALLBACK_DECRYPT_INVALID', 'Invalid callback ciphertext');
  }
  if (plaintext.length < 20) fail('CALLBACK_DECRYPT_INVALID', 'Invalid callback ciphertext');
  const messageLength = plaintext.readUInt32BE(16);
  const messageEnd = 20 + messageLength;
  if (messageLength < 2 || messageEnd > plaintext.length)
    fail('CALLBACK_DECRYPT_INVALID', 'Invalid callback ciphertext');
  const expected = Buffer.from(expectedAppId);
  const actual = plaintext.subarray(messageEnd);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual))
    fail('CALLBACK_APPID_MISMATCH', 'Callback AppID mismatch');
  return plaintext.subarray(20, messageEnd).toString('utf8');
}

function parseMediaCheckCallback({
  token,
  encodingAesKey,
  appId,
  timestamp,
  nonce,
  msgSignature,
  encrypted,
}) {
  if (!verifyMessageSignature(token, timestamp, nonce, encrypted, msgSignature))
    fail('CALLBACK_SIGNATURE_INVALID', 'Invalid callback signature');
  let payload;
  try {
    payload = JSON.parse(decryptSafeMessage(encrypted, encodingAesKey, appId));
  } catch (error) {
    if (error instanceof CallbackError) throw error;
    fail('CALLBACK_PAYLOAD_INVALID', 'Invalid callback payload');
  }
  if (
    payload?.MsgType !== 'event' ||
    payload?.Event !== 'wxa_media_check' ||
    payload?.appid !== appId
  )
    fail('CALLBACK_EVENT_INVALID', 'Invalid callback event');
  const traceId = typeof payload.trace_id === 'string' ? payload.trace_id.trim() : '';
  const errorCode = payload.errcode;
  if (
    !traceId ||
    traceId.length > 128 ||
    !Number.isInteger(payload.version) ||
    payload.version !== 2 ||
    !Number.isInteger(errorCode) ||
    (errorCode !== 0 && errorCode !== -1008)
  )
    fail('CALLBACK_DECISION_INVALID', 'Invalid callback decision');
  if (errorCode === -1008) return { traceId, outcome: 'retryable', errorCode };
  const suggest = payload?.result?.suggest;
  if (!['pass', 'review', 'risky'].includes(suggest))
    fail('CALLBACK_DECISION_INVALID', 'Invalid callback decision');
  return {
    traceId,
    outcome: 'decision',
    suggest,
    detail: Array.isArray(payload.detail) ? payload.detail : [],
  };
}

module.exports = {
  CallbackError,
  decryptSafeMessage,
  parseMediaCheckCallback,
  sha1Signature,
  verifyUrlSignature,
  verifyMessageSignature,
};
