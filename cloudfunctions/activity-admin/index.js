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
  deleteActivity,
  saveActivity,
  MAX_PARTITION_BACKFILL_RECORDS,
} = require('./domain-index');
const { listActivitiesPage } = require('./list-pagination');
const { previewRouteGpx, bindRoutePreviewImage } = require('./route-preview');
const { previewPublicRoute } = require('./public-route-preview');
const { resolveActivityMedia } = require('./media');
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
          getClub: (id) => maybeGet(transaction.collection('clubs'), id),
          getActiveClubMembership: async (clubId, memberOpenid) => {
            const result = await transaction
              .collection('club_memberships')
              .where({ club_id: clubId, openid: memberOpenid, status: 'active' })
              .limit(1)
              .get();
            return Array.isArray(result?.data) ? result.data[0] : undefined;
          },
          listActiveRegistrations: async (activityId) => {
            const registrations = [];
            for (const status of ['pending', 'approved', 'checked_in', 'waiting']) {
              let cursor = '';
              for (;;) {
                const result = await transaction
                  .collection('registrations')
                  .where({
                    activity_id: activityId,
                    status,
                    ...(cursor ? { _id: db.command.gt(cursor) } : {}),
                  })
                  .orderBy('_id', 'asc')
                  .limit(OCCUPANCY_BACKFILL_PAGE_SIZE)
                  .get();
                if (!result || !Array.isArray(result.data))
                  throw new Error('invalid registration page');
                registrations.push(...result.data);
                if (result.data.length < OCCUPANCY_BACKFILL_PAGE_SIZE) break;
                const nextCursor = result.data[result.data.length - 1]?._id;
                if (typeof nextCursor !== 'string' || !nextCursor || nextCursor === cursor)
                  throw new Error('invalid registration cursor');
                cursor = nextCursor;
              }
            }
            return registrations;
          },
          getRoutePreviewById: (id) => maybeGet(transaction.collection('route_previews'), id),
          consumeRoutePreview: (id, activityId, consumedAt) =>
            transaction
              .collection('route_previews')
              .doc(id)
              .update({
                data: {
                  consumed_at: consumedAt,
                  attached_activity_id: activityId,
                  updated_at: consumedAt,
                },
              }),
          getOccupyingRegistrations: async (activityId, expectedOccupiedCount) => {
            if (expectedOccupiedCount > MAX_PARTITION_BACKFILL_RECORDS)
              fail('PARTITION_BACKFILL_REQUIRED', '历史活动占位数超过自动回填上限');
            const registrations = [];
            // 事务查询不支持 skip，按稳定 _id 游标分页，最多读取 expected + 1 条证明数量是否超额。
            for (const status of ['pending', 'approved', 'checked_in', 'waiting']) {
              let cursor = '';
              while (registrations.length <= expectedOccupiedCount) {
                const limit = Math.min(
                  OCCUPANCY_BACKFILL_PAGE_SIZE,
                  expectedOccupiedCount + 1 - registrations.length,
                );
                const result = await transaction
                  .collection('registrations')
                  .where({
                    activity_id: activityId,
                    status,
                    ...(cursor ? { _id: db.command.gt(cursor) } : {}),
                  })
                  .orderBy('_id', 'asc')
                  .limit(limit)
                  .get();
                if (!result || !Array.isArray(result.data))
                  throw new Error('invalid registration page');
                registrations.push(...result.data);
                if (registrations.length > expectedOccupiedCount) return registrations;
                if (result.data.length < limit) break;
                const nextCursor = result.data[result.data.length - 1]?._id;
                if (typeof nextCursor !== 'string' || !nextCursor || nextCursor === cursor)
                  throw new Error('invalid registration cursor');
                cursor = nextCursor;
              }
            }
            return registrations;
          },
          createActivityId: async () => `activity_${crypto.randomUUID()}`,
          putActivity: async (id, value) => {
            const { _id, ...data } = value;
            await transaction.collection('activities').doc(id).set({ data });
          },
          updateActivity: async (id, data) => {
            await transaction.collection('activities').doc(id).update({ data });
          },
          putRegistration: async (id, value) => {
            const { _id, ...data } = value;
            await transaction.collection('registrations').doc(id).set({ data });
          },
          putNotification: async (id, value) => {
            const { _id, ...data } = value;
            await transaction.collection('notification_outbox').doc(id).set({ data });
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
    if (event.action === 'previewPublicRoute') {
      return ok(
        await previewPublicRoute(
          {
            getAdmin: (id) => maybeGet(db.collection('admins'), id),
            getPreview: (id) => maybeGet(db.collection('route_previews'), id),
            putPreview: async (id, value) => {
              const { _id, ...data } = value;
              await db.collection('route_previews').doc(id).set({ data });
            },
          },
          { openid, routeUrl: event.routeUrl },
          new Date(),
        ),
      );
    }
    if (event.action === 'previewRouteGpx') {
      return ok(
        await previewRouteGpx(
          {
            getAdmin: (id) => maybeGet(db.collection('admins'), id),
            downloadFile: (input) => cloud.downloadFile(input),
            getPreview: (id) => maybeGet(db.collection('route_previews'), id),
            putPreview: async (id, value) => {
              const { _id, ...data } = value;
              await db.collection('route_previews').doc(id).set({ data });
            },
          },
          {
            ...Object.fromEntries(
              Object.entries(event).filter(
                ([key]) =>
                  ![
                    'action',
                    'userInfo',
                    'tcbContext',
                    'gpxFileId',
                    'gpxSha256',
                    'fileName',
                    'requestId',
                  ].includes(key),
              ),
            ),
            openid,
            gpxFileId: event.gpxFileId,
            gpxSha256: event.gpxSha256,
            fileName: event.fileName,
            requestId: event.requestId,
          },
          new Date(),
        ),
      );
    }
    if (event.action === 'bindRoutePreviewImage') {
      return ok(
        await bindRoutePreviewImage(
          {
            getAdmin: (id) => maybeGet(db.collection('admins'), id),
            getPreview: (id) => maybeGet(db.collection('route_previews'), id),
            updatePreview: (id, data) => db.collection('route_previews').doc(id).update({ data }),
          },
          {
            ...Object.fromEntries(
              Object.entries(event).filter(
                ([key]) =>
                  ![
                    'action',
                    'userInfo',
                    'tcbContext',
                    'previewId',
                    'generatedPreviewFileId',
                  ].includes(key),
              ),
            ),
            openid,
            previewId: event.previewId,
            generatedPreviewFileId: event.generatedPreviewFileId,
          },
          new Date(),
        ),
      );
    }
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
      const saved = await saveActivity(
        transactionStore(),
        {
          openid,
          activityId: event.activityId,
          expectedVersion: event.expectedVersion,
          createRequestId: event.createRequestId,
          activity: event.activity,
          reason: event.operationReason,
        },
        new Date(),
      );
      return ok(await resolveActivityMedia(cloud, saved, openid));
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
    if (event.action === 'delete') {
      return ok(
        await deleteActivity(
          transactionStore(),
          {
            action: 'delete',
            activityId: event.activityId || event.id,
            id: event.id,
            reason: event.reason,
            openid,
          },
          new Date(),
        ),
      );
    }
    const identity = await actor(openid);
    if (event.action === 'list') {
      if (
        Object.prototype.hasOwnProperty.call(event, 'page_size') ||
        Object.prototype.hasOwnProperty.call(event, 'cursor')
      )
        return ok(await listActivitiesPage(db, { openid, ...identity }, event));
      let query = db.collection('activities');
      // 管理员看全部；成员查询条件由可信 OPENID 构造，客户端无权指定 owner。
      if (!identity.isAdmin) query = query.where({ created_by: openid });
      const result = await query.orderBy('event_start', 'desc').limit(100).get();
      return ok(
        result.data.filter((item) => item.is_deleted !== true).map((item) => publicActivity(item)),
      );
    }
    if (event.action === 'detail') {
      if (typeof event.activityId !== 'string' || !event.activityId)
        fail('VALIDATION_FAILED', '缺少活动 ID');
      const activity = await maybeGet(db.collection('activities'), event.activityId);
      if (!activity || activity.is_deleted === true) fail('ACTIVITY_NOT_FOUND', '活动不存在');
      if (!identity.isAdmin && activity.created_by !== openid)
        fail('FORBIDDEN', '只能查看自己的活动');
      return ok(await resolveActivityMedia(cloud, publicActivity(activity), openid));
    }
    fail('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('activity-admin failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return toErrorResponse(error);
  }
};
