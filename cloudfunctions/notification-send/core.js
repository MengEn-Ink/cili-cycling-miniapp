'use strict';

const crypto = require('node:crypto');
const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60 * 1000;
const ACK_ATTEMPTS = 3;
class NotificationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function fail(code, message) {
  throw new NotificationError(code, message);
}
function responseError(error) {
  const known = error && typeof error.code === 'string';
  return {
    ok: false,
    error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : '服务暂时不可用',
    },
  };
}
function templateFor(key, env) {
  const names = {
    review_approved: 'REVIEW_APPROVED_TEMPLATE_ID',
    review_rejected: 'REVIEW_REJECTED_TEMPLATE_ID',
  };
  const name = names[key];
  if (!name) fail('TEMPLATE_NOT_ALLOWED', '通知模板未列入审批结果白名单');
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) fail('TEMPLATE_MISSING', `缺少环境变量 ${name}`);
  return value.trim();
}
function messageData(outbox) {
  const payload = outbox.payload || {};
  return {
    thing1: { value: payload.decision === 'approved' ? '报名审核通过' : '报名审核未通过' },
    thing2: { value: String(payload.registration_id || '').slice(0, 20) },
    thing3: {
      value: String(payload.reason || payload.serial_no || '请进入小程序查看详情').slice(0, 20),
    },
  };
}
function providerCode(result) {
  return Number(result && (result.errCode ?? result.errcode ?? 0));
}
function providerRetryable(code) {
  return [-1, 45009].includes(code);
}
async function transitionOrLose(method, outboxId, value) {
  if (!(await method(outboxId, value))) fail('LEASE_LOST', '通知任务租约已失效');
}
async function markUnknownBestEffort(store, outboxId, fence, errorCode) {
  try {
    await store.markDeliveryUnknown(outboxId, { ...fence, errorCode });
  } catch {
    // 持久化不可用时保留 dispatching，由恢复任务在租约过期后隔离，绝不再次发送。
  }
}
async function consumeNotification({
  store,
  sender,
  claimant,
  outboxId,
  env,
  now = new Date(),
  randomUUID = crypto.randomUUID,
}) {
  if (typeof claimant !== 'string' || !claimant) fail('CALLER_INVALID', '缺少可信消费者身份');
  if (typeof outboxId !== 'string' || !outboxId) fail('VALIDATION_FAILED', '缺少 outbox ID');
  const claim = await store.claim(outboxId, {
    claimant,
    leaseId: randomUUID(),
    now,
    maxAttempts: MAX_ATTEMPTS,
    leaseMs: LEASE_MS,
  });
  if (claim.status === 'sent') return { outbox_id: outboxId, status: 'sent', duplicate: true };
  if (claim.claimed === false)
    return { outbox_id: outboxId, status: claim.status, duplicate: true };

  const fence = { leaseId: claim.lease_id, attemptNo: claim.attempt_no, now };
  let templateId;
  try {
    templateId = templateFor(claim.template_key, env);
    if (typeof claim.target_openid !== 'string' || !claim.target_openid.trim())
      fail('TARGET_OPENID_INVALID', '通知目标 openid 无效');
  } catch (error) {
    await transitionOrLose(store.markRetryable, outboxId, {
      ...fence,
      errorCode: String(error.code || 'NOTIFICATION_INVALID'),
    });
    throw error;
  }

  await transitionOrLose(store.beginDispatch, outboxId, fence);
  let result;
  try {
    result = await sender.send({
      touser: claim.target_openid,
      templateId,
      data: messageData(claim),
    });
  } catch (error) {
    await markUnknownBestEffort(store, outboxId, fence, 'SEND_RESULT_UNKNOWN');
    fail('DELIVERY_STATE_UNCERTAIN', '通知发送结果未知，请在小程序内查看审批状态');
  }

  const code = providerCode(result);
  if (code !== 0) {
    const errorCode = `WECHAT_${code}`;
    if (providerRetryable(code)) {
      await transitionOrLose(store.markRetryable, outboxId, { ...fence, errorCode });
      fail('WECHAT_SEND_FAILED', '微信订阅消息发送失败');
    }
    await transitionOrLose(store.markTerminal, outboxId, { ...fence, errorCode });
    fail('WECHAT_SEND_REJECTED', '微信拒绝发送订阅消息');
  }

  for (let attempt = 0; attempt < ACK_ATTEMPTS; attempt += 1) {
    try {
      if (!(await store.markSent(outboxId, fence))) fail('LEASE_LOST', '通知任务租约已失效');
      return { outbox_id: outboxId, status: 'sent', duplicate: false };
    } catch (error) {
      if (error instanceof NotificationError) throw error;
    }
  }
  await markUnknownBestEffort(store, outboxId, fence, 'ACK_WRITE_FAILED');
  fail('DELIVERY_STATE_UNCERTAIN', '通知已发送但状态确认失败，请勿自动重试');
}
function buildReadyCondition(command) {
  return {
    status: command.in(['pending', 'retryable', 'failed', 'claimed']),
    attempts: command.lt(MAX_ATTEMPTS),
  };
}
async function drainNotifications({ store, sender, env, now = new Date(), limit = 20 }) {
  const quarantined = await store.recoverExpiredDispatching(now, limit);
  const ids = await store.listReady(limit);
  const results = [];
  for (const outboxId of ids) {
    try {
      results.push({
        ok: true,
        data: await consumeNotification({
          store,
          sender,
          claimant: 'timer-worker',
          outboxId,
          env,
          now,
        }),
      });
    } catch (error) {
      results.push(responseError(error));
    }
  }
  return {
    quarantined,
    scanned: ids.length,
    sent: results.filter((item) => item.ok && item.data.status === 'sent').length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}
module.exports = {
  MAX_ATTEMPTS,
  LEASE_MS,
  ACK_ATTEMPTS,
  NotificationError,
  responseError,
  templateFor,
  consumeNotification,
  buildReadyCondition,
  drainNotifications,
};
