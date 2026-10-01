'use strict';

const {
  fail,
  assertNoForbiddenFields,
  assertActivityOpen,
  assertProfileReady,
  selectCanonicalStrava,
  validateOptions,
  validateTeamInput,
  createTeamId,
  assertCanSubmit,
  assertCanCancel,
  assertCheckInTransition,
  assertReviewTransition,
  isEnabledAdmin,
  registrationId,
  publicRegistration,
  buildAudit,
} = require('./domain');

function categoryQuota(activity, gatheringMode) {
  if (activity.occupancy_partition_ready !== true) return undefined;
  const capacityField =
    gatheringMode === 'support_vehicle' ? 'support_vehicle_capacity' : 'self_drive_capacity';
  const occupiedField =
    gatheringMode === 'support_vehicle'
      ? 'support_vehicle_occupied_count'
      : 'self_drive_occupied_count';
  const capacity = activity[capacityField];
  const occupied = activity[occupiedField];
  if (!Number.isInteger(capacity) || !Number.isInteger(occupied))
    fail('SCHEMA_INVALID', '分类名额计数异常');
  if (capacity < 0 || occupied < 0) fail('SCHEMA_INVALID', '分类名额计数异常');
  return { capacity, occupied, occupiedField };
}

function occupancyAfter(activity, gatheringMode, delta) {
  if (activity.occupancy_partition_ready !== true)
    return { occupied: activity.occupied_count + delta };
  const recognized = ['support_vehicle', 'self_drive'].includes(gatheringMode);
  if (!recognized)
    return {
      occupied: activity.occupied_count + delta,
      supportVehicleOccupied: Number.isInteger(activity.support_vehicle_occupied_count)
        ? activity.support_vehicle_occupied_count
        : 0,
      selfDriveOccupied: Number.isInteger(activity.self_drive_occupied_count)
        ? activity.self_drive_occupied_count
        : 0,
    };
  const occupiedField =
    gatheringMode === 'support_vehicle'
      ? 'support_vehicle_occupied_count'
      : gatheringMode === 'self_drive'
        ? 'self_drive_occupied_count'
        : '';
  const current = occupiedField ? activity[occupiedField] : undefined;
  if (!occupiedField || !Number.isInteger(current) || current < 0)
    fail('SCHEMA_INVALID', '分类名额计数异常');
  const next = current + delta;
  if (next < 0) fail('SCHEMA_INVALID', '分类名额计数异常');
  return {
    occupied: activity.occupied_count + delta,
    supportVehicleOccupied:
      occupiedField === 'support_vehicle_occupied_count'
        ? next
        : Number.isInteger(activity.support_vehicle_occupied_count)
          ? activity.support_vehicle_occupied_count
          : 0,
    selfDriveOccupied:
      occupiedField === 'self_drive_occupied_count'
        ? next
        : Number.isInteger(activity.self_drive_occupied_count)
          ? activity.self_drive_occupied_count
          : 0,
  };
}

function eventId(prefix, registration, now) {
  const source = registration.updated_at || registration.created_at || now;
  const epoch = new Date(source).getTime();
  return `${prefix}_${registration._id}_${Number.isFinite(epoch) ? epoch : now.getTime()}`;
}

function notification(id, templateKey, registration, now, payload = {}) {
  return {
    _id: id,
    type: templateKey,
    aggregate_id: registration._id,
    target_openid: registration.openid,
    template_key: templateKey,
    status: 'pending',
    attempts: 0,
    lease_expires_at: null,
    created_at: now,
    updated_at: now,
    payload: {
      registration_id: registration._id,
      activity_id: registration.activity_id,
      ...payload,
    },
  };
}

async function resolveTeam(tx, activityId, openid, rawTeam) {
  const team = validateTeamInput(rawTeam);
  if (team.teamName) {
    return {
      team_id: createTeamId(activityId, openid),
      team_name: team.teamName,
      is_team_leader: true,
    };
  }
  if (!team.teamId) return {};
  const leader = await tx.getTeamLeader(activityId, team.teamId);
  const activeLeaderStatuses = new Set(['waiting', 'pending', 'approved', 'checked_in']);
  if (
    !leader ||
    leader.team_id !== team.teamId ||
    leader.is_team_leader !== true ||
    !activeLeaderStatuses.has(leader.status)
  )
    fail('TEAM_NOT_FOUND', '队伍邀请已失效');
  return { team_id: team.teamId, team_name: leader.team_name, is_team_leader: false };
}

