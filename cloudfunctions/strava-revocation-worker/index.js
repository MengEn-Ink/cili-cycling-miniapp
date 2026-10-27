'use strict';

const TIMER_TRIGGER = 'strava-revocation-worker';

function coded(code, message) {
  throw Object.assign(new Error(message), { code });
}

function authorizeWorker(event, openid) {
  if (openid || !event || event.Type !== 'Timer' || event.TriggerName !== TIMER_TRIGGER)
    coded('SERVICE_IDENTITY_REQUIRED', '仅允许配置的定时触发器执行 Strava 撤销维护');
}

async function runWorker(store, now = new Date()) {
  const result = await store.drainRevocations({ now });
  console.log(
    'strava revocation metrics',
    JSON.stringify({
      attempted: result.attempted,
      completed: result.completed,
      isolated: result.isolated,
      uncertain: result.uncertain,
      backlog_pending_visible: result.backlog_pending_visible,
      backlog_pending_truncated: result.backlog_pending_truncated,
      manual_review_visible: result.manual_review_visible,
      manual_review_truncated: result.manual_review_truncated,
    }),
  );
  return result;
}

let runtime;
function cloudRuntime() {
  if (runtime) return runtime;
  const cloud = require('wx-server-sdk');
  const { createStravaStore } = require('./store');
  const privacy = require('./privacy-contract');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  runtime = {
    cloud,
    store: createStravaStore(cloud.database(), { env: process.env, cloud, privacy }),
  };
  return runtime;
}

exports.main = async (event = {}) => {
  try {
    const { cloud, store } = cloudRuntime();
    authorizeWorker(event, cloud.getWXContext().OPENID);
    return { ok: true, data: await runWorker(store) };
  } catch (error) {
    console.error(
      'strava-revocation-worker failed',
      typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
    );
    return {
      ok: false,
      error: {
        code: typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
        message: typeof error?.code === 'string' ? error.message : 'Strava 撤销维护暂时不可用',
      },
    };
  }
};

module.exports = { TIMER_TRIGGER, authorizeWorker, runWorker };
