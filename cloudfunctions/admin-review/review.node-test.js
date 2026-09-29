'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DomainError, reviewRegistration, validateOptions } = require('./domain');
function store(seed = {}) {
  const state = {
    registration: {
      _id: 'r1',
      activity_id: 'a1',
      openid: 'member',
      status: 'pending',
      review_history: [],
      options: { gathering_mode: 'support_vehicle' },
      profile_snapshot: {},
    },
    activity: {
      occupied_count: 1,
      occupancy_partition_ready: true,
      support_vehicle_occupied_count: 1,
      self_drive_occupied_count: 0,
      ...(seed.activity || {}),
    },
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
        setOccupied: async (_id, value, supportVehicleOccupied, selfDriveOccupied) => {
          state.activity.occupied_count = value;
          if (supportVehicleOccupied !== undefined)
            state.activity.support_vehicle_occupied_count = supportVehicleOccupied;
          if (selfDriveOccupied !== undefined)
            state.activity.self_drive_occupied_count = selfDriveOccupied;
        },
        addAudit: async () => {},
        putNotification: async (id, value) => state.outbox.set(id, value),
      }),
  };
}
test('集合方式只接受两个新值并丢弃旧字段', () => {
  for (const gatheringMode of ['self_drive', 'support_vehicle']) {
    assert.deepEqual(
      validateOptions({
        gathering_mode: gatheringMode,
        experience: 'regular',
        bike_mode: 'rent',
        rental_need: 'legacy',
      }),
      { gathering_mode: gatheringMode, experience: 'regular', remark: '' },
    );
  }
  for (const options of [
    { experience: 'regular' },
    { gathering_mode: 'unknown', experience: 'regular' },
    { bike_mode: 'own', experience: 'regular' },
  ]) {
    assert.throws(
      () => validateOptions(options),
      (error) => error instanceof DomainError && error.code === 'VALIDATION_FAILED',
    );
  }
});

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
test('未就绪旧活动驳回只释放总占位并保留现有分类计数', async () => {
  const s = store({
    activity: {
      occupied_count: 2,
      occupancy_partition_ready: false,
      support_vehicle_occupied_count: 1,
      self_drive_occupied_count: 0,
    },
  });

  await reviewRegistration(s, {
    openid: 'admin',
    registrationId: 'r1',
    action: 'reject',
    reason: '资料不完整',
  });

  assert.equal(s.state.activity.occupied_count, 1);
  assert.equal(s.state.activity.support_vehicle_occupied_count, 1);
  assert.equal(s.state.activity.self_drive_occupied_count, 0);
});
test('非管理员不能审批或创建 outbox', async () => {
  const s = store({ admin: false });
  await assert.rejects(
    reviewRegistration(s, { openid: 'admin', registrationId: 'r1', action: 'approve' }),
    { code: 'ADMIN_REQUIRED' },
  );
  assert.equal(s.state.outbox.size, 0);
});
