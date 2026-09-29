'use strict';
const cloud = require('wx-server-sdk');
const {
  consumeNotification,
  drainNotifications,
  responseError,
  subscriptionTemplateIds,
} = require('./core');
const { authorizeInvocation } = require('./access');
const { createNotificationStore } = require('./store');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const store = createNotificationStore(db);
const sender = { send: (message) => cloud.openapi.subscribeMessage.send(message) };
exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    // 手工入口保留管理员门禁；定时入口使用 CloudBase 平台服务身份。
    const access = await authorizeInvocation({ event, openid, requireAdmin: store.requireAdmin });
    if (access.mode === 'subscription-config')
      return { ok: true, data: { template_ids: subscriptionTemplateIds(process.env) } };
    if (access.mode === 'worker')
      return { ok: true, data: await drainNotifications({ store, sender, env: process.env }) };
    const result = await consumeNotification({
      store,
      sender,
      claimant: access.claimant,
      outboxId: event.outboxId,
      env: process.env,
    });
    return { ok: true, data: result };
  } catch (error) {
    console.error('notification-send failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return responseError(error);
  }
};
