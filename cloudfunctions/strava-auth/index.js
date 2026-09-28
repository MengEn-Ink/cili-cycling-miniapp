'use strict';
const cloud = require('wx-server-sdk');
const {
  config,
  createState,
  authorizationUrl,
  syncFlow,
  disconnectFlow,
  publicStatus,
  toError,
} = require('./oauth/core');
const { stravaApi } = require('./oauth/api');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const ok = (data) => ({ ok: true, data });
async function maybe(collection, id) {
  try {
    return (await db.collection(collection).doc(id).get()).data;
  } catch (error) {
    if (
      String(error?.errCode || '').includes('NOT_FOUND') ||
      String(error?.message || '')
        .toLowerCase()
        .includes('not exist')
    )
      return undefined;
    throw error;
  }
}
async function updateProfile(openid, strava) {
  const current = (await maybe('profiles', openid)) || { _id: openid };
  await db
    .collection('profiles')
    .doc(openid)
    .set({ data: { ...current, _id: openid, strava, updated_at: db.serverDate() } });
}
async function cleanupExpiredStates(now = new Date(), limit = 20) {
  const expired = await db
    .collection('oauth_states')
    .where({ expires_at: db.command.lte(now) })
    .limit(limit)
    .get();
  await Promise.all(
    (expired.data || [])
      .slice(0, limit)
      .map((item) => db.collection('oauth_states').doc(item._id).remove()),
  );
}
const store = {
  saveCredential: (data) => db.collection('strava_credentials').doc(data._id).set({ data }),
  saveSnapshot: async (data) => {
    await db.collection('strava_snapshots').doc(data._id).set({ data });
    await updateProfile(data.openid, { status: 'connected', snapshot: data });
  },
  disconnect: (openid, audit) =>
    db.runTransaction(async (tx) => {
      await tx.collection('strava_credentials').doc(openid).remove();
      await tx.collection('strava_snapshots').doc(openid).remove();
      const profile = await maybe('profiles', openid);
      if (profile)
        await tx
          .collection('profiles')
          .doc(openid)
          .set({
            data: { ...profile, strava: { status: 'disconnected' }, updated_at: db.serverDate() },
          });
      await tx.collection('audit_logs').add({ data: audit });
    }),
};
exports.main = async (event = {}) => {
  try {
    const cfg = config(process.env);
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw Object.assign(new Error('无法取得微信身份'), { code: 'UNAUTHENTICATED' });
    if (event.action === 'status' || event.action === 'start') await cleanupExpiredStates();
    if (event.action === 'status')
      return ok(
        publicStatus(
          await maybe('strava_credentials', OPENID),
          await maybe('strava_snapshots', OPENID),
        ),
      );
    if (event.action === 'start') {
      const state = createState();
      await db
        .collection('oauth_states')
        .doc(state.hash)
        .set({
          data: {
            _id: state.hash,
            state_hash: state.hash,
            openid: OPENID,
            expires_at: state.expiresAt,
            created_at: db.serverDate(),
          },
        });
      return ok({
        authorization_url: authorizationUrl(cfg.clientId, cfg.callbackUrl, state.raw),
        expires_at: state.expiresAt.toISOString(),
      });
    }
    if (event.action === 'sync')
      return ok(
        await syncFlow({
          openid: OPENID,
          env: process.env,
          credential: await maybe('strava_credentials', OPENID),
          api: stravaApi,
          store,
        }),
      );
    if (event.action === 'disconnect') return ok(await disconnectFlow({ openid: OPENID, store }));
    throw Object.assign(new Error('未知操作'), { code: 'UNKNOWN_ACTION' });
  } catch (error) {
    if (error && error.code && !error.constructor?.name?.includes('Strava'))
      return { ok: false, error: { code: error.code, message: error.message } };
    return toError(error);
  }
};
