'use strict';

const crypto = require('node:crypto');
const { activateClubMediaReferences, trustedCover } = require('./media');
const { assertCheckedContent, checkTextContent } = require('./content-contract');

class ClubApplicationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ClubApplicationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ClubApplicationError(code, message);
}

async function checkClubContent(openid, value, currentVersion, store, contentService) {
  const fields = { name: value.name, introduction: value.introduction };
  const checked = await checkTextContent({
    openid,
    scene: 4,
    fields,
    whitelist: { name: 30, introduction: 500 },
    currentVersion,
    msgSecCheck: contentService.msgSecCheck || store.msgSecCheck,
  });
  assertCheckedContent(checked, fields, currentVersion);
  return checked;
}

function assertClubContent(checked, value, currentVersion) {
  assertCheckedContent(
    checked,
    { name: value.name, introduction: value.introduction },
    currentVersion,
  );
}

function clubContentRecord(checked) {
  return {
    digest: checked.digest,
    version: checked.currentVersion,
    trace_id: checked.traceId,
    ...(checked.traceIds?.length > 1 ? { trace_ids: checked.traceIds } : {}),
  };
}

const text = (value, label, min, max) => {
  if (typeof value !== 'string') fail('VALIDATION_FAILED', `${label}格式错误`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max)
    fail('VALIDATION_FAILED', `${label}需为 ${min}-${max} 个字符`);
  return normalized;
};

function canonicalOwnerAlias(openid, secret = process.env.PROFILE_MEDIA_PATH_SECRET) {
  const key = typeof secret === 'string' ? secret.trim() : '';
  if (!openid || key.length < 32) return '';
  return crypto.createHmac('sha256', key).update(openid).digest('hex').slice(0, 32);
}

function ownedClubMedia(fileId, openid, category) {
  const alias = canonicalOwnerAlias(openid);
  return Boolean(
    alias &&
    new RegExp(
      `^cloud://[^/]+/profile-canonical/${alias}/${category}/[a-f0-9]{64}/[a-f0-9]{64}\\.(?:jpg|png|webp)$`,
      'i',
    ).test(fileId),
  );
}

function normalizeInput(raw, openid, existing) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    fail('VALIDATION_FAILED', '申请资料格式错误');
  const joinMode = raw.join_mode;
  if (!['public_apply', 'invite_code', 'admin_invite'].includes(joinMode))
    fail('VALIDATION_FAILED', '请选择加入方式');
  const expectedSize = Number(raw.expected_size);
  if (!Number.isInteger(expectedSize) || expectedSize < 2 || expectedSize > 10000)
    fail('VALIDATION_FAILED', '预计成员规模需为 2-10000 人');
  const avatarFileId = text(raw.avatar_file_id, '俱乐部头像', 10, 512);
  if (
    !ownedClubMedia(avatarFileId, openid, 'club-avatar') &&
    avatarFileId !== existing?.avatar_file_id
  )
    fail('VALIDATION_FAILED', '请重新上传俱乐部头像');
  if (raw.cover_file_id !== undefined && typeof raw.cover_file_id !== 'string')
    fail('VALIDATION_FAILED', '俱乐部背景照片格式错误');
  const coverFileId = typeof raw.cover_file_id === 'string' ? raw.cover_file_id.trim() : '';
  if (
    coverFileId &&
    (coverFileId.length > 512 ||
      (!ownedClubMedia(coverFileId, openid, 'club-cover') &&
        coverFileId !== existing?.cover_file_id))
  )
    fail('VALIDATION_FAILED', '请重新上传俱乐部背景照片');
  return {
    club_name: text(raw.club_name, '俱乐部名称', 2, 30),
    city: text(raw.city, '所在城市', 2, 20),
    introduction: text(raw.introduction, '俱乐部简介', 20, 500),
    applicant_contact: text(raw.applicant_contact, '联系方式', 5, 50),
    join_mode: joinMode,
    expected_size: expectedSize,
    activity_types: text(raw.activity_types, '主要活动类型', 2, 100),
    rules_summary: text(raw.rules_summary, '俱乐部规则', 10, 500),
    avatar_file_id: avatarFileId,
    cover_file_id: coverFileId,
  };
}

const applicationId = (openid) =>
  `clubapp_${crypto.createHash('sha256').update(openid).digest('hex')}`;
const membershipId = (id, openid) =>
  `clubmem_${crypto.createHash('sha256').update(`${id}\0${openid}`).digest('hex')}`;

function project(application, admin = false) {
  if (!application) return null;
  const result = {
    id: application._id,
    status: application.status,
    review_version: application.review_version || 0,
    club_name: application.club_name || '',
    city: application.city || '',
    introduction: application.introduction || '',
    applicant_contact: application.applicant_contact || '',
    join_mode: application.join_mode || 'public_apply',
    expected_size: application.expected_size || 0,
    activity_types: application.activity_types || '',
    rules_summary: application.rules_summary || '',
    avatar_file_id: application.avatar_file_id || '',
    cover_file_id: application.cover_file_id || '',
    rejection_reason: application.rejection_reason || '',
    club_id: application.club_id || '',
    created_at: application.created_at || '',
    updated_at: application.updated_at || '',
    submitted_at: application.submitted_at || '',
    reviewed_at: application.reviewed_at || '',
  };
  if (admin) result.applicant_openid = application.applicant_openid;
  return result;
}

