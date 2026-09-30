'use strict';

const crypto = require('node:crypto');

const {
  MAX_PARTITION_BACKFILL_RECORDS,
  assertTrustedOpenid,
  fail,
  isEnabledAdmin,
  publicActivity,
  effectiveActivityInput,
  validateDraftInput,
  validatePublishInput,
  assertStatusTransition,
  buildActivityAudit,
  activityAuditAction,
} = require('./domain');

const CLONE_REQUEST_FIELDS = new Set([
  'action',
  'openid',
  'sourceActivityId',
  'requestId',
  'signupDeadline',
  'eventStart',
  'eventEnd',
]);

function cloneActivityId(openid, requestId) {
  const digest = crypto
    .createHash('sha256')
    .update(openid)
    .update('\0')
    .update(requestId)
    .digest('hex');
  return `activity_clone_${digest.slice(0, 32)}`;
}

function cloneRequestFingerprint(openid, request) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        openid,
        request.sourceActivityId,
        request.signupDeadline ?? null,
        request.eventStart ?? null,
        request.eventEnd ?? null,
      ]),
    )
    .digest('hex');
}

function validateCloneRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request))
    fail('VALIDATION_FAILED', '复制参数格式错误');
  for (const key of Object.keys(request))
    if (!CLONE_REQUEST_FIELDS.has(key))
      fail('FORBIDDEN_FIELD', '复制请求包含未允许字段', { field: key });
  assertTrustedOpenid(request.openid);
  if (
    typeof request.sourceActivityId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(request.sourceActivityId)
  )
    fail('VALIDATION_FAILED', '源活动 ID 格式错误');
  if (typeof request.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(request.requestId))
    fail('VALIDATION_FAILED', '请求 ID 格式错误');
  for (const field of ['signupDeadline', 'eventStart', 'eventEnd'])
    if (request[field] !== undefined && typeof request[field] !== 'string')
      fail('VALIDATION_FAILED', '活动时间格式错误');
  return request;
}

async function cloneActivity(store, request, now = new Date()) {
  const safeRequest = validateCloneRequest(request);
  const { openid, sourceActivityId, requestId } = safeRequest;
  const targetId = cloneActivityId(openid, requestId);
  const requestFingerprint = cloneRequestFingerprint(openid, safeRequest);
  return store.transaction(async (tx) => {
    const admin = await tx.getAdmin(openid);
    const isAdmin = isEnabledAdmin(admin, openid);
    const source = await tx.getActivity(sourceActivityId);
    if (!source || source.is_deleted === true) fail('ACTIVITY_NOT_FOUND', '源活动不存在');
    if (!isAdmin && source.created_by !== openid) fail('FORBIDDEN', '只能复制自己的历史活动');
    if (source.status !== 'finished') fail('ACTIVITY_NOT_HISTORY', '只能从历史活动创建草稿');

    const existing = await tx.getActivity(targetId);
    if (existing) {
      if (
        existing.clone_source_activity_id !== sourceActivityId ||
        existing.clone_request_id !== requestId ||
        existing.clone_request_fingerprint !== requestFingerprint ||
        existing.created_by !== openid ||
        existing.status !== 'draft' ||
        existing.is_deleted === true
      )
        fail('CLONE_CONFLICT', '复制请求与已有草稿冲突');
      return publicActivity(existing, { revealContact: true });
    }

    const route = source.route && typeof source.route === 'object' ? source.route : {};
    const draftInput = {
      title: source.title,
      images: [],
      cover_image: '',
      description: source.description,
      schedule: source.schedule,
      route: {
        start: route.start,
        end: route.end,
        ...(route.start_location === undefined ? {} : { start_location: route.start_location }),
        ...(route.end_location === undefined ? {} : { end_location: route.end_location }),
        distance_km: route.distance_km,
        elevation_m: route.elevation_m,
        level: route.level,
        gpx_file_id: '',
      },
      notices: source.notices,
      equipment: source.equipment,
      fee: source.fee,
      capacity: source.capacity,
      ...(safeRequest.signupDeadline === undefined
        ? {}
        : { signup_deadline: safeRequest.signupDeadline }),
      ...(safeRequest.eventStart === undefined ? {} : { event_start: safeRequest.eventStart }),
      ...(safeRequest.eventEnd === undefined ? {} : { event_end: safeRequest.eventEnd }),
      status: 'draft',
    };
    const safe = validateDraftInput(draftInput, 0);
    const value = {
      ...safe,
      _id: targetId,
      occupied_count: 0,
      support_vehicle_occupied_count: 0,
      self_drive_occupied_count: 0,
      occupancy_partition_ready: false,
      version: 1,
      is_deleted: false,
      created_by: openid,
      created_at: now,
      updated_at: now,
      clone_source_activity_id: sourceActivityId,
      clone_request_id: requestId,
      clone_request_fingerprint: requestFingerprint,
    };
    await tx.putActivity(targetId, value);
    await tx.addAudit({
      actor_openid: openid,
      action: 'activity.cloned',
      target_id: targetId,
      created_at: now,
      detail: {
        source_activity_id: sourceActivityId,
        from_status: source.status,
        to_status: 'draft',
      },
    });
    return publicActivity(value, { revealContact: true });
  });
}

