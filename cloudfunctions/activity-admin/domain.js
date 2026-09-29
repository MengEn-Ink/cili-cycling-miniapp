'use strict';

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
  'occupied_count',
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
function publicActivity(activity) {
  return pick(activity, ACTIVITY_FIELDS);
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
function validateActivityInput(input, occupiedCount = 0) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('VALIDATION_FAILED', '活动参数格式错误');
  const allowed = new Set([
    'title',
    'cover_image',
    'description',
    'schedule',
    'route',
    'notices',
    'equipment',
    'fee',
    'capacity',
    'signup_deadline',
    'event_start',
    'event_end',
    'status',
  ]);
  for (const key of Object.keys(input))
    if (!allowed.has(key)) fail('FORBIDDEN_FIELD', '客户端不得传入服务端控制字段', { field: key });
  if (!Number.isInteger(input.capacity) || input.capacity < 1)
    fail('VALIDATION_FAILED', '活动容量必须为正整数');
  if (input.capacity < occupiedCount) fail('CAPACITY_BELOW_OCCUPIED', '活动容量不能低于已占用名额');
  if (!['draft', 'published', 'finished'].includes(input.status))
    fail('VALIDATION_FAILED', '活动状态无效');
  const deadline = validDate(input.signup_deadline, '报名截止时间');
  const start = validDate(input.event_start, '活动开始时间');
  const end = validDate(input.event_end, '活动结束时间');
  if (deadline.getTime() >= start.getTime())
    fail('INVALID_ACTIVITY_TIME', '报名截止时间必须早于活动开始时间');
  if (start.getTime() >= end.getTime())
    fail('INVALID_ACTIVITY_TIME', '活动结束时间必须晚于活动开始时间');
  const route = input.route;
  if (!route || typeof route !== 'object' || Array.isArray(route))
    fail('VALIDATION_FAILED', '路线格式错误');
  const distance = Number(route.distance_km);
  const elevation = Number(route.elevation_m);
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(elevation) || elevation < 0)
    fail('VALIDATION_FAILED', '路线里程或爬升格式错误');
  const fee = input.fee;
  let feeRemark;
  let feeIncluded = [];
  let feeExcluded = [];
  if (typeof fee === 'string') {
    feeRemark = cleanText(fee, '费用说明', 500);
  } else if (fee && typeof fee === 'object' && !Array.isArray(fee)) {
    feeRemark = cleanText(fee.remark || '', '费用说明', 500);
    feeIncluded = cleanStringArray(fee.included || [], '费用包含');
    feeExcluded = cleanStringArray(fee.excluded || [], '费用不含');
  } else {
    fail('VALIDATION_FAILED', '费用说明格式错误');
  }
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
    fee: { included: feeIncluded, excluded: feeExcluded, remark: feeRemark },
    capacity: input.capacity,
    signup_deadline: deadline,
    event_start: start,
    event_end: end,
    status: input.status,
  };
}
function assertStatusTransition(from, to) {
  if (from === to) return;
  if (from === 'draft' && to === 'published') return;
  if (from === 'published' && to === 'finished') return;
  fail('INVALID_TRANSITION', `活动状态不能从 ${from} 变更为 ${to}`);
}
function buildActivityAudit(actorOpenid, action, targetId, now, fromStatus, toStatus) {
  return {
    actor_openid: actorOpenid,
    action,
    target_id: targetId,
    created_at: now,
    detail: { ...(fromStatus ? { from_status: fromStatus } : {}), to_status: toStatus },
  };
}

module.exports = {
  DomainError,
  fail,
  ok,
  toErrorResponse,
  assertTrustedOpenid,
  isEnabledAdmin,
  publicActivity,
  validateActivityInput,
  assertStatusTransition,
  buildActivityAudit,
};
