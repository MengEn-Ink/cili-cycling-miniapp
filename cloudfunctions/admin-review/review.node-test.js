'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewRegistration } = require('./domain');
function store(seed = {}) {
  const state = {
    registration: {
      _id: 'r1',
      activity_id: 'a1',
      openid: 'member',
      status: 'pending',
      review_history: [],
      profile_snapshot: {},
    },
    activity: { occupied_count: 1 },
    outbox: new Map(),
  };
  return {
    state,
    transaction: (work) =>
      work({
        getAdmin: async () => (seed.admin === false ? undefined : { _id: 'admin', enabled: true }),
        getRegistration: async () => state.registration,
        getActivity: async () => state.activity,
        putRegistration: async (_id, value) => {
          state.registration = value;
        },
        setOccupied: async (_id, value) => {
          state.activity.occupied_count = value;
        },
        addAudit: async () => {},
        putNotification: async (id, value) => state.outbox.set(id, value),
      }),
  };
}
test('批准与 outbox 原子编排并返回 notification', async () => {
  const s = store();
  const result = await reviewRegistration(
    s,
    { openid: 'admin', registrationId: 'r1', action: 'approve' },
    new Date('2026-09-29T00:00:00Z'),
  );
  assert.equal(result.status, 'approved');
  assert.equal(result.notification.status, 'pending');
  assert.equal(s.state.outbox.get(result.notification.outbox_id).template_key, 'review_approved');
});
test('驳回创建通知并释放名额', async () => {
  const s = store();
  const result = await reviewRegistration(s, {
    openid: 'admin',
    registrationId: 'r1',
    action: 'reject',
    reason: '资料不完整',
  });
  assert.equal(result.status, 'rejected');
  assert.equal(s.state.activity.occupied_count, 0);
  assert.equal(s.state.outbox.get(result.notification.outbox_id).template_key, 'review_rejected');
});
test('非管理员不能审批或创建 outbox', async () => {
  const s = store({ admin: false });
  await assert.rejects(
    reviewRegistration(s, { openid: 'admin', registrationId: 'r1', action: 'approve' }),
    { code: 'ADMIN_REQUIRED' },
  );
  assert.equal(s.state.outbox.size, 0);
});
