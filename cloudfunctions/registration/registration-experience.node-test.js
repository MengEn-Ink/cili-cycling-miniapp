'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  submitRegistration,
  cancelRegistration,
  reviewRegistration,
  validateTeamInput,
} = require('./domain');

const now = new Date('2026-10-01T12:00:00.000Z');
function validActivity(patch = {}) {
  return {
    _id: 'a1',
    title: '环湖骑行',
    status: 'published',
    capacity: 2,
    occupied_count: 0,
    occupancy_partition_ready: true,
    support_vehicle_capacity: 1,
    self_drive_capacity: 1,
    support_vehicle_occupied_count: 0,
    self_drive_occupied_count: 0,
    support_vehicle_driver: {
      nickname: '司机',
      license_plate: '浙A00000',
      contact_phone: '13800000000',
    },
    signup_deadline: '2026-10-10T00:00:00.000Z',
    event_start: '2026-10-11T00:00:00.000Z',
    event_end: '2026-10-11T08:00:00.000Z',
    fee: '免费',
    ...patch,
  };
}
function fixture(seed = {}) {
  const registrations = new Map((seed.registrations || []).map((item) => [item._id, item]));
  const state = {
    activity: validActivity(seed.activity),
    registrations,
    notifications: new Map(),
    audits: [],
    occupiedWrites: 0,
  };
  const tx = {
    getActivity: async () => state.activity,
    getProfile: async () => ({
      nickname: '骑手',
      gender: '男',
      emergency_name: '联系人',
      avatar_file_id: 'cloud://avatar',
      background_photo: { file_id: 'cloud://bg', category: 'ride' },
      sensitive_status: { real_name: true, phone_verified: true, emergency_phone: true },
    }),
    getRegistration: async (id) => state.registrations.get(id),
    getStravaCredential: async () => ({
      athlete_id: 'athlete',
      access_token_cipher: { alg: 'A256GCM', iv: 'i', tag: 't', ciphertext: 'c' },
      refresh_token_cipher: { alg: 'A256GCM', iv: 'i', tag: 't', ciphertext: 'c' },
    }),
    getStravaSnapshot: async () => ({ athlete_id: 'athlete', synced_at: now }),
    getAdmin: async () => ({ _id: 'admin', enabled: true }),
    getTeamLeader: async (_activityId, teamId) =>
      [...state.registrations.values()].find(
        (item) => item.team_id === teamId && item.is_team_leader === true,
      ),
    listWaiting: async () =>
      [...state.registrations.values()]
        .filter((item) => item.status === 'waiting')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    putRegistration: async (id, value) => state.registrations.set(id, value),
    setOccupied: async (_id, occupied, support, selfDrive) => {
      state.occupiedWrites += 1;
      state.activity.occupied_count = occupied;
      if (support !== undefined) state.activity.support_vehicle_occupied_count = support;
      if (selfDrive !== undefined) state.activity.self_drive_occupied_count = selfDrive;
    },
    putNotification: async (id, value) => state.notifications.set(id, value),
    addAudit: async (value) => state.audits.push(value),
  };
  return { state, transaction: async (work) => work(tx) };
}
const submit = (store, openid, extra = {}) =>
  submitRegistration(
    store,
    {
      openid,
      activityId: 'a1',
      options: { gathering_mode: 'self_drive', experience: 'regular' },
      team: {},
      ...extra,
    },
    now,
  );

function registration(id, status, createdAt, mode = 'self_drive') {
  return {
    _id: id,
    activity_id: 'a1',
    openid: id,
    status,
    options: { gathering_mode: mode },
    profile_snapshot: {},
    created_at: new Date(createdAt),
    updated_at: new Date(createdAt),
    review_history: [],
  };
}

