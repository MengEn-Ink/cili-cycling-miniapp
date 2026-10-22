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
  const expectedBytes = Buffer.from(expected, 'hex');
  const suppliedBytes = Buffer.from(supplied.toLowerCase(), 'hex');
  return (
    expectedBytes.length === suppliedBytes.length &&
    crypto.timingSafeEqual(expectedBytes, suppliedBytes)
  );
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
    fail('CALLBACK_CONFIG_INVALID', '回调解密配置无效');
  const key = Buffer.from(`${value}=`, 'base64');
  if (key.length !== 32) fail('CALLBACK_CONFIG_INVALID', '回调解密配置无效');
  return key;
}
function removePkcs7(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) fail('CALLBACK_DECRYPT_INVALID', '回调密文无效');
  const padding = bytes.at(-1);
  if (padding < 1 || padding > 32 || bytes.length < padding)
    fail('CALLBACK_DECRYPT_INVALID', '回调密文无效');
  if (
    !crypto.timingSafeEqual(bytes.subarray(bytes.length - padding), Buffer.alloc(padding, padding))
  )
    fail('CALLBACK_DECRYPT_INVALID', '回调密文无效');
  return bytes.subarray(0, bytes.length - padding);
}
function decryptSafeMessage(encrypted, encodingAesKey, expectedAppId) {
  if (
    typeof encrypted !== 'string' ||
    !encrypted ||
    typeof expectedAppId !== 'string' ||
    !expectedAppId
  )
    fail('CALLBACK_INPUT_INVALID', '回调参数无效');
  let plaintext;
  try {
    const key = aesKey(encodingAesKey);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
    decipher.setAutoPadding(false);
    plaintext = removePkcs7(
      Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]),
    );
  } catch (error) {
    if (error instanceof CallbackError) throw error;
    fail('CALLBACK_DECRYPT_INVALID', '回调密文无效');
  }
  if (plaintext.length < 20) fail('CALLBACK_DECRYPT_INVALID', '回调密文无效');
  const messageLength = plaintext.readUInt32BE(16);
  const messageEnd = 20 + messageLength;
  if (messageLength < 2 || messageEnd > plaintext.length)
    fail('CALLBACK_DECRYPT_INVALID', '回调密文无效');
  const expected = Buffer.from(expectedAppId);
  const actual = plaintext.subarray(messageEnd);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual))
    fail('CALLBACK_APPID_MISMATCH', '回调应用身份不匹配');
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
    fail('CALLBACK_SIGNATURE_INVALID', '回调签名无效');
  let payload;
  try {
    payload = JSON.parse(decryptSafeMessage(encrypted, encodingAesKey, appId));
  } catch (error) {
    if (error instanceof CallbackError) throw error;
    fail('CALLBACK_PAYLOAD_INVALID', '回调内容无效');
  }
  if (
    payload?.MsgType !== 'event' ||
    payload?.Event !== 'wxa_media_check' ||
    payload?.appid !== appId
  )
    fail('CALLBACK_EVENT_INVALID', '回调事件无效');
  const errorCode = Number(payload.errcode);
  const traceId = typeof payload.trace_id === 'string' ? payload.trace_id.trim() : '';
  const suggest = payload?.result?.suggest;
  if (
    !traceId ||
    traceId.length > 128 ||
    Number(payload.version) !== 2 ||
    !Number.isInteger(errorCode) ||
    errorCode !== 0 ||
    !['pass', 'review', 'risky'].includes(suggest)
  )
    fail('CALLBACK_DECISION_INVALID', '回调审核结果无效');
  return {
    traceId,
    suggest,
    detail: Array.isArray(payload?.detail) ? payload.detail : [],
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
