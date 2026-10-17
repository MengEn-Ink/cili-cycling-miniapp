'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  saveDraft,
  submitApplication,
  reviewApplication,
  listJoinableClubs,
  joinPublicClub,
} = require('./core');
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
        getClub: (id) => state.clubs.get(id),
        getMembership: (id) => state.memberships.get(id),
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
  assert.equal(club.avatar_url, valid().cover_file_id);
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

const publicClubId = `club_${'a'.repeat(64)}`;
const joinableClub = (overrides = {}) => ({
  _id: publicClubId,
  name: '山海骑行会',
  city: '深圳',
  introduction: '每周组织安全友好的骑行活动',
  avatar_url: 'cloud://env/clubs/avatar.jpg',
  approval_status: 'approved',
  status: 'active',
  join_mode: 'public_apply',
  owner_openid: 'secret-owner',
  ...overrides,
});

test('可加入列表只保留可用公开俱乐部并返回安全投影', () => {
  const result = listJoinableClubs([
    joinableClub(),
    joinableClub({ _id: `club_${'b'.repeat(64)}`, status: 'disabled' }),
    joinableClub({ _id: `club_${'c'.repeat(64)}`, approval_status: 'pending' }),
    joinableClub({ _id: `club_${'d'.repeat(64)}`, join_mode: 'invite_code' }),
  ]);
  assert.deepEqual(result, [
    {
      id: publicClubId,
      name: '山海骑行会',
      city: '深圳',
      introduction: '每周组织安全友好的骑行活动',
      avatar_url: 'cloud://env/clubs/avatar.jpg',
    },
  ]);
  assert.equal(Object.hasOwn(result[0], 'owner_openid'), false);
  assert.equal(
    listJoinableClubs(
      Array.from({ length: 101 }, (_, index) =>
        joinableClub({ _id: `club_${index.toString(16).padStart(64, '0')}` }),
      ),
    ).length,
    100,
  );
});

test('列表投影仅在 avatar_url 缺失时回退存量 cover_file_id', () => {
  const legacy = joinableClub({ cover_file_id: 'cloud://env/legacy/cover.jpg' });
  delete legacy.avatar_url;
  assert.equal(listJoinableClubs([legacy])[0].avatar_url, 'cloud://env/legacy/cover.jpg');
  assert.equal(
    listJoinableClubs([
      joinableClub({ avatar_url: '', cover_file_id: 'cloud://env/legacy/cover.jpg' }),
    ])[0].avatar_url,
    '',
  );
});

test('公开加入创建 MEMBER active 并写审计，重复加入幂等', async () => {
  const store = memoryStore();
  store.state.clubs.set(publicClubId, joinableClub());
  const first = await joinPublicClub(
    store,
    { openid: 'joiner-1', clubId: publicClubId, requestId: 'join-request-0001' },
    now,
  );
  const second = await joinPublicClub(
    store,
    { openid: 'joiner-1', clubId: publicClubId, requestId: 'join-request-0002' },
    now,
  );
  assert.deepEqual(first, second);
  assert.equal(first.role, 'MEMBER');
  assert.equal(first.status, 'active');
  assert.equal(store.state.memberships.size, 1);
  assert.equal(store.state.audits.length, 1);
});

test('inactive 管理角色公开重加入全部降为 MEMBER，管理角色只能走授权流程恢复', async () => {
  for (const role of ['OWNER', 'ADMIN', 'ORGANIZER']) {
    const store = memoryStore();
    store.state.clubs.set(publicClubId, joinableClub());
    const existingId = require('node:crypto')
      .createHash('sha256')
      .update(`${publicClubId}\0joiner-1`)
      .digest('hex');
    store.state.memberships.set(`clubmem_${existingId}`, {
      _id: `clubmem_${existingId}`,
      club_id: publicClubId,
      openid: 'joiner-1',
      role,
      status: 'inactive',
    });
    const result = await joinPublicClub(
      store,
      { openid: 'joiner-1', clubId: publicClubId, requestId: `join-${role}-0001` },
      now,
    );
    assert.equal(result.role, 'MEMBER', role);
    assert.equal([...store.state.memberships.values()][0].role, 'MEMBER', role);
  }
});

test('已有 active membership 幂等返回并保留角色', async () => {
  for (const role of ['OWNER', 'ADMIN', 'ORGANIZER', 'MEMBER']) {
    const store = memoryStore();
    store.state.clubs.set(publicClubId, joinableClub());
    const existingId = require('node:crypto')
      .createHash('sha256')
      .update(`${publicClubId}\0joiner-1`)
      .digest('hex');
    store.state.memberships.set(`clubmem_${existingId}`, {
      _id: `clubmem_${existingId}`,
      club_id: publicClubId,
      openid: 'joiner-1',
      role,
      status: 'active',
    });

    const result = await joinPublicClub(
      store,
      { openid: 'joiner-1', clubId: publicClubId, requestId: `active-${role}-0001` },
      now,
    );

    assert.equal(result.role, role);
    assert.equal([...store.state.memberships.values()][0].role, role);
    assert.equal(store.state.audits.length, 0);
  }
});

test('公开加入拒绝非法 ID、不可用与非公开俱乐部', async () => {
  const store = memoryStore();
  await assert.rejects(
    () => joinPublicClub(store, { openid: 'joiner-1', clubId: 'bad', requestId: 'join-0001' }, now),
    /俱乐部 ID 无效/,
  );
  store.state.clubs.set(publicClubId, joinableClub({ status: 'disabled' }));
  await assert.rejects(
    () =>
      joinPublicClub(
        store,
        { openid: 'joiner-1', clubId: publicClubId, requestId: 'join-0002' },
        now,
      ),
    /暂不可加入/,
  );
  store.state.clubs.set(publicClubId, joinableClub({ join_mode: 'invite_code' }));
  await assert.rejects(
    () =>
      joinPublicClub(
        store,
        { openid: 'joiner-1', clubId: publicClubId, requestId: 'join-0003' },
        now,
      ),
    /不支持公开加入/,
  );
});
