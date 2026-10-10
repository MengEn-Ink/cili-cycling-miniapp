'use strict';

const cloud = require('wx-server-sdk');
const {
  ok,
  fail,
  toErrorResponse,
  assertTrustedOpenid,
  assertNoForbiddenFields,
  publicRegistration,
  submitRegistration,
  cancelRegistration,
  publicActivity,
} = require('./domain');
const { normalizePageSize, encodeMyCursor, decodeMyCursor } = require('./list-page');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function unavailableActivity(registration, activity) {
  const snapshot = registration.activity_snapshot || {};
  const source = activity || snapshot;
  return publicActivity(
    {
      ...(activity || {}),
      _id: registration.activity_id,
      title: typeof source.title === 'string' && source.title ? source.title : '历史活动',
      event_start: source.event_start || registration.created_at,
      event_end: source.event_end || source.event_start || registration.created_at,
      status: activity
        ? ['published', 'finished'].includes(source.status)
          ? source.status
          : 'finished'
        : 'finished',
    },
    new Date(),
  );
}

async function withActivities(registrations) {
  const byId = new Map();
  const ids = [...new Set(registrations.map((item) => item.activity_id).filter(Boolean))];
  for (let offset = 0; offset < ids.length; offset += 20) {
    const batch = ids.slice(offset, offset + 20);
    const result = await db
      .collection('activities')
      .where({ _id: _.in(batch) })
      .limit(20)
      .get();
    for (const activity of Array.isArray(result.data) ? result.data : [])
      byId.set(activity._id, activity);
  }
  return registrations.map((registration) => ({
    ...publicRegistration(registration),
    activity: unavailableActivity(registration, byId.get(registration.activity_id)),
  }));
}

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
function transactionStore() {
  return {
    transaction: (work) =>
      db.runTransaction(async (transaction) =>
        work({
          getActivity: (id) => maybeGet(transaction.collection('activities'), id),
          getProfile: (openid) => maybeGet(transaction.collection('profiles'), openid),
          getRegistration: (id) => maybeGet(transaction.collection('registrations'), id),
          getTeamLeader: async (activityId, teamId) => {
            const result = await transaction
              .collection('registrations')
              .where({ activity_id: activityId, team_id: teamId, is_team_leader: true })
              .limit(1)
              .get();
            return result.data[0];
          },
          listWaiting: async (activityId) => {
            const values = [];
            const pageSize = 100;
            for (let offset = 0; ; offset += pageSize) {
              const result = await transaction
                .collection('registrations')
                .where({ activity_id: activityId, status: 'waiting' })
                .orderBy('created_at', 'asc')
                .skip(offset)
                .limit(pageSize)
                .get();
              values.push(...result.data);
              if (result.data.length < pageSize) return values;
            }
          },
          getStravaCredential: (openid) =>
            maybeGet(transaction.collection('strava_credentials'), openid),
          getStravaSnapshot: (openid) =>
            maybeGet(transaction.collection('strava_snapshots'), openid),
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

function tripActivity(activity) {
  if (!activity || typeof activity !== 'object') return undefined;
  return {
    _id: activity._id,
    title: typeof activity.title === 'string' ? activity.title : '活动信息不可用',
    event_start: activity.event_start,
    status: activity.status,
  };
}

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    assertTrustedOpenid(openid);
    assertNoForbiddenFields(event);
    if (event.action === 'submit') {
      return ok(
        await submitRegistration(
          transactionStore(),
          { openid, activityId: event.activityId, options: event.options, team: event.team },
          new Date(),
        ),
      );
    }
    if (event.action === 'cancel') {
      if (typeof event.registrationId !== 'string' || !event.registrationId)
        fail('VALIDATION_FAILED', '缺少报名 ID');
      return ok(
        await cancelRegistration(
          transactionStore(),
          { openid, registrationId: event.registrationId },
          new Date(),
        ),
      );
    }
    if (event.action === 'mine') {
      const result = await db
        .collection('registrations')
        .where({ openid })
        .orderBy('created_at', 'desc')
        .limit(50)
        .get();
      return ok(await withActivities(result.data));
    }
    if (event.action === 'minePage') {
      const pageSize = normalizePageSize(event.page_size);
      const boundary = event.cursor ? decodeMyCursor(event.cursor) : null;
      const filter = boundary
        ? _.and([
            { openid },
            _.or([
              { created_at: _.lt(boundary.createdAt) },
              _.and([
                { created_at: _.eq(boundary.createdAt) },
                { activity_id: _.lt(boundary.activityId) },
              ]),
            ]),
          ])
        : { openid };
      const result = await db
        .collection('registrations')
        .where(filter)
        .orderBy('created_at', 'desc')
        .orderBy('activity_id', 'desc')
        .limit(pageSize + 1)
        .get();
      const rows = Array.isArray(result.data) ? result.data : [];
      const pageRows = rows.slice(0, pageSize);
      const items = await withActivities(pageRows);
      return ok({
        items,
        next_cursor:
          rows.length > pageSize
            ? encodeMyCursor({
                createdAt: pageRows[pageRows.length - 1].created_at,
                activityId: pageRows[pageRows.length - 1].activity_id,
              })
            : null,
      });
    }
    if (event.action === 'detail') {
      if (typeof event.registrationId !== 'string' || !event.registrationId)
        fail('VALIDATION_FAILED', '缺少报名 ID');
      const registration = await maybeGet(db.collection('registrations'), event.registrationId);
      if (!registration || registration.openid !== openid)
        fail('REGISTRATION_NOT_FOUND', '报名不存在');
      return ok((await withActivities([registration]))[0]);
    }
    fail('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('registration failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return toErrorResponse(error);
  }
};
