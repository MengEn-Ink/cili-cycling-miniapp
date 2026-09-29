'use strict';

const {
  fail,
  assertNoForbiddenFields,
  assertActivityOpen,
  assertProfileReady,
  selectCanonicalStrava,
  validateOptions,
  assertCanSubmit,
  assertCanCancel,
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
  const quota = categoryQuota(activity, gatheringMode);
  const next = quota.occupied + delta;
  if (next < 0) fail('SCHEMA_INVALID', '分类名额计数异常');
  return {
    occupied: activity.occupied_count + delta,
    supportVehicleOccupied:
      quota.occupiedField === 'support_vehicle_occupied_count'
        ? next
        : Number.isInteger(activity.support_vehicle_occupied_count)
          ? activity.support_vehicle_occupied_count
          : 0,
    selfDriveOccupied:
      quota.occupiedField === 'self_drive_occupied_count'
        ? next
        : Number.isInteger(activity.self_drive_occupied_count)
          ? activity.self_drive_occupied_count
          : 0,
  };
}

async function submitRegistration(store, { openid, activityId, options }, now = new Date()) {
  assertNoForbiddenFields(options);
  if (typeof activityId !== 'string' || !activityId) fail('VALIDATION_FAILED', '缺少活动 ID');
  const id = registrationId(activityId, openid);
  return store.transaction(async (tx) => {
    const [activity, profile, existing, credential, snapshot] = await Promise.all([
      tx.getActivity(activityId),
      tx.getProfile(openid),
      tx.getRegistration(id),
      tx.getStravaCredential(openid),
      tx.getStravaSnapshot(openid),
    ]);
    assertActivityOpen(activity, now);
    assertProfileReady(profile);
    assertCanSubmit(existing);
    const strava = selectCanonicalStrava(credential, snapshot, now);
    const safeOptions = validateOptions(options);
    if (activity.occupied_count >= activity.capacity) fail('CAPACITY_FULL', '活动名额已满');
    const quota = categoryQuota(activity, safeOptions.gathering_mode);
    if (quota && quota.occupied >= quota.capacity)
      fail('CATEGORY_CAPACITY_FULL', '所选集合方式名额已满');
    const nextOccupancy = occupancyAfter(activity, safeOptions.gathering_mode, 1);

    const history =
      existing && Array.isArray(existing.review_history) ? existing.review_history : [];
    const value = {
      _id: id,
      activity_id: activityId,
      openid,
      status: 'pending',
      options: safeOptions,
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
    // 活动文档是事务冲突点；并发提交必须串行核对并递增，不能先 count 后 insert。
    await tx.setOccupied(
      activityId,
      nextOccupancy.occupied,
      nextOccupancy.supportVehicleOccupied,
      nextOccupancy.selfDriveOccupied,
    );
    await tx.addAudit(
      buildAudit(
        openid,
        existing ? 'registration.resubmitted' : 'registration.submitted',
        id,
        now,
        {
          activity_id: activityId,
          from_status: existing ? existing.status : null,
          to_status: 'pending',
        },
      ),
    );
    return publicRegistration(value);
  });
}

async function cancelRegistration(store, { openid, registrationId: id }, now = new Date()) {
  return store.transaction(async (tx) => {
    const registration = await tx.getRegistration(id);
    assertCanCancel(registration, openid);
    const activity = await tx.getActivity(registration.activity_id);
    if (!activity || !Number.isInteger(activity.occupied_count) || activity.occupied_count < 1)
      fail('SCHEMA_INVALID', '活动名额计数异常');
    const nextOccupancy = occupancyAfter(activity, registration.options?.gathering_mode, -1);
    const value = { ...registration, status: 'cancelled', updated_at: now };
    await tx.putRegistration(id, value);
    await tx.setOccupied(
      registration.activity_id,
      nextOccupancy.occupied,
      nextOccupancy.supportVehicleOccupied,
      nextOccupancy.selfDriveOccupied,
    );
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
      ...(nextStatus === 'approved' && !registration.serial_no
        ? {
            serial_no: `RE-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(-6).toUpperCase()}`,
          }
        : {}),
    };
    await tx.putRegistration(id, value);
    if (nextStatus === 'rejected') {
      const activity = await tx.getActivity(registration.activity_id);
      if (!activity || activity.occupied_count < 1) fail('SCHEMA_INVALID', '活动名额计数异常');
      const nextOccupancy = occupancyAfter(activity, registration.options?.gathering_mode, -1);
      await tx.setOccupied(
        registration.activity_id,
        nextOccupancy.occupied,
        nextOccupancy.supportVehicleOccupied,
        nextOccupancy.selfDriveOccupied,
      );
    }
    await tx.addAudit(
      buildAudit(openid, `registration.${nextStatus}`, id, now, {
        from_status: registration.status,
        to_status: nextStatus,
        reason: typeof reason === 'string' ? reason.trim() : '',
      }),
    );
    return publicRegistration(value);
  });
}

module.exports = { submitRegistration, cancelRegistration, reviewRegistration };
