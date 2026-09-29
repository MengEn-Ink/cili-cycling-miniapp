'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DomainError,
  validateActivityInput,
  assertStatusTransition,
  publicActivity,
  saveActivity,
} = require('./domain-index');
const now = new Date('2026-09-29T04:00:00.000Z');
const input = {
  title: ' 环湖骑行 ',
  cover_image: '',
  description: '说明',
  schedule: [{ time: '08:00', title: '集合', location: '起点' }],
  route: { start: '甲', end: '乙', distance_km: 80, elevation_m: 500, level: '进阶' },
  notices: ['戴头盔'],
  equipment: ['公路车'],
  fee: '免费',
  capacity: 20,
  support_vehicle_capacity: 8,
  self_drive_capacity: 12,
  support_vehicle_driver: {
    nickname: ' 王师傅 ',
    license_plate: ' 粤b12345 ',
    contact_phone: '13812345678',
  },
  signup_deadline: '2026-10-10T00:00:00.000Z',
  event_start: '2026-10-11T00:00:00.000Z',
  event_end: '2026-10-11T08:00:00.000Z',
  status: 'draft',
};
function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof DomainError && error.code === code);
}
function store(current, admin = { _id: 'admin', enabled: true }, registrations = []) {
  const state = { current, registrations, backfillReads: 0, saved: undefined, audits: [] };
  return {
    state,
    transaction: (work) =>
      work({
        getAdmin: async () => admin,
        getActivity: async () => state.current,
        getOccupyingRegistrations: async () => {
          state.backfillReads += 1;
          return state.registrations;
        },
        createActivityId: async () => 'activity_new',
        putActivity: async (_id, value) => {
          state.saved = value;
        },
        addAudit: async (value) => state.audits.push(value),
      }),
  };
}
test('活动输入清洗且公开响应只含白名单', () => {
  const value = validateActivityInput(input, 3);
  assert.equal(value.title, '环湖骑行');
  assert.equal(value.fee.remark, '免费');
  assert.ok(value.event_start instanceof Date);
  assert.equal(publicActivity({ _id: 'a1', ...value, created_by: 'secret' }).created_by, undefined);
});
test('活动输入完整保留行程备注、GPX 与费用明细', () => {
  const value = validateActivityInput({
    ...input,
    schedule: [{ time: ' 08:00 ', title: ' 集合 ', location: ' 起点 ', remark: ' 停车场集合 ' }],
    route: { ...input.route, gpx_file_id: ' cloud://routes/a1.gpx ' },
    fee: { included: [' 保险 '], excluded: [' 午餐 '], remark: ' 现场结算 ' },
  });

  assert.deepEqual(value.schedule, [
    { time: '08:00', title: '集合', location: '起点', remark: '停车场集合' },
  ]);
  assert.equal(value.route.gpx_file_id, 'cloud://routes/a1.gpx');
  assert.deepEqual(value.fee, {
    included: ['保险'],
    excluded: ['午餐'],
    remark: '现场结算',
  });
});
test('校验容量、状态、关键时间、路线和嵌套字段', () => {
  expectCode(() => validateActivityInput({ ...input, capacity: 2 }, 3), 'CAPACITY_BELOW_OCCUPIED');
  expectCode(() => validateActivityInput({ ...input, capacity: 0 }), 'VALIDATION_FAILED');
  expectCode(() => validateActivityInput({ ...input, status: 'deleted' }), 'VALIDATION_FAILED');
  expectCode(
    () => validateActivityInput({ ...input, signup_deadline: 'bad' }),
    'VALIDATION_FAILED',
  );
  expectCode(
    () => validateActivityInput({ ...input, signup_deadline: input.event_start }),
    'INVALID_ACTIVITY_TIME',
  );
  expectCode(
    () => validateActivityInput({ ...input, event_end: input.event_start }),
    'INVALID_ACTIVITY_TIME',
  );
  expectCode(() => validateActivityInput({ ...input, route: null }), 'VALIDATION_FAILED');
  expectCode(
    () => validateActivityInput({ ...input, route: { ...input.route, distance_km: -1 } }),
    'VALIDATION_FAILED',
  );
  expectCode(() => validateActivityInput({ ...input, schedule: [null] }), 'VALIDATION_FAILED');
  expectCode(() => validateActivityInput({ ...input, notices: 'x' }), 'VALIDATION_FAILED');
  expectCode(() => validateActivityInput({ ...input, occupied_count: 0 }), 'FORBIDDEN_FIELD');
  expectCode(
    () =>
      validateActivityInput({
        ...input,
        capacity: 1001,
        support_vehicle_capacity: 500,
        self_drive_capacity: 501,
      }),
    'VALIDATION_FAILED',
  );
});
test('状态机仅允许 draft→published→finished，同状态可更新', () => {
  assert.doesNotThrow(() => assertStatusTransition('draft', 'draft'));
  assert.doesNotThrow(() => assertStatusTransition('draft', 'published'));
  assert.doesNotThrow(() => assertStatusTransition('published', 'finished'));
  expectCode(() => assertStatusTransition('published', 'draft'), 'INVALID_TRANSITION');
  expectCode(() => assertStatusTransition('finished', 'published'), 'INVALID_TRANSITION');
});
test('创建必须是草稿并写入服务端控制字段与审计', async () => {
  const memory = store(undefined);
  const result = await saveActivity(memory, { openid: 'admin', activity: input }, now);
  assert.equal(result._id, 'activity_new');
  assert.equal(memory.state.saved.occupied_count, 0);
  assert.equal(result.version, 1);
  assert.equal(memory.state.saved.version, 1);
  assert.equal(memory.state.saved.occupancy_partition_ready, true);
  assert.equal(memory.state.saved.support_vehicle_occupied_count, 0);
  assert.equal(memory.state.saved.self_drive_occupied_count, 0);
  assert.equal(memory.state.saved.created_by, 'admin');
  assert.equal(memory.state.audits[0].action, 'activity.create');
  await assert.rejects(
    saveActivity(
      store(undefined),
      { openid: 'admin', activity: { ...input, status: 'published' } },
      now,
    ),
    (error) => error.code === 'INVALID_TRANSITION',
  );
});
test('更新校验 expectedVersion、单调递增版本并区分发布审计', async () => {
  const current = {
    _id: 'a1',
    ...validateActivityInput(input),
    occupied_count: 4,
    version: 3,
    occupancy_partition_ready: true,
    support_vehicle_occupied_count: 1,
    self_drive_occupied_count: 3,
    created_by: 'first-admin',
    created_at: new Date('2026-01-01'),
  };
  const memory = store(current);
  const result = await saveActivity(
    memory,
    {
      openid: 'admin',
      activityId: 'a1',
      expectedVersion: 3,
      activity: {
        ...input,
        status: 'published',
        capacity: 4,
        support_vehicle_capacity: 1,
        self_drive_capacity: 3,
      },
    },
    now,
  );
  assert.equal(result.status, 'published');
  assert.equal(result.version, 4);
  assert.equal(memory.state.saved.occupied_count, 4);
  assert.equal(memory.state.saved.created_by, 'first-admin');
  assert.equal(memory.state.audits[0].action, 'activity.publish');
  const conflict = store(current);
  await assert.rejects(
    saveActivity(conflict, {
      openid: 'admin',
      activityId: 'a1',
      expectedVersion: 2,
      activity: { ...input, status: 'published' },
    }),
    { code: 'ACTIVITY_CONFLICT' },
  );
  assert.equal(conflict.state.saved, undefined);
  await assert.rejects(
    saveActivity(store(undefined), {
      openid: 'admin',
      activityId: 'missing',
      expectedVersion: 0,
      activity: input,
    }),
    (error) => error.code === 'ACTIVITY_NOT_FOUND',
  );
  await assert.rejects(
    saveActivity(store(current, { _id: 'admin', enabled: false }), {
      openid: 'admin',
      activityId: 'a1',
      expectedVersion: 3,
      activity: input,
    }),
    (error) => error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    saveActivity(store({ ...current, occupied_count: -1 }), {
      openid: 'admin',
      activityId: 'a1',
      expectedVersion: 3,
      activity: input,
    }),
    (error) => error.code === 'SCHEMA_INVALID',
  );
});