async function saveDraft(store, { openid, input }, now) {
  const id = applicationId(openid);
  return store.transaction(async (tx) => {
    const existing = await tx.getApplication(id);
    const value = normalizeInput(input, openid, existing);
    if (existing && !['draft', 'rejected'].includes(existing.status))
      fail('INVALID_STATE', '当前申请不可编辑');
    const next = {
      ...(existing || {}),
      _id: id,
      applicant_openid: openid,
      ...value,
      status: 'draft',
      review_version: existing?.review_version || 0,
      rejection_reason: existing?.rejection_reason || '',
      created_at: existing?.created_at || now.toISOString(),
      updated_at: now.toISOString(),
    };
    await tx.putApplication(id, next);
    await activateClubMediaReferences(tx, openid, next, now, existing);
    return project(next);
  });
}

async function submitApplication(store, { openid, input, requestId }, now) {
  const id = applicationId(openid);
  const safeRequestId = text(requestId, '提交请求 ID', 8, 128);
  return store.transaction(async (tx) => {
    const existing = await tx.getApplication(id);
    const value = normalizeInput(input, openid, existing);
    if (existing?.status === 'pending_review' && existing.last_submit_request_id === safeRequestId)
      return project(existing);
    if (existing && !['draft', 'rejected'].includes(existing.status))
      fail('INVALID_STATE', '申请已提交，请勿重复操作');
    const next = {
      ...(existing || {}),
      _id: id,
      applicant_openid: openid,
      ...value,
      status: 'pending_review',
      review_version: (existing?.review_version || 0) + 1,
      rejection_reason: '',
      last_submit_request_id: safeRequestId,
      created_at: existing?.created_at || now.toISOString(),
      submitted_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    await tx.putApplication(id, next);
    await activateClubMediaReferences(tx, openid, next, now, existing);
    await tx.addAudit({
      actor_openid: openid,
      action: 'club_application_submitted',
      target_type: 'club_application',
      target_id: id,
      before_status: existing?.status || 'none',
      after_status: 'pending_review',
      review_version: next.review_version,
      request_id: safeRequestId,
      created_at: now.toISOString(),
    });
    return project(next);
  });
}

async function withdrawApplication(store, { openid, requestId, expectedReviewVersion }, now) {
  const id = applicationId(openid);
  const safeRequestId = text(requestId, '撤回请求 ID', 8, 128);
  if (!Number.isInteger(expectedReviewVersion) || expectedReviewVersion < 1)
    fail('VERSION_CONFLICT', '申请版本已变化，请刷新后重试');
  return store.transaction(async (tx) => {
    const existing = await tx.getApplication(id);
    if (!existing || existing.applicant_openid !== openid) fail('NOT_FOUND', '俱乐部申请不存在');
    if (existing.status === 'draft' && existing.last_withdraw_request_id === safeRequestId)
      return project(existing);
    if (existing.status !== 'pending_review') fail('INVALID_STATE', '当前申请不可撤回');
    if (existing.review_version !== expectedReviewVersion)
      fail('VERSION_CONFLICT', '申请版本已变化，请刷新后重试');
    const next = {
      ...existing,
      status: 'draft',
      last_withdraw_request_id: safeRequestId,
      updated_at: now.toISOString(),
    };
    await tx.putApplication(id, next);
    await tx.addAudit({
      actor_openid: openid,
      action: 'club_application_withdrawn',
      target_type: 'club_application',
      target_id: id,
      before: { status: 'pending_review' },
      after: { status: 'draft' },
      before_status: 'pending_review',
      after_status: 'draft',
      review_version: next.review_version,
      request_id: safeRequestId,
      created_at: now.toISOString(),
    });
    return project(next);
  });
}

function capacityValue(value, code = 'INVALID_MAX_MEMBERS') {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 2 || normalized > 10000)
    fail(code, '人数上限需为 2-10000 人');
  return normalized;
}

async function ensureClubCapacity(tx, clubId, club) {
  if (Number.isInteger(club.member_count) && Number.isInteger(club.max_members)) return club;
  // 存量俱乐部没有容量字段；必须在同一事务按 active 关系实数回填，避免迁移窗口内超卖。
  const actualCount = await tx.countActiveMemberships(clubId);
  const next = {
    ...club,
    member_count: actualCount,
    max_members: Number.isInteger(club.max_members)
      ? Math.max(club.max_members, actualCount, 2)
      : Math.max(50, actualCount),
  };
  await tx.putClub(clubId, next);
  return next;
}

