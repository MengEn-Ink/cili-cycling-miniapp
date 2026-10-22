'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
process.env.PROFILE_MEDIA_PATH_SECRET = 'profile-media-secret-for-tests-32-bytes';
const { applicationId, membershipId } = require('./core');

const canonicalClubMedia = (openid, category, marker) => {
  const alias = crypto
    .createHmac('sha256', process.env.PROFILE_MEDIA_PATH_SECRET)
    .update(openid)
    .digest('hex')
    .slice(0, 32);
  return `cloud://env/profile-canonical/${alias}/${category}/${marker.repeat(64)}/${marker.repeat(64)}.jpg`;
};

function loadHandler(application, options = {}) {
  const applications = application ? new Map([[application._id, { ...application }]]) : new Map();
  const clubs = new Map(Object.entries(options.clubs || {}));
  const admins = new Map(
    Object.entries(
      options.admins === undefined
        ? { 'user-handler': { _id: 'user-handler', enabled: true } }
        : options.admins,
    ),
  );
  const memberships = new Map(Object.entries(options.memberships || {}));
  const profileMedia = new Map(
    Object.entries(
      options.profileMedia || {
        avatar: {
          _id: 'avatar',
          canonical_file_id: canonicalClubMedia('user-handler', 'club-avatar', 'a'),
          owner_openid: 'user-handler',
          category: 'club-avatar',
          status: 'unreferenced',
          security_status: 'pass',
        },
        cover: {
          _id: 'cover',
          canonical_file_id: canonicalClubMedia('user-handler', 'club-cover', 'b'),
          owner_openid: 'user-handler',
          category: 'club-cover',
          status: 'unreferenced',
          security_status: 'pass',
        },
      },
    ),
  );
  const audits = [];
  const auditById = new Map();
  const sourceFor = (name) =>
    name === 'club_applications'
      ? applications
      : name === 'clubs'
        ? clubs
        : name === 'admins'
          ? admins
          : name === 'club_memberships'
            ? memberships
            : name === 'profile_media'
              ? profileMedia
              : name === 'audit_logs'
                ? auditById
                : null;
  const collection = (name) => ({
    doc: (id) => ({
      get: async () => {
        const value = sourceFor(name)?.get(id);
        if (!value) throw Object.assign(new Error('not found'), { errCode: -502001 });
        return { data: { ...value } };
      },
      set: async ({ data }) => {
        if (name === 'club_applications') applications.set(id, { _id: id, ...data });
        else if (name === 'clubs') clubs.set(id, { _id: id, ...data });
        else if (name === 'audit_logs') {
          const record = { _id: id, ...data };
          const index = audits.findIndex((item) => item._id === id);
          if (index >= 0) audits[index] = record;
          else audits.push(record);
          auditById.set(id, record);
        }
      },
      update: async ({ data }) => {
        const source = sourceFor(name);
        const current = source?.get(id);
        if (!current) throw Object.assign(new Error('not found'), { errCode: -502001 });
        source.set(id, { ...current, ...data });
      },
    }),
    add: async ({ data }) => {
      if (name === 'audit_logs') {
        audits.push(data);
        if (data._id) auditById.set(data._id, data);
      }
    },
    where: (query) => ({
      limit: (limit) => ({
        get: async () => ({
          data:
            name === 'profile_media'
              ? [...profileMedia.values()]
                  .filter((record) =>
                    Object.entries(query).every(([key, value]) => record[key] === value),
                  )
                  .slice(0, limit)
              : [],
        }),
      }),
      count: async () => ({ total: 0 }),
    }),
    orderBy: () => ({
      limit: (limit) => ({
        get: async () => ({
          data: [...clubs.values()]
            .sort((left, right) => String(left._id).localeCompare(String(right._id)))
            .slice(0, limit)
            .map((value) => ({ ...value })),
        }),
      }),
    }),
  });
  const db = {
    collection,
    runTransaction: async (work) => work({ collection }),
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => db,
    getWXContext: () => ({ OPENID: options.openid || 'user-handler' }),
    getTempFileURL: async () => ({ fileList: [] }),
    openapi: {
      security: {
        msgSecCheck:
          options.msgSecCheck || (async () => ({ errCode: 0, result: { suggest: 'pass' } })),
      },
    },
  };
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = require.resolve('./index');
  delete require.cache[modulePath];
  try {
    return { main: require('./index').main, applications, clubs, audits };
  } finally {
    Module._load = originalLoad;
  }
}