test('普通成员可创建并发布自己的草稿，但不能编辑他人或结束活动', async () => {
  const createdStore = store(undefined, null);
  const created = await saveActivity(createdStore, { openid: 'member-1', activity: input }, now);
  assert.equal(created.status, 'draft');
  assert.equal(createdStore.state.saved.created_by, 'member-1');

  const ownDraft = createdStore.state.saved;
  const published = await saveActivity(
    store(ownDraft, null),
    {
      openid: 'member-1',
      activityId: ownDraft._id,
      expectedVersion: 1,
      activity: { ...input, status: 'published' },
    },
    now,
  );
  assert.equal(published.status, 'published');
  await assert.rejects(
    saveActivity(store({ ...ownDraft, created_by: 'other' }, null), {
      openid: 'member-1',
      activityId: ownDraft._id,
      expectedVersion: 1,
      activity: input,
    }),
    (error) => error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    saveActivity(store({ ...ownDraft, status: 'published' }, null), {
      openid: 'member-1',
      activityId: ownDraft._id,
      expectedVersion: 1,
      activity: { ...input, status: 'finished' },
    }),
    (error) => error.code === 'FORBIDDEN',
  );
});

test('司机字段清洗、容量拆分校验与公开手机号脱敏', () => {
  const value = validateActivityInput(input);
  assert.deepEqual(value.support_vehicle_driver, {
    nickname: '王师傅',
    license_plate: '粤B12345',
    contact_phone: '13812345678',
  });
  expectCode(
    () => validateActivityInput({ ...input, self_drive_capacity: 11 }),
    'VALIDATION_FAILED',
  );
  const publicValue = publicActivity({ _id: 'a1', ...value });
  assert.match(publicValue.support_vehicle_driver.contact_phone, /\*{4}/);
  const privateValue = publicActivity({ _id: 'a1', ...value }, { revealContact: true });
  assert.equal(
    privateValue.support_vehicle_driver.contact_phone,
    value.support_vehicle_driver.contact_phone,
  );
});

