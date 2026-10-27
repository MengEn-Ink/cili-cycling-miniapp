'use strict';

const cloud = require('wx-server-sdk');
const {
  createState,
  authorizationUrl,
  compatibleStatus,
  config,
  importRoute,
  StravaError,
} = require('./core');
const { parseGpx } = require('./gpx');
const { createStravaStore } = require('./store');
const privacy = require('./privacy-contract');

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

function assertOpenid(openid) {
  if (typeof openid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(openid))
    throw new StravaError('AUTH_REQUIRED', '请先完成微信身份验证');
}

async function assertAdmin(openid) {
  const admin = await maybeGet(db.collection('admins'), openid);
  if (!admin || admin._id !== openid || admin.enabled !== true)
    throw new StravaError('ADMIN_REQUIRED', '仅活动管理员可以导入路线');
}

function ok(data) {
  return { ok: true, data };
}

function failure(error) {
  const code = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR';
  const safeMessage =
    code === 'INTERNAL_ERROR' ? 'Strava 服务暂时不可用，请稍后重试' : String(error.message);
  return { ok: false, error: { code, message: safeMessage } };
}

const store = createStravaStore(db, { env: process.env, cloud, privacy });

async function handle(event = {}, openid, now = new Date()) {
  assertOpenid(openid);
  if (event.action === 'status') return compatibleStatus(await store.status(openid, now));
  if (event.action === 'disconnect') {
    await store.disconnect(openid, now);
    await store.drainRevocations({ owner: openid, now });
    return compatibleStatus(await store.status(openid, now));
  }
  await assertAdmin(openid);
  if (event.action === 'start') {
    const configuration = config(process.env);
    const state = createState(now.getTime());
    await store.start(openid, state, now, event.profileGeneration);
    return {
      authorization_url: authorizationUrl(configuration, state.raw),
      expires_at: state.expiresAt,
    };
  }
  if (event.action === 'importRoute') {
    return importRoute({
      request: {
        openid,
        routeUrl: event.routeUrl,
        requestId: event.requestId,
      },
      env: process.env,
      store,
      parseGpx,
      now,
    });
  }
  throw new StravaError('UNKNOWN_ACTION', '未知操作');
}

exports.main = async (event = {}) => {
  try {
    return ok(await handle(event, cloud.getWXContext().OPENID));
  } catch (error) {
    console.error(
      'strava-bridge failed',
      typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
    );
    return failure(error);
  }
};
exports.handle = handle;
exports.store = store;
