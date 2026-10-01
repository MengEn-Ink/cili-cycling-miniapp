'use strict';

const { fail, isEnabledAdmin, buildAudit } = require('./domain');

function reminderOutboxId(activityId, registrationId) {
  return `activity_reminder_${activityId}_${registrationId}`;
}

async function enqueueActivityReminders(store, { openid, activityId }, now = new Date()) {
  if (typeof activityId !== 'string' || !activityId) fail('VALIDATION_FAILED', '缺少活动 ID');
  return store.transaction(async (tx) => {
    const admin = await tx.getAdmin(openid);
    if (!isEnabledAdmin(admin, openid)) fail('ADMIN_REQUIRED', '需要管理员权限');
    const activity = await tx.getActivity(activityId);
    if (!activity || activity.is_deleted === true) fail('ACTIVITY_NOT_FOUND', '活动不存在');
    const registrations = await tx.listApproved(activityId);
    let queued = 0;
    let duplicates = 0;
    for (const registration of registrations) {
      const id = reminderOutboxId(activityId, registration._id);
      // 确定性 ID 让重复触发只读已有任务，尤其不能把 sent 覆盖回 pending 造成重复通知。
      if (await tx.getNotification(id)) {
        duplicates += 1;
        continue;
      }
      await tx.putNotification(id, {
        _id: id,
        type: 'activity_reminder',
        aggregate_id: registration._id,
        target_openid: registration.openid,
        template_key: 'activity_reminder',
        status: 'pending',
        attempts: 0,
        lease_expires_at: null,
        created_at: now,
        updated_at: now,
        payload: {
          activity_id: activityId,
          registration_id: registration._id,
          activity_title: activity.title || '骑行活动',
          event_start: activity.event_start,
          meeting_place:
            activity.route?.start_location?.address || activity.route?.start || '请进入小程序查看',
        },
      });
      queued += 1;
    }
    // 每次经过权限校验的显式触发都留痕；即使全部为重复任务，也需要保留管理员操作审计。
    await tx.addAudit(
      buildAudit(openid, 'activity.reminders_enqueued', activityId, now, {
        activity_id: activityId,
        reason: `queued=${queued},duplicates=${duplicates}`,
      }),
    );
    return { activity_id: activityId, queued, duplicates, total: registrations.length };
  });
}

module.exports = { reminderOutboxId, enqueueActivityReminders };
