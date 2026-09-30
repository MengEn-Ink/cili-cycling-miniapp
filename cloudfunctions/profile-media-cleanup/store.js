'use strict';

const {
  claimDecision,
  importClaimDecision,
  failureDecision,
  profileReferences,
  validIntentCloudPath,
} = require('./core');

function missing(error) {
  const code = String(error?.errCode || error?.code || '');
  const message = String(error?.errMsg || error?.message || '');
  const explicitDocumentMissing =
    /\bdocument(?:\s+with\s+_id\s+\S+)?\s+(?:(?:does\s+)?not\s+exist|not\s+found)\b/i.test(message);
  return (
    ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(code) ||
    ([-502001, -1].includes(Number(error?.errCode)) && explicitDocumentMissing)
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

function createCleanupStore(db, mediaSecret) {
  const command = db.command;
  async function fencedUpdate(collectionName, id, leaseId, data, statuses = ['deleting']) {
    return db.runTransaction(async (tx) => {
      const collection = tx.collection(collectionName);
      const current = await get(collection, id);
      if (!current || !statuses.includes(current.status) || current.delete_lease_id !== leaseId)
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
    listImportIntents: async (now, limit) => {
      const bounded = Math.min(20, limit);
      const specs = [
        ['leased', 'cleanup_after'],
        ['prepared', 'cleanup_after'],
        ['uploaded', 'cleanup_after'],
        ['orphaned', 'cleanup_after'],
        ['delete_confirming', 'cleanup_after'],
        ['recovering', 'delete_lease_expires_at'],
        ['deleting', 'delete_lease_expires_at'],
        ['delete_failed', 'retry_at'],
      ];
      const results = await Promise.all(
        specs.map(([status, field]) =>
          db
            .collection('profile_media_imports')
            .where({ status, [field]: command.lte(now) })
            .orderBy(field, 'asc')
            .limit(bounded)
            .get(),
        ),
      );
      const queues = results.map((result) => (result.data || []).map((item) => item._id));
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
        const decision = claimDecision(record, profile, fence.now, fence.leaseId, mediaSecret);
        if (!decision) return undefined;
        await media.doc(id).update({ data: decision.update });
        return {
          ...record,
          ...decision.update,
          claimed: decision.kind === 'claimed',
          reactivated: decision.kind === 'referenced',
          delete_file_ids: [record.file_id, record.canonical_file_id].filter(
            (value, index, values) => value && values.indexOf(value) === index,
          ),
        };
      }),
    markDeleted: (id, fence) =>
      fencedUpdate('profile_media', id, fence.leaseId, {
        status: 'deleted',
        deleted_at: fence.now,
        delete_lease_id: '',
        delete_lease_expires_at: null,
        retry_at: null,
        cleanup_after: null,
        last_error_code: '',
        updated_at: fence.now,
      }),
    claimImportIntent: (id, fence) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profile_media_imports');
        const record = await get(collection, id);
        if (!record) return undefined;
        const profile = await get(tx.collection('profiles'), record.owner_openid);
        const decision = importClaimDecision(
          record,
          profile,
          fence.now,
          fence.leaseId,
          mediaSecret,
        );
        if (!decision) return undefined;
        await collection.doc(id).update({ data: decision.update });
        if (decision.kind === 'aborted') {
          const credential = await get(tx.collection('strava_credentials'), record.owner_openid);
          if (credential?.avatar_import_lease_id === id) {
            await tx
              .collection('strava_credentials')
              .doc(record.owner_openid)
              .update({
                data: {
                  avatar_import_lease_id: command.remove(),
                  avatar_import_started_at: command.remove(),
                  avatar_import_lease_expires_at: command.remove(),
                },
              });
          }
        }
        return {
          ...record,
          ...decision.update,
          claimed: decision.kind === 'claimed',
          resolve_target: decision.kind === 'resolve',
          defer_completion: decision.defer_completion === true,
          confirm_delete: decision.finalize_delete === true,
          invalid: decision.kind === 'invalid',
          completed: decision.kind === 'completed',
          aborted: decision.kind === 'aborted',
        };
      }),
    isImportRecoveryLeaseCurrent: async (id, fence) => {
      const current = await get(db.collection('profile_media_imports'), id);
      const expiresAt = new Date(current?.delete_lease_expires_at);
      const profile = current
        ? await get(db.collection('profiles'), current.owner_openid)
        : undefined;
      return Boolean(
        current &&
        current.status === 'recovering' &&
        current.delete_lease_id === fence.leaseId &&
        Number.isFinite(expiresAt.getTime()) &&
        expiresAt > fence.now &&
        validIntentCloudPath(current, mediaSecret) &&
        !(current.file_id && profileReferences(profile, current.file_id)),
      );
    },
    attachImportDeleteTarget: (id, fence) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profile_media_imports');
        const current = await get(collection, id);
        const slash =
          typeof fence.fileId === 'string' && fence.fileId.startsWith('cloud://')
            ? fence.fileId.indexOf('/', 'cloud://'.length)
            : -1;
        if (
          !current ||
          current.status !== 'recovering' ||
          current.delete_lease_id !== fence.leaseId ||
          !validIntentCloudPath(current, mediaSecret) ||
          slash < 0 ||
          fence.fileId.slice(slash + 1) !== current.cloud_path
        )
          return false;
        const profile = await get(tx.collection('profiles'), current.owner_openid);
        if (profileReferences(profile, fence.fileId)) return false;
        await collection.doc(id).update({
          data: {
            status: 'deleting',
            file_id: fence.fileId,
            recovery_delete_pending: true,
            updated_at: fence.now,
          },
        });
        return true;
      }),
    reclaimImportDeleteTarget: (id, fence) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profile_media_imports');
        const current = await get(collection, id);
        if (
          !current ||
          current.status === 'completed' ||
          current.status === 'invalid' ||
          current.owner_openid !== fence.ownerOpenid ||
          current.cloud_path !== fence.cloudPath ||
          !validIntentCloudPath(current, mediaSecret)
        )
          return false;
        const slash =
          typeof fence.fileId === 'string' && fence.fileId.startsWith('cloud://')
            ? fence.fileId.indexOf('/', 'cloud://'.length)
            : -1;
        if (slash < 0 || fence.fileId.slice(slash + 1) !== current.cloud_path) return false;
        const profile = await get(tx.collection('profiles'), current.owner_openid);
        if (profileReferences(profile, fence.fileId)) return false;
        await collection.doc(id).update({
          data: {
            status: 'deleting',
            file_id: fence.fileId,
            recovery_delete_pending: true,
            delete_lease_id: fence.leaseId,
            delete_claimed_at: fence.now,
            delete_lease_expires_at: fence.leaseExpiresAt,
            cleanup_after: fence.now,
            updated_at: fence.now,
          },
        });
        return true;
      }),
    isImportDeleteLeaseCurrent: async (id, fence) => {
      const current = await get(db.collection('profile_media_imports'), id);
      const expiresAt = new Date(current?.delete_lease_expires_at);
      if (
        !current ||
        current.status !== 'deleting' ||
        current.delete_lease_id !== fence.leaseId ||
        !Number.isFinite(expiresAt.getTime()) ||
        expiresAt <= fence.now ||
        current.file_id !== fence.fileId ||
        !validIntentCloudPath(current, mediaSecret)
      )
        return false;
      const profile = await get(db.collection('profiles'), current.owner_openid);
      return !profileReferences(profile, fence.fileId);
    },
    markImportDeleted: (id, fence) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profile_media_imports');
        const current = await get(collection, id);
        if (
          !current ||
          !['deleting', 'recovering'].includes(current.status) ||
          current.delete_lease_id !== fence.leaseId
        )
          return false;
        await collection.doc(id).update({
          data: fence.deferCompletion
            ? {
                status: 'delete_confirming',
                deleted_at: fence.now,
                delete_lease_id: '',
                delete_lease_expires_at: null,
                delete_attempts: 0,
                delete_confirmation_pending: false,
                recovery_delete_pending: false,
                retry_at: null,
                cleanup_after: fence.confirmAfter,
                last_error_code: '',
                updated_at: fence.now,
              }
            : {
                status: 'deleted',
                deleted_at: fence.now,
                delete_lease_id: '',
                delete_lease_expires_at: null,
                delete_confirmation_pending: false,
                recovery_delete_pending: false,
                retry_at: null,
                cleanup_after: null,
                last_error_code: '',
                updated_at: fence.now,
              },
        });
        return true;
      }),
    markImportFailed: (id, fence) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profile_media_imports');
        const current = await get(collection, id);
        if (
          !current ||
          !['deleting', 'recovering'].includes(current.status) ||
          current.delete_lease_id !== fence.leaseId
        )
          return false;
        await collection.doc(id).update({
          data: failureDecision(current, fence.now, fence.errorCode),
        });
        return true;
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
