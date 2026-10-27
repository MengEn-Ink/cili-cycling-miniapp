'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  submitRegistration,
  cancelRegistration,
  deleteRegistration,
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
      ...seed.profile,
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
    deleteRegistration: async (id) => state.registrations.delete(id),
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

test('公开模式普通用户有名额直接通过，审核模式与旧数据仍待审批', async () => {
  const open = fixture({ activity: { registration_mode: 'open' } });
  const approved = await submit(open, 'member-open');
  assert.equal(approved.status, 'approved');
  assert.ok(approved.serial_no);
  assert.equal(approved.review_history[0].comment, '公开报名自动通过');
  assert.equal(open.state.audits[0].action, 'registration.open_auto_approved');

  const approval = fixture({ activity: { registration_mode: 'approval' } });
  assert.equal((await submit(approval, 'member-approval')).status, 'pending');

  const legacy = fixture();
  assert.equal((await submit(legacy, 'member-legacy')).status, 'pending');
});

test('缺 generation 的旧客户端兼容 g1 和 g2，并始终写入服务端实际代际', async () => {
  for (const [profile, expectedGeneration] of [
    [{}, 1],
    [{ generation: 2 }, 2],
  ]) {
    const store = fixture({ profile });
    const dto = await submit(store, `legacy-g${expectedGeneration}`);
    assert.equal(store.state.registrations.get(dto._id).profile_generation, expectedGeneration);
    assert.equal(dto.profile_generation, undefined);
  }
});

test('显式 generation 匹配时写入服务端实际代际且不以公共同意替代本人报名资料', async () => {
  const generationTwo = fixture({
    profile: {
      generation: 2,
      avatar_visibility: 'private',
      public_consent: {
        nickname: { consented: false },
        media: { consented: false },
      },
    },
  });
  const dto = await submit(generationTwo, 'private-member', { generation: 2 });
  const stored = generationTwo.state.registrations.get(dto._id);
  assert.equal(stored.profile_generation, 2);
  assert.equal(stored.profile_snapshot.nickname, '骑手');
  assert.equal(dto.profile_snapshot.nickname, '骑手');
  assert.equal(dto.profile_generation, undefined);
});

test('显式过时代际被严格拒绝且不产生写副作用', async () => {
  const store = fixture({ profile: { generation: 2, deletion_status: 'active' } });
  await assert.rejects(() => submit(store, 'stale-member', { generation: 1 }), {
    code: 'PROFILE_GENERATION_MISMATCH',
  });
  assert.equal(store.state.registrations.size, 0);
  assert.equal(store.state.occupiedWrites, 0);
  assert.equal(store.state.audits.length, 0);
});

test('删除锁优先阻断报名且不产生写副作用', async () => {
  const store = fixture({ profile: { generation: 2, deletion_status: 'pending' } });
  await assert.rejects(() => submit(store, 'locked-member'), {
    code: 'PROFILE_DELETION_LOCKED',
  });
  assert.equal(store.state.registrations.size, 0);
  assert.equal(store.state.occupiedWrites, 0);
  assert.equal(store.state.audits.length, 0);
});

test('非法服务端代际被拒绝且不产生写副作用', async () => {
  const store = fixture({ profile: { generation: 0 } });
  await assert.rejects(() => submit(store, 'invalid-generation-member'), {
    code: 'PROFILE_GENERATION_INVALID',
  });
  assert.equal(store.state.registrations.size, 0);
  assert.equal(store.state.occupiedWrites, 0);
  assert.equal(store.state.audits.length, 0);
});

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

test('管理员报名在有名额时自动通过，满员时仍按候补处理', async () => {
  const available = fixture();
  const approved = await submit(available, 'admin');
  assert.equal(approved.status, 'approved');
  assert.equal(available.state.activity.occupied_count, 1);
  const stored = available.state.registrations.get(approved._id);
  assert.ok(stored.approved_at instanceof Date);
  assert.match(approved.serial_no, /^RE-20261001-/);
  assert.deepEqual(approved.review_history, [
    {
      reviewed_at: now,
      action: 'approve',
      comment: '管理员报名自动通过',
    },
  ]);
  assert.equal(stored.review_history[0].reviewer_openid, 'admin');
  assert.equal(available.state.audits[0].action, 'registration.admin_auto_approved');

  const full = fixture({
    activity: {
      occupied_count: 2,
      self_drive_occupied_count: 1,
      support_vehicle_occupied_count: 1,
    },
  });
  const waiting = await submit(full, 'admin');
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.approved_at, undefined);
  assert.equal(full.state.activity.occupied_count, 2);
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

test('公开活动满员先候补，释放名额后按 FIFO 自动通过', async () => {
  const active = registration('active-open', 'approved', '2026-09-01T00:00:00Z');
  const waiting = registration('waiting-open', 'waiting', '2026-09-02T00:00:00Z');
  const store = fixture({
    activity: {
      registration_mode: 'open',
      capacity: 1,
      occupied_count: 1,
      self_drive_capacity: 1,
      self_drive_occupied_count: 1,
    },
    registrations: [active, waiting],
  });

  await cancelRegistration(store, { openid: 'active-open', registrationId: 'active-open' }, now);

  const promoted = store.state.registrations.get('waiting-open');
  assert.equal(promoted.status, 'approved');
  assert.equal(promoted.review_history[0].comment, '公开报名候补补位自动通过');
  assert.equal(store.state.activity.occupied_count, 1);
});

test('管理员候补释放名额后自动通过并补齐审批凭证', async () => {
  const active = registration('active', 'pending', '2026-09-01T00:00:00Z');
  const waitingAdmin = registration('admin', 'waiting', '2026-09-02T00:00:00Z');
  const store = fixture({
    activity: { occupied_count: 1, self_drive_occupied_count: 1 },
    registrations: [active, waitingAdmin],
  });

  await cancelRegistration(store, { openid: 'active', registrationId: 'active' }, now);

  const promoted = store.state.registrations.get('admin');
  assert.equal(promoted.status, 'approved');
  assert.ok(promoted.approved_at instanceof Date);
  assert.match(promoted.serial_no, /^RE-20261001-/);
  assert.equal(promoted.review_history[0].reviewer_openid, 'admin');
  assert.equal(promoted.review_history[0].comment, '管理员候补补位自动通过');
  assert.equal(store.state.audits[0].detail.to_status, 'approved');
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

test('仅本人可删除已取消行程，删除保留审计且不影响名额', async () => {
  const cancelled = registration('member-1', 'cancelled', '2026-09-01T00:00:00Z');
  const pending = registration('member-2', 'pending', '2026-09-02T00:00:00Z');
  const store = fixture({
    activity: { occupied_count: 1, self_drive_occupied_count: 1 },
    registrations: [cancelled, pending],
  });

  await assert.rejects(
    deleteRegistration(store, { openid: 'other', registrationId: 'member-1' }, now),
    { code: 'REGISTRATION_NOT_FOUND' },
  );
  await assert.rejects(
    deleteRegistration(store, { openid: 'member-2', registrationId: 'member-2' }, now),
    { code: 'INVALID_TRANSITION' },
  );
  await deleteRegistration(store, { openid: 'member-1', registrationId: 'member-1' }, now);
  await assert.doesNotReject(() =>
    deleteRegistration(store, { openid: 'member-1', registrationId: 'member-1' }, now),
  );

  assert.equal(store.state.registrations.has('member-1'), false);
  assert.equal(store.state.activity.occupied_count, 1);
  assert.equal(store.state.occupiedWrites, 0);
  assert.equal(store.state.audits.at(-1).action, 'registration.deleted');
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
