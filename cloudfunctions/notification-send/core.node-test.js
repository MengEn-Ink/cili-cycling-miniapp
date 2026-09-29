'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_ATTEMPTS,
  LEASE_MS,
  buildReadyCondition,
  consumeNotification,
  drainNotifications,
} = require('./core');
const env = {
  REVIEW_APPROVED_TEMPLATE_ID: 'approved-template',
  REVIEW_REJECTED_TEMPLATE_ID: 'rejected-template',
};
function fixture(overrides = {}) {
  const item = {
    _id: 'o1',
    target_openid: 'member-openid',
    template_key: 'review_approved',
    status: 'pending',
    attempts: 0,
    payload: { registration_id: 'r1', decision: 'approved' },
    ...overrides,
  };
  const calls = [];
  const store = {
    listReady: async () => [item._id],
    claim: async (_id, claimant, now, { maxAttempts, leaseMs }) => {
      if (item.status === 'sent') return { ...item, claimed: false };
      if (item.status === 'sending' && Date.parse(item.lease_expires_at) > now.getTime())
        return { ...item, claimed: false };
      if (item.attempts >= maxAttempts) {
        const error = new Error('通知任务已达到最大重试次数');
        error.code = 'MAX_RETRIES_EXCEEDED';
        throw error;
      }
      item.status = 'sending';
      item.attempts += 1;
      item.claimed_by = claimant;
      item.lease_expires_at = new Date(now.getTime() + leaseMs);
      return { ...item, claimed: true };
    },
    markSent: async () => {
      item.status = 'sent';
      item.lease_expires_at = null;
    },
    markFailed: async (_id, error) => {
      item.status = 'failed';
      item.last_error = error;
      item.lease_expires_at = null;
    },
  };
  const sender = {
    send: async (message) => {
      calls.push(message);
      return { errCode: 0 };
    },
  };
  return { calls, item, store, sender };
}
const consume = (f, extra = {}) =>
  consumeNotification({
    ...f,
    claimant: 'worker',
    outboxId: 'o1',
    env,
    now: new Date('2026-09-29T00:00:00Z'),
    ...extra,
  });
test('模板缺失明确落 failed 且释放租约', async () => {
  const f = fixture();
  await assert.rejects(consume(f, { env: {} }), { code: 'TEMPLATE_MISSING' });
  assert.equal(f.item.status, 'failed');
  assert.equal(f.item.lease_expires_at, null);
  assert.match(f.item.last_error, /TEMPLATE_MISSING/);
});
test('发送成功落 sent', async () => {
  const f = fixture();
  const result = await consume(f);
  assert.equal(result.status, 'sent');
  assert.equal(f.item.status, 'sent');
  assert.equal(f.calls[0].touser, 'member-openid');
});
test('发送失败明确落 failed/last_error', async () => {
  const f = fixture();
  f.sender.send = async () => {
    throw new Error('network down');
  };
  await assert.rejects(consume(f), { code: 'WECHAT_SEND_FAILED' });
  assert.equal(f.item.status, 'failed');
  assert.match(f.item.last_error, /network down/);
});
test('未过期 sending 不重复发送', async () => {
  const f = fixture({ status: 'sending', attempts: 1, lease_expires_at: '2026-09-29T00:01:00Z' });
  const result = await consume(f);
  assert.equal(result.duplicate, true);
  assert.equal(f.calls.length, 0);
});
test('过期 sending 可重领并增加 attempts', async () => {
  const f = fixture({ status: 'sending', attempts: 1, lease_expires_at: '2026-09-28T23:59:00Z' });
  await consume(f);
  assert.equal(f.item.status, 'sent');
  assert.equal(f.item.attempts, 2);
});
test('最大重试次数阻止继续发送', async () => {
  const f = fixture({ status: 'failed', attempts: MAX_ATTEMPTS });
  await assert.rejects(consume(f), { code: 'MAX_RETRIES_EXCEEDED' });
  assert.equal(f.calls.length, 0);
});
test('租约时长使用核心常量', async () => {
  const f = fixture();
  await consume(f);
  assert.equal(LEASE_MS, 120000);
});
test('worker 批量消费审批生成的 pending 任务', async () => {
  const f = fixture();
  const result = await drainNotifications({ ...f, env, now: new Date('2026-09-29T00:00:00Z') });
  assert.equal(result.scanned, 1);
  assert.equal(result.sent, 1);
  assert.equal(f.item.status, 'sent');
});
test('worker 批量返回模板错误且任务为 failed', async () => {
  const f = fixture();
  const result = await drainNotifications({ ...f, env: {}, now: new Date('2026-09-29T00:00:00Z') });
  assert.equal(result.failed, 1);
  assert.equal(result.results[0].error.code, 'TEMPLATE_MISSING');
  assert.equal(f.item.status, 'failed');
});

test('大量耗尽任务在数据库 limit 前被过滤，不阻塞后续 pending', () => {
  const command = {
    in: (values) => ({ matches: (value) => values.includes(value) }),
    lt: (limit) => ({ matches: (value) => value < limit }),
  };
  const condition = buildReadyCondition(command);
  const exhausted = Array.from({ length: 100 }, (_, index) => ({
    _id: `exhausted-${index}`,
    status: 'failed',
    attempts: MAX_ATTEMPTS,
  }));
  const pending = { _id: 'fresh-pending', status: 'pending', attempts: 0 };
  const batch = [...exhausted, pending]
    .filter(
      (item) => condition.status.matches(item.status) && condition.attempts.matches(item.attempts),
    )
    .slice(0, 20);
  assert.deepEqual(
    batch.map((item) => item._id),
    ['fresh-pending'],
  );
});
