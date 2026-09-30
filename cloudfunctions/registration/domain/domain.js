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
  'version',
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
function hasFeeDetails(fee) {
  if (typeof fee === 'string') return fee.trim().length > 0;
  if (!fee || typeof fee !== 'object' || Array.isArray(fee)) return false;
  return (
    (typeof fee.remark === 'string' && fee.remark.trim().length > 0) ||
    (Array.isArray(fee.included) &&
      fee.included.some((item) => typeof item === 'string' && item.trim())) ||
    (Array.isArray(fee.excluded) &&
      fee.excluded.some((item) => typeof item === 'string' && item.trim()))
  );
}
function hasCompleteDriver(driver) {
  return Boolean(
    driver &&
    typeof driver === 'object' &&
    !Array.isArray(driver) &&
    ['nickname', 'license_plate', 'contact_phone'].every(
      (field) => typeof driver[field] === 'string' && driver[field].trim().length > 0,
    ),
  );
}
function registrationSetupReady(activity) {
  if (!activity || typeof activity !== 'object') return false;
  const capacity = activity.capacity;
  const occupied = activity.occupied_count;
  const supportCapacity = activity.support_vehicle_capacity;
  const selfDriveCapacity = activity.self_drive_capacity;
  const supportOccupied = activity.support_vehicle_occupied_count;
  const selfDriveOccupied = activity.self_drive_occupied_count;
  const deadline = dateOrNull(activity.signup_deadline);
  const start = dateOrNull(activity.event_start);
  const end = dateOrNull(activity.event_end);
  if (
    activity.occupancy_partition_ready !== true ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    !Number.isInteger(supportCapacity) ||
    supportCapacity < 0 ||
    !Number.isInteger(selfDriveCapacity) ||
    selfDriveCapacity < 0 ||
    supportCapacity + selfDriveCapacity !== capacity ||
    !Number.isInteger(occupied) ||
    occupied < 0 ||
    occupied > capacity ||
    !Number.isInteger(supportOccupied) ||
    supportOccupied < 0 ||
    supportOccupied > supportCapacity ||
    !Number.isInteger(selfDriveOccupied) ||
    selfDriveOccupied < 0 ||
    selfDriveOccupied > selfDriveCapacity ||
    supportOccupied + selfDriveOccupied !== occupied ||
    !deadline ||
    !start ||
    !end ||
    deadline.getTime() >= start.getTime() ||
    start.getTime() >= end.getTime() ||
    !hasFeeDetails(activity.fee) ||
    (supportCapacity > 0 && !hasCompleteDriver(activity.support_vehicle_driver))
  )
    return false;
  return true;
}
function assertActivityOpen(activity, now) {
  const decision = registrationDecision(activity, now);
  if (decision.registration_state === 'open') return;
  if (decision.closed_reason === 'deadline') fail('SIGNUP_CLOSED', '报名已截止');
  if (decision.closed_reason === 'full') fail('CAPACITY_FULL', '活动名额已满');
  if (decision.closed_reason === 'incomplete') fail('SIGNUP_INFO_INCOMPLETE', '报名信息待完善');
  fail('ACTIVITY_NOT_AVAILABLE', '活动未发布、已结束或已下线');
}
function assertProfileReady(profile) {
  const sensitive = profile && profile.sensitive_status;
  // 存量证件密文保持只读兼容：报名判定不读取、不解密，也不要求资料更新时删除。
  const realNameReady = sensitive?.real_name === true || !!profile?.real_name_cipher;
  const phoneReady = sensitive?.phone_verified === true || !!profile?.phone_cipher;
  const emergencyReady =
    typeof profile?.emergency_name === 'string' &&
    !!profile.emergency_name.trim() &&
    (sensitive?.emergency_phone === true || !!profile?.emergency_phone_cipher);
  if (
    !profile ||
    typeof profile.nickname !== 'string' ||
    !profile.nickname.trim() ||
    !phoneReady ||
    !realNameReady ||
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
    typeof credential.athlete_id !== 'string' ||
    !credential.athlete_id ||
    !isTokenEnvelope(credential.access_token_cipher) ||
    !isTokenEnvelope(credential.refresh_token_cipher) ||
    !snapshot ||
    snapshot.athlete_id !== credential.athlete_id
  )
    fail('STRAVA_NOT_READY', 'Strava 数据尚未准备完成');
  const syncedAt = dateOrNull(snapshot && snapshot.synced_at);
  if (!syncedAt || now.getTime() - syncedAt.getTime() >= 24 * 60 * 60 * 1000)
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
    !['self_drive', 'support_vehicle'].includes(options.gathering_mode) ||
    !['beginner', 'intermediate', 'regular'].includes(options.experience)
  ) {
    fail('VALIDATION_FAILED', '请选择集合方式并补全骑行经验');
  }
  return {
    gathering_mode: options.gathering_mode,
    experience: options.experience,
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
  'support_vehicle_capacity',
  'self_drive_capacity',
  'support_vehicle_driver',
  'occupied_count',
  'version',
  'signup_deadline',
  'event_start',
  'event_end',
  'status',
];
function registrationDecision(activity, now) {
  const end = dateOrNull(activity && activity.event_end);
  const deadline = dateOrNull(activity && activity.signup_deadline);
  if (activity && activity.status === 'finished')
    return { registration_state: 'closed', closed_reason: 'finished' };
  if (!activity || activity.is_deleted === true || activity.status !== 'published')
    return { registration_state: 'closed', closed_reason: 'unavailable' };
  if (end && end.getTime() <= now.getTime())
    return { registration_state: 'closed', closed_reason: 'finished' };
  if (deadline && deadline.getTime() <= now.getTime())
    return { registration_state: 'closed', closed_reason: 'deadline' };
  if (
    Number.isInteger(activity.capacity) &&
    activity.capacity > 0 &&
    Number.isInteger(activity.occupied_count) &&
    activity.occupied_count >= activity.capacity
  )
    return { registration_state: 'closed', closed_reason: 'full' };
  if (!registrationSetupReady(activity))
    return { registration_state: 'closed', closed_reason: 'incomplete' };
  return { registration_state: 'open', closed_reason: null };
}
function publicActivity(activity, now = new Date()) {
  const output = pick(activity, ACTIVITY_FIELDS);
  if (!Number.isInteger(output.capacity)) output.capacity = 0;
  if (output.support_vehicle_driver) {
    output.support_vehicle_driver = {
      ...output.support_vehicle_driver,
      contact_phone: maskPhone(output.support_vehicle_driver.contact_phone),
    };
  }
  if (
    activity.occupancy_partition_ready === true &&
    Number.isInteger(activity.support_vehicle_capacity)
  )
    output.support_vehicle_remaining = Math.max(
      0,
      activity.support_vehicle_capacity -
        (Number.isInteger(activity.support_vehicle_occupied_count)
          ? activity.support_vehicle_occupied_count
          : 0),
    );
  if (activity.occupancy_partition_ready === true && Number.isInteger(activity.self_drive_capacity))
    output.self_drive_remaining = Math.max(
      0,
      activity.self_drive_capacity -
        (Number.isInteger(activity.self_drive_occupied_count)
          ? activity.self_drive_occupied_count
          : 0),
    );
  const decision = registrationDecision(activity, now);
  const setupPending = activity?.status === 'published' && decision.closed_reason === 'incomplete';
  return {
    ...output,
    ...decision,
    ...(setupPending ? { registration_setup_pending: true } : {}),
    ...(setupPending ? { registration_state: 'closed', closed_reason: 'unavailable' } : {}),
    server_now: now.toISOString(),
  };
}
function maskPhone(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const digits = value.replace(/\D/g, '');
  if (/^\d{11}$/.test(digits)) return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  // 无法可靠识别的电话文本也必须 fail closed，绝不回显原文。
  return digits.length >= 4 ? `****${digits.slice(-4)}` : '****';
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
    phone_source: ['wechat', 'manual', 'legacy'].includes(snapshot.phone_source)
      ? snapshot.phone_source
      : '',
    phone_verified: snapshot.phone_verified === true,
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
  registrationDecision,
  registrationSetupReady,
  publicActivity,
  publicRegistration,
  buildAudit,
};
