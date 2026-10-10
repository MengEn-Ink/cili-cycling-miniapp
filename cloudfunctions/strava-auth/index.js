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
function diagnosticCode(error) {
  const value = error?.code ?? error?.errCode;
  return ['string', 'number'].includes(typeof value) && String(value).length <= 64
    ? String(value)
    : 'INTERNAL_ERROR';
}
function createHandler({
  getOpenId = () => cloud.getWXContext().OPENID,
  cleanup = cleanupExpiredStates,
  readinessStore = store,
  logger = console,
} = {}) {
  return async (event = {}) => {
    let stage = 'identity';
    try {
      const OPENID = getOpenId();
      if (!OPENID) throw Object.assign(new Error('无法取得微信身份'), { code: 'UNAUTHENTICATED' });
      if (
        event.action === 'status' ||
        event.action === 'start' ||
        event.action === 'cancelAuthorization'
      ) {
        stage = 'cleanup-expired-states';
        await cleanup();
      }
      if (event.action === 'status') {
        stage = 'read-readiness';
        const now = new Date();
        return ok(deriveReadiness(await readinessStore.readReadiness(OPENID, now), now));
      }
      if (event.action === 'start') {
        stage = 'start-authorization';
        const cfg = config(process.env);
        const state = createState();
        await readinessStore.createAuthorizationAttempt(OPENID, state);
        return ok({
          authorization_url: authorizationUrl(cfg.clientId, cfg.callbackUrl, state.raw),
          expires_at: state.expiresAt.toISOString(),
        });
      }
      if (event.action === 'cancelAuthorization')
        return ok(await readinessStore.cancelAuthorization(OPENID, new Date()));
      if (event.action === 'ensureReady' || event.action === 'sync')
        return ok(
          await ensureReadyFlow({
            openid: OPENID,
            env: process.env,
            api: stravaApi,
            store: readinessStore,
          }),
        );
      if (event.action === 'routePreview') {
        stage = 'route-preview';
        const admin = await readinessStore.getAdmin(OPENID);
        if (!admin || admin._id !== OPENID || admin.enabled === false)
          throw Object.assign(new Error('仅管理员可以同步 Strava 路线'), {
            code: 'ADMIN_REQUIRED',
          });
        return ok(
          await routePreviewFlow({
            openid: OPENID,
            routeUrl: event.routeUrl,
            env: process.env,
            api: stravaApi,
            store: readinessStore,
          }),
        );
      }
      if (event.action === 'routeGpx') {
        stage = 'route-gpx';
        return ok(
          await routeGpxFlow({
            openid: OPENID,
            activityId: event.activityId,
            routeId: event.routeId,
            env: process.env,
            api: stravaApi,
            store: readinessStore,
          }),
        );
      }
      if (event.action === 'disconnect') {
        stage = 'disconnect';
        return ok(await disconnectFlow({ openid: OPENID, store: readinessStore }));
      }
      throw Object.assign(new Error('未知操作'), { code: 'UNKNOWN_ACTION' });
    } catch (error) {
      if (error && error.code && !error.constructor?.name?.includes('Strava'))
        return { ok: false, error: { code: error.code, message: error.message } };
      const result = toError(error);
      if (result.error.code === 'INTERNAL_ERROR') {
        logger.error('strava_auth_failed', {
          action: typeof event.action === 'string' ? event.action.slice(0, 64) : 'unknown',
          stage,
          code: diagnosticCode(error),
        });
      }
      return result;
    }
  };
}
exports.createHandler = createHandler;
exports.main = createHandler();