function projectJoinableClub(club) {
  const capacityInitialized =
    Number.isInteger(club?.member_count) && Number.isInteger(club?.max_members);
  const memberCount = Number.isInteger(club?.member_count) ? club.member_count : 0;
  const maxMembers = Number.isInteger(club?.max_members)
    ? Math.max(club.max_members, memberCount)
    : Math.max(50, memberCount);
  return {
    id: typeof club?._id === 'string' ? club._id : '',
    name: typeof club?.name === 'string' ? club.name : '',
    city: typeof club?.city === 'string' ? club.city : '',
    introduction: typeof club?.introduction === 'string' ? club.introduction : '',
    avatar_url: typeof club?.avatar_url === 'string' ? club.avatar_url : '',
    cover_file_id: typeof club?.cover_file_id === 'string' ? club.cover_file_id : '',
    capacity_initialized: capacityInitialized,
    member_count: memberCount,
    max_members: maxMembers,
  };
}

function listJoinableClubs(clubs, activeClubIds = []) {
  if (!Array.isArray(clubs)) return [];
  const excluded = new Set(Array.isArray(activeClubIds) ? activeClubIds : []);
  return clubs
    .filter(
      (club) =>
        club &&
        !excluded.has(club._id) &&
        club.approval_status === 'approved' &&
        club.status === 'active' &&
        club.join_mode === 'public_apply',
    )
    .slice(0, 100)
    .map(projectJoinableClub);
}

async function joinPublicClub(store, { openid, clubId: requestedClubId, requestId }, now) {
  const safeClubId = text(requestedClubId, '俱乐部 ID', 1, 128);
  if (!/^club_[a-f0-9]{64}$/.test(safeClubId)) fail('VALIDATION_FAILED', '俱乐部 ID 无效');
  const safeRequestId = text(requestId, '加入请求 ID', 8, 128);
  return store.transaction(async (tx) => {
    // 必须在事务内重读俱乐部，避免列表展示后俱乐部状态或加入方式已经变化。
    const club = await tx.getClub(safeClubId);
    if (!club) fail('NOT_FOUND', '俱乐部不存在');
    if (club.approval_status !== 'approved' || club.status !== 'active')
      fail('CLUB_UNAVAILABLE', '该俱乐部暂不可加入');
    if (club.join_mode !== 'public_apply') fail('JOIN_NOT_ALLOWED', '该俱乐部不支持公开加入');

    const id = membershipId(safeClubId, openid);
    const existing = await tx.getMembership(id);
    const capacityClub = await ensureClubCapacity(tx, safeClubId, club);
    if (existing?.status === 'active') {
      return {
        club: projectJoinableClub(capacityClub),
        role: existing.role,
        status: existing.status,
      };
    }
    if (capacityClub.member_count >= capacityClub.max_members)
      fail('CLUB_FULL', '该俱乐部人数已满');
    // 非 active 关系只代表历史记录；管理角色恢复必须走授权流程，公开重加入一律降为 MEMBER。
    const role = 'MEMBER';
    const membership = {
      ...(existing || {}),
      _id: id,
      club_id: safeClubId,
      openid,
      role,
      status: 'active',
      created_at: existing?.created_at || now.toISOString(),
      updated_at: now.toISOString(),
      last_join_request_id: safeRequestId,
    };
    // clubs 文档与 membership 在同一事务写入；并发加入都会竞争同一 club 版本，CloudBase 会重试或冲突而不会超卖。
    const updatedClub = {
      ...capacityClub,
      member_count: capacityClub.member_count + 1,
      updated_at: now.toISOString(),
    };
    await tx.putClub(safeClubId, updatedClub);
    await tx.putMembership(id, membership);
    await tx.addAudit({
      actor_openid: openid,
      action: 'public_club_joined',
      target_type: 'club',
      target_id: safeClubId,
      before_status: existing?.status || 'none',
      after_status: 'active',
      request_id: safeRequestId,
      created_at: now.toISOString(),
    });
    return { club: projectJoinableClub(updatedClub), role, status: 'active' };
  });
}

const profileRequestId = (clubId, requestId) =>
  `clubprofile_${crypto.createHash('sha256').update(`${clubId}\0${requestId}`).digest('hex')}`;

function managedUpdatedAt(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
  }
  return '';
}

function projectManagedClub(club) {
  if (!club) return null;
  return {
    id: typeof club._id === 'string' ? club._id : '',
    name: typeof club.name === 'string' ? club.name : '',
    city: typeof club.city === 'string' ? club.city : '',
    introduction: typeof club.introduction === 'string' ? club.introduction : '',
    join_mode: ['public_apply', 'invite_code', 'admin_invite'].includes(club.join_mode)
      ? club.join_mode
      : 'public_apply',
    avatar_file_id: typeof club.avatar_url === 'string' ? club.avatar_url : '',
    cover_file_id: typeof club.cover_file_id === 'string' ? club.cover_file_id : '',
    member_count: Number.isInteger(club.member_count) ? club.member_count : 0,
    max_members: Number.isInteger(club.max_members)
      ? Math.max(club.max_members, Number.isInteger(club.member_count) ? club.member_count : 0)
      : Math.max(50, Number.isInteger(club.member_count) ? club.member_count : 0),
    updated_at: managedUpdatedAt(club.updated_at),
  };
}

function normalizeManagedClubInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    fail('VALIDATION_FAILED', '俱乐部资料格式错误');
  const allowed = new Set([
    'name',
    'city',
    'introduction',
    'join_mode',
    'avatar_file_id',
    'cover_file_id',
    'max_members',
  ]);
  for (const key of Object.keys(raw))
    if (!allowed.has(key)) fail('FORBIDDEN_FIELD', '客户端不得修改受保护字段');
  if (!['public_apply', 'invite_code', 'admin_invite'].includes(raw.join_mode))
    fail('VALIDATION_FAILED', '请选择加入方式');
  const avatarFileId = text(raw.avatar_file_id, '俱乐部头像', 10, 512);
  if (
    !/^cloud:\/\/[^/]+\/(?:club-applications\/[^/]+\/.+|profile-canonical\/[a-f0-9]{32}\/club-avatar\/[a-f0-9]{64}\/[a-f0-9]{64}\.(?:jpg|png|webp))$/i.test(
      avatarFileId,
    )
  )
    fail('VALIDATION_FAILED', '请重新上传俱乐部头像');
  const hasCover = Object.prototype.hasOwnProperty.call(raw, 'cover_file_id');
  if (hasCover && typeof raw.cover_file_id !== 'string')
    fail('VALIDATION_FAILED', '俱乐部背景照片格式错误');
  const coverFileId = typeof raw.cover_file_id === 'string' ? raw.cover_file_id.trim() : '';
  if (
    hasCover &&
    coverFileId &&
    (coverFileId.length > 512 ||
      !/^cloud:\/\/[^/]+\/(?:club-applications\/[^/]+\/.+|profile-canonical\/[a-f0-9]{32}\/club-cover\/[a-f0-9]{64}\/[a-f0-9]{64}\.(?:jpg|png|webp))$/i.test(
        coverFileId,
      ))
  )
    fail('VALIDATION_FAILED', '请重新上传俱乐部背景照片');
  return {
    name: text(raw.name, '俱乐部名称', 2, 30),
    city: text(raw.city, '所在城市', 2, 20),
    introduction: text(raw.introduction, '俱乐部简介', 20, 500),
    join_mode: raw.join_mode,
    avatar_url: avatarFileId,
    ...(hasCover ? { cover_file_id: coverFileId } : {}),
    max_members: capacityValue(raw.max_members),
  };
}

async function requireClubManager(tx, clubId, openid) {
  const membership = await tx.getMembership(membershipId(clubId, openid));
  if (
    !membership ||
    membership.status !== 'active' ||
    !['OWNER', 'ADMIN'].includes(String(membership.role || '').toUpperCase())
  )
    fail('CLUB_ADMIN_REQUIRED', '仅俱乐部负责人或管理员可以修改资料');
  return membership;
}

async function getClubDetail(store, { openid, clubId: requestedClubId }) {
  const safeClubId = text(requestedClubId, '俱乐部 ID', 1, 128);
  if (!/^club_[a-f0-9]{64}$/.test(safeClubId)) fail('VALIDATION_FAILED', '俱乐部 ID 无效');
  return store.transaction(async (tx) => {
    const membership = await tx.getMembership(membershipId(safeClubId, openid));
    if (!membership || membership.status !== 'active')
      fail('CLUB_MEMBER_REQUIRED', '仅俱乐部成员可查看详情');
    const club = await tx.getClub(safeClubId);
    if (!club || club.approval_status !== 'approved' || club.status !== 'active')
      fail('CLUB_UNAVAILABLE', '俱乐部暂不可查看');
    const normalized = await ensureClubCapacity(tx, safeClubId, club);
    const role = String(membership.role || 'MEMBER').toUpperCase();
    return {
      ...projectJoinableClub(normalized),
      join_mode: normalized.join_mode || 'public_apply',
      role,
      role_label:
        { OWNER: '负责人', ADMIN: '管理员', ORGANIZER: '组织者', MEMBER: '成员' }[role] || '成员',
      can_manage: ['OWNER', 'ADMIN'].includes(role),
    };
  });
}

async function getManagedClub(store, { openid, clubId: requestedClubId }) {
  const safeClubId = text(requestedClubId, '俱乐部 ID', 1, 128);
  if (!/^club_[a-f0-9]{64}$/.test(safeClubId)) fail('VALIDATION_FAILED', '俱乐部 ID 无效');
  return store.transaction(async (tx) => {
    await requireClubManager(tx, safeClubId, openid);
    const club = await tx.getClub(safeClubId);
    if (!club || club.approval_status !== 'approved' || club.status !== 'active')
      fail('CLUB_UNAVAILABLE', '俱乐部暂不可管理');
    return projectManagedClub(await ensureClubCapacity(tx, safeClubId, club));
  });
}

