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
} = require('./domain');
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
function transactionStore() {
  return {
    transaction: (work) =>
      db.runTransaction(async (transaction) =>
        work({
          getActivity: (id) => maybeGet(transaction.collection('activities'), id),
          getProfile: (openid) => maybeGet(transaction.collection('profiles'), openid),
          getRegistration: (id) => maybeGet(transaction.collection('registrations'), id),
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
                  support_vehicle_occupied_count: supportVehicleOccupied,
                  self_drive_occupied_count: selfDriveOccupied,
                  updated_at: db.serverDate(),
                },
              }),
          addAudit: (audit) => transaction.collection('audit_logs').add({ data: audit }),
        }),
      ),
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
          { openid, activityId: event.activityId, options: event.options },
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
      return ok(result.data.map(publicRegistration));
    }
    if (event.action === 'detail') {
      if (typeof event.registrationId !== 'string' || !event.registrationId)
        fail('VALIDATION_FAILED', '缺少报名 ID');
      const registration = await maybeGet(db.collection('registrations'), event.registrationId);
      if (!registration || registration.openid !== openid)
        fail('REGISTRATION_NOT_FOUND', '报名不存在');
      return ok(publicRegistration(registration));
    }
    fail('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('registration failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return toErrorResponse(error);
  }
};
