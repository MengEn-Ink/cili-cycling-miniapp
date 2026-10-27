'use strict';

const cloud = require('wx-server-sdk');
const { parseEncryptedEcho, parseMediaCheckCallback } = require('./callback-contract');
const { applyMediaDecision } = require('./core');
const { createCallbackStore } = require('./store');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
    body,
  };
}

function requestBody(event) {
  if (typeof event.body === 'string') {
    try {
      return JSON.parse(event.body);
    } catch {
      return {};
    }
  }
  return event.body && typeof event.body === 'object' ? event.body : {};
}

function callbackErrorStatus(error) {
  if (error?.retryable || error?.code === 'CALLBACK_CONFIG_INVALID') return 503;
  if (typeof error?.code === 'string' && error.code.startsWith('CALLBACK_')) return 400;
  return 500;
}

function createHandler({
  env = process.env,
  store = createCallbackStore(db),
  parseCallback = parseMediaCheckCallback,
  parseEcho = parseEncryptedEcho,
  applyDecision = applyMediaDecision,
} = {}) {
  return async (event = {}) => {
    const query = event.queryStringParameters || event.query || {};
    if (event.httpMethod === 'GET') {
      if (!env.WECHAT_CALLBACK_TOKEN || !env.WECHAT_CALLBACK_AES_KEY || !env.WECHAT_APP_ID)
        return response(503, 'callback unavailable');
      if (
        typeof query.echostr !== 'string' ||
        !query.echostr ||
        typeof query.msg_signature !== 'string' ||
        !query.msg_signature
      )
        return response(400, 'bad request');
      try {
        const echo = parseEcho({
          token: env.WECHAT_CALLBACK_TOKEN,
          encodingAesKey: env.WECHAT_CALLBACK_AES_KEY,
          appId: env.WECHAT_APP_ID,
          timestamp: query.timestamp,
          nonce: query.nonce,
          msgSignature: query.msg_signature,
          encryptedEcho: query.echostr,
        });
        return response(200, echo);
      } catch (error) {
        const status =
          error?.code === 'CALLBACK_CONFIG_INVALID'
            ? 503
            : error?.code === 'CALLBACK_SIGNATURE_INVALID'
              ? 403
              : 400;
        return response(status, status === 503 ? 'callback unavailable' : 'bad request');
      }
    }
    if (event.httpMethod !== 'POST') return response(405, 'method not allowed');
    if (!env.WECHAT_CALLBACK_TOKEN || !env.WECHAT_CALLBACK_AES_KEY || !env.WECHAT_APP_ID) {
      return response(503, 'callback unavailable');
    }
    const body = requestBody(event);
    const encrypted = body.Encrypt;
    if (typeof encrypted !== 'string' || !encrypted) return response(400, 'bad request');
    try {
      const decision = parseCallback({
        token: env.WECHAT_CALLBACK_TOKEN,
        encodingAesKey: env.WECHAT_CALLBACK_AES_KEY,
        appId: env.WECHAT_APP_ID,
        timestamp: query.timestamp,
        nonce: query.nonce,
        msgSignature: query.msg_signature,
        encrypted,
      });
      await applyDecision(store, decision, new Date());
      return response(200, 'success');
    } catch (error) {
      console.error(
        'content callback rejected',
        typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
      );
      const status = callbackErrorStatus(error);
      return response(status, status < 500 ? 'bad request' : 'callback unavailable');
    }
  };
}

exports.main = createHandler();
exports.createHandler = createHandler;