const soleClubInput = {
  name: '辛庄桥小火车',
  city: '北京',
  introduction: '全平台唯一俱乐部，管理员在空库时首次创建的资料简介。',
  avatar_file_id: canonicalClubMedia('user-handler', 'club-avatar', 'a'),
  cover_file_id: canonicalClubMedia('user-handler', 'club-cover', 'b'),
};

test('withdraw handler 接线 requestId 与 expectedReviewVersion 并返回 draft', async () => {
  const id = applicationId('user-handler');
  const { main, applications, audits } = loadHandler({
    _id: id,
    applicant_openid: 'user-handler',
    status: 'pending_review',
    review_version: 4,
    club_name: '山海骑行会',
    city: '深圳',
    join_mode: 'public_apply',
    expected_size: 30,
  });
  const response = await main({
    action: 'withdraw',
    requestId: 'handler-withdraw-1',
    expectedReviewVersion: 4,
  });
  assert.equal(response.ok, true);
  assert.equal(response.data.status, 'draft');
  assert.equal(response.data.review_version, 4);
  assert.equal(applications.get(id).status, 'draft');
  assert.equal(audits[0].action, 'club_application_withdrawn');
});

test('withdraw handler 将版本冲突映射为稳定错误响应', async () => {
  const id = applicationId('user-handler');
  const { main } = loadHandler({
    _id: id,
    applicant_openid: 'user-handler',
    status: 'pending_review',
    review_version: 4,
  });
  const response = await main({
    action: 'withdraw',
    requestId: 'handler-withdraw-2',
    expectedReviewVersion: 3,
  });
  assert.deepEqual(response, {
    ok: false,
    error: { code: 'VERSION_CONFLICT', message: '申请版本已变化，请刷新后重试' },
  });
});

const publicClubId = `club_${'f'.repeat(64)}`;
const publicClub = {
  _id: publicClubId,
  name: '辛庄桥小火车',
  city: '北京',
  introduction: '全平台唯一俱乐部，固定路线晨练与周末骑行活动。',
  avatar_url: '',
  cover_file_id: '',
  owner_openid: 'owner-handler',
  applicant_contact: 'secret-contact',
  approval_status: 'approved',
  status: 'active',
};

test('公开主页普通成员只读，OWNER/ADMIN 仅展示身份，平台管理员才可管理', async () => {
  const cases = [
    { openid: 'member-handler', role: 'MEMBER', label: '成员', admin: false, canManage: false },
    { openid: 'owner-handler', role: 'OWNER', label: '负责人', admin: false, canManage: false },
    {
      openid: 'club-admin-handler',
      role: 'ADMIN',
      label: '管理员',
      admin: false,
      canManage: false,
    },
    { openid: 'platform-admin', role: '', label: '平台管理员', admin: true, canManage: true },
  ];
  for (const item of cases) {
    const id = membershipId(publicClubId, item.openid);
    const response = await loadHandler(null, {
      openid: item.openid,
      admins: item.admin ? { [item.openid]: { _id: item.openid, enabled: true } } : {},
      clubs: { [publicClubId]: publicClub },
      memberships: item.role
        ? {
            [id]: {
              _id: id,
              club_id: publicClubId,
              openid: item.openid,
              role: item.role,
              status: 'active',
            },
          }
        : {},
    }).main({ action: 'getSoleClubHome' });
    assert.equal(response.ok, true);
    assert.equal(response.data.role_label, item.label);
    assert.equal(response.data.can_manage, item.canManage);
    assert.deepEqual(Object.keys(response.data.club).sort(), [
      'avatar_url',
      'city',
      'cover_url',
      'id',
      'introduction',
      'name',
    ]);
  }
});

test('管理员读取唯一俱乐部：空库返回 exists:false 且不报错', async () => {
  const { main, clubs } = loadHandler(null);
  const response = await main({ action: 'adminGetSoleClub' });
  assert.deepEqual(response, { ok: true, data: { exists: false } });
  assert.equal(clubs.size, 0);
});