test('首次启用分仓按全部占位报名回填分类并写无 PII 审计摘要', async () => {
  const legacyInput = {
    ...input,
    capacity: 140,
    support_vehicle_capacity: 60,
    self_drive_capacity: 80,
  };
  const current = {
    _id: 'legacy',
    ...validateActivityInput(legacyInput),
    occupied_count: 125,
    created_by: 'admin',
  };
  delete current.support_vehicle_occupied_count;
  delete current.self_drive_occupied_count;
  const registrations = Array.from({ length: 125 }, (_, index) => ({
    _id: `r${index}`,
    status: index % 5 === 0 ? 'approved' : 'pending',
    options: { gathering_mode: index < 50 ? 'support_vehicle' : 'self_drive' },
  }));
  const memory = store(current, undefined, registrations);
  await saveActivity(
    memory,
    {
      openid: 'admin',
      activityId: 'legacy',
      expectedVersion: 0,
      activity: { ...legacyInput, title: '只改标题' },
    },
    now,
  );
  assert.equal(memory.state.saved.occupancy_partition_ready, true);
  assert.equal(memory.state.saved.support_vehicle_occupied_count, 50);
  assert.equal(memory.state.saved.self_drive_occupied_count, 75);
  assert.deepEqual(memory.state.audits[0].detail.occupancy_partition, {
    from: 'legacy',
    to: 'ready',
    support_vehicle_occupied_count: 50,
    self_drive_occupied_count: 75,
  });
});

test('首次启用分仓遇到未知集合方式时阻断且不写活动', async () => {
  const current = {
    _id: 'legacy',
    ...validateActivityInput(input),
    occupied_count: 1,
    created_by: 'admin',
  };
  const memory = store(current, undefined, [
    { _id: 'r1', status: 'pending', options: { gathering_mode: 'unknown' } },
  ]);

  await assert.rejects(
    saveActivity(
      memory,
      { openid: 'admin', activityId: 'legacy', expectedVersion: 0, activity: input },
      now,
    ),
    { code: 'PARTITION_BACKFILL_REQUIRED' },
  );
  assert.equal(memory.state.saved, undefined);
  assert.equal(memory.state.audits.length, 0);
});

test('首次启用分仓的报名统计与总占位不一致时阻断且不写活动', async () => {
  const current = {
    _id: 'legacy',
    ...validateActivityInput(input),
    occupied_count: 2,
    created_by: 'admin',
  };
  const memory = store(current, undefined, [
    { _id: 'r1', status: 'approved', options: { gathering_mode: 'self_drive' } },
  ]);

  await assert.rejects(
    saveActivity(
      memory,
      { openid: 'admin', activityId: 'legacy', expectedVersion: 0, activity: input },
      now,
    ),
    { code: 'PARTITION_BACKFILL_REQUIRED' },
  );
  assert.equal(memory.state.saved, undefined);
  assert.equal(memory.state.audits.length, 0);
});

