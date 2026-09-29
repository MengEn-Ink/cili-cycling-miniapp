'use strict';

const { claimDecision, failureDecision } = require('./core');

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
      const bounded = Math.min(20, limit);
      const specs = [
        ['unreferenced', 'cleanup_after'],
        ['deleting', 'delete_lease_expires_at'],
        ['delete_failed', 'retry_at'],
      ];
      const results = await Promise.all(
        specs.map(([status, field]) =>
          db
            .collection('profile_media')
            .where({ status, [field]: command.lte(now) })
            .orderBy(field, 'asc')
            .limit(bounded)
            .get(),
        ),
      );
      const queues = results.map((result) => result.data.map((item) => item._id));
      const selected = [];
      const seen = new Set();
      while (selected.length < bounded && queues.some((queue) => queue.length)) {
        for (const queue of queues) {
          const id = queue.shift();
          if (id && !seen.has(id)) {
            seen.add(id);
            selected.push(id);
            if (selected.length >= bounded) break;
          }
        }
      }
      return selected;
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
        delete_lease_expires_at: null,
        retry_at: null,
        cleanup_after: null,
        last_error_code: '',
        updated_at: fence.now,
      }),
    markFailed: (id, fence) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profile_media');
        const current = await get(collection, id);
        if (!current || current.status !== 'deleting' || current.delete_lease_id !== fence.leaseId)
          return false;
        await collection.doc(id).update({
          data: failureDecision(current, fence.now, fence.errorCode),
        });
        return true;
      }),
  };
}

module.exports = { missing, get, createCleanupStore };