test('非管理员读取或创建唯一俱乐部被拒绝', async () => {
  const read = await loadHandler(null, { admins: {} }).main({ action: 'adminGetSoleClub' });
  assert.deepEqual(read, {
    ok: false,
    error: { code: 'ADMIN_REQUIRED', message: '需要管理员权限' },
  });
  const create = await loadHandler(null, { admins: {} }).main({
    action: 'adminCreateSoleClub',
    club: soleClubInput,
    requestId: 'handler-sole-denied-1',
  });
  assert.equal(create.ok, false);
  assert.equal(create.error.code, 'ADMIN_REQUIRED');
});

test('空库首次创建唯一俱乐部后可读回，重复创建返回中文冲突错误', async () => {
  const { main, clubs } = loadHandler(null);
  const created = await main({
    action: 'adminCreateSoleClub',
    club: soleClubInput,
    requestId: 'handler-sole-create-1',
  });
  assert.equal(created.ok, true);
  assert.equal(created.data.exists, true);
  assert.equal(created.data.club.name, '辛庄桥小火车');
  assert.equal(clubs.size, 1);

  // 响应丢失后用同一 requestId 重试：幂等返回首次结果。
  const replay = await main({
    action: 'adminCreateSoleClub',
    club: { ...soleClubInput, name: '重放不应覆盖' },
    requestId: 'handler-sole-create-1',
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.data.club.name, '辛庄桥小火车');
  assert.equal(clubs.size, 1);

  // 新 requestId 再创建必须失败并给中文错误。
  const again = await main({
    action: 'adminCreateSoleClub',
    club: soleClubInput,
    requestId: 'handler-sole-create-2',
  });
  assert.deepEqual(again, {
    ok: false,
    error: {
      code: 'CLUB_ALREADY_EXISTS',
      message: '全平台只允许存在一个俱乐部，不能创建第二个',
    },
  });

  const fetched = await main({ action: 'adminGetSoleClub' });
  assert.equal(fetched.ok, true);
  assert.equal(fetched.data.exists, true);
  assert.equal(fetched.data.club.city, '北京');
});

test('唯一俱乐部入口保留受控内容审核错误且不写入', async () => {
  const { main, clubs } = loadHandler(null, {
    msgSecCheck: async () => ({ errCode: 0, result: { suggest: 'risky' } }),
  });
  const response = await main({
    action: 'adminCreateSoleClub',
    club: soleClubInput,
    requestId: 'handler-sole-risky-1',
  });
  assert.deepEqual(response, {
    ok: false,
    error: { code: 'CONTENT_RISKY', message: '内容未通过安全审核' },
  });
  assert.equal(clubs.size, 0);
});

test('更新唯一俱乐部成功，乐观锁冲突映射为中文错误', async () => {
  const { main, clubs } = loadHandler(null);
  const created = await main({
    action: 'adminCreateSoleClub',
    club: soleClubInput,
    requestId: 'handler-sole-update-setup-1',
  });
  const createdAt = created.data.club.updated_at;
  const updated = await main({
    action: 'adminUpdateSoleClub',
    club: { ...soleClubInput, name: '辛庄桥快车', city: '上海' },
    requestId: 'handler-sole-update-1',
    expectedUpdatedAt: createdAt,
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.data.club.name, '辛庄桥快车');
  assert.equal([...clubs.values()][0].name, '辛庄桥快车');

  // 模拟另一位管理员已在此后保存（避免同毫秒时间戳掩盖乐观锁）。
  const soleId = [...clubs.keys()][0];
  clubs.get(soleId).updated_at = '2026-10-20T10:00:00.000Z';

  const conflict = await main({
    action: 'adminUpdateSoleClub',
    club: { ...soleClubInput, name: '过期改名' },
    requestId: 'handler-sole-update-2',
    expectedUpdatedAt: createdAt,
  });
  assert.deepEqual(conflict, {
    ok: false,
    error: {
      code: 'CLUB_PROFILE_CONFLICT',
      message: '俱乐部资料已被其他管理员更新，请重新加载后再修改',
    },
  });

  // 同 requestId 重放回放在冲突之后仍返回首次保存结果。
  const replay = await main({
    action: 'adminUpdateSoleClub',
    club: { ...soleClubInput, name: '重放不应覆盖' },
    requestId: 'handler-sole-update-1',
    expectedUpdatedAt: createdAt,
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.data.club.name, '辛庄桥快车');
});

test('旧审批流已创建俱乐部时，首次创建被拒绝且存量数据不变', async () => {
  const legacyId = `club_${'a'.repeat(64)}`;
  const { main, clubs } = loadHandler(null, {
    clubs: {
      [legacyId]: {
        _id: legacyId,
        name: '存量俱乐部',
        city: '深圳',
        introduction: '由旧申请审批流程创建的存量俱乐部，必须原样保留。',
        join_mode: 'public_apply',
        avatar_url: 'cloud://env/club-applications/legacy/avatar.jpg',
        approval_status: 'approved',
        status: 'active',
      },
    },
  });
  const response = await main({
    action: 'adminCreateSoleClub',
    club: soleClubInput,
    requestId: 'handler-sole-legacy-1',
  });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'CLUB_ALREADY_EXISTS');
  assert.equal(clubs.size, 1);
  assert.equal(clubs.get(legacyId).name, '存量俱乐部');

  const fetched = await main({ action: 'adminGetSoleClub' });
  assert.equal(fetched.data.club.id, legacyId);

  const updated = await main({
    action: 'adminUpdateSoleClub',
    club: {
      name: '存量俱乐部新名称',
      city: '广州',
      introduction: '单条旧 ID 俱乐部无需改写文档 ID，仍然可以正常管理资料。',
      avatar_file_id: 'cloud://env/club-applications/legacy/avatar.jpg',
    },
    requestId: 'handler-sole-legacy-update-1',
    expectedUpdatedAt: '',
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.data.club.id, legacyId);
  assert.equal(clubs.get(legacyId).name, '存量俱乐部新名称');
});

test('唯一俱乐部存在后旧 review approved 明确失败且不得创建第二条', async () => {
  const application = {
    _id: applicationId('legacy-applicant'),
    applicant_openid: 'legacy-applicant',
    status: 'pending_review',
    review_version: 1,
    club_name: '第二俱乐部',
    city: '上海',
    introduction: '旧审批入口不得再通过申请创建第二个俱乐部。',
    join_mode: 'public_apply',
    expected_size: 30,
  };
  const existingId = 'club_' + 'a'.repeat(64);
  const { main, applications, clubs } = loadHandler(application, {
    clubs: {
      [existingId]: {
        _id: existingId,
        name: '唯一俱乐部',
        approval_status: 'approved',
        status: 'active',
      },
    },
  });

  const response = await main({
    action: 'review',
    applicationId: application._id,
    decision: 'approved',
    requestId: 'legacy-review-approved-1',
  });

  assert.deepEqual(response, {
    ok: false,
    error: {
      code: 'CLUB_CREATION_DISABLED',
      message: '单俱乐部模式已关闭旧审批创建入口，请在俱乐部管理页创建唯一俱乐部',
    },
  });
  assert.equal(clubs.size, 1);
  assert.equal(applications.get(application._id).status, 'pending_review');
});

test('多条存量俱乐部时 get/create/update 均要求先迁移且不修改数据', async () => {
  const firstId = 'club_' + 'a'.repeat(64);
  const secondId = 'club_' + 'b'.repeat(64);
  const { main, clubs } = loadHandler(null, {
    clubs: {
      [firstId]: { _id: firstId, name: '存量甲', approval_status: 'approved', status: 'active' },
      [secondId]: { _id: secondId, name: '存量乙', approval_status: 'approved', status: 'active' },
    },
  });
  const events = [
    { action: 'getSoleClubHome' },
    { action: 'adminGetSoleClub' },
    {
      action: 'adminCreateSoleClub',
      club: soleClubInput,
      requestId: 'multi-club-create-1',
    },
    {
      action: 'adminUpdateSoleClub',
      club: soleClubInput,
      requestId: 'multi-club-update-1',
      expectedUpdatedAt: '',
    },
  ];

  for (const event of events) {
    const response = await main(event);
    assert.deepEqual(response, {
      ok: false,
      error: {
        code: 'DATA_MIGRATION_REQUIRED',
        message: '检测到多个存量俱乐部，请先完成数据迁移后再管理唯一俱乐部',
      },
    });
  }
  assert.equal(clubs.size, 2);
  assert.equal(clubs.get(firstId).name, '存量甲');
  assert.equal(clubs.get(secondId).name, '存量乙');
});
