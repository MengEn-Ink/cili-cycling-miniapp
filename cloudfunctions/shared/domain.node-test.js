'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DomainError,
  assertNoForbiddenFields,
  registrationId,
  isOccupying,
  assertActivityOpen,
  assertProfileReady,
  selectStrava,
  validateOptions,
  assertCanSubmit,
  assertCanCancel,
  assertReviewTransition,
  isEnabledAdmin,
  publicActivity,
  publicRegistration,
  buildAudit,
  submitRegistration,
  cancelRegistration,
  reviewRegistration,
} = require('./index');

const openid = 'openid-unit-test-only';
const now = new Date('2026-09-28T12:00:00.000Z');
const activity = {
  _id: 'a1',
  title: 'test',
  status: 'published',
  is_deleted: false,
  signup_deadline: '2026-10-01T00:00:00.000Z',
  capacity: 2,
  occupied_count: 0,
  created_by: 'secret',
};
const profile = {
  _id: openid,
  nickname: '骑手',
  real_name_masked: '曹*',
  phone_masked: '138****5678',
  id_number_masked: '11******1234',
  sensitive_status: {
    phone_verified: true,
    identity_encrypted: true,
    emergency_contact_encrypted: true,
  },
  strava: { status: 'connected', snapshot: { activities_90d: 10, weighted_avg_speed_kmh: 25 } },
};

