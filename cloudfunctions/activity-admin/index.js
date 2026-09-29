'use strict';

const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const {
  ok,
  fail,
  toErrorResponse,
  assertTrustedOpenid,
  isEnabledAdmin,
  publicActivity,
  saveActivity,
} = require('./domain-index');
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
          createActivityId: async () => `activity_${crypto.randomUUID()}`,
          putActivity: async (id, value) => {
            const { _id, ...data } = value;
            await transaction.collection('activities').doc(id).set({ data });
          },
          addAudit: (audit) => transaction.collection('audit_logs').add({ data: audit }),
        }),
      ),
  };
}

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    assertTrustedOpenid(openid);
    if (event.action === 'save') {
      if (
        event.activityId !== undefined &&
        (typeof event.activityId !== 'string' || !event.activityId)
      )
        fail('VALIDATION_FAILED', '活动 ID 格式错误');
      return ok(
        await saveActivity(
          transactionStore(),
          { openid, activityId: event.activityId, activity: event.activity },
          new Date(),
        ),
      );
    }
    await requireAdmin(openid);
    if (event.action === 'list') {
      const result = await db
        .collection('activities')
        .orderBy('event_start', 'desc')
        .limit(100)
        .get();
      return ok(result.data.filter((item) => item.is_deleted !== true).map(publicActivity));
    }
    if (event.action === 'detail') {
      if (typeof event.activityId !== 'string' || !event.activityId)
        fail('VALIDATION_FAILED', '缺少活动 ID');
      const activity = await maybeGet(db.collection('activities'), event.activityId);
      if (!activity || activity.is_deleted === true) fail('ACTIVITY_NOT_FOUND', '活动不存在');
      return ok(publicActivity(activity));
    }
    fail('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('activity-admin failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return toErrorResponse(error);
  }
};
