'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewRegistration } = require('../admin-review/domain');
const { drainNotifications } = require('./core');
test('审批提交后定时 worker 可消费同一 outbox', async () => {
  const outbox = new Map();
  const registration = {
    _id: 'r1',
    activity_id: 'a1',
    openid: 'member-openid',
    status: 'pending',
    review_history: [],
    profile_snapshot: {},
  };
  const reviewStore = {
    transaction: (work) =>
      work({
        getAdmin: async () => ({ _id: 'admin', enabled: true }),
        getRegistration: async () => registration,
        getActivity: async () => ({ occupied_count: 1 }),
        putRegistration: async () => {},
        setOccupied: async () => {},
        addAudit: async () => {},
        putNotification: async (id, value) => outbox.set(id, value),
      }),
  };
  const reviewed = await reviewRegistration(
    reviewStore,
    { openid: 'admin', registrationId: 'r1', action: 'approve' },
    new Date('2026-09-29T00:00:00Z'),
  );
  const item = outbox.get(reviewed.notification.outbox_id);
  const workerStore = {
    listReady: async () => [item._id],
    claim: async (_id, claimant, now, { leaseMs }) => {
      Object.assign(item, {
        status: 'sending',
        attempts: item.attempts + 1,
        claimed_by: claimant,
        lease_expires_at: new Date(now.getTime() + leaseMs),
      });
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
  const sent = [];
  const result = await drainNotifications({
    store: workerStore,
    sender: {
      send: async (message) => {
        sent.push(message);
        return { errCode: 0 };
      },
    },
    env: { REVIEW_APPROVED_TEMPLATE_ID: 'approved-template' },
    now: new Date('2026-09-29T00:01:00Z'),
  });
  assert.equal(result.sent, 1);
  assert.equal(item.status, 'sent');
  assert.equal(sent[0].touser, registration.openid);
});