function expectCode(fn, code) {
  assert.throws(fn, (error) => error instanceof DomainError && error.code === code);
}
function memoryStore(seed = {}) {
  const state = {
    activities: new Map([['a1', { ...activity, ...(seed.activity || {}) }]]),
    profiles: new Map([[openid, { ...profile, ...(seed.profile || {}) }]]),
    registrations: new Map(
      seed.registration ? [[seed.registration._id, { ...seed.registration }]] : [],
    ),
    admins: new Map([[openid, { _id: openid, enabled: true }]]),
    audits: [],
  };
  let queue = Promise.resolve();
  return {
    state,
    transaction(work) {
      const run = queue.then(() =>
        work({
          getActivity: async (id) => state.activities.get(id),
          getProfile: async (id) => state.profiles.get(id),
          getRegistration: async (id) => state.registrations.get(id),
          getAdmin: async (id) => state.admins.get(id),
          putRegistration: async (id, value) => state.registrations.set(id, { ...value }),
          setOccupied: async (id, value) => {
            state.activities.get(id).occupied_count = value;
          },
          addAudit: async (value) => state.audits.push(value),
        }),
      );
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

const input = {
  openid,
  activityId: 'a1',
  options: { bike_mode: 'own', experience: 'regular', remark: 'ok' },
};

test('提交校验活动、资料、Strava 和客户端越权字段', () => {
  expectCode(
    () => assertActivityOpen({ ...activity, status: 'draft' }, now),
    'ACTIVITY_NOT_AVAILABLE',
  );
  expectCode(
    () => assertActivityOpen({ ...activity, signup_deadline: now.toISOString() }, now),
    'SIGNUP_CLOSED',
  );
  expectCode(() => assertProfileReady({ nickname: 'x' }), 'PROFILE_INCOMPLETE');
  expectCode(() => selectStrava({ strava: {} }), 'STRAVA_REQUIRED');
  assert.equal(
    selectStrava({ strava: { exempt: { enabled: true, reason: '人工核验' } } }).status,
    'exempted',
  );
  expectCode(
    () => validateOptions({ bike_mode: 'other', experience: 'regular' }),
    'VALIDATION_FAILED',
  );
  expectCode(() => assertNoForbiddenFields({ options: { status: 'approved' } }), 'FORBIDDEN_FIELD');
});

test('占位口径仅 pending+approved', () => {
  assert.equal(isOccupying('pending'), true);
  assert.equal(isOccupying('approved'), true);
  assert.equal(isOccupying('rejected'), false);
  assert.equal(isOccupying('cancelled'), false);
});

test('确定性幂等键稳定且不同用户不同', () => {
  assert.equal(registrationId('a1', openid), registrationId('a1', openid));
  assert.notEqual(registrationId('a1', openid), registrationId('a1', 'other'));
});

test('重复占位提交拒绝，驳回或取消后沿原记录重报并保留历史', async () => {
  expectCode(() => assertCanSubmit({ status: 'pending' }), 'REGISTRATION_EXISTS');
  const id = registrationId('a1', openid);
  const store = memoryStore({
    registration: {
      _id: id,
      activity_id: 'a1',
      openid,
      status: 'rejected',
      review_history: [{ action: 'reject' }],
      created_at: now,
    },
  });
  const result = await submitRegistration(store, input, new Date('2026-09-29T00:00:00Z'));
  assert.equal(result.status, 'pending');
  assert.equal(store.state.registrations.get(id).review_history.length, 1);
  assert.equal(store.state.activities.get('a1').occupied_count, 1);
});

test('事务边界在满员时不写入；并发提交不会超过 capacity', async () => {
  const full = memoryStore({ activity: { capacity: 1, occupied_count: 1 } });
  await assert.rejects(
    submitRegistration(full, input, now),
    (error) => error.code === 'CAPACITY_FULL',
  );
  assert.equal(full.state.registrations.size, 0);

  const store = memoryStore({ activity: { capacity: 1 } });
  const secondProfile = { ...profile, _id: 'other' };
  store.state.profiles.set('other', secondProfile);
  const settled = await Promise.allSettled([
    submitRegistration(store, input, now),
    submitRegistration(store, { ...input, openid: 'other' }, now),
  ]);
  assert.deepEqual(settled.map((x) => x.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(store.state.activities.get('a1').occupied_count, 1);
});

test('取消仅本人 pending/approved 并在事务内释放名额', async () => {
  const id = registrationId('a1', openid);
  const registration = {
    _id: id,
    activity_id: 'a1',
    openid,
    status: 'approved',
    review_history: [],
  };
  expectCode(() => assertCanCancel(registration, 'other'), 'FORBIDDEN');
  expectCode(
    () => assertCanCancel({ ...registration, status: 'rejected' }, openid),
    'INVALID_TRANSITION',
  );
  const store = memoryStore({ activity: { occupied_count: 1 }, registration });
  const result = await cancelRegistration(store, { openid, registrationId: id }, now);
  assert.equal(result.status, 'cancelled');
  assert.equal(store.state.activities.get('a1').occupied_count, 0);
});

test('审批状态机、理由与管理员判断', async () => {
  assert.equal(isEnabledAdmin({ _id: openid, enabled: true }, openid), true);
  assert.equal(isEnabledAdmin({ _id: openid, enabled: false }, openid), false);
  expectCode(() => assertReviewTransition('approved', 'reject', 'x'), 'INVALID_TRANSITION');
  expectCode(() => assertReviewTransition('pending', 'reject', ' '), 'REASON_REQUIRED');
  const id = registrationId('a1', openid);
  const registration = {
    _id: id,
    activity_id: 'a1',
    openid,
    status: 'pending',
    review_history: [],
  };
  const store = memoryStore({ activity: { occupied_count: 1 }, registration });
  const result = await reviewRegistration(
    store,
    { openid, registrationId: id, action: 'reject', reason: '资料需补充' },
    now,
  );
  assert.equal(result.status, 'rejected');
  assert.equal(store.state.activities.get('a1').occupied_count, 0);
  assert.equal(store.state.audits.length, 1);
});

test('活动和报名响应只含白名单字段并脱敏', () => {
  const a = publicActivity({ ...activity, internal_note: 'x', updated_at: now });
  assert.equal(a.internal_note, undefined);
  assert.equal(a.created_by, undefined);
  const r = publicRegistration({
    _id: 'r',
    activity_id: 'a1',
    openid,
    status: 'pending',
    token: 'secret',
    review_history: [{ reviewer_openid: 'admin-secret', action: 'reject', comment: 'x' }],
    strava_snapshot: { activities_90d: 10, access_token: 'secret' },
    profile_snapshot: {
      nickname: 'n',
      phone_masked: '13812345678',
      id_number_masked: '110101199001011234',
    },
  });
  assert.equal(r.openid, undefined);
  assert.equal(r.token, undefined);
  assert.equal(r.strava_snapshot.activities_90d, 10);
  assert.equal(r.strava_snapshot.access_token, undefined);
  assert.equal(r.review_history[0].reviewer_openid, undefined);
  assert.equal(r.profile_snapshot.phone_masked, '138****5678');
  assert.equal(r.profile_snapshot.id_number_masked, '11******1234');
});

test('审计日志只保留安全字段，不含手机号证件号和 token', () => {
  const log = buildAudit(openid, 'registration.reject', 'r1', now, {
    reason: '不符合要求',
    phone: 'secret',
    id_number: 'secret',
    token: 'secret',
  });
  const text = JSON.stringify(log);
  assert.equal(log.actor_openid, openid);
  assert.equal(log.target_id, 'r1');
  assert.equal(text.includes('phone'), false);
  assert.equal(text.includes('id_number'), false);
  assert.equal(text.includes('token'), false);
});
