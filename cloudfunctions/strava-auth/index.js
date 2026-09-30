'use strict';
const cloud = require('wx-server-sdk');
const {
  config,
  createState,
  authorizationUrl,
  deriveReadiness,
  ensureReadyFlow,
  disconnectFlow,
  toError,
} = require('./oauth/core');
const { stravaApi } = require('./oauth/api');
const { routePreviewFlow, routeGpxFlow } = require('./oauth/routes');
const { createReadinessStore } = require('./store');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const ok = (data) => ({ ok: true, data });
const store = createReadinessStore(db);
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
exports.main = async (event = {}) => {
  try {
    const cfg = config(process.env);
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw Object.assign(new Error('无法取得微信身份'), { code: 'UNAUTHENTICATED' });
    if (
      event.action === 'status' ||
      event.action === 'start' ||
      event.action === 'cancelAuthorization'
    )
      await cleanupExpiredStates();
    if (event.action === 'status') {
      const now = new Date();
      return ok(deriveReadiness(await store.readReadiness(OPENID, now), now));
    }
    if (event.action === 'start') {
      const state = createState();
      await db
        .collection('oauth_states')
        .doc(state.hash)
        .set({
          data: {
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
    if (event.action === 'cancelAuthorization')
      return ok(await store.cancelAuthorization(OPENID, new Date()));
    if (event.action === 'ensureReady' || event.action === 'sync')
      return ok(
        await ensureReadyFlow({
          openid: OPENID,
          env: process.env,
          api: stravaApi,
          store,
        }),
      );
    if (event.action === 'routePreview') {
      const admin = await store.getAdmin(OPENID);
      if (!admin || admin._id !== OPENID || admin.enabled === false)
        throw Object.assign(new Error('仅管理员可以同步 Strava 路线'), { code: 'ADMIN_REQUIRED' });
      return ok(
        await routePreviewFlow({
          openid: OPENID,
          routeUrl: event.routeUrl,
          env: process.env,
          api: stravaApi,
          store,
        }),
      );
    }
    if (event.action === 'routeGpx')
      return ok(
        await routeGpxFlow({
          openid: OPENID,
          activityId: event.activityId,
          routeId: event.routeId,
          env: process.env,
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
