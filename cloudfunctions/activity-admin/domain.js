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
  'images',
  'cover_image',
  'description',
  'schedule',
  'route',
  'notices',
  'equipment',
  'fee',
  'capacity',
  'registration_unlimited',
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
function cleanImages(value, maxImages = 3) {
  if (!Array.isArray(value) || value.length > maxImages)
    fail('VALIDATION_FAILED', '活动图片最多 3 张');
  return value.map((item) => cleanText(item, '活动图片', 500, true));
}
function cleanLocation(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('VALIDATION_FAILED', `${field}格式错误`);
  const allowed = new Set(['name', 'address', 'latitude', 'longitude']);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    fail('VALIDATION_FAILED', `${field}格式错误`);
  const latitude = value.latitude;
  const longitude = value.longitude;
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  )
    fail('VALIDATION_FAILED', `${field}经纬度格式错误`);
  return {
    name: cleanText(value.name, `${field}名称`, 200),
    address: cleanText(value.address, `${field}地址`, 300),
    latitude,
    longitude,
  };
}
function cleanStravaRoute(route) {
  const extraFields = [
    'strava_route_id',
    'strava_route_url',
    'elevation_profile',
    'route_bounds',
    'popular_climbs',
  ];
  if (!extraFields.some((field) => route[field] !== undefined)) return {};
  const url = cleanText(route.strava_route_url, 'Strava 路线 URL', 256, true);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail('VALIDATION_FAILED', 'Strava 路线 URL 格式错误');
  }
  const urlMatch = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?routes\/(\d+)\/?$/i.exec(parsed.pathname);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname.toLowerCase() !== 'www.strava.com' ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !urlMatch
  )
    fail('VALIDATION_FAILED', 'Strava 路线 URL 格式错误');
  const hasSyncedData = extraFields.some(
    (field) => field !== 'strava_route_url' && route[field] !== undefined,
  );
  if (!hasSyncedData) return { strava_route_url: url };
  const id = cleanText(route.strava_route_id, 'Strava 路线 ID', 20, true);
  if (!/^\d{1,20}$/.test(id) || urlMatch[1] !== id)
    fail('VALIDATION_FAILED', 'Strava 路线 URL 格式错误');
  if (
    !Array.isArray(route.elevation_profile) ||
    route.elevation_profile.length < 2 ||
    route.elevation_profile.length > 80
  )
    fail('VALIDATION_FAILED', '海拔曲线格式错误');
  let previousDistance = -1;
  const elevationProfile = route.elevation_profile.map((point) => {
    if (
      !point ||
      typeof point !== 'object' ||
      Array.isArray(point) ||
      Object.keys(point).some((key) => !['distance_km', 'elevation_m'].includes(key))
    )
      fail('VALIDATION_FAILED', '海拔曲线格式错误');
    const distance = point.distance_km;
    const elevation = point.elevation_m;
    if (
      typeof distance !== 'number' ||
      !Number.isFinite(distance) ||
      distance < previousDistance ||
      distance < 0 ||
      distance > 20000 ||
      typeof elevation !== 'number' ||
      !Number.isFinite(elevation) ||
      elevation < -1000 ||
      elevation > 10000
    )
      fail('VALIDATION_FAILED', '海拔曲线格式错误');
    previousDistance = distance;
    return { distance_km: distance, elevation_m: elevation };
  });
  const bounds = route.route_bounds;
  if (
    !bounds ||
    typeof bounds !== 'object' ||
    Array.isArray(bounds) ||
    Object.keys(bounds).some((key) => !['south', 'west', 'north', 'east'].includes(key))
  )
    fail('VALIDATION_FAILED', '路线边界格式错误');
  const { south, west, north, east } = bounds;
  if (
    ![south, west, north, east].every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    ) ||
    south < -90 ||
    north > 90 ||
    west < -180 ||
    east > 180 ||
    south > north ||
    west > east
  )
    fail('VALIDATION_FAILED', '路线边界格式错误');
  if (!Array.isArray(route.popular_climbs) || route.popular_climbs.length > 3)
    fail('VALIDATION_FAILED', '热门爬坡格式错误');
  const popularClimbs = route.popular_climbs.map((climb) => {
    const fields = [
      'id',
      'name',
      'distance_km',
      'elevation_gain_m',
      'average_grade',
      'max_grade',
      'climb_category',
      'popularity',
      'popularity_label',
    ];
    if (
      !climb ||
      typeof climb !== 'object' ||
      Array.isArray(climb) ||
      Object.keys(climb).some((key) => !fields.includes(key))
    )
      fail('VALIDATION_FAILED', '热门爬坡格式错误');
    const numeric = fields.slice(2, 8);
    if (
      !/^\d{1,20}$/.test(climb.id) ||
      numeric.some((key) => typeof climb[key] !== 'number' || !Number.isFinite(climb[key])) ||
      !Number.isInteger(climb.climb_category) ||
      climb.climb_category < 0 ||
      climb.climb_category > 5 ||
      !Number.isSafeInteger(climb.popularity) ||
      climb.popularity < 0 ||
      climb.distance_km < 0 ||
      climb.distance_km > 1000 ||
      climb.elevation_gain_m < 0 ||
      climb.elevation_gain_m > 100000 ||
      climb.average_grade < -100 ||
      climb.average_grade > 100 ||
      climb.max_grade < -100 ||
      climb.max_grade > 100
    )
      fail('VALIDATION_FAILED', '热门爬坡格式错误');
    return {
      id: climb.id,
      name: cleanText(climb.name, '爬坡名称', 120, true),
      distance_km: climb.distance_km,
      elevation_gain_m: climb.elevation_gain_m,
      average_grade: climb.average_grade,
      max_grade: climb.max_grade,
      climb_category: climb.climb_category,
      popularity: climb.popularity,
      popularity_label: cleanText(climb.popularity_label, '热度说明', 40, true),
    };
  });
  return {
    strava_route_id: id,
    strava_route_url: `https://www.strava.com/routes/${id}`,
    elevation_profile: elevationProfile,
    route_bounds: { south, west, north, east },
    popular_climbs: popularClimbs,
  };
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
  if (typeof value !== 'string' && !(value instanceof Date))
    fail('VALIDATION_FAILED', `${label}格式错误`);
  const date = new Date(value instanceof Date ? value.getTime() : value);
  if (!Number.isFinite(date.getTime())) fail('VALIDATION_FAILED', `${label}格式错误`);
  return date;
}
const ACTIVITY_INPUT_FIELDS = new Set([
  'title',
  'images',
  'cover_image',
  'description',
  'schedule',
  'route',
  'notices',
  'equipment',
  'fee',
  'capacity',
  'registration_unlimited',
  'support_vehicle_capacity',
  'self_drive_capacity',
  'support_vehicle_driver',
  'signup_deadline',
  'event_start',
  'event_end',
  'status',
]);
function effectiveActivityInput(current, input) {
  const effective = { ...input };
  for (const field of ACTIVITY_INPUT_FIELDS)
    if (effective[field] === undefined && current?.[field] !== undefined)
      effective[field] = current[field];
  return effective;
}
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
function validateBaseActivityInput(input, occupiedCount, allowedStatuses, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('VALIDATION_FAILED', '活动参数格式错误');
  for (const key of Object.keys(input))
    if (!ACTIVITY_INPUT_FIELDS.has(key))
      fail('FORBIDDEN_FIELD', '客户端不得传入服务端控制字段', { field: key });
  if (!allowedStatuses.includes(input.status)) fail('VALIDATION_FAILED', '活动状态无效');

  const registrationUnlimited = input.registration_unlimited === true;
  if (
    input.registration_unlimited !== undefined &&
    typeof input.registration_unlimited !== 'boolean'
  )
    fail('VALIDATION_FAILED', '报名人数限制格式错误');
  const capacity =
    input.capacity === undefined
      ? undefined
      : validateOptionalNonNegativeInteger(input.capacity, '活动容量');
  if (capacity !== undefined && (capacity < 1 || capacity > MAX_ACTIVITY_CAPACITY))
    fail('VALIDATION_FAILED', `活动容量必须为 1-${MAX_ACTIVITY_CAPACITY} 的整数`);
  if (capacity !== undefined && !registrationUnlimited && capacity < occupiedCount)
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
  const routeFields = new Set([
    'start',
    'end',
    'start_location',
    'end_location',
    'distance_km',
    'elevation_m',
    'level',
    'gpx_file_id',
    'strava_route_id',
    'strava_route_url',
    'elevation_profile',
    'route_bounds',
    'popular_climbs',
  ]);
  if (Object.keys(route).some((key) => !routeFields.has(key)))
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
  const images =
    input.images === undefined ? [] : cleanImages(input.images, options.maxImages || 3);
  const legacyCover = cleanText(input.cover_image || '', '封面', 500);
  return {
    title: cleanText(input.title, '活动标题', 100, true),
    images,
    cover_image: images[0] || legacyCover,
    description: cleanText(input.description || '', '活动说明', 5000),
    schedule: cleanSchedule(input.schedule || []),
    route: {
      start: cleanText(route.start || '', '路线起点', 200),
      end: cleanText(route.end || '', '路线终点', 200),
      ...(route.start_location === undefined
        ? {}
        : { start_location: cleanLocation(route.start_location, '路线起点') }),
      ...(route.end_location === undefined
        ? {}
        : { end_location: cleanLocation(route.end_location, '路线终点') }),
      distance_km: distance,
      elevation_m: elevation,
      level: cleanText(route.level || '', '路线难度', 50),
      gpx_file_id: cleanText(route.gpx_file_id || '', 'GPX 文件', 500),
      ...cleanStravaRoute(route),
    },
    notices: cleanStringArray(input.notices || [], '注意事项'),
    equipment: cleanStringArray(input.equipment || [], '装备要求'),
    ...(fee === undefined ? {} : { fee }),
    ...(input.registration_unlimited === undefined
      ? {}
      : { registration_unlimited: registrationUnlimited }),
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
function validateDraftInput(input, occupiedCount = 0, options = {}) {
  return validateBaseActivityInput(input, occupiedCount, ['draft'], options);
}
function validatePublishInput(input, occupiedCount = 0, now = new Date(), options = {}) {
  const safe = validateBaseActivityInput(input, occupiedCount, ['published', 'finished'], options);
  for (const field of ['event_start', 'event_end'])
    if (safe[field] === undefined) fail('VALIDATION_FAILED', '发布前请补全活动时间');
  if (!safe.route.start || (!safe.registration_unlimited && !safe.route.end))
    fail('VALIDATION_FAILED', '发布前请补全路线起点和终点');
  if (
    options.requireFutureDeadline !== false &&
    safe.signup_deadline &&
    safe.signup_deadline.getTime() <= now.getTime()
  )
    fail('INVALID_ACTIVITY_TIME', '报名截止时间必须晚于当前时间');
  // 只有显式把后援车容量设为 0 才清空司机；字段省略表示保留当前值。
  if (safe.support_vehicle_capacity > 0)
    safe.support_vehicle_driver = cleanDriver(input.support_vehicle_driver, true);
  else if (safe.support_vehicle_capacity === 0)
    safe.support_vehicle_driver = { nickname: '', license_plate: '', contact_phone: '' };
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
    (from === 'published' && to === 'draft') ||
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
  if (currentStatus === 'published' && nextStatus === 'draft') return 'activity.unpublish';
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
  effectiveActivityInput,
  validateDraftInput,
  validatePublishInput,
  validateActivityInput,
  assertStatusTransition,
  buildActivityAudit,
  activityAuditAction,
  maskPhone,
};