async function submitRegistration(store, { openid, activityId, options, team }, now = new Date()) {
  assertNoForbiddenFields(options);
  assertNoForbiddenFields(team);
  if (typeof activityId !== 'string' || !activityId) fail('VALIDATION_FAILED', '缺少活动 ID');
  const id = registrationId(activityId, openid);
  return store.transaction(async (tx) => {
    // 云开发事务复用同一事务上下文，依赖读取必须串行，确保并发提交都在活动文档冲突点重试。
    const activity = await tx.getActivity(activityId);
    const profile = await tx.getProfile(openid);
    const existing = await tx.getRegistration(id);
    const credential = await tx.getStravaCredential(openid);
    const snapshot = await tx.getStravaSnapshot(openid);
    assertActivityOpen(activity, now);
    assertProfileReady(profile);
    assertCanSubmit(existing);
    const strava = selectCanonicalStrava(credential, snapshot, now);
    const safeOptions = validateOptions(options);
    const teamFields = await resolveTeam(tx, activityId, openid, team);
    const quota = categoryQuota(activity, safeOptions.gathering_mode);
    const waiting =
      activity.occupied_count >= activity.capacity || (quota && quota.occupied >= quota.capacity);
    const status = waiting ? 'waiting' : 'pending';
    const nextOccupancy = waiting
      ? undefined
      : occupancyAfter(activity, safeOptions.gathering_mode, 1);
    const history =
      existing && Array.isArray(existing.review_history) ? existing.review_history : [];
    const value = {
      _id: id,
      activity_id: activityId,
      openid,
      status,
      options: safeOptions,
      ...teamFields,
      profile_snapshot: {
        nickname: profile.nickname,
        real_name_masked: profile.real_name_masked,
        phone_masked: profile.phone_masked,
        phone_source: ['wechat', 'manual'].includes(profile.phone_source)
          ? profile.phone_source
          : profile.phone_cipher
            ? 'legacy'
            : '',
        phone_verified: profile.phone_verified === true,
      },
      strava_status: strava.status,
      ...(strava.snapshot ? { strava_snapshot: strava.snapshot } : {}),
      ...(strava.exemption ? { exemption: strava.exemption } : {}),
      review_history: history,
      created_at: existing ? existing.created_at : now,
      updated_at: now,
    };
    await tx.putRegistration(id, value);
    if (nextOccupancy) {
      await tx.setOccupied(
        activityId,
        nextOccupancy.occupied,
        nextOccupancy.supportVehicleOccupied,
        nextOccupancy.selfDriveOccupied,
      );
    } else {
      const outboxId = eventId('waitlist_entered', value, now);
      await tx.putNotification(outboxId, notification(outboxId, 'waitlist_entered', value, now));
    }
    await tx.addAudit(
      buildAudit(
        openid,
        existing ? 'registration.resubmitted' : 'registration.submitted',
        id,
        now,
        {
          activity_id: activityId,
          from_status: existing ? existing.status : null,
          to_status: status,
        },
      ),
    );
    return publicRegistration(value);
  });
}

function activityWithOccupancy(activity, occupancy) {
  return {
    ...activity,
    occupied_count: occupancy.occupied,
    ...(occupancy.supportVehicleOccupied !== undefined
      ? { support_vehicle_occupied_count: occupancy.supportVehicleOccupied }
      : {}),
    ...(occupancy.selfDriveOccupied !== undefined
      ? { self_drive_occupied_count: occupancy.selfDriveOccupied }
      : {}),
  };
}

function canPromote(activity, waiting) {
  if (activity.occupied_count >= activity.capacity) return false;
  const mode = waiting.options?.gathering_mode;
  if (!['support_vehicle', 'self_drive'].includes(mode)) return false;
  const quota = categoryQuota(activity, mode);
  return !quota || quota.occupied < quota.capacity;
}

async function promoteOldestWaiting(tx, activity, nextOccupancy, now) {
  const candidates = typeof tx.listWaiting === 'function' ? await tx.listWaiting(activity._id) : [];
  const postReleaseActivity = activityWithOccupancy(activity, nextOccupancy);
  // 全局 FIFO 中可跳过分类仍满的候补，但不改变被跳过者的状态和顺序。
  const waiting = candidates.find((candidate) => canPromote(postReleaseActivity, candidate));
  if (!waiting) return null;
  const promoted = { ...waiting, status: 'pending', updated_at: now };
  await tx.putRegistration(waiting._id, promoted);
  const promotedOccupancy = occupancyAfter(postReleaseActivity, waiting.options?.gathering_mode, 1);
  await tx.setOccupied(
    activity._id || waiting.activity_id,
    promotedOccupancy.occupied,
    promotedOccupancy.supportVehicleOccupied,
    promotedOccupancy.selfDriveOccupied,
  );
  const outboxId = eventId('waitlist_promoted', waiting, now);
  await tx.putNotification(outboxId, notification(outboxId, 'waitlist_promoted', waiting, now));
  await tx.addAudit(
    buildAudit('system:waitlist', 'registration.waitlist_promoted', waiting._id, now, {
      activity_id: waiting.activity_id,
      from_status: 'waiting',
      to_status: 'pending',
    }),
  );
  return promoted;
}

async function releaseAndPromote(tx, activity, registration, now) {
  const mode = registration.options?.gathering_mode;
  const nextOccupancy = occupancyAfter(activity, mode, -1);
  const promoted = await promoteOldestWaiting(tx, activity, nextOccupancy, now);
  if (promoted) return promoted;
  await tx.setOccupied(
    activity._id || registration.activity_id,
    nextOccupancy.occupied,
    nextOccupancy.supportVehicleOccupied,
    nextOccupancy.selfDriveOccupied,
  );
  return null;
}

