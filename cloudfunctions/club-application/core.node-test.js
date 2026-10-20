'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.PROFILE_MEDIA_PATH_SECRET = 'profile-media-secret-for-tests-32-bytes';
const {
  saveDraft,
  submitApplication,
  withdrawApplication,
  reviewApplication,
  listJoinableClubs,
  joinPublicClub,
  getManagedClub,
  updateManagedClub,
  getSoleClubHome,
  getSoleClub,
  createSoleClub,
  updateSoleClub,
  membershipId,
  SOLE_CLUB_ID,
} = require('./core');

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

test('唯一俱乐部存在后旧审批通过入口关闭，不得创建第二条', async () => {
  const store = memoryStore();
  const existingId = 'club_' + 'a'.repeat(64);
  store.state.clubs.set(existingId, joinableClub({ _id: existingId }));
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
          adminOpenid: 'admin-1',
          applicationId: pending.id,
          decision: 'approved',
          requestId: 'review-0001',
        },
        now,
      ),
    (error) =>
      error.code === 'CLUB_CREATION_DISABLED' &&
      /单俱乐部模式已关闭旧审批创建入口/.test(error.message),
  );
  assert.equal(store.state.clubs.size, 1);
  assert.equal(store.state.clubs.get(existingId).name, '山海骑行会');
  assert.equal(store.state.applications.get(pending.id).status, 'pending_review');
  assert.equal(store.state.memberships.size, 0);
});

