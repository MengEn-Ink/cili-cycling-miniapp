'use strict';

const MAX_ACTIVITY_CAPACITY = 1000;
const MAX_PARTITION_BACKFILL_RECORDS = MAX_ACTIVITY_CAPACITY;

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
  if (error instanceof DomainError)
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用' } };
}
function assertTrustedOpenid(openid) {
  if (typeof openid !== 'string' || !openid) fail('UNAUTHENTICATED', '无法取得微信可信身份');
}
function isEnabledAdmin(admin, openid) {
  return Boolean(admin && admin._id === openid && admin.enabled !== false);
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
function pick(object, keys) {
  return keys.reduce((out, key) => {
    if (object && object[key] !== undefined) out[key] = object[key];
    return out;
  }, {});
}
function maskPhone(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const digits = value.replace(/\D/g, '');
  if (/^\d{11}$/.test(digits)) return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  // 无法可靠识别的电话文本也必须 fail closed，绝不回显原文。
  return digits.length >= 4 ? `****${digits.slice(-4)}` : '****';
}
function publicActivity(activity, options = {}) {
  const output = pick(activity, ACTIVITY_FIELDS);
  if (output.support_vehicle_driver && !options.revealContact) {
    output.support_vehicle_driver = {
      ...output.support_vehicle_driver,
      contact_phone: maskPhone(output.support_vehicle_driver.contact_phone),
    };
  }
  return output;
}
function cleanText(value, field, max, required = false) {
  if (typeof value !== 'string') fail('VALIDATION_FAILED', `${field}格式错误`);
  const text = value.trim();
  if (required && !text) fail('VALIDATION_FAILED', `请填写${field}`);
  if (text.length > max) fail('VALIDATION_FAILED', `${field}过长`);
  return text;
}
function cleanStringArray(value, field) {
  if (!Array.isArray(value) || value.length > 50) fail('VALIDATION_FAILED', `${field}格式错误`);
  return value.map((item) => cleanText(item, field, 200)).filter(Boolean);
}
function cleanSchedule(value) {
  if (!Array.isArray(value) || value.length > 50) fail('VALIDATION_FAILED', '行程格式错误');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      fail('VALIDATION_FAILED', '行程格式错误');
    return {
      time: cleanText(item.time, '行程时间', 20, true),
      title: cleanText(item.title, '行程标题', 100, true),
      location: cleanText(item.location || '', '行程地点', 200),
      remark: cleanText(item.remark || '', '行程备注', 500),
    };
  });
}
function validDate(value, label) {
  if (typeof value !== 'string') fail('VALIDATION_FAILED', `${label}格式错误`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail('VALIDATION_FAILED', `${label}格式错误`);
  return date;
}
const ACTIVITY_INPUT_FIELDS = new Set([
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
  'signup_deadline',
  'event_start',
  'event_end',
  'status',
]);
function validateOptionalNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) fail('VALIDATION_FAILED', `${label}必须为非负整数`);
  return value;
}
function cleanFee(fee) {
  let remark;
  let included = [];
  let excluded = [];
  if (typeof fee === 'string') remark = cleanText(fee, '费用说明', 500);
  else if (fee && typeof fee === 'object' && !Array.isArray(fee)) {
    remark = cleanText(fee.remark || '', '费用说明', 500);
    included = cleanStringArray(fee.included || [], '费用包含');
    excluded = cleanStringArray(fee.excluded || [], '费用不含');
  } else fail('VALIDATION_FAILED', '费用说明格式错误');
  return { included, excluded, remark };
}
function cleanDriver(driver, required) {
  if (!driver || typeof driver !== 'object' || Array.isArray(driver))
    fail('VALIDATION_FAILED', '后援车师傅信息格式错误');
  return {
    nickname: cleanText(driver.nickname ?? '', '后援车师傅昵称', 50, required),
    license_plate: cleanText(driver.license_plate ?? '', '车牌号', 20, required).toUpperCase(),
    contact_phone: cleanText(driver.contact_phone ?? '', '联系电话', 30, required),
  };
}
function validateBaseActivityInput(input, occupiedCount, allowedStatuses) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('VALIDATION_FAILED', '活动参数格式错误');
  for (const key of Object.keys(input))
    if (!ACTIVITY_INPUT_FIELDS.has(key))
      fail('FORBIDDEN_FIELD', '客户端不得传入服务端控制字段', { field: key });
  if (!allowedStatuses.includes(input.status)) fail('VALIDATION_FAILED', '活动状态无效');

  const capacity =
    input.capacity === undefined
      ? undefined
      : validateOptionalNonNegativeInteger(input.capacity, '活动容量');
  if (capacity !== undefined && (capacity < 1 || capacity > MAX_ACTIVITY_CAPACITY))
    fail('VALIDATION_FAILED', `活动容量必须为 1-${MAX_ACTIVITY_CAPACITY} 的整数`);
  if (capacity !== undefined && capacity < occupiedCount)
    fail('CAPACITY_BELOW_OCCUPIED', '活动容量不能低于已占用名额');
  const supportVehicleCapacity =
    input.support_vehicle_capacity === undefined
      ? undefined
      : validateOptionalNonNegativeInteger(input.support_vehicle_capacity, '后援车名额');
  const selfDriveCapacity =
    input.self_drive_capacity === undefined
      ? undefined
      : validateOptionalNonNegativeInteger(input.self_drive_capacity, '自驾名额');
  if (
    capacity !== undefined &&
    supportVehicleCapacity !== undefined &&
    selfDriveCapacity !== undefined &&
    supportVehicleCapacity + selfDriveCapacity !== capacity
  )
    fail('VALIDATION_FAILED', '后援车名额与自驾名额之和必须等于活动容量');

  const deadline =
    input.signup_deadline === undefined
      ? undefined
      : validDate(input.signup_deadline, '报名截止时间');
  const start =
    input.event_start === undefined ? undefined : validDate(input.event_start, '活动开始时间');
  const end =
    input.event_end === undefined ? undefined : validDate(input.event_end, '活动结束时间');
  if (deadline && start && deadline.getTime() >= start.getTime())
    fail('INVALID_ACTIVITY_TIME', '报名截止时间必须早于活动开始时间');
  if (start && end && start.getTime() >= end.getTime())
    fail('INVALID_ACTIVITY_TIME', '活动结束时间必须晚于活动开始时间');
  const route = input.route;
  if (!route || typeof route !== 'object' || Array.isArray(route))
    fail('VALIDATION_FAILED', '路线格式错误');
  const distance = Number(route.distance_km);
  const elevation = Number(route.elevation_m);
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(elevation) || elevation < 0)
    fail('VALIDATION_FAILED', '路线里程或爬升格式错误');
  const fee = input.fee === undefined ? undefined : cleanFee(input.fee);
  const driver =
    input.support_vehicle_driver === undefined
      ? undefined
      : cleanDriver(input.support_vehicle_driver, false);
  return {
    title: cleanText(input.title, '活动标题', 100, true),
    cover_image: cleanText(input.cover_image || '', '封面', 500),
    description: cleanText(input.description || '', '活动说明', 5000),
    schedule: cleanSchedule(input.schedule || []),
    route: {
      start: cleanText(route.start || '', '路线起点', 200),
      end: cleanText(route.end || '', '路线终点', 200),
      distance_km: distance,
      elevation_m: elevation,
      level: cleanText(route.level || '', '路线难度', 50),
      gpx_file_id: cleanText(route.gpx_file_id || '', 'GPX 文件', 500),
    },
    notices: cleanStringArray(input.notices || [], '注意事项'),
    equipment: cleanStringArray(input.equipment || [], '装备要求'),
    ...(fee === undefined ? {} : { fee }),
    ...(capacity === undefined ? {} : { capacity }),
    ...(supportVehicleCapacity === undefined
      ? {}
      : { support_vehicle_capacity: supportVehicleCapacity }),
    ...(selfDriveCapacity === undefined ? {} : { self_drive_capacity: selfDriveCapacity }),
    ...(driver === undefined ? {} : { support_vehicle_driver: driver }),
    ...(deadline === undefined ? {} : { signup_deadline: deadline }),
    ...(start === undefined ? {} : { event_start: start }),
    ...(end === undefined ? {} : { event_end: end }),
    status: input.status,
  };
}
function validateDraftInput(input, occupiedCount = 0) {
  return validateBaseActivityInput(input, occupiedCount, ['draft']);
}
function validatePublishInput(input, occupiedCount = 0, now = new Date(), options = {}) {
  const safe = validateBaseActivityInput(input, occupiedCount, ['published', 'finished']);
  for (const field of [
    'capacity',
    'support_vehicle_capacity',
    'self_drive_capacity',
    'fee',
    'signup_deadline',
    'event_start',
    'event_end',
  ])
    if (safe[field] === undefined) fail('VALIDATION_FAILED', '发布前请补全活动运营信息');
  if (!safe.fee.remark && safe.fee.included.length === 0 && safe.fee.excluded.length === 0)
    fail('VALIDATION_FAILED', '发布前请填写费用说明');
  if (options.requireFutureDeadline !== false && safe.signup_deadline.getTime() <= now.getTime())
    fail('INVALID_ACTIVITY_TIME', '报名截止时间必须晚于当前时间');
  safe.support_vehicle_driver =
    safe.support_vehicle_capacity > 0
      ? cleanDriver(input.support_vehicle_driver, true)
      : input.support_vehicle_driver === undefined
        ? { nickname: '', license_plate: '', contact_phone: '' }
        : safe.support_vehicle_driver;
  return safe;
}
function validateActivityInput(input, occupiedCount = 0, now = new Date()) {
  return input?.status === 'draft'
    ? validateDraftInput(input, occupiedCount)
    : validatePublishInput(input, occupiedCount, now);
}
function assertStatusTransition(from, to) {
  if (
    from === to ||
    (from === 'draft' && to === 'published') ||
    (from === 'published' && to === 'finished')
  )
    return;
  fail('INVALID_TRANSITION', `活动状态不能从 ${from} 变更为 ${to}`);
}
function buildActivityAudit(
  actorOpenid,
  action,
  targetId,
  now,
  fromStatus,
  toStatus,
  occupancyPartition,
) {
  return {
    actor_openid: actorOpenid,
    action,
    target_id: targetId,
    created_at: now,
    detail: {
      ...(fromStatus ? { from_status: fromStatus } : {}),
      to_status: toStatus,
      ...(occupancyPartition ? { occupancy_partition: occupancyPartition } : {}),
    },
  };
}
function activityAuditAction(currentStatus, nextStatus) {
  if (!currentStatus) return 'activity.create';
  if (currentStatus === 'draft' && nextStatus === 'published') return 'activity.publish';
  if (currentStatus === 'published' && nextStatus === 'finished') return 'activity.finish';
  return 'activity.update';
}
module.exports = {
  MAX_ACTIVITY_CAPACITY,
  MAX_PARTITION_BACKFILL_RECORDS,
  DomainError,
  fail,
  ok,
  toErrorResponse,
  assertTrustedOpenid,
  isEnabledAdmin,
  publicActivity,
  validateDraftInput,
  validatePublishInput,
  validateActivityInput,
  assertStatusTransition,
  buildActivityAudit,
  activityAuditAction,
  maskPhone,
};