async function managedClubWriteContext(tx, { safeClubId, openid, safeRequestId, value }) {
  await requireClubManager(tx, safeClubId, openid);
  const club = await tx.getClub(safeClubId);
  if (!club || club.approval_status !== 'approved' || club.status !== 'active')
    fail('CLUB_UNAVAILABLE', '俱乐部暂不可管理');
  const operationId = profileRequestId(safeClubId, safeRequestId);
  const previousOperation = await tx.getAudit(operationId);
  if (
    previousOperation?.action === 'club_profile_updated' &&
    previousOperation?.target_id === safeClubId &&
    previousOperation?.request_id === safeRequestId &&
    previousOperation?.result
  )
    return { existingResult: previousOperation.result };
  const capacityClub = await ensureClubCapacity(tx, safeClubId, club);
  if (value.max_members < capacityClub.member_count)
    fail('MAX_MEMBERS_BELOW_CURRENT', '人数上限不能低于当前成员数');
  const currentProfile = projectManagedClub(capacityClub);
  if (
    value.avatar_url !== currentProfile.avatar_file_id &&
    !ownedClubMedia(value.avatar_url, openid, 'club-avatar')
  )
    fail('VALIDATION_FAILED', '请重新上传俱乐部头像');
  if (
    value.cover_file_id !== currentProfile.cover_file_id &&
    value.cover_file_id &&
    !ownedClubMedia(value.cover_file_id, openid, 'club-cover')
  )
    fail('VALIDATION_FAILED', '请重新上传俱乐部背景照片');
  return { capacityClub, currentProfile, operationId };
}

async function updateManagedClub(
  store,
  { openid, clubId: requestedClubId, requestId, expectedUpdatedAt, input },
  now,
  contentService = {},
) {
  const safeClubId = text(requestedClubId, '俱乐部 ID', 1, 128);
  if (!/^club_[a-f0-9]{64}$/.test(safeClubId)) fail('VALIDATION_FAILED', '俱乐部 ID 无效');
  const safeRequestId = text(requestId, '保存请求 ID', 8, 128);
  if (typeof expectedUpdatedAt !== 'string' || expectedUpdatedAt.length > 64)
    fail('VALIDATION_FAILED', '俱乐部资料版本无效');
  const value = normalizeManagedClubInput(input);
  const contentPlan = await store.transaction(async (tx) => {
    const context = await managedClubWriteContext(tx, {
      safeClubId,
      openid,
      safeRequestId,
      value,
    });
    if (context.existingResult) return context;
    if (context.currentProfile.updated_at !== expectedUpdatedAt)
      fail('CLUB_PROFILE_CONFLICT', '俱乐部资料已被其他管理员更新，请重新加载后再修改');
    return { currentVersion: context.currentProfile.updated_at };
  });
  if (contentPlan.existingResult) return contentPlan.existingResult;
  const checked = await checkClubContent(
    openid,
    { name: value.name, introduction: value.introduction },
    contentPlan.currentVersion,
    store,
    contentService,
  );
  return store.transaction(async (tx) => {
    const context = await managedClubWriteContext(tx, {
      safeClubId,
      openid,
      safeRequestId,
      value,
    });
    if (context.existingResult) return context.existingResult;
    const { capacityClub, currentProfile, operationId } = context;
    if (checked.currentVersion !== currentProfile.updated_at)
      assertClubContent(checked, value, currentProfile.updated_at);
    if (currentProfile.updated_at !== expectedUpdatedAt)
      fail('CLUB_PROFILE_CONFLICT', '俱乐部资料已被其他管理员更新，请重新加载后再修改');
    assertClubContent(checked, value, currentProfile.updated_at);
    const next = {
      ...capacityClub,
      ...value,
      content_check: { ...clubContentRecord(checked), checked_at: now.toISOString() },
      updated_at: now.toISOString(),
    };
    const result = projectManagedClub(next);
    await tx.putClub(safeClubId, next);
    await activateClubMediaReferences(tx, openid, next, now, capacityClub);
    await tx.putAudit(operationId, {
      _id: operationId,
      actor_openid: openid,
      action: 'club_profile_updated',
      target_type: 'club',
      target_id: safeClubId,
      request_id: safeRequestId,
      result,
      created_at: now.toISOString(),
    });
    return result;
  });
}

// 全平台唯一俱乐部使用固定文档 ID：空库首次创建在事务内 get→put 同一文档，
// 并发下只有一个事务能提交，从数据层保证至多一个俱乐部，绝不依赖客户端约束。
const SOLE_CLUB_ID = `club_${crypto.createHash('sha256').update('cili-sole-club').digest('hex')}`;
const SOLE_AVATAR_FILE =
  /^cloud:\/\/[^/]+\/(?:club-applications\/[^/]+\/.+|profile-canonical\/[a-f0-9]{32}\/club-avatar\/[a-f0-9]{64}\/[a-f0-9]{64}\.(?:jpg|png|webp))$/i;
const SOLE_COVER_FILE =
  /^cloud:\/\/[^/]+\/(?:club-applications\/[^/]+\/.+|profile-canonical\/[a-f0-9]{32}\/club-cover\/[a-f0-9]{64}\/[a-f0-9]{64}\.(?:jpg|png|webp))$/i;
