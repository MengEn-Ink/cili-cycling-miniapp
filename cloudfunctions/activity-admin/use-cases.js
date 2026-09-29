'use strict';

const {
  MAX_PARTITION_BACKFILL_RECORDS,
  fail,
  isEnabledAdmin,
  publicActivity,
  validateActivityInput,
  assertStatusTransition,
  buildActivityAudit,
  activityAuditAction,
} = require('./domain');

function partitionBackfill(registrations, occupiedCount) {
  if (!Array.isArray(registrations) || registrations.length !== occupiedCount)
    fail('PARTITION_BACKFILL_REQUIRED', '历史报名数量与活动占位数不一致，请先修复数据');
  let supportVehicleOccupiedCount = 0;
  let selfDriveOccupiedCount = 0;
  for (const registration of registrations) {
    if (!['pending', 'approved'].includes(registration?.status))
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
    if (activityId && !current) fail('ACTIVITY_NOT_FOUND', '活动不存在');
    // 普通成员的权限严格绑定服务端 OPENID：只能创建草稿、编辑自己的草稿并发布。
    if (!isAdmin && current && current.created_by !== openid)
      fail('FORBIDDEN', '只能编辑自己的活动');
    if (!isAdmin && current && current.status !== 'draft')
      fail('FORBIDDEN', '普通成员只能编辑自己的草稿');
    if (!isAdmin && activity.status === 'finished') fail('ADMIN_REQUIRED', '仅管理员可以结束活动');
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
      (!Number.isInteger(current.capacity) ||
        current.capacity < 1 ||
        current.capacity > MAX_PARTITION_BACKFILL_RECORDS ||
        occupiedCount > MAX_PARTITION_BACKFILL_RECORDS)
    )
      fail('PARTITION_BACKFILL_REQUIRED', '历史活动容量或占位数超过自动回填上限');
    if (current) assertStatusTransition(current.status, activity.status);
    else if (activity.status !== 'draft') fail('INVALID_TRANSITION', '新活动必须先保存为草稿');
    const safe = validateActivityInput(activity, occupiedCount);
    const occupancyPartitionReady = true;
    let supportVehicleOccupiedCount = 0;
    let selfDriveOccupiedCount = 0;
    let backfilledPartition;
    if (current?.occupancy_partition_ready === true) {
      supportVehicleOccupiedCount = current.support_vehicle_occupied_count;
      selfDriveOccupiedCount = current.self_drive_occupied_count;
    } else if (current) {
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
      safe.support_vehicle_capacity < supportVehicleOccupiedCount ||
      safe.self_drive_capacity < selfDriveOccupiedCount
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
    };
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
module.exports = { partitionBackfill, saveActivity };