async function cancelRegistration(store, { openid, registrationId: id }, now = new Date()) {
  return store.transaction(async (tx) => {
    const registration = await tx.getRegistration(id);
    if (registration && registration.openid === openid && registration.status === 'cancelled')
      return publicRegistration(registration);
    assertCanCancel(registration, openid);
    const wasWaiting = registration.status === 'waiting';
    const value = { ...registration, status: 'cancelled', updated_at: now };
    await tx.putRegistration(id, value);
    if (!wasWaiting) {
      const activity = await tx.getActivity(registration.activity_id);
      if (!activity || !Number.isInteger(activity.occupied_count) || activity.occupied_count < 1)
        fail('SCHEMA_INVALID', '活动名额计数异常');
      // 释放与 FIFO 补位在同一事务；补位成功时一减一加抵消，occupied_count 保持不变。
      await releaseAndPromote(tx, activity, registration, now);
    }
    await tx.addAudit(
      buildAudit(openid, 'registration.cancelled', id, now, {
        activity_id: registration.activity_id,
        from_status: registration.status,
        to_status: 'cancelled',
      }),
    );
    return publicRegistration(value);
  });
}

async function reviewRegistration(
  store,
  { openid, registrationId: id, action, reason },
  now = new Date(),
) {
  return store.transaction(async (tx) => {
    const admin = await tx.getAdmin(openid);
    if (!isEnabledAdmin(admin, openid)) fail('ADMIN_REQUIRED', '需要管理员权限');
    const registration = await tx.getRegistration(id);
    if (!registration) fail('REGISTRATION_NOT_FOUND', '报名不存在');
    const duplicateStatus = action === 'reject' ? 'rejected' : 'approved';
    if (registration.status === duplicateStatus) return publicRegistration(registration);
    const nextStatus = assertReviewTransition(registration.status, action, reason);
    const history = Array.isArray(registration.review_history)
      ? registration.review_history.slice()
      : [];
    history.push({
      reviewer_openid: openid,
      reviewed_at: now,
      action,
      comment: typeof reason === 'string' ? reason.trim() : '',
    });
    const value = {
      ...registration,
      status: nextStatus,
      review_history: history,
      updated_at: now,
      ...(nextStatus === 'approved' && !registration.approved_at ? { approved_at: now } : {}),
      ...(nextStatus === 'approved' && !registration.serial_no
        ? {
            serial_no: `RE-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(-6).toUpperCase()}`,
          }
        : {}),
    };
    await tx.putRegistration(id, value);
    const reviewOutboxId = `review_${id}_${history.length}`;
    await tx.putNotification(
      reviewOutboxId,
      notification(
        reviewOutboxId,
        nextStatus === 'approved' ? 'review_approved' : 'review_rejected',
        value,
        now,
        {
          decision: nextStatus,
          reason: typeof reason === 'string' ? reason.trim() : '',
          serial_no: value.serial_no || '',
        },
      ),
    );
    if (nextStatus === 'rejected') {
      const activity = await tx.getActivity(registration.activity_id);
      if (!activity || activity.occupied_count < 1) fail('SCHEMA_INVALID', '活动名额计数异常');
      await releaseAndPromote(tx, activity, registration, now);
    }
    await tx.addAudit(
      buildAudit(openid, `registration.${nextStatus}`, id, now, {
        activity_id: registration.activity_id,
        from_status: registration.status,
        to_status: nextStatus,
        reason: typeof reason === 'string' ? reason.trim() : '',
      }),
    );
    return {
      ...publicRegistration(value),
      notification: { outbox_id: reviewOutboxId, status: 'pending' },
    };
  });
}

async function checkInRegistration(store, { openid, registrationId: id }, now = new Date()) {
  return store.transaction(async (tx) => {
    const admin = await tx.getAdmin(openid);
    if (!isEnabledAdmin(admin, openid)) fail('ADMIN_REQUIRED', '需要管理员权限');
    const registration = await tx.getRegistration(id);
    if (!registration) fail('REGISTRATION_NOT_FOUND', '报名不存在');
    assertCheckInTransition(registration.status);
    if (registration.status === 'checked_in') return publicRegistration(registration);
    const value = {
      ...registration,
      status: 'checked_in',
      checked_in_at: now,
      checkin_operator_openid: openid,
      updated_at: now,
    };
    await tx.putRegistration(id, value);
    await tx.addAudit(
      buildAudit(openid, 'check_in', id, now, {
        activity_id: registration.activity_id,
        from_status: registration.status,
        to_status: 'checked_in',
      }),
    );
    return publicRegistration(value);
  });
}

module.exports = {
  categoryQuota,
  occupancyAfter,
  submitRegistration,
  promoteOldestWaiting,
  releaseAndPromote,
  cancelRegistration,
  reviewRegistration,
  checkInRegistration,
};