function partitionBackfill(registrations, occupiedCount) {
  if (!Array.isArray(registrations) || registrations.length !== occupiedCount)
    fail('PARTITION_BACKFILL_REQUIRED', '历史报名数量与活动占位数不一致，请先修复数据');
  let supportVehicleOccupiedCount = 0;
  let selfDriveOccupiedCount = 0;
  for (const registration of registrations) {
    if (!['pending', 'approved', 'checked_in'].includes(registration?.status))
      fail('PARTITION_BACKFILL_REQUIRED', '历史报名状态无法用于分仓回填');
    const gatheringMode = registration?.options?.gathering_mode;
    if (gatheringMode === 'support_vehicle') supportVehicleOccupiedCount += 1;
    else if (gatheringMode === 'self_drive') selfDriveOccupiedCount += 1;
    else fail('PARTITION_BACKFILL_REQUIRED', '历史报名缺少有效集合方式，请先修复数据');
  }
  if (supportVehicleOccupiedCount + selfDriveOccupiedCount !== occupiedCount)
    fail('PARTITION_BACKFILL_REQUIRED', '历史报名分仓统计与活动占位数不一致');
  return { supportVehicleOccupiedCount, selfDriveOccupiedCount };
}

async function saveActivity(
  store,
  { openid, activityId, expectedVersion, activity },
  now = new Date(),
) {
  if (!activity || typeof activity !== 'object' || Array.isArray(activity))
    fail('VALIDATION_FAILED', '活动参数格式错误');
  return store.transaction(async (tx) => {
    const admin = await tx.getAdmin(openid);
    const isAdmin = isEnabledAdmin(admin, openid);
    const current = activityId ? await tx.getActivity(activityId) : undefined;
    let effectiveActivity = effectiveActivityInput(current, activity);
    const requestedRouteId = effectiveActivity.route?.strava_route_id;
    let stravaRouteOwnerOpenid;
    if (requestedRouteId !== undefined) {
      if (typeof requestedRouteId !== 'string' || !/^\d{1,20}$/.test(requestedRouteId))
        fail('VALIDATION_FAILED', 'Strava 路线 ID 格式错误');
      const preview = await tx.getRoutePreview(openid, requestedRouteId);
      const previewExpiresAt = new Date(preview?.expires_at).getTime();
      const previewUsable =
        preview &&
        preview.owner_openid === openid &&
        preview.strava_route_id === requestedRouteId &&
        Number.isFinite(previewExpiresAt) &&
        previewExpiresAt > now.getTime();
      const trusted = previewUsable
        ? preview
        : current?.route?.strava_route_id === requestedRouteId
          ? current.route
          : undefined;
      if (!trusted) fail('ROUTE_PREVIEW_REQUIRED', '请先重新同步 Strava 路线');
      // 路线归属只从服务端预览或已保存活动继承，客户端无法伪造；后续 GPX 导出始终复用路线创建者凭证。
      stravaRouteOwnerOpenid = previewUsable
        ? preview.owner_openid
        : current?.strava_route_owner_openid;
      if (typeof stravaRouteOwnerOpenid !== 'string' || !stravaRouteOwnerOpenid)
        fail('ROUTE_PREVIEW_REQUIRED', '请先重新同步 Strava 路线');
      effectiveActivity = {
        ...effectiveActivity,
        route: {
          ...effectiveActivity.route,
          distance_km: trusted.distance_km,
          elevation_m: trusted.elevation_m,
          strava_route_id: trusted.strava_route_id,
          strava_route_url: trusted.strava_route_url,
          elevation_profile: trusted.elevation_profile,
          route_bounds: trusted.route_bounds,
          popular_climbs: trusted.popular_climbs,
        },
      };
    }
    if (activityId && !current) fail('ACTIVITY_NOT_FOUND', '活动不存在');
    // 普通成员的权限严格绑定服务端 OPENID：只能管理自己的草稿，并可下架自己已上线的活动。
    if (!isAdmin && current && current.created_by !== openid)
      fail('FORBIDDEN', '只能编辑自己的活动');
    // 创建者可把自己已上线的活动下架；已上线内容的其他编辑仍只允许管理员执行。
    if (
      !isAdmin &&
      current &&
      current.status !== 'draft' &&
      !(current.status === 'published' && effectiveActivity.status === 'draft')
    )
      fail('FORBIDDEN', '普通成员只能编辑自己的草稿或下架已上线活动');
    if (!isAdmin && effectiveActivity.status === 'finished')
      fail('ADMIN_REQUIRED', '仅管理员可以结束活动');
    let currentVersion = 0;
    if (current && current.version !== undefined) {
      if (!Number.isInteger(current.version) || current.version < 1)
        fail('SCHEMA_INVALID', '活动版本异常');
      currentVersion = current.version;
    }
    if (current && expectedVersion !== currentVersion)
      fail('ACTIVITY_CONFLICT', '活动已被其他人更新，请刷新后重试');
    const occupiedCount = current?.occupied_count ?? 0;
    if (!Number.isInteger(occupiedCount) || occupiedCount < 0)
      fail('SCHEMA_INVALID', '活动名额计数异常');
    if (
      current?.occupancy_partition_ready !== true &&
      current &&
      ((Number.isInteger(current.capacity) && current.capacity > MAX_PARTITION_BACKFILL_RECORDS) ||
        occupiedCount > MAX_PARTITION_BACKFILL_RECORDS)
    )
      fail('PARTITION_BACKFILL_REQUIRED', '历史活动容量或占位数超过自动回填上限');
    if (current) assertStatusTransition(current.status, effectiveActivity.status);
    else if (effectiveActivity.status !== 'draft')
      fail('INVALID_TRANSITION', '新活动必须先保存为草稿');
    const safe =
      effectiveActivity.status === 'draft'
        ? validateDraftInput(effectiveActivity, occupiedCount)
        : validatePublishInput(effectiveActivity, occupiedCount, now, {
            requireFutureDeadline:
              current?.status === 'draft' && effectiveActivity.status === 'published',
          });
    const partitionCapacityReady =
      Number.isInteger(safe.capacity) &&
      safe.capacity > 0 &&
      Number.isInteger(safe.support_vehicle_capacity) &&
      safe.support_vehicle_capacity >= 0 &&
      Number.isInteger(safe.self_drive_capacity) &&
      safe.self_drive_capacity >= 0 &&
      safe.support_vehicle_capacity + safe.self_drive_capacity === safe.capacity;
    const occupancyPartitionReady = partitionCapacityReady;
    let supportVehicleOccupiedCount = 0;
    let selfDriveOccupiedCount = 0;
    let backfilledPartition;
    if (partitionCapacityReady && current?.occupancy_partition_ready === true) {
      supportVehicleOccupiedCount = current.support_vehicle_occupied_count;
      selfDriveOccupiedCount = current.self_drive_occupied_count;
    } else if (partitionCapacityReady && current) {
      let registrations;
      try {
        registrations = await tx.getOccupyingRegistrations(activityId, occupiedCount);
      } catch (_error) {
        fail('PARTITION_BACKFILL_REQUIRED', '历史报名读取失败，请重试或先修复数据');
      }
      const counts = partitionBackfill(registrations, occupiedCount);
      supportVehicleOccupiedCount = counts.supportVehicleOccupiedCount;
      selfDriveOccupiedCount = counts.selfDriveOccupiedCount;
      backfilledPartition = {
        from: 'legacy',
        to: 'ready',
        support_vehicle_occupied_count: supportVehicleOccupiedCount,
        self_drive_occupied_count: selfDriveOccupiedCount,
      };
    }
    if (supportVehicleOccupiedCount < 0 || selfDriveOccupiedCount < 0)
      fail('SCHEMA_INVALID', '分类名额计数异常');
    if (!Number.isInteger(supportVehicleOccupiedCount) || !Number.isInteger(selfDriveOccupiedCount))
      fail('SCHEMA_INVALID', '分类名额计数异常');
    if (
      (occupancyPartitionReady && safe.support_vehicle_capacity < supportVehicleOccupiedCount) ||
      (occupancyPartitionReady && safe.self_drive_capacity < selfDriveOccupiedCount)
    )
      fail('CAPACITY_BELOW_OCCUPIED', '分类容量不能低于对应已占用名额');
    const id = activityId || (await tx.createActivityId());
    const value = {
      ...(current || {}),
      ...safe,
      _id: id,
      occupied_count: occupiedCount,
      version: currentVersion + 1,
      occupancy_partition_ready: occupancyPartitionReady,
      support_vehicle_occupied_count: supportVehicleOccupiedCount,
      self_drive_occupied_count: selfDriveOccupiedCount,
      is_deleted: false,
      created_by: current?.created_by || openid,
      created_at: current?.created_at || now,
      updated_at: now,
      ...(stravaRouteOwnerOpenid ? { strava_route_owner_openid: stravaRouteOwnerOpenid } : {}),
    };
    if (!safe.route?.strava_route_id) delete value.strava_route_owner_openid;
    await tx.putActivity(id, value);
    await tx.addAudit(
      buildActivityAudit(
        openid,
        activityAuditAction(current?.status, safe.status),
        id,
        now,
        current?.status,
        safe.status,
        backfilledPartition,
      ),
    );
    return publicActivity(value, { revealContact: true });
  });
}
module.exports = {
  partitionBackfill,
  cloneActivityId,
  cloneRequestFingerprint,
  cloneActivity,
  saveActivity,
};
