'use strict';

const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60 * 1000;
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
async function consumeNotification({ store, sender, claimant, outboxId, env, now = new Date() }) {
  if (typeof claimant !== 'string' || !claimant) fail('CALLER_INVALID', '缺少可信消费者身份');
  if (typeof outboxId !== 'string' || !outboxId) fail('VALIDATION_FAILED', '缺少 outbox ID');
  const claim = await store.claim(outboxId, claimant, now, {
    maxAttempts: MAX_ATTEMPTS,
    leaseMs: LEASE_MS,
  });
  if (claim.status === 'sent') return { outbox_id: outboxId, status: 'sent', duplicate: true };
  // 未过期租约只能由原消费者继续持有；其他 worker 不得并发发送。
  if (claim.claimed === false)
    return { outbox_id: outboxId, status: claim.status, duplicate: true };
  try {
    const templateId = templateFor(claim.template_key, env);
    if (typeof claim.target_openid !== 'string' || !claim.target_openid.trim())
      fail('TARGET_OPENID_INVALID', '通知目标 openid 无效');
    const result = await sender.send({
      touser: claim.target_openid,
      templateId,
      data: messageData(claim),
    });
    if (result && Number(result.errCode ?? result.errcode ?? 0) !== 0)
      fail('WECHAT_SEND_FAILED', String(result.errMsg || result.errmsg || '微信接口返回失败'));
    await store.markSent(outboxId, now);
    return { outbox_id: outboxId, status: 'sent', duplicate: false };
  } catch (error) {
    const message = String((error && (error.code || error.message)) || '微信发送失败').slice(
      0,
      500,
    );
    // 模板配置错误和网络错误都必须显式落 failed，释放租约后才允许下一轮重试。
    await store.markFailed(outboxId, message, now);
    if (error instanceof NotificationError) throw error;
    fail('WECHAT_SEND_FAILED', '微信订阅消息发送失败');
  }
}
function buildReadyCondition(command) {
  return {
    status: command.in(['pending', 'failed', 'sending']),
    attempts: command.lt(MAX_ATTEMPTS),
  };
}
async function drainNotifications({ store, sender, env, now = new Date(), limit = 20 }) {
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
    scanned: ids.length,
    sent: results.filter((item) => item.ok && item.data.status === 'sent').length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}
module.exports = {
  MAX_ATTEMPTS,
  LEASE_MS,
  NotificationError,
  responseError,
  templateFor,
  consumeNotification,
  buildReadyCondition,
  drainNotifications,
};