test('正常报名占位，满员报名进入 waiting 且通知幂等键稳定', async () => {
  const normal = fixture();
  assert.equal((await submit(normal, 'member-1')).status, 'pending');
  assert.equal(normal.state.activity.occupied_count, 1);

  const full = fixture({
    activity: {
      occupied_count: 2,
      self_drive_occupied_count: 1,
      support_vehicle_occupied_count: 1,
    },
  });
  const waiting = await submit(full, 'member-2');
  assert.equal(waiting.status, 'waiting');
  assert.equal(full.state.activity.occupied_count, 2);
  assert.equal(full.state.occupiedWrites, 0);
  assert.deepEqual(
    [...full.state.notifications.keys()],
    [`waitlist_entered_${waiting._id}_${now.getTime()}`],
  );
});

test('不限人数活动超过内部容量基线后仍直接报名', async () => {
  const unlimited = fixture({
    activity: {
      registration_unlimited: true,
      occupied_count: 500,
      capacity: 500,
      self_drive_occupied_count: 500,
      self_drive_capacity: 500,
      support_vehicle_occupied_count: 0,
      support_vehicle_capacity: 0,
      support_vehicle_driver: undefined,
    },
  });
  const result = await submit(unlimited, 'member-unlimited');
  assert.equal(result.status, 'pending');
  assert.equal(unlimited.state.activity.occupied_count, 501);
});

test('取消按 created_at FIFO 补位且 occupied_count 保持不变', async () => {
  const active = registration('active', 'pending', '2026-09-01T00:00:00Z');
  const late = registration('late', 'waiting', '2026-09-03T00:00:00Z');
  const early = registration('early', 'waiting', '2026-09-02T00:00:00Z');
  const store = fixture({
    activity: { occupied_count: 1, self_drive_occupied_count: 1 },
    registrations: [active, late, early],
  });
  await cancelRegistration(store, { openid: 'active', registrationId: 'active' }, now);
  assert.equal(store.state.registrations.get('early').status, 'pending');
  assert.equal(store.state.registrations.get('late').status, 'waiting');
  assert.equal(store.state.activity.occupied_count, 1);
  assert.equal(store.state.occupiedWrites, 1);
  assert.ok([...store.state.notifications.keys()][0].startsWith('waitlist_promoted_early_'));
});

test('释放保障车名额后可补位因总容量等待的自驾候补', async () => {
  const active = registration(
    'support-active',
    'pending',
    '2026-09-01T00:00:00Z',
    'support_vehicle',
  );
  const other = registration('self-active', 'pending', '2026-09-01T01:00:00Z');
  const waiting = registration('self-waiting', 'waiting', '2026-09-02T00:00:00Z');
  const store = fixture({
    activity: {
      capacity: 2,
      occupied_count: 2,
      support_vehicle_capacity: 1,
      support_vehicle_occupied_count: 1,
      self_drive_capacity: 2,
      self_drive_occupied_count: 1,
    },
    registrations: [active, other, waiting],
  });

  await cancelRegistration(
    store,
    { openid: 'support-active', registrationId: 'support-active' },
    now,
  );

  assert.equal(store.state.registrations.get('self-waiting').status, 'pending');
  assert.equal(store.state.activity.occupied_count, 2);
  assert.equal(store.state.activity.support_vehicle_occupied_count, 0);
  assert.equal(store.state.activity.self_drive_occupied_count, 2);
});

test('全局 FIFO 跳过分类仍满候补，保留其顺序并补位最早可容纳者', async () => {
  const supportActive = registration(
    'support-active',
    'pending',
    '2026-09-01T00:00:00Z',
    'support_vehicle',
  );
  const selfActive = registration('self-active', 'pending', '2026-09-01T01:00:00Z');
  const earlySupport = registration(
    'early-support',
    'waiting',
    '2026-09-02T00:00:00Z',
    'support_vehicle',
  );
  const lateSelf = registration('late-self', 'waiting', '2026-09-03T00:00:00Z');
  const store = fixture({
    activity: {
      capacity: 2,
      occupied_count: 2,
      support_vehicle_capacity: 1,
      support_vehicle_occupied_count: 1,
      self_drive_capacity: 2,
      self_drive_occupied_count: 1,
    },
    registrations: [supportActive, selfActive, earlySupport, lateSelf],
  });

  await cancelRegistration(store, { openid: 'self-active', registrationId: 'self-active' }, now);

  assert.equal(store.state.registrations.get('early-support').status, 'waiting');
  assert.equal(store.state.registrations.get('early-support').created_at, earlySupport.created_at);
  assert.equal(store.state.registrations.get('late-self').status, 'pending');
  assert.equal(store.state.activity.support_vehicle_occupied_count, 1);
  assert.equal(store.state.activity.self_drive_occupied_count, 1);
});

