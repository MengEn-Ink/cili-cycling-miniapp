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
  cloneActivity,
  saveActivity,
  MAX_PARTITION_BACKFILL_RECORDS,
} = require('./domain-index');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const OCCUPANCY_BACKFILL_PAGE_SIZE = 100;
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
async function actor(openid) {
  const admin = await maybeGet(db.collection('admins'), openid);
  return { isAdmin: isEnabledAdmin(admin, openid) };
}
function transactionStore() {
  return {
    transaction: (work) =>
      db.runTransaction(async (transaction) =>
        work({
          getAdmin: (id) => maybeGet(transaction.collection('admins'), id),
          getActivity: (id) => maybeGet(transaction.collection('activities'), id),
          getOccupyingRegistrations: async (activityId, expectedOccupiedCount) => {
            if (expectedOccupiedCount > MAX_PARTITION_BACKFILL_RECORDS)
              fail('PARTITION_BACKFILL_REQUIRED', '历史活动占位数超过自动回填上限');
            const registrations = [];
            // 复用 activity_id + status + created_at 索引，分别完整扫描两种占位状态。
            for (const status of ['pending', 'approved']) {
              let offset = 0;
              while (registrations.length <= expectedOccupiedCount) {
                // 最多读取 expected + 1 条：多出的 1 条用于证明总数超出 occupied_count。
                const limit = Math.min(
                  OCCUPANCY_BACKFILL_PAGE_SIZE,
                  expectedOccupiedCount + 1 - registrations.length,
                );
                const result = await transaction
                  .collection('registrations')
                  .where({ activity_id: activityId, status })
                  .orderBy('created_at', 'desc')
                  .skip(offset)
                  .limit(limit)
                  .get();
                if (!result || !Array.isArray(result.data))
                  throw new Error('invalid registration page');
                registrations.push(...result.data);
                if (registrations.length > expectedOccupiedCount) return registrations;
                if (result.data.length < limit) break;
                offset += result.data.length;
              }
            }
            return registrations;
          },
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
      if (
        event.activityId !== undefined &&
        (!Number.isInteger(event.expectedVersion) || event.expectedVersion < 0)
      )
        fail('VALIDATION_FAILED', '活动版本格式错误');
      return ok(
        await saveActivity(
          transactionStore(),
          {
            openid,
            activityId: event.activityId,
            expectedVersion: event.expectedVersion,
            activity: event.activity,
          },
          new Date(),
        ),
      );
    }
    if (event.action === 'clone') {
      return ok(
        await cloneActivity(
          transactionStore(),
          {
            ...event,
            openid,
          },
          new Date(),
        ),
      );
    }
    const identity = await actor(openid);
    if (event.action === 'list') {
      let query = db.collection('activities');
      // 管理员看全部；成员查询条件由可信 OPENID 构造，客户端无权指定 owner。
      if (!identity.isAdmin) query = query.where({ created_by: openid });
      const result = await query.orderBy('event_start', 'desc').limit(100).get();
      return ok(
        result.data
          .filter((item) => item.is_deleted !== true)
          .map((item) => publicActivity(item, { revealContact: true })),
      );
    }
    if (event.action === 'detail') {
      if (typeof event.activityId !== 'string' || !event.activityId)
        fail('VALIDATION_FAILED', '缺少活动 ID');
      const activity = await maybeGet(db.collection('activities'), event.activityId);
      if (!activity || activity.is_deleted === true) fail('ACTIVITY_NOT_FOUND', '活动不存在');
      if (!identity.isAdmin && activity.created_by !== openid)
        fail('FORBIDDEN', '只能查看自己的活动');
      return ok(publicActivity(activity, { revealContact: true }));
    }
    fail('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('activity-admin failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return toErrorResponse(error);
  }
};
