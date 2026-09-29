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
    if (!isEnabledAdmin(admin, openid)) fail('ADMIN_REQUIRED', '需要管理员权限');
    const current = activityId ? await tx.getActivity(activityId) : undefined;
    if (activityId && !current) fail('ACTIVITY_NOT_FOUND', '活动不存在');
    const occupiedCount = current?.occupied_count ?? 0;
    if (!Number.isInteger(occupiedCount) || occupiedCount < 0)
      fail('SCHEMA_INVALID', '活动名额计数异常');
    if (current) assertStatusTransition(current.status, activity.status);
    else if (activity.status !== 'draft') fail('INVALID_TRANSITION', '新活动必须先保存为草稿');
    const safe = validateActivityInput(activity, occupiedCount);
    const id = activityId || (await tx.createActivityId());
    const value = {
      ...(current || {}),
      ...safe,
      _id: id,
      occupied_count: occupiedCount,
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
    return publicActivity(value);
  });
}

module.exports = { saveActivity };