const SOLE_CLUB_EXISTS_MESSAGE = '全平台只允许存在一个俱乐部，不能创建第二个';

const soleClubOperationId = (requestId) =>
  `soleclub_${crypto.createHash('sha256').update(requestId).digest('hex')}`;

async function requirePlatformAdmin(tx, openid) {
  const admin = await tx.getAdmin(openid);
  if (!admin || admin._id !== openid || admin.enabled === false)
    fail('ADMIN_REQUIRED', '需要管理员权限');
}

async function soleClubCreateContext(tx, { adminOpenid, safeRequestId, existingClubId, value }) {
  await requirePlatformAdmin(tx, adminOpenid);
  const operationId = soleClubOperationId(safeRequestId);
  const previousOperation = await tx.getAudit(operationId);
  if (
    previousOperation?.action === 'sole_club_created' &&
    previousOperation?.target_id &&
    previousOperation?.result
  )
    return { existingResult: previousOperation.result };
  if (existingClubId) fail('CLUB_ALREADY_EXISTS', SOLE_CLUB_EXISTS_MESSAGE);
  const reserved = await tx.getClub(SOLE_CLUB_ID);
  if (reserved) fail('CLUB_ALREADY_EXISTS', SOLE_CLUB_EXISTS_MESSAGE);
  if (!trustedCover(value.avatar_url, adminOpenid, 'club-avatar'))
    fail('VALIDATION_FAILED', '请重新上传俱乐部头像');
  if (
    Object.prototype.hasOwnProperty.call(value, 'cover_file_id') &&
    value.cover_file_id &&
    !trustedCover(value.cover_file_id, adminOpenid, 'club-cover')
  )
    fail('VALIDATION_FAILED', '请重新上传俱乐部背景照片');
  return { operationId };
}

function normalizeSoleClubInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    fail('VALIDATION_FAILED', '俱乐部资料格式错误');
  const allowed = new Set(['name', 'city', 'introduction', 'avatar_file_id', 'cover_file_id']);
  for (const key of Object.keys(raw))
    if (!allowed.has(key)) fail('FORBIDDEN_FIELD', '客户端不得修改受保护字段');
  const avatarFileId = text(raw.avatar_file_id, '俱乐部头像', 10, 512);
  if (!SOLE_AVATAR_FILE.test(avatarFileId)) fail('VALIDATION_FAILED', '请重新上传俱乐部头像');
  const hasCover = Object.prototype.hasOwnProperty.call(raw, 'cover_file_id');
  if (hasCover && typeof raw.cover_file_id !== 'string')
    fail('VALIDATION_FAILED', '俱乐部背景照片格式错误');
  const coverFileId = typeof raw.cover_file_id === 'string' ? raw.cover_file_id.trim() : '';
  if (hasCover && coverFileId && (coverFileId.length > 512 || !SOLE_COVER_FILE.test(coverFileId)))
    fail('VALIDATION_FAILED', '请重新上传俱乐部背景照片');
  return {
    name: text(raw.name, '俱乐部名称', 2, 30),
    city: text(raw.city, '所在城市', 2, 20),
    introduction: text(raw.introduction, '俱乐部简介', 20, 500),
    avatar_url: avatarFileId,
    ...(hasCover ? { cover_file_id: coverFileId } : {}),
  };
}

async function getSoleClub(store, { adminOpenid, clubId: requestedClubId }) {
  return store.transaction(async (tx) => {
    await requirePlatformAdmin(tx, adminOpenid);
    if (!requestedClubId) return { exists: false };
    const club = await tx.getClub(requestedClubId);
    if (!club) return { exists: false };
    return { exists: true, club: projectManagedClub(club) };
  });
}

async function createSoleClub(
  store,
  { adminOpenid, existingClubId, input, requestId },
  now,
  contentService = {},
) {
  const safeRequestId = text(requestId, '创建请求 ID', 8, 128);
  const value = normalizeSoleClubInput(input);
  const contentPlan = await store.transaction((tx) =>
    soleClubCreateContext(tx, {
      adminOpenid,
      safeRequestId,
      existingClubId,
      value,
    }),
  );
  if (contentPlan.existingResult) return contentPlan.existingResult;
  const checked = await checkClubContent(adminOpenid, value, 0, store, contentService);
  return store.transaction(async (tx) => {
    const context = await soleClubCreateContext(tx, {
      adminOpenid,
      safeRequestId,
      existingClubId,
      value,
    });
    if (context.existingResult) return context.existingResult;
    const { operationId } = context;
    assertClubContent(checked, value, 0);
    const timestamp = now.toISOString();
    const next = {
      _id: SOLE_CLUB_ID,
      name: value.name,
      city: value.city,
      introduction: value.introduction,
      avatar_url: value.avatar_url,
      cover_file_id: Object.prototype.hasOwnProperty.call(value, 'cover_file_id')
        ? value.cover_file_id
        : '',
      // 多俱乐部加入方式已下线；保留默认值兼容存量数据读取与活动归属。
      join_mode: 'public_apply',
      max_members: 50,
      member_count: 0,
      owner_openid: adminOpenid,
      approval_status: 'approved',
      status: 'active',
      content_check: { ...clubContentRecord(checked), checked_at: timestamp },
      source: 'admin_bootstrap',
      created_at: timestamp,
      updated_at: timestamp,
    };
    await tx.putClub(SOLE_CLUB_ID, next);
    await activateClubMediaReferences(tx, adminOpenid, next, now);
    const result = { exists: true, club: projectManagedClub(next) };
    await tx.putAudit(operationId, {
      _id: operationId,
      actor_openid: adminOpenid,
      action: 'sole_club_created',
      target_type: 'club',
      target_id: SOLE_CLUB_ID,
      request_id: safeRequestId,
      result,
      created_at: timestamp,
    });
    return result;
  });
}

