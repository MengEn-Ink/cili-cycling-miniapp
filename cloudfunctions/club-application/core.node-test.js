'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.PROFILE_MEDIA_PATH_SECRET = 'profile-media-secret-for-tests-32-bytes';
const {
  saveDraft,
  submitApplication,
  reviewApplication,
  listJoinableClubs,
  joinPublicClub,
  getManagedClub,
  updateManagedClub,
  membershipId,
} = require('./core');
const { activeApprovedClub } = require('../profile/club-memberships');
const { resolveTrustedClubIdentity } = require('../activity-admin/use-cases');

const canonicalClubMedia = (openid, category, extension = 'jpg') => {
  const alias = crypto
    .createHmac('sha256', process.env.PROFILE_MEDIA_PATH_SECRET)
    .update(openid)
    .digest('hex')
    .slice(0, 32);
  return `cloud://env/profile-canonical/${alias}/${category}/${'a'.repeat(64)}/${'b'.repeat(64)}.${extension}`;
};

const valid = (openid = 'user-1') => ({
  club_name: '山海骑行会',
  city: '深圳',
  introduction: '我们每周组织安全、友好的公路骑行训练活动。',
  applicant_contact: 'wx: rider123',
  join_mode: 'public_apply',
  expected_size: 30,
  activity_types: '公路骑行、爬坡训练',
  rules_summary: '遵守交通规则，佩戴头盔，服从领队安排。',
  avatar_file_id: canonicalClubMedia(openid, 'club-avatar'),
  cover_file_id: canonicalClubMedia(openid, 'club-cover'),
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
        countActiveMemberships: (clubId) =>
          [...state.memberships.values()].filter(
            (item) => item.club_id === clubId && item.status === 'active',
          ).length,
        getAudit: (id) => state.audits.find((item) => item._id === id),
        putApplication: (id, value) => state.applications.set(id, { ...value }),
        putClub: (id, value) => state.clubs.set(id, { ...value }),
        putMembership: (id, value) => state.memberships.set(id, { ...value }),
        putAudit: (id, value) => {
          const index = state.audits.findIndex((item) => item._id === id);
          if (index >= 0) state.audits[index] = { ...value };
          else state.audits.push({ ...value });
        },
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
  assert.equal(club.avatar_url, valid().avatar_file_id);
  assert.equal(club.cover_file_id, valid().cover_file_id);
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

test('存量申请缺少头像时审批保留空头像，绝不使用背景兜底', async () => {
  const store = memoryStore();
  const id = 'legacy-application';
  store.state.applications.set(id, {
    _id: id,
    applicant_openid: 'legacy-owner',
    club_name: '存量骑行会',
    city: '深圳',
    introduction: '这是一个历史申请，只有背景照片但没有独立头像字段。',
    join_mode: 'public_apply',
    expected_size: 30,
    cover_file_id: 'cloud://env/club-applications/legacy-owner/cover.jpg',
    status: 'pending_review',
    review_version: 1,
  });

  const approved = await reviewApplication(
    store,
    {
      adminOpenid: 'admin-1',
      applicationId: id,
      decision: 'approved',
      requestId: 'legacy-review-1',
    },
    now,
  );
  const club = store.state.clubs.get(approved.club_id);
  assert.equal(club.avatar_url, '');
  assert.equal(club.cover_file_id, 'cloud://env/club-applications/legacy-owner/cover.jpg');
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
      cover_file_id: '',
      capacity_initialized: false,
      member_count: 0,
      max_members: 50,
    },
  ]);
  assert.equal(Object.hasOwn(result[0], 'owner_openid'), false);
  assert.equal(
    listJoinableClubs([joinableClub({ member_count: 12, max_members: 50 })])[0]
      .capacity_initialized,
    true,
  );
  assert.equal(
    listJoinableClubs(
      Array.from({ length: 101 }, (_, index) =>
        joinableClub({ _id: `club_${index.toString(16).padStart(64, '0')}` }),
      ),
    ).length,
    100,
  );
});

test('列表与详情头像不再回退背景，背景保持独立投影', () => {
  const legacy = joinableClub({ cover_file_id: 'cloud://env/legacy/cover.jpg' });
  delete legacy.avatar_url;
  const projected = listJoinableClubs([legacy])[0];
  assert.equal(projected.avatar_url, '');
  assert.equal(projected.cover_file_id, 'cloud://env/legacy/cover.jpg');
});