test('首次启用分仓查询失败统一阻断且不写活动', async () => {
  const current = {
    _id: 'legacy',
    ...validateActivityInput(input),
    occupied_count: 1,
    created_by: 'admin',
  };
  const memory = store(current);
  memory.transaction = (work) =>
    work({
      getAdmin: async () => ({ _id: 'admin', enabled: true }),
      getActivity: async () => current,
      getOccupyingRegistrations: async () => {
        throw new Error('page 2 failed');
      },
      putActivity: async (_id, value) => {
        memory.state.saved = value;
      },
      addAudit: async (value) => memory.state.audits.push(value),
    });

  await assert.rejects(
    saveActivity(
      memory,
      { openid: 'admin', activityId: 'legacy', expectedVersion: 0, activity: input },
      now,
    ),
    { code: 'PARTITION_BACKFILL_REQUIRED' },
  );
  assert.equal(memory.state.saved, undefined);
  assert.equal(memory.state.audits.length, 0);
});

test('旧活动容量或占位数超过回填硬上限时在分页前阻断', async () => {
  const oversizedCapacity = {
    _id: 'legacy-capacity',
    ...validateActivityInput(input),
    capacity: 1001,
    occupied_count: 1,
    created_by: 'admin',
  };
  const capacityStore = store(oversizedCapacity);
  await assert.rejects(
    saveActivity(capacityStore, {
      openid: 'admin',
      activityId: oversizedCapacity._id,
      expectedVersion: 0,
      activity: input,
    }),
    { code: 'PARTITION_BACKFILL_REQUIRED' },
  );
  assert.equal(capacityStore.state.backfillReads, 0);
  assert.equal(capacityStore.state.saved, undefined);

  const oversizedOccupied = {
    _id: 'legacy-occupied',
    ...validateActivityInput(input),
    capacity: 1000,
    occupied_count: 1001,
    created_by: 'admin',
  };
  const occupiedStore = store(oversizedOccupied);
  await assert.rejects(
    saveActivity(occupiedStore, {
      openid: 'admin',
      activityId: oversizedOccupied._id,
      expectedVersion: 0,
      activity: {
        ...input,
        capacity: 1000,
        support_vehicle_capacity: 500,
        self_drive_capacity: 500,
      },
    }),
    { code: 'PARTITION_BACKFILL_REQUIRED' },
  );
  assert.equal(occupiedStore.state.backfillReads, 0);
  assert.equal(occupiedStore.state.saved, undefined);
});

test('结束活动使用独立审计动作', async () => {
  const current = {
    _id: 'a1',
    ...validateActivityInput({ ...input, status: 'published' }),
    occupied_count: 0,
    occupancy_partition_ready: true,
    support_vehicle_occupied_count: 0,
    self_drive_occupied_count: 0,
    version: 6,
    created_by: 'admin',
  };
  const memory = store(current);
  await saveActivity(memory, {
    openid: 'admin',
    activityId: 'a1',
    expectedVersion: 6,
    activity: { ...input, status: 'finished' },
  });
  assert.equal(memory.state.audits[0].action, 'activity.finish');
});

test('空 activity 在解引用前返回 VALIDATION_FAILED', async () => {
  await assert.rejects(saveActivity(store(undefined), { openid: 'admin', activity: undefined }), {
    code: 'VALIDATION_FAILED',
  });
});

test('公开电话对非标准文本、区号分机和非法类型均 fail closed', () => {
  for (const phone of ['12345', '010-12345678-分机9', 'not-a-phone']) {
    const output = publicActivity({ support_vehicle_driver: { contact_phone: phone } });
    assert.notEqual(output.support_vehicle_driver.contact_phone, phone);
    assert.match(output.support_vehicle_driver.contact_phone, /^\*|^$/);
  }
  assert.equal(
    publicActivity({ support_vehicle_driver: { contact_phone: { unsafe: true } } })
      .support_vehicle_driver.contact_phone,
    '',
  );
});