async function soleClubUpdateContext(tx, { adminOpenid, safeClubId, safeRequestId, value }) {
  await requirePlatformAdmin(tx, adminOpenid);
  const club = await tx.getClub(safeClubId);
  if (!club || club.approval_status !== 'approved' || club.status !== 'active')
    fail('CLUB_UNAVAILABLE', '俱乐部暂不可管理');
  const operationId = profileRequestId(safeClubId, safeRequestId);
  const previousOperation = await tx.getAudit(operationId);
  if (
    previousOperation?.action === 'sole_club_profile_updated' &&
    previousOperation?.target_id === safeClubId &&
    previousOperation?.request_id === safeRequestId &&
    previousOperation?.result
  )
    return { existingResult: previousOperation.result };
  const currentProfile = projectManagedClub(club);
  const hasCover = Object.prototype.hasOwnProperty.call(value, 'cover_file_id');
  if (
    value.avatar_url !== currentProfile.avatar_file_id &&
    !trustedCover(value.avatar_url, adminOpenid, 'club-avatar')
  )
    fail('VALIDATION_FAILED', '请重新上传俱乐部头像');
  if (
    hasCover &&
    value.cover_file_id !== currentProfile.cover_file_id &&
    value.cover_file_id &&
    !trustedCover(value.cover_file_id, adminOpenid, 'club-cover')
  )
    fail('VALIDATION_FAILED', '请重新上传俱乐部背景照片');
  return { club, currentProfile, hasCover, operationId };
}

async function updateSoleClub(
  store,
  { adminOpenid, clubId: requestedClubId, requestId, expectedUpdatedAt, input },
  now,
  contentService = {},
) {
  const safeClubId = text(requestedClubId, '俱乐部 ID', 1, 128);
  if (!/^club_[a-f0-9]{64}$/.test(safeClubId)) fail('VALIDATION_FAILED', '俱乐部 ID 无效');
  const safeRequestId = text(requestId, '保存请求 ID', 8, 128);
  if (typeof expectedUpdatedAt !== 'string' || expectedUpdatedAt.length > 64)
    fail('VALIDATION_FAILED', '俱乐部资料版本无效');
  const value = normalizeSoleClubInput(input);
  const contentPlan = await store.transaction(async (tx) => {
    const context = await soleClubUpdateContext(tx, {
      adminOpenid,
      safeClubId,
      safeRequestId,
      value,
    });
    if (context.existingResult) return context;
    if (context.currentProfile.updated_at !== expectedUpdatedAt)
      fail('CLUB_PROFILE_CONFLICT', '俱乐部资料已被其他管理员更新，请重新加载后再修改');
    return { currentVersion: context.currentProfile.updated_at };
  });
  if (contentPlan.existingResult) return contentPlan.existingResult;
  const checked = await checkClubContent(
    adminOpenid,
    value,
    contentPlan.currentVersion,
    store,
    contentService,
  );
  return store.transaction(async (tx) => {
    const context = await soleClubUpdateContext(tx, {
      adminOpenid,
      safeClubId,
      safeRequestId,
      value,
    });
    if (context.existingResult) return context.existingResult;
    const { club, currentProfile, hasCover, operationId } = context;
    if (checked.currentVersion !== currentProfile.updated_at)
      assertClubContent(checked, value, currentProfile.updated_at);
    if (currentProfile.updated_at !== expectedUpdatedAt)
      fail('CLUB_PROFILE_CONFLICT', '俱乐部资料已被其他管理员更新，请重新加载后再修改');
    assertClubContent(checked, value, currentProfile.updated_at);
    const next = {
      ...club,
      name: value.name,
      city: value.city,
      introduction: value.introduction,
      avatar_url: value.avatar_url,
      ...(hasCover ? { cover_file_id: value.cover_file_id } : {}),
      content_check: { ...clubContentRecord(checked), checked_at: now.toISOString() },
      updated_at: now.toISOString(),
    };
    const result = { exists: true, club: projectManagedClub(next) };
    await tx.putClub(safeClubId, next);
    await activateClubMediaReferences(tx, adminOpenid, next, now, club);
    await tx.putAudit(operationId, {
      _id: operationId,
      actor_openid: adminOpenid,
      action: 'sole_club_profile_updated',
      target_type: 'club',
      target_id: safeClubId,
      request_id: safeRequestId,
      result,
      created_at: now.toISOString(),
    });
    return result;
  });
}

