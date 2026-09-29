'use strict';

const { claimDecision } = require('./core');

function missing(error) {
  return (
    Number(error?.errCode) === -502001 || /not exist|not found/i.test(String(error?.errMsg || ''))
  );
}

async function get(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

function createCleanupStore(db) {
  const command = db.command;
  async function fencedUpdate(id, leaseId, data) {
    return db.runTransaction(async (tx) => {
      const collection = tx.collection('profile_media');
      const current = await get(collection, id);
      if (!current || current.status !== 'deleting' || current.delete_lease_id !== leaseId)
        return false;
      await collection.doc(id).update({ data });
      return true;
    });
  }
  return {
    listEligible: async (now, limit) => {
      const result = await db
        .collection('profile_media')
        .where({ status: 'unreferenced', cleanup_after: command.lte(now) })
        .orderBy('cleanup_after', 'asc')
        .limit(Math.min(20, limit))
        .get();
      return result.data.map((item) => item._id);
    },
    claim: (id, fence) =>
      db.runTransaction(async (tx) => {
        const media = tx.collection('profile_media');
        const record = await get(media, id);
        if (!record) return undefined;
        const profile = await get(tx.collection('profiles'), record.owner_openid);
        const decision = claimDecision(record, profile, fence.now, fence.leaseId);
        if (!decision) return undefined;
        await media.doc(id).update({ data: decision.update });
        return {
          ...record,
          ...decision.update,
          claimed: decision.kind === 'claimed',
          reactivated: decision.kind === 'referenced',
        };
      }),
    markDeleted: (id, fence) =>
      fencedUpdate(id, fence.leaseId, {
        status: 'deleted',
        deleted_at: fence.now,
        delete_lease_id: '',
        cleanup_after: null,
        last_error_code: '',
        updated_at: fence.now,
      }),
    markFailed: (id, fence) =>
      fencedUpdate(id, fence.leaseId, {
        status: 'delete_failed',
        delete_failed_at: fence.now,
        delete_lease_id: '',
        last_error_code: fence.errorCode,
        updated_at: fence.now,
      }),
  };
}

module.exports = { missing, get, createCleanupStore };
