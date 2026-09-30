'use strict';

const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const {
  ok,
  fail,
  toErrorResponse,
  assertTrustedOpenid,
  assertNoForbiddenFields,
  isEnabledAdmin,
  publicRegistration,
  reviewRegistration,
} = require('./domain');
const { adminCapabilityDetail } = require('./capability-card');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function isNotFound(error) {
  return (
    error &&
    (Number(error.errCode) === -502001 || /not exist|not found/i.test(String(error.errMsg || '')))
  );
}
async function maybeGet(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}
function profileMediaIds(profile) {
  const ids = [profile && profile.avatar_file_id];
  for (const item of Array.isArray(profile && profile.photos) ? profile.photos : [])
    ids.push(item && item.file_id);
  return [...new Set(ids.filter((id) => typeof id === 'string' && id))];
}
async function loadMediaRecords(ownerOpenid, profile) {
  return (
    await Promise.all(
      profileMediaIds(profile).map((fileId) =>
        maybeGet(
          db.collection('profile_media'),
          crypto.createHash('sha256').update(fileId).digest('hex'),
        ),
      ),
    )
  ).filter((record) => record && record.owner_openid === ownerOpenid);
}
async function requireAdmin(openid) {
  const admin = await maybeGet(db.collection('admins'), openid);
  if (!isEnabledAdmin(admin, openid)) fail('ADMIN_REQUIRED', '需要管理员权限');
}
function transactionStore() {
  return {
    transaction: (work) =>
      db.runTransaction(async (transaction) =>
        work({
          getAdmin: (id) => maybeGet(transaction.collection('admins'), id),
          getActivity: (id) => maybeGet(transaction.collection('activities'), id),
          getRegistration: (id) => maybeGet(transaction.collection('registrations'), id),
          putRegistration: async (id, value) => {
            const { _id, ...data } = value;
            await transaction.collection('registrations').doc(id).set({ data });
          },
          setOccupied: (id, occupied, supportVehicleOccupied, selfDriveOccupied) =>
            transaction
              .collection('activities')
              .doc(id)
              .update({
                data: {
                  occupied_count: occupied,
                  ...(supportVehicleOccupied !== undefined
                    ? { support_vehicle_occupied_count: supportVehicleOccupied }
                    : {}),
                  ...(selfDriveOccupied !== undefined
                    ? { self_drive_occupied_count: selfDriveOccupied }
                    : {}),
                  updated_at: db.serverDate(),
                },
              }),
          addAudit: (audit) => transaction.collection('audit_logs').add({ data: audit }),
          putNotification: async (id, value) => {
            const { _id, ...data } = value;
            await transaction.collection('notification_outbox').doc(id).set({ data });
          },
        }),
      ),
  };
}

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    assertTrustedOpenid(openid);
    assertNoForbiddenFields(event);
    if (event.action === 'review') {
      if (typeof event.registrationId !== 'string' || !event.registrationId)
        fail('VALIDATION_FAILED', '缺少报名 ID');
      return ok(
        await reviewRegistration(
          transactionStore(),
          {
            openid,
            registrationId: event.registrationId,
            action: event.decision,
            reason: event.reason,
          },
          new Date(),
        ),
      );
    }
    if (event.action === 'list') {
      await requireAdmin(openid);
      if (typeof event.activityId !== 'string' || !event.activityId)
        fail('VALIDATION_FAILED', '缺少活动 ID');
      const condition = { activity_id: event.activityId };
      if (event.filterStatus !== undefined) {
        if (!['pending', 'approved', 'rejected', 'cancelled'].includes(event.filterStatus))
          fail('VALIDATION_FAILED', '报名状态无效');
        condition.status = event.filterStatus;
      }
      const result = await db
        .collection('registrations')
        .where(condition)
        .orderBy('created_at', 'desc')
        .limit(100)
        .get();
      return ok(result.data.map(publicRegistration));
    }
    if (event.action === 'detail') {
      if (typeof event.registrationId !== 'string' || !event.registrationId)
        fail('VALIDATION_FAILED', '缺少报名 ID');
      const detail = await adminCapabilityDetail({
        authorize: () => requireAdmin(openid),
        loadRegistration: () => maybeGet(db.collection('registrations'), event.registrationId),
        loadProfile: (profileOpenid) => maybeGet(db.collection('profiles'), profileOpenid),
        loadMediaRecords,
        getTempFileURL: (input) => cloud.getTempFileURL(input),
        mediaSecret: process.env.PROFILE_MEDIA_PATH_SECRET,
        projectRegistration: publicRegistration,
      });
      if (!detail) fail('REGISTRATION_NOT_FOUND', '报名不存在');
      return ok(detail);
    }
    fail('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('admin-review failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return toErrorResponse(error);
  }
};
