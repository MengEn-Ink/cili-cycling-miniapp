'use strict';

const crypto = require('node:crypto');

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

const text = (value, label, min, max) => {
  if (typeof value !== 'string') fail('VALIDATION_FAILED', `${label}格式错误`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max)
    fail('VALIDATION_FAILED', `${label}需为 ${min}-${max} 个字符`);
  return normalized;
};

function normalizeInput(raw, openid) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    fail('VALIDATION_FAILED', '申请资料格式错误');
  const joinMode = raw.join_mode;
  if (!['public_apply', 'invite_code', 'admin_invite'].includes(joinMode))
    fail('VALIDATION_FAILED', '请选择加入方式');
  const expectedSize = Number(raw.expected_size);
  if (!Number.isInteger(expectedSize) || expectedSize < 2 || expectedSize > 10000)
    fail('VALIDATION_FAILED', '预计成员规模需为 2-10000 人');
  const coverFileId = text(raw.cover_file_id, '俱乐部封面', 10, 512);
  if (!coverFileId.includes(`/club-applications/${openid}/`))
    fail('VALIDATION_FAILED', '请重新上传俱乐部封面');
  return {
    club_name: text(raw.club_name, '俱乐部名称', 2, 30),
    city: text(raw.city, '所在城市', 2, 20),
    introduction: text(raw.introduction, '俱乐部简介', 20, 500),
    applicant_contact: text(raw.applicant_contact, '联系方式', 5, 50),
    join_mode: joinMode,
    expected_size: expectedSize,
    activity_types: text(raw.activity_types, '主要活动类型', 2, 100),
    rules_summary: text(raw.rules_summary, '俱乐部规则', 10, 500),
    cover_file_id: coverFileId,
  };
}

const applicationId = (openid) =>
  `clubapp_${crypto.createHash('sha256').update(openid).digest('hex')}`;
const clubId = (id) => `club_${crypto.createHash('sha256').update(id).digest('hex')}`;
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
  const value = normalizeInput(input, openid);
  return store.transaction(async (tx) => {
    const existing = await tx.getApplication(id);
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
    return project(next);
  });
}

async function submitApplication(store, { openid, input, requestId }, now) {
  const id = applicationId(openid);
  const safeRequestId = text(requestId, '提交请求 ID', 8, 128);
  const value = normalizeInput(input, openid);
  return store.transaction(async (tx) => {
    const existing = await tx.getApplication(id);
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
    if (decision === 'approved') {
      const newClubId = clubId(id);
      next.club_id = newClubId;
      await tx.putClub(newClubId, {
        _id: newClubId,
        name: application.club_name,
        city: application.city,
        introduction: application.introduction,
        cover_file_id: application.cover_file_id,
        join_mode: application.join_mode,
        owner_openid: application.applicant_openid,
        approval_status: 'approved',
        status: 'active',
        source_application_id: id,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      const memberId = membershipId(newClubId, application.applicant_openid);
      await tx.putMembership(memberId, {
        _id: memberId,
        club_id: newClubId,
        openid: application.applicant_openid,
        role: 'OWNER',
        status: 'active',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
    }
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
  normalizeInput,
  project,
  saveDraft,
  submitApplication,
  reviewApplication,
};
