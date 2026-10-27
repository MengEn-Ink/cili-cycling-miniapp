'use strict';

const cloud = require('wx-server-sdk');
const { callbackFlow } = require('./core');
const { createStravaStore } = require('./store');
const privacy = require('./privacy-contract');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function callbackStore(database) {
  return createStravaStore(database, { env: process.env, cloud, privacy });
}

function html(success) {
  const title = success ? 'Strava 已连接' : 'Strava 连接失败';
  const hint = success
    ? '请返回微信，页面会自动刷新连接状态。'
    : '请返回微信重试，或使用手动上传 GPX。';
  return {
    statusCode: success ? 200 : 400,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'referrer-policy': 'no-referrer',
    },
    body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font-family:sans-serif;padding:32px;color:#171717}h1{font-size:24px}</style><h1>${title}</h1><p>${hint}</p>`,
  };
}

function queryOf(event) {
  return event.queryStringParameters || event.query || {};
}

function createHandler({ env = process.env, store = callbackStore(db), fetchImpl = fetch } = {}) {
  return async (event = {}) => {
    try {
      await callbackFlow({ query: queryOf(event), env, store, fetchImpl });
      return html(true);
    } catch (error) {
      console.error(
        'strava-callback failed',
        typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
      );
      return html(false);
    }
  };
}

exports.main = createHandler();
exports.createHandler = createHandler;
exports.callbackStore = callbackStore;