function projectSoleClubHome(club) {
  if (!club) return null;
  return {
    id: typeof club._id === 'string' ? club._id : '',
    name: typeof club.name === 'string' ? club.name : '',
    city: typeof club.city === 'string' ? club.city : '',
    introduction: typeof club.introduction === 'string' ? club.introduction : '',
    avatar_file_id: typeof club.avatar_url === 'string' ? club.avatar_url : '',
    cover_file_id: typeof club.cover_file_id === 'string' ? club.cover_file_id : '',
  };
}

const SOLE_HOME_ROLE_LABELS = {
  OWNER: '负责人',
  ADMIN: '管理员',
  ORGANIZER: '组织者',
  MEMBER: '成员',
};

async function getSoleClubHome(store, { openid, clubId: requestedClubId }) {
  const safeClubId = typeof requestedClubId === 'string' ? requestedClubId.trim() : '';
  return store.transaction(async (tx) => {
    const admin = await tx.getAdmin(openid);
    const isPlatformAdmin = Boolean(admin && admin._id === openid && admin.enabled !== false);
    if (!safeClubId) return { exists: false };
    const club = await tx.getClub(safeClubId);
    if (!club || club.approval_status !== 'approved' || club.status !== 'active')
      return { exists: false };
    const membership = await tx.getMembership(membershipId(safeClubId, openid));
    const membershipRole =
      membership && membership.status === 'active'
        ? String(membership.role || '').toUpperCase()
        : '';
    let role;
    let roleLabel;
    if (isPlatformAdmin) {
      role = 'PLATFORM_ADMIN';
      roleLabel = '平台管理员';
    } else if (membershipRole) {
      role = membershipRole;
      roleLabel = SOLE_HOME_ROLE_LABELS[membershipRole] || '骑友';
    } else {
      role = 'VISITOR';
      roleLabel = '骑友';
    }
    // 管理写入口统一要求 admin_users 平台管理员；俱乐部 OWNER/ADMIN 仅展示身份。
    const canManage = isPlatformAdmin;
    return {
      exists: true,
      club: projectSoleClubHome(club),
      role,
      role_label: roleLabel,
      can_manage: canManage,
    };
  });
}

async function reviewApplication(
  store,
  { adminOpenid, applicationId: id, decision, reason, requestId },
  now,
) {
  if (!['approved', 'rejected'].includes(decision)) fail('VALIDATION_FAILED', '审批操作无效');
  const safeRequestId = text(requestId, '审批请求 ID', 8, 128);
  const rejectionReason = decision === 'rejected' ? text(reason, '驳回原因', 2, 200) : '';
  return store.transaction(async (tx) => {
    const admin = await tx.getAdmin(adminOpenid);
    if (!admin || admin._id !== adminOpenid || admin.enabled === false)
      fail('ADMIN_REQUIRED', '需要管理员权限');
    const application = await tx.getApplication(id);
    if (!application) fail('NOT_FOUND', '俱乐部申请不存在');
    if (application.status === decision && application.last_review_request_id === safeRequestId)
      return project(application, true);
    if (decision === 'approved' && application.status === 'approved')
      return project(application, true);
    if (decision === 'approved')
      fail(
        'CLUB_CREATION_DISABLED',
        '单俱乐部模式已关闭旧审批创建入口，请在俱乐部管理页创建唯一俱乐部',
      );
    if (application.status !== 'pending_review') fail('INVALID_STATE', '该申请已被处理');
    const next = {
      ...application,
      status: decision,
      rejection_reason: rejectionReason,
      reviewed_by: adminOpenid,
      reviewed_at: now.toISOString(),
      updated_at: now.toISOString(),
      last_review_request_id: safeRequestId,
    };
    await tx.putApplication(id, next);
    await tx.addAudit({
      actor_openid: adminOpenid,
      action: `club_application_${decision}`,
      target_type: 'club_application',
      target_id: id,
      before_status: 'pending_review',
      after_status: decision,
      review_version: application.review_version,
      request_id: safeRequestId,
      ...(rejectionReason ? { reason: rejectionReason } : {}),
      created_at: now.toISOString(),
    });
    return project(next, true);
  });
}

module.exports = {
  ClubApplicationError,
  applicationId,
  membershipId,
  normalizeInput,
  normalizeManagedClubInput,
  normalizeSoleClubInput,
  project,
  projectJoinableClub,
  projectManagedClub,
  listJoinableClubs,
  joinPublicClub,
  getClubDetail,
  getManagedClub,
  updateManagedClub,
  getSoleClubHome,
  getSoleClub,
  createSoleClub,
  updateSoleClub,
  SOLE_CLUB_ID,
  saveDraft,
  submitApplication,
  withdrawApplication,
  reviewApplication,
};
