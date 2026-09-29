'use strict';

const crypto = require('node:crypto');
const OCCUPYING = new Set(['pending', 'approved']);
const RESUBMITTABLE = new Set(['rejected', 'cancelled']);
const FORBIDDEN = new Set([
  'openid',
  'role',
  'status',
  'capacity',
  'occupied_count',
  'amount',
  'price',
  'reviewer_openid',
  'review_history',
  'serial_no',
  'approved_at',
  'rejected_at',
]);

class DomainError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
function fail(code, message, details) {
  throw new DomainError(code, message, details);
}
function ok(data) {
  return { ok: true, data };
}
function toErrorResponse(error) {
  if (error instanceof DomainError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' } };
}
function assertTrustedOpenid(openid) {
  if (typeof openid !== 'string' || !openid) fail('UNAUTHENTICATED', '无法取得微信可信身份');
}
function assertNoForbiddenFields(input, path = 'input') {
  if (!input || typeof input !== 'object') return;
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN.has(key))
      fail('FORBIDDEN_FIELD', '客户端不得传入服务端控制字段', { field: `${path}.${key}` });
    assertNoForbiddenFields(value, `${path}.${key}`);
  }
}
function registrationId(activityId, openid) {
  return 'reg_' + crypto.createHash('sha256').update(`${activityId}\u0000${openid}`).digest('hex');
}
function isOccupying(status) {
  return OCCUPYING.has(status);
}
function assertActivityOpen(activity, now) {
  if (!activity || activity.is_deleted === true || activity.status !== 'published')
    fail('ACTIVITY_NOT_AVAILABLE', '活动未发布或已下线');
  const deadline = Date.parse(activity.signup_deadline);
  if (!Number.isFinite(deadline) || deadline <= now.getTime()) fail('SIGNUP_CLOSED', '报名已截止');
  if (
    !Number.isInteger(activity.capacity) ||
    activity.capacity < 1 ||
    !Number.isInteger(activity.occupied_count) ||
    activity.occupied_count < 0
  ) {
    fail('SCHEMA_INVALID', '活动名额计数异常');
  }
}
function assertProfileReady(profile) {
  const sensitive = profile && profile.sensitive_status;
  // 新版资料服务以加密字段作为可信事实；旧数据保留 materialized 状态时继续兼容。
  const phoneReady = sensitive?.phone_verified === true || !!profile?.phone_cipher;
  const identityReady =
    sensitive?.identity_encrypted === true ||
    (!!profile?.real_name_cipher && !!profile?.id_number_cipher);
  const emergencyReady =
    sensitive?.emergency_contact_encrypted === true ||
    (!!profile?.emergency_name && !!profile?.emergency_phone_cipher);
  if (
    !profile ||
    typeof profile.nickname !== 'string' ||
    !profile.nickname.trim() ||
    !phoneReady ||
    !identityReady ||
    !emergencyReady
  ) {
    fail('PROFILE_INCOMPLETE', '请先完成并安全保存实名资料');
  }
}
const STRAVA_FIELDS = [
  'years_on_strava',
  'rides_per_month',
  'total_km',
  'activities_90d',
  'activities_4w',
  'longest_km',
  'longest_name',
  'max_elevation_m',
  'max_elevation_name',
  'total_elevation_m',
  'weighted_avg_speed_kmh',
  'race_count',
  'races',
  'clubs',
  'primary_club_name',
  'bikes',
  'coverage',
  'connected_at',
  'latest_activity_at',
  'synced_at',
  'coverage_from',
  'coverage_to',
  'coverage_complete',
];
function safeStravaSnapshot(snapshot) {
  return pick(snapshot, STRAVA_FIELDS);
}
function selectStrava(profile) {
  const strava = profile.strava || {};
  if (strava.status === 'connected' && strava.snapshot && typeof strava.snapshot === 'object') {
    return { status: 'connected', snapshot: safeStravaSnapshot(strava.snapshot) };
  }
  if (
    strava.exempt &&
    strava.exempt.enabled === true &&
    typeof strava.exempt.reason === 'string' &&
    strava.exempt.reason.trim()
  ) {
    return {
      status: 'exempted',
      exemption: { reason: strava.exempt.reason, at: strava.exempt.at },
    };
  }
  fail('STRAVA_REQUIRED', '请先绑定 Strava 或取得豁免');
}
function finiteNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function dateOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function isTokenEnvelope(value) {
  return Boolean(
    value &&
    value.alg === 'A256GCM' &&
    ['iv', 'tag', 'ciphertext'].every(
      (field) => typeof value[field] === 'string' && value[field].trim().length > 0,
    ),
  );
}
function selectCanonicalStrava(credential, snapshot, now = new Date()) {
  if (
    !credential ||
    !isTokenEnvelope(credential.access_token_cipher) ||
    !isTokenEnvelope(credential.refresh_token_cipher)
  )
    fail('STRAVA_NOT_READY', 'Strava 数据尚未准备完成');
  const syncedAt = dateOrNull(snapshot && snapshot.synced_at);
  if (!snapshot || !syncedAt || now.getTime() - syncedAt.getTime() >= 24 * 60 * 60 * 1000)
    fail('STRAVA_NOT_READY', 'Strava 数据已过期，请重新准备');
  return {
    status: 'connected',
    snapshot: {
      total_km: finiteNumberOrNull(snapshot.total_km),
      activities_90d: finiteNumberOrNull(snapshot.activities_90d),
      longest_km: finiteNumberOrNull(snapshot.longest_km),
      total_elevation_m: finiteNumberOrNull(snapshot.total_elevation_m),
      weighted_avg_speed_kmh: finiteNumberOrNull(snapshot.weighted_avg_speed_kmh),
      latest_activity_at: dateOrNull(snapshot.latest_activity_at),
      synced_at: syncedAt,
      coverage_from: dateOrNull(snapshot.coverage_from),
      coverage_to: dateOrNull(snapshot.coverage_to),
      coverage_complete: snapshot.coverage_complete === true,
    },
  };
}
function validateOptions(options) {
  if (
    !options ||
    !['own', 'rent'].includes(options.bike_mode) ||
    !['beginner', 'intermediate', 'regular'].includes(options.experience)
  ) {
    fail('VALIDATION_FAILED', '请补全用车和骑行经验信息');
  }
  return {
    bike_mode: options.bike_mode,
    experience: options.experience,
    rental_need: typeof options.rental_need === 'string' ? options.rental_need.slice(0, 200) : '',
    remark: typeof options.remark === 'string' ? options.remark.slice(0, 500) : '',
  };
}
function assertCanSubmit(existing) {
  if (existing && !RESUBMITTABLE.has(existing.status))
    fail('REGISTRATION_EXISTS', '该活动已有占位中的报名');
}
function assertCanCancel(registration, openid) {
  if (!registration) fail('REGISTRATION_NOT_FOUND', '报名不存在');
  if (registration.openid !== openid) fail('FORBIDDEN', '只能取消本人的报名');
  if (!OCCUPYING.has(registration.status)) fail('INVALID_TRANSITION', '当前状态不可取消');
}
function assertReviewTransition(from, action, reason) {
  if (from !== 'pending') fail('INVALID_TRANSITION', '仅待审核报名可以审批');
  if (!['approve', 'reject'].includes(action)) fail('VALIDATION_FAILED', '未知审批动作');
  if (action === 'reject' && (typeof reason !== 'string' || !reason.trim()))
    fail('REASON_REQUIRED', '驳回必须填写理由');
  if (action === 'approve' && reason !== undefined && typeof reason !== 'string')
    fail('VALIDATION_FAILED', '审批备注格式错误');
  return action === 'approve' ? 'approved' : 'rejected';
}
function isEnabledAdmin(admin, openid) {
  return Boolean(admin && admin._id === openid && admin.enabled !== false);
}
function pick(object, keys) {
  return keys.reduce((out, key) => {
    if (object && object[key] !== undefined) out[key] = object[key];
    return out;
  }, {});
}
const ACTIVITY_FIELDS = [
  '_id',
  'title',
  'cover_image',
  'description',
  'schedule',
  'route',
  'notices',
  'equipment',
  'fee',
  'capacity',
  'occupied_count',
  'signup_deadline',
  'event_start',
  'event_end',
  'status',
];
function publicActivity(activity) {
  return pick(activity, ACTIVITY_FIELDS);
}
function maskPhone(value) {
  return typeof value === 'string' ? value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '';
}
function maskId(value) {
  return typeof value !== 'string'
    ? ''
    : value.length <= 8
      ? '****'
      : `${value.slice(0, 2)}******${value.slice(-4)}`;
}
function publicRegistration(registration) {
  const output = pick(registration, [
    '_id',
    'activity_id',
    'status',
    'options',
    'strava_status',
    'serial_no',
    'created_at',
    'updated_at',
  ]);
  output.review_history = Array.isArray(registration.review_history)
    ? registration.review_history.map((item) => pick(item, ['reviewed_at', 'action', 'comment']))
    : [];
  if (registration.strava_snapshot)
    output.strava_snapshot = safeStravaSnapshot(registration.strava_snapshot);
  if (registration.exemption) output.exemption = pick(registration.exemption, ['reason', 'at']);
  const snapshot = registration.profile_snapshot || {};
  output.profile_snapshot = {
    nickname: snapshot.nickname,
    real_name_masked: snapshot.real_name_masked,
    phone_masked: maskPhone(snapshot.phone_masked),
    id_number_masked: maskId(snapshot.id_number_masked),
  };
  return output;
}
function buildAudit(actorOpenid, action, targetId, now, detail = {}) {
  const safeDetail = {};
  for (const key of ['activity_id', 'from_status', 'to_status', 'reason'])
    if (detail[key] !== undefined) safeDetail[key] = detail[key];
  return {
    actor_openid: actorOpenid,
    action,
    target_id: targetId,
    created_at: now,
    detail: safeDetail,
  };
}

module.exports = {
  DomainError,
  fail,
  ok,
  toErrorResponse,
  assertTrustedOpenid,
  assertNoForbiddenFields,
  registrationId,
  isOccupying,
  assertActivityOpen,
  assertProfileReady,
  selectStrava,
  selectCanonicalStrava,
  validateOptions,
  assertCanSubmit,
  assertCanCancel,
  assertReviewTransition,
  isEnabledAdmin,
  publicActivity,
  publicRegistration,
  buildAudit,
};
