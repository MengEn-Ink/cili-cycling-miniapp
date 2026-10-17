'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { saveDraft, submitApplication, reviewApplication } = require('./core');
const { activeApprovedClub } = require('../profile/club-memberships');
const { resolveTrustedClubIdentity } = require('../activity-admin/use-cases');

const valid = (openid = 'user-1') => ({
  club_name: '山海骑行会',
  city: '深圳',
  introduction: '我们每周组织安全、友好的公路骑行训练活动。',
  applicant_contact: 'wx: rider123',
  join_mode: 'public_apply',
  expected_size: 30,
  activity_types: '公路骑行、爬坡训练',
  rules_summary: '遵守交通规则，佩戴头盔，服从领队安排。',
  cover_file_id: `cloud://env/club-applications/${openid}/cover.jpg`,
});
function memoryStore() {
  const state = {
    applications: new Map(),
    clubs: new Map(),
    memberships: new Map(),
    audits: [],
    admins: new Map([['admin-1', { _id: 'admin-1', enabled: true }]]),
  };
  return {
    state,
    transaction: (work) =>
      work({
        getAdmin: (id) => state.admins.get(id),
        getApplication: (id) => state.applications.get(id),
        putApplication: (id, value) => state.applications.set(id, { ...value }),
        putClub: (id, value) => state.clubs.set(id, { ...value }),
        putMembership: (id, value) => state.memberships.set(id, { ...value }),
        addAudit: (value) => state.audits.push(value),
      }),
  };
}
const now = new Date('2026-10-17T12:00:00.000Z');

test('草稿、提交、驳回修改重提形成闭环', async () => {
  const store = memoryStore();
  const draft = await saveDraft(store, { openid: 'user-1', input: valid() }, now);
  assert.equal(draft.status, 'draft');
  const pending = await submitApplication(
    store,
    { openid: 'user-1', input: valid(), requestId: 'submit-0001' },
    now,
  );
  assert.equal(pending.status, 'pending_review');
  assert.equal(pending.review_version, 1);
  const rejected = await reviewApplication(
    store,
    {
      adminOpenid: 'admin-1',
      applicationId: pending.id,
      decision: 'rejected',
      reason: '请补充城市骑行安全规则',
      requestId: 'review-0001',
    },
    now,
  );
  assert.equal(rejected.status, 'rejected');
  await saveDraft(
    store,
    {
      openid: 'user-1',
      input: { ...valid(), rules_summary: '遵守交通规则，佩戴头盔，夜骑开启车灯并服从领队安排。' },
    },
    now,
  );
  const retried = await submitApplication(
    store,
    { openid: 'user-1', input: valid(), requestId: 'submit-0002' },
    now,
  );
  assert.equal(retried.review_version, 2);
});

test('审批通过原子创建俱乐部与 OWNER，重复审批幂等', async () => {
  const store = memoryStore();
  const pending = await submitApplication(
    store,
    { openid: 'user-1', input: valid(), requestId: 'submit-0001' },
    now,
  );
  const first = await reviewApplication(
    store,
    {
      adminOpenid: 'admin-1',
      applicationId: pending.id,
      decision: 'approved',
      requestId: 'review-0001',
    },
    now,
  );
  const second = await reviewApplication(
    store,
    {
      adminOpenid: 'admin-1',
      applicationId: pending.id,
      decision: 'approved',
      requestId: 'review-0002',
    },
    now,
  );
  assert.equal(first.club_id, second.club_id);
  assert.equal(store.state.clubs.size, 1);
  const club = [...store.state.clubs.values()][0];
  assert.equal(club.approval_status, 'approved');
  assert.equal(activeApprovedClub(club), true);
  await assert.doesNotReject(() =>
    resolveTrustedClubIdentity(
      {
        getClub: async () => club,
        getActiveClubMembership: async () => ({ role: 'OWNER', status: 'active' }),
      },
      { clubId: club._id, openid: 'user-1', isAdmin: false },
    ),
  );
  assert.equal(store.state.memberships.size, 1);
  assert.equal([...store.state.memberships.values()][0].role, 'OWNER');
});

test('非管理员不可审批且驳回原因必填', async () => {
  const store = memoryStore();
  const pending = await submitApplication(
    store,
    { openid: 'user-1', input: valid(), requestId: 'submit-0001' },
    now,
  );
  await assert.rejects(
    () =>
      reviewApplication(
        store,
        {
          adminOpenid: 'user-1',
          applicationId: pending.id,
          decision: 'approved',
          requestId: 'review-0001',
        },
        now,
      ),
    /管理员权限/,
  );
  await assert.rejects(
    () =>
      reviewApplication(
        store,
        {
          adminOpenid: 'admin-1',
          applicationId: pending.id,
          decision: 'rejected',
          reason: '',
          requestId: 'review-0002',
        },
        now,
      ),
    /驳回原因/,
  );
});
