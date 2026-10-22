'use strict';

const crypto = require('node:crypto');
const TIMER_TRIGGER = 'privacy-maintenance-worker';
const LEASE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_BATCH = 2;
const ROW_BATCH = 3;
function authorizePrivacy(event, openid) {
  if (openid || event?.Type !== 'Timer' || event.TriggerName !== TIMER_TRIGGER || event.action)
    throw Object.assign(new Error('仅允许配置的隐私定时触发器'), {
      code: 'SERVICE_IDENTITY_REQUIRED',
    });
  return 'timer-worker';
}
async function drainPrivacy({
  store,
  now = new Date(),
  limit = MAX_BATCH,
  randomUUID = crypto.randomUUID,
}) {
  const bounded = Math.max(1, Math.min(MAX_BATCH, Number(limit) || MAX_BATCH));
  const ids = await store.listEligible(now, bounded);
  const result = { processed: 0, failed: 0 };
  for (const id of ids.slice(0, bounded)) {
    const fence = { now, leaseId: randomUUID() };
    if (!(await store.claim(id, fence))) continue;
    try {
      if (await store.process(id, fence, ROW_BATCH)) result.processed += 1;
    } catch {
      if (await store.markFailed(id, fence)) result.failed += 1;
    }
  }
  return result;
}
module.exports = {
  TIMER_TRIGGER,
  LEASE_MS,
  MAX_ATTEMPTS,
  MAX_BATCH,
  ROW_BATCH,
  authorizePrivacy,
  drainPrivacy,
};
