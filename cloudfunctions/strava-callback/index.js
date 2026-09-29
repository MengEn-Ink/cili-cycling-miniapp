'use strict';
const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const { callbackFlow, writableDocument, toError } = require('./oauth/core');
const { stravaApi } = require('./oauth/api');
const { redirect303, resultLocation, renderResultPage } = require('./http');
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
    await db
      .collection('strava_credentials')
      .doc(data._id)
      .set({ data: writableDocument(data) });
    const profile = await maybeProfile(data.openid);
    await db
      .collection('profiles')
      .doc(data.openid)
      .set({
        data: writableDocument({
          ...profile,
          _id: data.openid,
          strava: { status: 'connected' },
          updated_at: db.serverDate(),
        }),
      });
  },
};
function eventPath(event) {
  return event.path || event.rawPath || (event.requestContext && event.requestContext.path) || '';
}

function createHandler({ callbackUrl, handleCallback, randomNonce, logger }) {
  const nonce = randomNonce || (() => crypto.randomBytes(18).toString('base64url'));
  const output = logger || console;
  const configuredUrl = () => (typeof callbackUrl === 'function' ? callbackUrl() : callbackUrl);

  return async (event = {}) => {
    const path = eventPath(event);
    if (path === '/strava/success') {
      return renderResultPage({ success: true, nonce: nonce() });
    }
    if (path === '/strava/failure') {
      return renderResultPage({ success: false, nonce: nonce() });
    }

    const query = event.queryStringParameters || event.query || event;
    try {
      await handleCallback(query);
      return redirect303(resultLocation(configuredUrl(), true));
    } catch (error) {
      const safe = toError(error);
      output.error('strava_callback_failed', { code: safe.error.code });
      return redirect303(resultLocation(configuredUrl(), false));
    }
  };
}

const main = createHandler({
  callbackUrl: () => process.env.STRAVA_CALLBACK_URL,
  handleCallback: (query) =>
    callbackFlow({
      code: query.code,
      state: query.state,
      env: process.env,
      store,
      api: stravaApi,
    }),
});

exports.main = main;
exports.createHandler = createHandler;
