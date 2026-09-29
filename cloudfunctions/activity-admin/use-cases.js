'use strict';

const {
  fail,
  isEnabledAdmin,
  publicActivity,
  validateActivityInput,
  assertStatusTransition,
  buildActivityAudit,
} = require('./domain');

async function saveActivity(store, { openid, activityId, activity }, now = new Date()) {
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
    const occupiedCount = current?.occupied_count ?? 0;
    if (!Number.isInteger(occupiedCount) || occupiedCount < 0)
      fail('SCHEMA_INVALID', '活动名额计数异常');
    if (current) assertStatusTransition(current.status, activity.status);
    else if (activity.status !== 'draft') fail('INVALID_TRANSITION', '新活动必须先保存为草稿');
    const supportVehicleOccupiedCount = Number.isInteger(current?.support_vehicle_occupied_count)
      ? current.support_vehicle_occupied_count
      : 0;
    const selfDriveOccupiedCount = Number.isInteger(current?.self_drive_occupied_count)
      ? current.self_drive_occupied_count
      : 0;
    if (supportVehicleOccupiedCount < 0 || selfDriveOccupiedCount < 0)
      fail('SCHEMA_INVALID', '分类名额计数异常');
    const safe = validateActivityInput(activity, occupiedCount);
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
        current ? 'activity.update' : 'activity.create',
        id,
        now,
        current?.status,
        safe.status,
      ),
    );
    return publicActivity(value, { revealContact: true });
  });
}
module.exports = { saveActivity };