test('历史已通过申请继续支持幂等读取且不再创建俱乐部', async () => {
  const store = memoryStore();
  const id = 'legacy-approved-application';
  store.state.applications.set(id, {
    _id: id,
    applicant_openid: 'legacy-owner',
    club_name: '存量骑行会',
    status: 'approved',
    club_id: 'club_' + 'c'.repeat(64),
    review_version: 1,
  });

  const approved = await reviewApplication(
    store,
    {
      adminOpenid: 'admin-1',
      applicationId: id,
      decision: 'approved',
      requestId: 'legacy-review-read-1',
    },
    now,
  );
  assert.equal(approved.status, 'approved');
  assert.equal(approved.club_id, 'club_' + 'c'.repeat(64));
  assert.equal(store.state.clubs.size, 0);
  assert.equal(store.state.memberships.size, 0);
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

test('空库也不允许旧审批通过入口恢复创建能力', async () => {
  const store = memoryStore();
  const pending = await submitApplication(
    store,
    { openid: 'capacity-owner', input: valid('capacity-owner'), requestId: 'capacity-submit-1' },
    now,
  );
  await assert.rejects(
    () =>
      reviewApplication(
        store,
        {
          adminOpenid: 'admin-1',
          applicationId: pending.id,
          decision: 'approved',
          requestId: 'capacity-review-1',
        },
        now,
      ),
    (error) => error.code === 'CLUB_CREATION_DISABLED',
  );
  assert.equal(store.state.clubs.size, 0);
  assert.equal(store.state.memberships.size, 0);
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

test('申请人可按版本撤回审核中申请，同 requestId 幂等且重提版本递增', async () => {
  const store = memoryStore();
  const pending = await submitApplication(
    store,
    { openid: 'user-1', input: valid(), requestId: 'submit-withdraw-1' },
    now,
  );
  const first = await withdrawApplication(
    store,
    { openid: 'user-1', requestId: 'withdraw-0001', expectedReviewVersion: 1 },
    now,
  );
  const duplicate = await withdrawApplication(
    store,
    { openid: 'user-1', requestId: 'withdraw-0001', expectedReviewVersion: 1 },
    now,
  );
  assert.equal(first.status, 'draft');
  assert.deepEqual(duplicate, first);
  assert.equal(first.review_version, pending.review_version);
  assert.deepEqual(
    store.state.audits.find((item) => item.action === 'club_application_withdrawn'),
    {
      actor_openid: 'user-1',
      action: 'club_application_withdrawn',
      target_type: 'club_application',
      target_id: pending.id,
      before: { status: 'pending_review' },
      after: { status: 'draft' },
      before_status: 'pending_review',
      after_status: 'draft',
      review_version: 1,
      request_id: 'withdraw-0001',
      created_at: now.toISOString(),
    },
  );
  const resubmitted = await submitApplication(
    store,
    { openid: 'user-1', input: valid(), requestId: 'submit-withdraw-2' },
    now,
  );
  assert.equal(resubmitted.review_version, 2);
});

test('撤回拒绝错误版本、不同 requestId 的草稿以及 approved/rejected 状态', async () => {
  for (const expectedReviewVersion of [undefined, 0, 2]) {
    const store = memoryStore();
    await submitApplication(
      store,
      { openid: 'user-1', input: valid(), requestId: 'submit-version-1' },
      now,
    );
    await assert.rejects(
      () =>
        withdrawApplication(
          store,
          { openid: 'user-1', requestId: 'withdraw-version', expectedReviewVersion },
          now,
        ),
      (error) => error.code === 'VERSION_CONFLICT',
    );
  }

  const draftStore = memoryStore();
  await submitApplication(
    draftStore,
    { openid: 'user-1', input: valid(), requestId: 'submit-draft-1' },
    now,
  );
  await withdrawApplication(
    draftStore,
    { openid: 'user-1', requestId: 'withdraw-draft-1', expectedReviewVersion: 1 },
    now,
  );
  await assert.rejects(
    () =>
      withdrawApplication(
        draftStore,
        { openid: 'user-1', requestId: 'withdraw-draft-2', expectedReviewVersion: 1 },
        now,
      ),
    (error) => error.code === 'INVALID_STATE',
  );

  for (const decision of ['approved', 'rejected']) {
    const store = memoryStore();
    const pending = await submitApplication(
      store,
      { openid: 'user-1', input: valid(), requestId: `submit-${decision}` },
      now,
    );
    if (decision === 'rejected') {
      await reviewApplication(
        store,
        {
          adminOpenid: 'admin-1',
          applicationId: pending.id,
          decision,
          reason: '资料需要调整后重新提交',
          requestId: 'review-rejected',
        },
        now,
      );
    } else {
      store.state.applications.set(pending.id, {
        ...store.state.applications.get(pending.id),
        status: 'approved',
      });
    }
    await assert.rejects(
      () =>
        withdrawApplication(
          store,
          { openid: 'user-1', requestId: `withdraw-${decision}`, expectedReviewVersion: 1 },
          now,
        ),
      (error) => error.code === 'INVALID_STATE',
    );
  }
});

test('事务串行化时撤回与管理员审批并发只能一个成功', async () => {
  const store = memoryStore();
  const runTransaction = store.transaction;
  let tail = Promise.resolve();
  store.transaction = (work) => {
    const result = tail.then(() => runTransaction(work));
    tail = result.catch(() => undefined);
    return result;
  };
  const pending = await submitApplication(
    store,
    { openid: 'user-1', input: valid(), requestId: 'submit-race-1' },
    now,
  );
  const results = await Promise.allSettled([
    withdrawApplication(
      store,
      { openid: 'user-1', requestId: 'withdraw-race-1', expectedReviewVersion: 1 },
      now,
    ),
    reviewApplication(
      store,
      {
        adminOpenid: 'admin-1',
        applicationId: pending.id,
        decision: 'approved',
        requestId: 'review-race-1',
      },
      now,
    ),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
  assert.equal(store.state.applications.get(pending.id).status, 'draft');
  assert.equal(store.state.clubs.size, 0);
});

test('非申请人无法撤回他人的审核中申请', async () => {
  const store = memoryStore();
  await submitApplication(
    store,
    { openid: 'user-1', input: valid(), requestId: 'submit-owner-1' },
    now,
  );
  await assert.rejects(
    () =>
      withdrawApplication(
        store,
        { openid: 'user-2', requestId: 'withdraw-owner-1', expectedReviewVersion: 1 },
        now,
      ),
    (error) => error.code === 'NOT_FOUND',
  );
});

const soleInput = (openid = 'admin-1') => ({
  name: '辛庄桥小火车',
  city: '北京',
  introduction: '全平台唯一的示例俱乐部，管理员在空库时首次创建的资料。',
  avatar_file_id: canonicalClubMedia(openid, 'club-avatar'),
  cover_file_id: canonicalClubMedia(openid, 'club-cover'),
});

test('空库读取唯一俱乐部返回 exists:false 且不报错', async () => {
  const store = memoryStore();
  const empty = await getSoleClub(store, { adminOpenid: 'admin-1', clubId: '' });
  assert.deepEqual(empty, { exists: false });
  const missing = await getSoleClub(store, {
    adminOpenid: 'admin-1',
    clubId: `club_${'0'.repeat(64)}`,
  });
  assert.deepEqual(missing, { exists: false });
});

test('非管理员读取或创建唯一俱乐部均被拒绝', async () => {
  const store = memoryStore();
  await assert.rejects(
    () => getSoleClub(store, { adminOpenid: 'user-1', clubId: '' }),
    /管理员权限/,
  );
  await assert.rejects(
    () =>
      createSoleClub(
        store,
        {
          adminOpenid: 'user-1',
          existingClubId: '',
          input: soleInput('user-1'),
          requestId: 'sole-denied-1',
        },
        now,
      ),
    /管理员权限/,
  );
  assert.equal(store.state.clubs.size, 0);
});

test('空库首次创建唯一俱乐部，固定 ID 落库并按 requestId 幂等', async () => {
  const store = memoryStore();
  const created = await createSoleClub(
    store,
    {
      adminOpenid: 'admin-1',
      existingClubId: '',
      input: soleInput(),
      requestId: 'sole-create-1',
    },
    now,
  );
  assert.equal(created.exists, true);
  assert.equal(created.club.id, SOLE_CLUB_ID);
  assert.equal(created.club.name, '辛庄桥小火车');
  assert.equal(store.state.clubs.size, 1);
  const stored = store.state.clubs.get(SOLE_CLUB_ID);
  assert.equal(stored._id, SOLE_CLUB_ID);
  assert.equal(stored.source, 'admin_bootstrap');
  assert.equal(stored.approval_status, 'approved');
  assert.equal(stored.status, 'active');
  assert.equal(stored.owner_openid, 'admin-1');

  const fetched = await getSoleClub(store, {
    adminOpenid: 'admin-1',
    clubId: SOLE_CLUB_ID,
  });
  assert.equal(fetched.exists, true);
  assert.equal(fetched.club.city, '北京');

  // 响应丢失后重试同一 requestId 必须幂等，不能新建第二个俱乐部。
  const replay = await createSoleClub(
    store,
    {
      adminOpenid: 'admin-1',
      existingClubId: SOLE_CLUB_ID,
      input: { ...soleInput(), name: '重试不应覆盖的名称' },
      requestId: 'sole-create-1',
    },
    now,
  );
  assert.deepEqual(replay, created);
  assert.equal(store.state.clubs.size, 1);
  assert.equal(store.state.clubs.get(SOLE_CLUB_ID).name, '辛庄桥小火车');
});

test('已存在俱乐部时再次创建失败：兼容旧审批流 ID 与固定 ID 两种路径', async () => {
  const legacyId = `club_${'d'.repeat(64)}`;
  const legacyStore = memoryStore();
  legacyStore.state.clubs.set(legacyId, {
    _id: legacyId,
    name: '旧审批流俱乐部',
    city: '深圳',
    introduction: '由旧申请审批流程创建的存量俱乐部，数据必须保留。',
    join_mode: 'public_apply',
    avatar_url: canonicalClubMedia('owner', 'club-avatar'),
    approval_status: 'approved',
    status: 'active',
  });
  await assert.rejects(
    () =>
      createSoleClub(
        legacyStore,
        {
          adminOpenid: 'admin-1',
          existingClubId: legacyId,
          input: soleInput(),
          requestId: 'sole-legacy-1',
        },
        now,
      ),
    (error) =>
      error.code === 'CLUB_ALREADY_EXISTS' && /全平台只允许存在一个俱乐部/.test(error.message),
  );
  assert.equal(legacyStore.state.clubs.get(legacyId).name, '旧审批流俱乐部');

  const store = memoryStore();
  await createSoleClub(
    store,
    {
      adminOpenid: 'admin-1',
      existingClubId: '',
      input: soleInput(),
      requestId: 'sole-create-existing-1',
    },
    now,
  );
  await assert.rejects(
    () =>
      createSoleClub(
        store,
        {
          adminOpenid: 'admin-1',
          existingClubId: '',
          input: soleInput(),
          requestId: 'sole-create-existing-2',
        },
        now,
      ),
    (error) => error.code === 'CLUB_ALREADY_EXISTS',
  );
  assert.equal(store.state.clubs.size, 1);
});

test('并发首次创建串行化后只有一个成功，第二个收到中文冲突错误', async () => {
  const store = memoryStore();
  const runTransaction = store.transaction;
  let tail = Promise.resolve();
  store.transaction = (work) => {
    const result = tail.then(() => runTransaction(work));
    tail = result.catch(() => undefined);
    return result;
  };
  const results = await Promise.allSettled([
    createSoleClub(
      store,
      {
        adminOpenid: 'admin-1',
        existingClubId: '',
        input: soleInput(),
        requestId: 'sole-race-1',
      },
      now,
    ),
    createSoleClub(
      store,
      {
        adminOpenid: 'admin-1',
        existingClubId: '',
        input: soleInput(),
        requestId: 'sole-race-2',
      },
      now,
    ),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  const rejected = results.find((item) => item.status === 'rejected');
  assert.equal(rejected.reason.code, 'CLUB_ALREADY_EXISTS');
  assert.match(rejected.reason.message, /全平台只允许存在一个俱乐部/);
  assert.equal(store.state.clubs.size, 1);
});

test('平台管理员更新唯一俱乐部成功并按 requestId 幂等', async () => {
  const store = memoryStore();
  const created = await createSoleClub(
    store,
    {
      adminOpenid: 'admin-1',
      existingClubId: '',
      input: soleInput(),
      requestId: 'sole-update-setup-1',
    },
    now,
  );
  const updated = await updateSoleClub(
    store,
    {
      adminOpenid: 'admin-1',
      clubId: SOLE_CLUB_ID,
      requestId: 'sole-update-1',
      expectedUpdatedAt: created.club.updated_at,
      input: { ...soleInput(), name: '辛庄桥快车', city: '上海' },
    },
    new Date('2026-10-20T08:00:00.000Z'),
  );
  assert.equal(updated.exists, true);
  assert.equal(updated.club.name, '辛庄桥快车');
  assert.equal(updated.club.city, '上海');
  assert.equal(store.state.clubs.get(SOLE_CLUB_ID).name, '辛庄桥快车');
  assert.equal(store.state.audits.at(-1).action, 'sole_club_profile_updated');

  // 响应丢失重试同一 requestId：即使携带过期内容也返回首次结果。
  const replay = await updateSoleClub(
    store,
    {
      adminOpenid: 'admin-1',
      clubId: SOLE_CLUB_ID,
      requestId: 'sole-update-1',
      expectedUpdatedAt: created.club.updated_at,
      input: { ...soleInput(), name: '过期重放名称' },
    },
    new Date('2026-10-20T09:00:00.000Z'),
  );
  assert.deepEqual(replay, updated);
  assert.equal(store.state.clubs.get(SOLE_CLUB_ID).name, '辛庄桥快车');
});

test('更新唯一俱乐部执行乐观锁，旧版本失败并返回中文提示', async () => {
  const store = memoryStore();
  const created = await createSoleClub(
    store,
    {
      adminOpenid: 'admin-1',
      existingClubId: '',
      input: soleInput(),
      requestId: 'sole-conflict-setup-1',
    },
    now,
  );
  await updateSoleClub(
    store,
    {
      adminOpenid: 'admin-1',
      clubId: SOLE_CLUB_ID,
      requestId: 'sole-conflict-update-1',
      expectedUpdatedAt: created.club.updated_at,
      input: { ...soleInput(), city: '广州' },
    },
    new Date('2026-10-20T08:00:00.000Z'),
  );
  await assert.rejects(
    () =>
      updateSoleClub(
        store,
        {
          adminOpenid: 'admin-1',
          clubId: SOLE_CLUB_ID,
          requestId: 'sole-conflict-update-2',
          expectedUpdatedAt: created.club.updated_at,
          input: { ...soleInput(), name: '迟到的改名' },
        },
        new Date('2026-10-20T09:00:00.000Z'),
      ),
    (error) =>
      error.code === 'CLUB_PROFILE_CONFLICT' &&
      /已被其他管理员更新，请重新加载/.test(error.message),
  );
  assert.equal(store.state.clubs.get(SOLE_CLUB_ID).name, '辛庄桥小火车');
});

test('OWNER/ADMIN 仅展示俱乐部身份，不能绕过平台管理员权限更新资料', async () => {
  const store = memoryStore();
  const created = await createSoleClub(
    store,
    {
      adminOpenid: 'admin-1',
      existingClubId: '',
      input: soleInput(),
      requestId: 'sole-manager-setup-1',
    },
    now,
  );
  for (const [openid, role] of [
    ['owner-1', 'OWNER'],
    ['club-admin-1', 'ADMIN'],
  ]) {
    store.state.memberships.set(membershipId(SOLE_CLUB_ID, openid), {
      _id: membershipId(SOLE_CLUB_ID, openid),
      club_id: SOLE_CLUB_ID,
      openid,
      role,
      status: 'active',
    });
    await assert.rejects(
      () =>
        updateSoleClub(
          store,
          {
            adminOpenid: openid,
            clubId: SOLE_CLUB_ID,
            requestId: `sole-manager-update-${role.toLowerCase()}`,
            expectedUpdatedAt: created.club.updated_at,
            input: soleInput(),
          },
          new Date('2026-10-20T09:00:00.000Z'),
        ),
      (error) => error.code === 'ADMIN_REQUIRED',
    );
  }
});

const homeProjectionClubId = `club_${'f'.repeat(64)}`;
const publicClub = {
  _id: homeProjectionClubId,
  name: '辛庄桥小火车',
  city: '北京',
  introduction: '全平台唯一俱乐部，固定路线晨练与周末骑行活动。',
  avatar_url: 'cloud://env/club-applications/admin/avatar.jpg',
  cover_file_id: 'cloud://env/club-applications/admin/cover.jpg',
  owner_openid: 'owner-1',
  applicant_contact: 'secret-contact',
  member_count: 3,
  max_members: 50,
  join_mode: 'public_apply',
  approval_status: 'approved',
  status: 'active',
};

test('普通成员读取唯一俱乐部时只返回公开投影且不可管理', async () => {
  const store = memoryStore();
  store.state.clubs.set(homeProjectionClubId, publicClub);
  const home = await getSoleClubHome(store, { openid: 'member-1', clubId: homeProjectionClubId });
  assert.equal(home.role, 'VISITOR');
  assert.equal(home.role_label, '骑友');
  assert.equal(home.can_manage, false);
  assert.deepEqual(Object.keys(home.club).sort(), [
    'avatar_file_id',
    'city',
    'cover_file_id',
    'id',
    'introduction',
    'name',
  ]);
});

test('OWNER/ADMIN 身份可展示但 can_manage 仍为 false', async () => {
  for (const [openid, role, label] of [
    ['owner-1', 'OWNER', '负责人'],
    ['club-admin-1', 'ADMIN', '管理员'],
  ]) {
    const store = memoryStore();
    store.state.clubs.set(homeProjectionClubId, publicClub);
    store.state.memberships.set(membershipId(homeProjectionClubId, openid), {
      _id: membershipId(homeProjectionClubId, openid),
      club_id: homeProjectionClubId,
      openid,
      role,
      status: 'active',
    });
    const home = await getSoleClubHome(store, { openid, clubId: homeProjectionClubId });
    assert.equal(home.role, role);
    assert.equal(home.role_label, label);
    assert.equal(home.can_manage, false);
  }
});

test('admin_users 中启用的平台管理员 can_manage 为 true', async () => {
  const store = memoryStore();
  store.state.clubs.set(homeProjectionClubId, publicClub);
  const home = await getSoleClubHome(store, { openid: 'admin-1', clubId: homeProjectionClubId });
  assert.equal(home.role, 'PLATFORM_ADMIN');
  assert.equal(home.role_label, '平台管理员');
  assert.equal(home.can_manage, true);
});

test('唯一俱乐部资料只允许白名单字段，受保护字段由服务端拒绝', async () => {
  const store = memoryStore();
  await createSoleClub(
    store,
    {
      adminOpenid: 'admin-1',
      existingClubId: '',
      input: soleInput(),
      requestId: 'sole-field-setup-1',
    },
    now,
  );
  await assert.rejects(
    () =>
      createSoleClub(
        store,
        {
          adminOpenid: 'admin-1',
          existingClubId: '',
          input: { ...soleInput(), owner_openid: 'attacker', approval_status: 'pending' },
          requestId: 'sole-field-create-1',
        },
        now,
      ),
    (error) => error.code === 'FORBIDDEN_FIELD',
  );
});
