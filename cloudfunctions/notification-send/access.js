'use strict';
const TIMER_TRIGGER = 'notification-outbox-worker';
function coded(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function requireTrustedOpenid(openid) {
  if (typeof openid !== 'string' || !openid) coded('UNAUTHENTICATED', '无法取得微信可信身份');
  return openid;
}
async function authorizeInvocation({ event, openid, requireAdmin }) {
  if (event && event.action === 'subscription-config') {
    requireTrustedOpenid(openid);
    return { mode: 'subscription-config', claimant: `member:${openid}` };
  }
  if (!openid && event && event.Type === 'Timer' && event.TriggerName === TIMER_TRIGGER)
    return { mode: 'worker', claimant: 'timer-worker' };
  if (!openid) coded('SERVICE_IDENTITY_REQUIRED', '仅允许配置的定时触发器调用 worker');
  await requireAdmin(openid);
  return { mode: 'manual', claimant: `admin:${openid}` };
}
module.exports = { TIMER_TRIGGER, authorizeInvocation, requireTrustedOpenid };
