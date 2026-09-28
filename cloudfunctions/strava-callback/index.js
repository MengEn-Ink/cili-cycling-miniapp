'use strict';
const cloud = require('wx-server-sdk');
const { callbackFlow, toError } = require('./oauth/core');
const { stravaApi } = require('./oauth/api');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
async function maybeProfile(openid) {
  try {
    return (await db.collection('profiles').doc(openid).get()).data;
  } catch {
    return { _id: openid };
  }
}
const store = {
  consumeState: (hash) =>
    db.runTransaction(async (tx) => {
      let doc;
      try {
        doc = (await tx.collection('oauth_states').doc(hash).get()).data;
      } catch {
        return undefined;
      }
      if (!doc || doc.consumed_at) return undefined;
      await tx
        .collection('oauth_states')
        .doc(hash)
        .update({ data: { consumed_at: db.serverDate() } });
      return doc;
    }),
  saveCredential: async (data) => {
    await db.collection('strava_credentials').doc(data._id).set({ data });
    const profile = await maybeProfile(data.openid);
    await db
      .collection('profiles')
      .doc(data.openid)
      .set({
        data: {
          ...profile,
          _id: data.openid,
          strava: { status: 'connected' },
          updated_at: db.serverDate(),
        },
      });
  },
};
const page = (success, message) => ({
  statusCode: success ? 200 : 400,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
  },
  body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Strava 授权</title><style>body{font-family:sans-serif;padding:32px;color:#173c2d}</style><h2>${success ? '绑定成功' : '绑定失败'}</h2><p>${message}</p><p>请返回小程序刷新绑定状态。</p>`,
});
exports.main = async (event = {}) => {
  const query = event.queryStringParameters || event.query || event;
  try {
    await callbackFlow({
      code: query.code,
      state: query.state,
      env: process.env,
      store,
      api: stravaApi,
    });
    return page(true, 'Strava 已安全绑定，页面未包含任何 token。');
  } catch (error) {
    const safe = toError(error);
    return page(false, safe.error.message);
  }
};
