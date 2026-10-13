'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { enqueueActivityReminders, reminderOutboxId } = require('./reminder');

function fixture({ admin = true, existing = [] } = {}) {
  const outbox = new Map(existing.map((item) => [item._id, item]));
  const audits = [];
  const registrations = [
    { _id: 'r1', openid: 'member-1', status: 'approved' },
    { _id: 'r2', openid: 'member-2', status: 'checked_in' },
  ];
  return {
    outbox,
    audits,
    transaction: (work) =>
      work({
        getAdmin: async () => (admin ? { _id: 'admin', enabled: true } : undefined),
        getActivity: async () => ({
          _id: 'a1',
          title: '环湖骑行',
          event_start: '2026-10-11T00:00:00Z',
          route: { start: '湖滨广场' },
        }),
        listReminderRecipients: async (activityId, statuses) => {
          assert.equal(activityId, 'a1');
          assert.deepEqual(statuses, ['approved', 'checked_in']);
          return registrations.filter((item) => statuses.includes(item.status));
        },
        getNotification: async (id) => outbox.get(id),
        putNotification: async (id, value) => outbox.set(id, value),
        addAudit: async (value) => audits.push(value),
      }),
  };
}

test('管理员显式触发对 approved 与 checked_in 幂等入队并写审计', async () => {
  const store = fixture();
  const first = await enqueueActivityReminders(store, { openid: 'admin', activityId: 'a1' });
  const second = await enqueueActivityReminders(store, { openid: 'admin', activityId: 'a1' });
  assert.deepEqual(first, { activity_id: 'a1', queued: 2, duplicates: 0, total: 2 });
  assert.deepEqual(second, { activity_id: 'a1', queued: 0, duplicates: 2, total: 2 });
  assert.equal(store.outbox.size, 2);
  assert.equal(store.audits.length, 2);
  assert.match(store.audits[1].detail.reason, /queued=0,duplicates=2/);
  assert.equal(store.outbox.get(reminderOutboxId('a1', 'r1')).template_key, 'activity_reminder');
});

test('提醒收件人使用与复合索引一致的稳定顺序分页', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  assert.match(
    source,
    /where\(\{ activity_id: activityId, status: db\.command\.in\(statuses\) \}\)[\s\S]*?\.orderBy\('_id', 'asc'\)[\s\S]*?\.skip\(offset\)/,
  );
});

test('已有 sent 提醒不会被覆盖回 pending', async () => {
  const id = reminderOutboxId('a1', 'r1');
  const sent = { _id: id, status: 'sent' };
  const store = fixture({ existing: [sent] });
  await enqueueActivityReminders(store, { openid: 'admin', activityId: 'a1' });
  assert.equal(store.outbox.get(id), sent);
});

test('非管理员不能入队且不写通知或审计', async () => {
  const store = fixture({ admin: false });
  await assert.rejects(enqueueActivityReminders(store, { openid: 'admin', activityId: 'a1' }), {
    code: 'ADMIN_REQUIRED',
  });
  assert.equal(store.outbox.size, 0);
  assert.equal(store.audits.length, 0);
});
