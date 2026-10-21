'use strict';

const cloud = require('wx-server-sdk');
const { callbackFlow, StravaError } = require('./core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function isNotFound(error) {
  return (
    Number(error?.errCode) === -502001 || /not exist|not found/i.test(String(error?.errMsg || ''))
  );
}

async function maybeGet(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function callbackStore(database) {
  return {
    consumeState: (hash, now) =>
      database.runTransaction(async (transaction) => {
        const state = await maybeGet(transaction.collection('oauth_states'), hash);
        if (!state || state.consumed_at) return undefined;
        await transaction
          .collection('oauth_states')
          .doc(hash)
          .update({ data: { consumed_at: now } });
        return state;
      }),
    saveCredential: async (openid, value) => {
      if (value.owner_openid !== openid) throw new StravaError('FORBIDDEN', '凭证所有者不匹配');
      const { _id, ...data } = value;
      await database.collection('strava_credentials').doc(openid).set({ data });
    },
  };
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
