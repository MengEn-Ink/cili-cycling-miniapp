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
  signup_deadline: '2026-10-10T00:00:00.000Z',
  event_start: '2026-10-11T00:00:00.000Z',
  event_end: '2026-10-11T08:00:00.000Z',
  status: 'draft',
};
function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof DomainError && error.code === code);
}
function store(current, admin = { _id: 'admin', enabled: true }) {
  const state = { current, saved: undefined, audits: [] };
  return {
    state,
    transaction: (work) =>
      work({
        getAdmin: async () => admin,
        getActivity: async () => state.current,
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
test('更新保留创建信息和占位数，拒绝越权、不存在与异常旧数据', async () => {
  const current = {
    _id: 'a1',
    ...validateActivityInput(input),
    occupied_count: 4,
    created_by: 'first-admin',
    created_at: new Date('2026-01-01'),
  };
  const memory = store(current);
  const result = await saveActivity(
    memory,
    { openid: 'admin', activityId: 'a1', activity: { ...input, status: 'published', capacity: 4 } },
    now,
  );
  assert.equal(result.status, 'published');
  assert.equal(memory.state.saved.occupied_count, 4);
  assert.equal(memory.state.saved.created_by, 'first-admin');
  assert.equal(memory.state.audits[0].action, 'activity.update');
  await assert.rejects(
    saveActivity(store(undefined), { openid: 'admin', activityId: 'missing', activity: input }),
    (error) => error.code === 'ACTIVITY_NOT_FOUND',
  );
  await assert.rejects(
    saveActivity(store(current, { _id: 'admin', enabled: false }), {
      openid: 'admin',
      activityId: 'a1',
      activity: input,
    }),
    (error) => error.code === 'ADMIN_REQUIRED',
  );
  await assert.rejects(
    saveActivity(store({ ...current, occupied_count: -1 }), {
      openid: 'admin',
      activityId: 'a1',
      activity: input,
    }),
    (error) => error.code === 'SCHEMA_INVALID',
  );
});
