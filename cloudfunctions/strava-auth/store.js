'use strict';
const {
  isSnapshotFresh,
  isCredentialUsable,
  isSnapshotForCredential,
  writableDocument,
} = require('./oauth/core');

async function maybeGet(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    const code = Number(error && error.errCode);
    const message = String((error && (error.errMsg || error.message)) || '');
    if (code === -502001 || /not exist|not found/i.test(message)) return undefined;
    throw error;
  }
}

function createReadinessStore(db) {
  const command = db.command;
  return {
    async readReadiness(openid, now) {
      const [credential, snapshot, active] = await Promise.all([
        maybeGet(db.collection('strava_credentials'), openid),
        maybeGet(db.collection('strava_snapshots'), openid),
        db
          .collection('oauth_states')
          .where({
            openid,
            expires_at: command.gt(now),
            consumed_at: command.exists(false),
          })
          .limit(1)
          .get(),
      ]);
      return {
        credential,
        snapshot,
        hasActiveOAuthState: Boolean(active.data && active.data.length),
      };
    },
    acquireSyncLease(openid, { leaseId, now, staleBefore, audit }) {
      return db.runTransaction(async (tx) => {
        const credential = await maybeGet(tx.collection('strava_credentials'), openid);
        const snapshot = await maybeGet(tx.collection('strava_snapshots'), openid);
        const snapshotReady =
          isCredentialUsable(credential) &&
          isSnapshotForCredential(credential, snapshot) &&
          isSnapshotFresh(snapshot, now);
        if (!credential || snapshotReady) {
          return { acquired: false, credential, snapshot };
        }
        const startedAt = new Date(credential.sync_started_at);
        const activeLease =
          credential.sync_status === 'running' &&
          Number.isFinite(startedAt.getTime()) &&
          startedAt > staleBefore;
        if (activeLease) return { acquired: false, credential, snapshot };
        await tx
          .collection('strava_credentials')
          .doc(openid)
          .update({
            data: {
              sync_status: 'running',
              sync_lease_id: leaseId,
              sync_started_at: now,
              sync_error_code: command.remove(),
              updated_at: now,
            },
          });
        await tx.collection('audit_logs').add({ data: audit });
        return {
          acquired: true,
          credential: {
            ...credential,
            sync_status: 'running',
            sync_lease_id: leaseId,
            sync_started_at: now,
          },
          snapshot,
        };
      });
    },
    completeSync(openid, { leaseId, credential, snapshot, finishedAt, audit }) {
      return db.runTransaction(async (tx) => {
        const current = await maybeGet(tx.collection('strava_credentials'), openid);
        if (!current || current.sync_lease_id !== leaseId) return false;
        const profile = (await maybeGet(tx.collection('profiles'), openid)) || {};
        await tx
          .collection('strava_credentials')
          .doc(openid)
          .set({
            data: writableDocument({
              ...current,
              ...credential,
              sync_status: 'ready',
              sync_finished_at: finishedAt,
              updated_at: finishedAt,
            }),
          });
        await tx
          .collection('strava_credentials')
          .doc(openid)
          .update({
            data: {
              sync_error_code: command.remove(),
              sync_lease_id: command.remove(),
            },
          });
        await tx
          .collection('strava_snapshots')
          .doc(openid)
          .set({ data: writableDocument(snapshot) });
        await tx
          .collection('profiles')
          .doc(openid)
          .set({
            data: writableDocument({
              ...profile,
              strava: { status: 'connected', snapshot },
              updated_at: finishedAt,
            }),
          });
        await tx.collection('audit_logs').add({ data: audit });
        return true;
      });
    },
    failSync(openid, { leaseId, errorCode, finishedAt, audit }) {
      return db.runTransaction(async (tx) => {
        const current = await maybeGet(tx.collection('strava_credentials'), openid);
        if (!current || current.sync_lease_id !== leaseId) return false;
        await tx
          .collection('strava_credentials')
          .doc(openid)
          .update({
            data: {
              sync_status: 'failed',
              sync_error_code: errorCode,
              sync_lease_id: command.remove(),
              sync_finished_at: finishedAt,
              updated_at: finishedAt,
            },
          });
        await tx.collection('audit_logs').add({ data: audit });
        return true;
      });
    },
    disconnect(openid, audit) {
      return db.runTransaction(async (tx) => {
        await tx.collection('strava_credentials').doc(openid).remove();
        await tx.collection('strava_snapshots').doc(openid).remove();
        const profile = await maybeGet(tx.collection('profiles'), openid);
        if (profile) {
          await tx
            .collection('profiles')
            .doc(openid)
            .set({
              data: writableDocument({
                ...profile,
                strava: { status: 'disconnected' },
                updated_at: db.serverDate(),
              }),
            });
        }
        await tx.collection('audit_logs').add({ data: audit });
      });
    },
  };
}

module.exports = { maybeGet, createReadinessStore };