test('推荐按 active membership 排除，inactive 与新用户仍可见', () => {
  const secondId = `club_${'b'.repeat(64)}`;
  const clubs = [joinableClub(), joinableClub({ _id: secondId })];
  assert.deepEqual(
    listJoinableClubs(clubs, [publicClubId]).map((item) => item.id),
    [secondId],
  );
  assert.equal(listJoinableClubs(clubs, []).length, 2);
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

test('OWNER 与 ADMIN 可读取俱乐部资料，普通成员不可读取', async () => {
  const store = memoryStore();
  const id = `club_${'a'.repeat(64)}`;
  store.state.clubs.set(id, {
    _id: id,
    name: '山海骑行会',
    city: '深圳',
    introduction: '我们每周组织安全、友好的公路骑行训练活动。',
    join_mode: 'public_apply',
    avatar_url: 'cloud://env/club-applications/user-1/cover.jpg',
    approval_status: 'approved',
    status: 'active',
    updated_at: now.toISOString(),
  });
  store.state.memberships.set(membershipId(id, 'user-1'), {
    club_id: id,
    openid: 'user-1',
    role: 'OWNER',
    status: 'active',
  });
  store.state.memberships.set(membershipId(id, 'user-2'), {
    club_id: id,
    openid: 'user-2',
    role: 'ADMIN',
    status: 'active',
  });
  store.state.memberships.set(membershipId(id, 'user-3'), {
    club_id: id,
    openid: 'user-3',
    role: 'MEMBER',
    status: 'active',
  });

  await assert.doesNotReject(() => getManagedClub(store, { openid: 'user-1', clubId: id }));
  await assert.doesNotReject(() => getManagedClub(store, { openid: 'user-2', clubId: id }));
  await assert.rejects(
    () => getManagedClub(store, { openid: 'user-3', clubId: id }),
    (error) => error.code === 'CLUB_ADMIN_REQUIRED',
  );
});

test('管理员更新资料时服务端只写允许字段并记录审计', async () => {
  const store = memoryStore();
  const id = `club_${'b'.repeat(64)}`;
  store.state.clubs.set(id, {
    _id: id,
    name: '旧名称',
    city: '深圳',
    introduction: '这是修改之前的俱乐部介绍，长度满足服务端校验。',
    join_mode: 'public_apply',
    avatar_url: 'cloud://env/club-applications/user-1/old-avatar.jpg',
    cover_file_id: 'cloud://env/club-applications/user-1/old-cover.jpg',
    owner_openid: 'user-1',
    approval_status: 'approved',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  });
  store.state.memberships.set(membershipId(id, 'user-2'), {
    club_id: id,
    openid: 'user-2',
    role: 'ADMIN',
    status: 'active',
  });

  const updated = await updateManagedClub(
    store,
    {
      openid: 'user-2',
      clubId: id,
      requestId: 'club-update-0001',
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      input: {
        name: '新名称骑行会',
        city: '广州',
        introduction: '这是修改后的俱乐部介绍，清晰说明定位和日常活动安排。',
        join_mode: 'admin_invite',
        avatar_file_id: canonicalClubMedia('user-2', 'club-avatar'),
        cover_file_id: canonicalClubMedia('user-2', 'club-cover'),
        max_members: 120,
      },
    },
    now,
  );

  assert.equal(updated.name, '新名称骑行会');
  assert.equal(updated.avatar_file_id, canonicalClubMedia('user-2', 'club-avatar'));
  assert.equal(updated.cover_file_id, canonicalClubMedia('user-2', 'club-cover'));
  const stored = store.state.clubs.get(id);
  assert.equal(stored.owner_openid, 'user-1');
  assert.equal(stored.status, 'active');
  assert.equal(stored.approval_status, 'approved');
  assert.equal(stored.avatar_url, canonicalClubMedia('user-2', 'club-avatar'));
  assert.equal(stored.cover_file_id, canonicalClubMedia('user-2', 'club-cover'));
  assert.equal(store.state.audits.at(-1).action, 'club_profile_updated');
  assert.equal(store.state.audits.at(-1).request_id, 'club-update-0001');
});

test('资料更新要求 active 管理身份、合法图片归属并支持同请求幂等', async () => {
  const store = memoryStore();
  const id = `club_${'c'.repeat(64)}`;
  store.state.clubs.set(id, {
    _id: id,
    name: '山海骑行会',
    city: '深圳',
    introduction: '我们每周组织安全、友好的公路骑行训练活动。',
    join_mode: 'public_apply',
    avatar_url: 'cloud://env/club-applications/user-1/old.jpg',
    approval_status: 'approved',
    status: 'active',
  });
  store.state.memberships.set(membershipId(id, 'user-1'), {
    club_id: id,
    openid: 'user-1',
    role: 'OWNER',
    status: 'active',
  });
  const input = {
    name: '山海骑行会',
    city: '深圳',
    introduction: '我们每周组织安全、友好的公路骑行训练活动。',
    join_mode: 'public_apply',
    avatar_file_id: canonicalClubMedia('user-1', 'club-avatar'),
    max_members: 50,
  };

  const first = await updateManagedClub(
    store,
    {
      openid: 'user-1',
      clubId: id,
      requestId: 'club-update-0001',
      expectedUpdatedAt: '',
      input,
    },
    now,
  );
  const second = await updateManagedClub(
    store,
    {
      openid: 'user-1',
      clubId: id,
      requestId: 'club-update-0001',
      expectedUpdatedAt: '',
      input: {
        ...input,
        name: '响应丢失后误改名称',
        avatar_file_id: 'cloud://env/club-applications/other-user/new.jpg',
      },
    },
    now,
  );
  assert.deepEqual(first, second);
  assert.equal(store.state.audits.length, 1);

  store.state.memberships.set(membershipId(id, 'user-2'), {
    club_id: id,
    openid: 'user-2',
    role: 'ADMIN',
    status: 'active',
  });
  const adminNow = new Date('2026-10-17T12:01:00.000Z');
  await updateManagedClub(
    store,
    {
      openid: 'user-2',
      clubId: id,
      requestId: 'club-update-admin',
      expectedUpdatedAt: first.updated_at,
      input: { ...input, name: '管理员更新名称' },
    },
    adminNow,
  );
  const delayedReplay = await updateManagedClub(
    store,
    {
      openid: 'user-1',
      clubId: id,
      requestId: 'club-update-0001',
      expectedUpdatedAt: '',
      input,
    },
    now,
  );
  assert.equal(delayedReplay.name, first.name);
  assert.equal(store.state.clubs.get(id).name, '管理员更新名称');
  assert.equal(store.state.audits.length, 2);

  await assert.rejects(
    () =>
      updateManagedClub(
        store,
        {
          openid: 'user-1',
          clubId: id,
          requestId: 'club-update-stale',
          expectedUpdatedAt: first.updated_at,
          input: { ...input, city: '广州' },
        },
        new Date('2026-10-17T12:02:00.000Z'),
      ),
    (error) => error.code === 'CLUB_PROFILE_CONFLICT',
  );
  assert.equal(store.state.clubs.get(id).name, '管理员更新名称');

  await assert.rejects(
    () =>
      updateManagedClub(
        store,
        {
          openid: 'user-1',
          clubId: id,
          requestId: 'club-update-0002',
          expectedUpdatedAt: adminNow.toISOString(),
          input: { ...input, owner_openid: 'attacker' },
        },
        now,
      ),
    (error) => error.code === 'FORBIDDEN_FIELD',
  );
  await assert.rejects(
    () =>
      updateManagedClub(
        store,
        {
          openid: 'user-1',
          clubId: id,
          requestId: 'club-update-0003',
          expectedUpdatedAt: adminNow.toISOString(),
          input: { ...input, avatar_file_id: 'cloud://env/club-applications/other-user/new.jpg' },
        },
        now,
      ),
    (error) => error.code === 'VALIDATION_FAILED',
  );
  await assert.rejects(
    () =>
      updateManagedClub(
        store,
        {
          openid: 'user-1',
          clubId: id,
          requestId: 'club-update-0004',
          expectedUpdatedAt: adminNow.toISOString(),
          input: {
            ...input,
            cover_file_id: 'cloud://env/club-applications/other-user/private-cover.jpg',
          },
        },
        now,
      ),
    (error) => error.code === 'VALIDATION_FAILED',
  );
  store.state.memberships.set(membershipId(id, 'user-1'), {
    club_id: id,
    openid: 'user-1',
    role: 'OWNER',
    status: 'inactive',
  });
  await assert.rejects(
    () => getManagedClub(store, { openid: 'user-1', clubId: id }),
    (error) => error.code === 'CLUB_ADMIN_REQUIRED',
  );
});

test('审批创建按预计规模初始化容量且 OWNER 计入成员数', async () => {
  const store = memoryStore();
  const pending = await submitApplication(
    store,
    { openid: 'capacity-owner', input: valid('capacity-owner'), requestId: 'capacity-submit-1' },
    now,
  );
  await reviewApplication(
    store,
    {
      adminOpenid: 'admin-1',
      applicationId: pending.id,
      decision: 'approved',
      requestId: 'capacity-review-1',
    },
    now,
  );
  const club = [...store.state.clubs.values()][0];
  assert.equal(club.max_members, 30);
  assert.equal(club.member_count, 1);
});

test('历史俱乐部在事务内按 active membership 回填容量字段', async () => {
  const store = memoryStore();
  const id = `club_${'e'.repeat(64)}`;
  store.state.clubs.set(id, joinableClub({ _id: id }));
  for (const [openid, status] of [
    ['owner', 'active'],
    ['member', 'active'],
    ['left', 'inactive'],
  ]) {
    store.state.memberships.set(membershipId(id, openid), {
      club_id: id,
      openid,
      role: openid === 'owner' ? 'OWNER' : 'MEMBER',
      status,
    });
  }
  const managed = await getManagedClub(store, { openid: 'owner', clubId: id });
  assert.equal(managed.member_count, 2);
  assert.equal(managed.max_members, 50);
  assert.equal(store.state.clubs.get(id).member_count, 2);
});

test('公开加入严格执行容量边界且重复加入不重复计数', async () => {
  const store = memoryStore();
  store.state.clubs.set(publicClubId, joinableClub({ member_count: 1, max_members: 2 }));
  await joinPublicClub(
    store,
    { openid: 'joiner-1', clubId: publicClubId, requestId: 'capacity-join-1' },
    now,
  );
  assert.equal(store.state.clubs.get(publicClubId).member_count, 2);
  await joinPublicClub(
    store,
    { openid: 'joiner-1', clubId: publicClubId, requestId: 'capacity-join-2' },
    now,
  );
  assert.equal(store.state.clubs.get(publicClubId).member_count, 2);
  await assert.rejects(
    () =>
      joinPublicClub(
        store,
        { openid: 'joiner-2', clubId: publicClubId, requestId: 'capacity-join-3' },
        now,
      ),
    (error) => error.code === 'CLUB_FULL',
  );
});

test('管理员人数上限拒绝非法值和低于当前成员数', async () => {
  const store = memoryStore();
  const id = `club_${'f'.repeat(64)}`;
  store.state.clubs.set(
    id,
    joinableClub({
      _id: id,
      member_count: 8,
      max_members: 20,
      updated_at: now.toISOString(),
      avatar_url: 'cloud://env/club-applications/owner/old.jpg',
    }),
  );
  store.state.memberships.set(membershipId(id, 'owner'), {
    club_id: id,
    openid: 'owner',
    role: 'OWNER',
    status: 'active',
  });
  const input = {
    name: '山海骑行会',
    city: '深圳',
    introduction: '我们每周组织安全、友好的公路骑行训练活动。',
    join_mode: 'public_apply',
    avatar_file_id: 'cloud://env/club-applications/owner/old.jpg',
  };
  for (const max_members of [1, 10001, 2.5]) {
    await assert.rejects(
      () =>
        updateManagedClub(
          store,
          {
            openid: 'owner',
            clubId: id,
            requestId: `invalid-max-${String(max_members)}`,
            expectedUpdatedAt: now.toISOString(),
            input: { ...input, max_members },
          },
          now,
        ),
      (error) => error.code === 'INVALID_MAX_MEMBERS',
    );
  }
  await assert.rejects(
    () =>
      updateManagedClub(
        store,
        {
          openid: 'owner',
          clubId: id,
          requestId: 'below-current-1',
          expectedUpdatedAt: now.toISOString(),
          input: { ...input, max_members: 7 },
        },
        now,
      ),
    (error) => error.code === 'MAX_MEMBERS_BELOW_CURRENT',
  );
});