test('无候补时释放名额，重复 cancel 幂等且不重复释放', async () => {
  const active = registration('active', 'pending', '2026-09-01T00:00:00Z');
  const store = fixture({
    activity: { occupied_count: 1, self_drive_occupied_count: 1 },
    registrations: [active],
  });
  await cancelRegistration(store, { openid: 'active', registrationId: 'active' }, now);
  await cancelRegistration(store, { openid: 'active', registrationId: 'active' }, now);
  assert.equal(store.state.activity.occupied_count, 0);
  assert.equal(store.state.occupiedWrites, 1);
});

test('重复 reject 幂等；首个 reject 与补位在同一事务语义中完成', async () => {
  const active = registration('active', 'pending', '2026-09-01T00:00:00Z');
  const waiting = registration('waiting', 'waiting', '2026-09-02T00:00:00Z');
  const store = fixture({
    activity: { occupied_count: 1, self_drive_occupied_count: 1 },
    registrations: [active, waiting],
  });
  await reviewRegistration(
    store,
    { openid: 'admin', registrationId: 'active', action: 'reject', reason: '资料不符' },
    now,
  );
  const auditCount = store.state.audits.length;
  await reviewRegistration(
    store,
    { openid: 'admin', registrationId: 'active', action: 'reject', reason: '资料不符' },
    now,
  );
  assert.equal(store.state.registrations.get('waiting').status, 'pending');
  assert.equal(store.state.activity.occupied_count, 1);
  assert.equal(store.state.audits.length, auditCount);
});

test('team_id 参数校验、创建队伍与加入队伍均独立报名', async () => {
  assert.throws(() => validateTeamInput({ team_id: '../bad' }), { code: 'VALIDATION_FAILED' });
  const store = fixture();
  const leader = await submit(store, 'leader', { team: { team_name: '破风小队' } });
  assert.equal(leader.is_team_leader, true);
  const member = await submit(store, 'member', {
    team: { team_id: leader.team_id },
    options: { gathering_mode: 'support_vehicle', experience: 'regular' },
  });
  assert.equal(member.team_name, '破风小队');
  assert.equal(member.is_team_leader, false);
  assert.equal(store.state.activity.occupied_count, 2);
});

test('已取消或驳回队长的邀请链接失效', async () => {
  for (const status of ['cancelled', 'rejected']) {
    const leader = {
      ...registration(`leader-${status}`, status, '2026-09-01T00:00:00Z'),
      team_id: 'team_existing1',
      team_name: '破风小队',
      is_team_leader: true,
    };
    const store = fixture({ registrations: [leader] });
    await assert.rejects(
      submit(store, `member-${status}`, { team: { team_id: 'team_existing1' } }),
      (error) => error.code === 'TEAM_NOT_FOUND' && error.message === '队伍邀请已失效',
    );
  }
});

test('旧数据无 team 字段仍可公开读取；事务冲突重试不会产生额外业务分支', async () => {
  const old = registration('old', 'pending', '2026-09-01T00:00:00Z');
  const store = fixture({ registrations: [old] });
  assert.equal(store.state.registrations.get('old').team_id, undefined);
  let attempts = 0;
  const retrying = {
    transaction: async (work) => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('transaction conflict');
        error.code = 'TRANSACTION_CONFLICT';
        throw error;
      }
      return store.transaction(work);
    },
  };
  await assert.rejects(submit(retrying, 'retry-member'), { code: 'TRANSACTION_CONFLICT' });
  assert.equal(attempts, 1);
  assert.equal(store.state.activity.occupied_count, 0);
});
