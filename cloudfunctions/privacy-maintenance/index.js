'use strict';
const cloud = require('wx-server-sdk');
const { authorizePrivacy, drainPrivacy } = require('./core');
const { createPrivacyStore } = require('./store');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const store = createPrivacyStore(cloud.database(), process.env.PROFILE_MEDIA_PATH_SECRET);
exports.main = async (event = {}) => {
  try {
    authorizePrivacy(event, cloud.getWXContext().OPENID);
    let replay;
    // Only the configured Timer identity may request restore replay, never a client action.
    if (event.ReplayRequestId) {
      if (
        typeof event.ReplayRequestId !== 'string' ||
        !/^deletion-[a-f0-9]{64}$/.test(event.ReplayRequestId)
      )
        throw Object.assign(new Error('重放标识无效'), { code: 'REPLAY_ID_INVALID' });
      replay = await store.replayDeletion(event.ReplayRequestId, new Date());
    }
    return {
      ok: true,
      data: { ...(await drainPrivacy({ store })), ...(replay ? { replay } : {}) },
    };
  } catch {
    return {
      ok: false,
      error: { code: 'PRIVACY_WORKER_FAILED', message: '隐私任务需重试或人工核验' },
    };
  }
};
