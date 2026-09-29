'use strict';
const cloud = require('wx-server-sdk');
const {
  consumeNotification,
  buildReadyCondition,
  drainNotifications,
  responseError,
} = require('./core');
const { authorizeInvocation } = require('./access');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const command = db.command;
function coded(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function missing(error) {
  return (
    error &&
    (Number(error.errCode) === -502001 || /not exist|not found/i.test(String(error.errMsg || '')))
  );
}
async function get(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}
const store = {
  requireAdmin: async (openid) => {
    const admin = await get(db.collection('admins'), openid);
    if (!admin || admin._id !== openid || admin.enabled === false)
      coded('ADMIN_REQUIRED', '需要管理员权限');
  },
  listReady: async (limit) => {
    const result = await db
      .collection('notification_outbox')
      .where(buildReadyCondition(command))
      .orderBy('lease_expires_at', 'asc')
      .limit(limit)
      .get();
    return result.data.map((item) => item._id);
  },
  claim: (id, claimant, now, { maxAttempts, leaseMs }) =>
    db.runTransaction(async (tx) => {
      const ref = tx.collection('notification_outbox').doc(id);
      const item = await get(tx.collection('notification_outbox'), id);
      if (!item) coded('OUTBOX_NOT_FOUND', '通知任务不存在');
      if (item.status === 'sent') return { ...item, claimed: false };
      const leaseExpires = Date.parse(item.lease_expires_at);
      if (
        item.status === 'sending' &&
        Number.isFinite(leaseExpires) &&
        leaseExpires > now.getTime()
      )
        return { ...item, claimed: false };
      const attempts = Number(item.attempts || 0);
      if (attempts >= maxAttempts) coded('MAX_RETRIES_EXCEEDED', '通知任务已达到最大重试次数');
      if (!['pending', 'failed', 'sending'].includes(item.status))
        coded('INVALID_OUTBOX_STATE', '通知状态不可消费');
      const next = {
        ...item,
        status: 'sending',
        attempts: attempts + 1,
        claimed_by: claimant,
        lease_expires_at: new Date(now.getTime() + leaseMs),
        updated_at: now,
        last_error: '',
        claimed: true,
      };
      // sending 租约过期后允许其他 worker 原子重领；attempts 上限阻止无限重试。
      await ref.update({
        data: {
          status: next.status,
          attempts: next.attempts,
          claimed_by: claimant,
          lease_expires_at: next.lease_expires_at,
          updated_at: now,
          last_error: '',
        },
      });
      return next;
    }),
  markSent: (id, now) =>
    db
      .collection('notification_outbox')
      .doc(id)
      .update({
        data: {
          status: 'sent',
          sent_at: now,
          updated_at: now,
          lease_expires_at: null,
          last_error: '',
        },
      }),
  markFailed: (id, lastError, now) =>
    db
      .collection('notification_outbox')
      .doc(id)
      .update({
        data: { status: 'failed', last_error: lastError, updated_at: now, lease_expires_at: null },
      }),
};
const sender = { send: (message) => cloud.openapi.subscribeMessage.send(message) };
exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    // 手工入口保留管理员门禁；定时入口使用 CloudBase 平台服务身份。
    const access = await authorizeInvocation({ event, openid, requireAdmin: store.requireAdmin });
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
