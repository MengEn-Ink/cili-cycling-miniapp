'use strict';
const crypto = require('node:crypto');
const {
  isSnapshotFresh,
  isCredentialUsable,
  isSnapshotForCredential,
  sameCredentialVersion,
  writableDocument,
} = require('./oauth/core');

async function maybeGet(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    const code = String((error && (error.errCode || error.code)) || '');
    const message = String((error && (error.errMsg || error.message)) || '');
    const explicitDocumentMissing =
      /\bdocument(?:\s+with\s+_id\s+\S+)?\s+(?:(?:does\s+)?not\s+exist|not\s+found)\b/i.test(
        message,
      );
    if (
      ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(code) ||
      ([-502001, -1].includes(Number(error && error.errCode)) && explicitDocumentMissing)
    )
      return undefined;
    throw error;
  }
}

function nextAvatarRevision(profile) {
  const current =
    Number.isSafeInteger(profile?.avatar_revision) && profile.avatar_revision >= 0
      ? profile.avatar_revision
      : 0;
  if (current >= Number.MAX_SAFE_INTEGER)
    throw Object.assign(new Error('头像版本无法继续递增'), {
      code: 'AVATAR_REVISION_EXHAUSTED',
    });
  return current + 1;
}

const MEDIA_PAGE_SIZE = 100;

async function forEachByIdPage(collection, command, query, visit, pageSize = MEDIA_PAGE_SIZE) {
  let cursor;
  while (true) {
    const pageQuery = cursor ? { ...query, _id: command.gt(cursor) } : query;
    const result = await collection.where(pageQuery).orderBy('_id', 'asc').limit(pageSize).get();
    const rows = Array.isArray(result.data) ? result.data : [];
    if (!rows.length) return;
    for (const row of rows) await visit(row);
    const nextCursor = rows.at(-1)?._id;
    if (typeof nextCursor !== 'string' || (cursor !== undefined && nextCursor <= cursor)) {
      throw Object.assign(new Error('媒体分页游标无效'), { code: 'PROFILE_MEDIA_CURSOR_INVALID' });
    }
    cursor = nextCursor;
    if (rows.length < pageSize) return;
  }
}

function createReadinessStore(db) {
  const command = db.command;
  return {
    getCredential(openid) {
      return maybeGet(db.collection('strava_credentials'), openid);
    },
    getActivity(activityId) {
      return maybeGet(db.collection('activities'), activityId);
    },
    getAdmin(openid) {
      return maybeGet(db.collection('admins'), openid);
    },
    async saveCredential(credential) {
      await db
        .collection('strava_credentials')
        .doc(credential.openid)
        .set({
          data: writableDocument(credential),
        });
    },
    acquireCredentialRefreshLease(openid, { leaseId, now, staleBefore, expected }) {
      return db.runTransaction(async (tx) => {
        const collection = tx.collection('strava_credentials');
        const current = await maybeGet(collection, openid);
        const currentMatchesOpenid =
          current &&
          (current._id === undefined || current._id === openid) &&
          (current.openid === undefined || current.openid === openid);
        const expectedMatchesOpenid =
          expected &&
          (expected._id === undefined || expected._id === openid) &&
          (expected.openid === undefined || expected.openid === openid);
        const currentHasGeneration = current && Object.hasOwn(current, 'credential_generation');
        const expectedHasGeneration = expected && Object.hasOwn(expected, 'credential_generation');
        const legacyGeneration = !currentHasGeneration && !expectedHasGeneration;
        const currentGeneration = legacyGeneration ? 1 : current?.credential_generation;
        const generationMatches =
          legacyGeneration ||
          (Number.isSafeInteger(currentGeneration) &&
            currentGeneration >= 1 &&
            Number.isSafeInteger(expected?.credential_generation) &&
            expected.credential_generation === currentGeneration);
        if (
          !currentMatchesOpenid ||
          !expectedMatchesOpenid ||
          !generationMatches ||
          !sameCredentialVersion(current, expected)
        )
          return { acquired: false, credential: current };
        const startedAt = new Date(current.token_refresh_started_at);
        const activeLease =
          typeof current.token_refresh_lease_id === 'string' &&
          current.token_refresh_lease_id &&
          Number.isFinite(startedAt.getTime()) &&
          startedAt > staleBefore;
        if (activeLease) return { acquired: false, credential: current };
        const fields = {
          credential_generation: currentGeneration,
          token_refresh_lease_id: leaseId,
          token_refresh_started_at: now,
          updated_at: now,
        };
        await collection.doc(openid).update({ data: fields });
        return { acquired: true, credential: { ...current, ...fields } };
      });
    },
    saveRefreshedCredential(openid, expected, refreshed, now, leaseId) {
      return db.runTransaction(async (tx) => {
        const collection = tx.collection('strava_credentials');
        const current = await maybeGet(collection, openid);
        const currentMatchesOpenid =
          current &&
          (current._id === undefined || current._id === openid) &&
          (current.openid === undefined || current.openid === openid);
        const expectedMatchesOpenid =
          expected &&
          (expected._id === undefined || expected._id === openid) &&
          (expected.openid === undefined || expected.openid === openid);
        if (
          !currentMatchesOpenid ||
          !expectedMatchesOpenid ||
          !Number.isSafeInteger(expected?.credential_generation) ||
          expected.credential_generation < 1 ||
          current.credential_generation !== expected.credential_generation ||
          current.token_refresh_lease_id !== leaseId ||
          !sameCredentialVersion(current, expected)
        )
          return { saved: false, credential: current };
        const fields = {
          access_token_cipher: refreshed.access_token_cipher,
          refresh_token_cipher: refreshed.refresh_token_cipher,
          token_expires_at: refreshed.token_expires_at,
          scopes: refreshed.scopes,
          updated_at: now,
          token_refresh_lease_id: command.remove(),
          token_refresh_started_at: command.remove(),
        };
        await collection.doc(openid).update({ data: fields });
        return {
          saved: true,
          credential: (() => {
            const { token_refresh_lease_id, token_refresh_started_at, ...withoutLease } = current;
            void token_refresh_lease_id;
            void token_refresh_started_at;
            return {
              ...withoutLease,
              access_token_cipher: fields.access_token_cipher,
              refresh_token_cipher: fields.refresh_token_cipher,
              token_expires_at: fields.token_expires_at,
              scopes: fields.scopes,
              updated_at: now,
            };
          })(),
        };
      });
    },
    releaseCredentialRefreshLease(openid, { leaseId, expected, finishedAt }) {
      return db.runTransaction(async (tx) => {
        const collection = tx.collection('strava_credentials');
        const current = await maybeGet(collection, openid);
        const currentMatchesOpenid =
          current &&
          (current._id === undefined || current._id === openid) &&
          (current.openid === undefined || current.openid === openid);
        const expectedMatchesOpenid =
          expected &&
          (expected._id === undefined || expected._id === openid) &&
          (expected.openid === undefined || expected.openid === openid);
        if (
          !currentMatchesOpenid ||
          !expectedMatchesOpenid ||
          !Number.isSafeInteger(expected?.credential_generation) ||
          expected.credential_generation < 1 ||
          current.credential_generation !== expected.credential_generation ||
          !sameCredentialVersion(current, expected) ||
          current.token_refresh_lease_id !== leaseId
        )
          return false;
        await collection.doc(openid).update({
          data: {
            token_refresh_lease_id: command.remove(),
            token_refresh_started_at: command.remove(),
            updated_at: finishedAt,
          },
        });
        return true;
      });
    },
    async saveRoutePreview(openid, preview, now) {
      const id = crypto
        .createHash('sha256')
        .update(`${openid}\0${preview.strava_route_id}`)
        .digest('hex');
      await db
        .collection('strava_route_previews')
        .doc(id)
        .set({
          data: {
            owner_openid: openid,
            ...preview,
            created_at: now,
            expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1000),
          },
        });
    },
    createAuthorizationAttempt(openid, state) {
      return db.runTransaction(async (tx) => {
        const current = (await maybeGet(tx.collection('oauth_attempts'), openid)) || {};
        const generation = Number.isSafeInteger(current.attempt_generation)
          ? current.attempt_generation + 1
          : 1;
        if (!Number.isSafeInteger(generation))
          throw Object.assign(new Error('OAuth 授权代际无法继续递增'), {
            code: 'OAUTH_GENERATION_EXHAUSTED',
          });
        await tx
          .collection('oauth_attempts')
          .doc(openid)
          .set({
            data: {
              openid,
              attempt_generation: generation,
              status: 'authorizing',
              error_code: null,
              updated_at: db.serverDate(),
            },
          });
        await tx
          .collection('oauth_states')
          .doc(state.hash)
          .set({
            data: {
              state_hash: state.hash,
              openid,
              attempt_generation: generation,
              expires_at: state.expiresAt,
              created_at: db.serverDate(),
            },
          });
        return generation;
      });
    },
    async readReadiness(openid, now) {
      const [credential, snapshot, active, attempt] = await Promise.all([
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
        maybeGet(db.collection('oauth_attempts'), openid),
      ]);
      return {
        credential,
        snapshot,
        hasActiveOAuthState: Boolean(active.data && active.data.length),
        authorizationErrorCode:
          attempt?.status === 'failed' && typeof attempt.error_code === 'string'
            ? attempt.error_code
            : undefined,
      };
    },
    cancelAuthorization(openid, now) {
      return db.runTransaction(async (tx) => {
        const cancelledAt = db.serverDate();
        const current = (await maybeGet(tx.collection('oauth_attempts'), openid)) || {};
        const generation = Number.isSafeInteger(current.attempt_generation)
          ? current.attempt_generation + 1
          : 1;
        const result = await tx
          .collection('oauth_states')
          .where({
            openid,
            expires_at: command.gt(now),
            consumed_at: command.exists(false),
          })
          .update({ data: { consumed_at: cancelledAt, cancelled_at: cancelledAt } });
        await tx
          .collection('oauth_attempts')
          .doc(openid)
          .set({
            data: {
              openid,
              attempt_generation: generation,
              status: 'cancelled',
              error_code: null,
              updated_at: cancelledAt,
            },
          });
        return { cancelled: result.stats?.updated || 0 };
      });
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
        const {
          avatar_import_lease_id: staleAvatarLease,
          avatar_import_started_at: staleAvatarStartedAt,
          avatar_import_lease_expires_at: staleAvatarExpiresAt,
          ...syncCredential
        } = credential;
        void staleAvatarLease;
        void staleAvatarStartedAt;
        void staleAvatarExpiresAt;
        await tx
          .collection('strava_credentials')
          .doc(openid)
          .set({
            data: writableDocument({
              ...current,
              ...syncCredential,
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
    async disconnect(openid, audit) {
      const referencedFileIds = await db.runTransaction(async (tx) => {
        const disconnectedAt = db.serverDate();
        const currentAttempt = (await maybeGet(tx.collection('oauth_attempts'), openid)) || {};
        const generation = Number.isSafeInteger(currentAttempt.attempt_generation)
          ? currentAttempt.attempt_generation + 1
          : 1;
        await tx
          .collection('oauth_states')
          .where({ openid, consumed_at: command.exists(false) })
          .update({ data: { consumed_at: disconnectedAt, cancelled_at: disconnectedAt } });
        await tx
          .collection('oauth_attempts')
          .doc(openid)
          .set({
            data: {
              openid,
              attempt_generation: generation,
              status: 'disconnected',
              error_code: null,
              updated_at: disconnectedAt,
            },
          });
        await tx.collection('strava_credentials').doc(openid).remove();
        await tx.collection('strava_snapshots').doc(openid).remove();
        const profile = await maybeGet(tx.collection('profiles'), openid);
        let nextProfile = profile;
        if (profile?.avatar_source === 'strava' && typeof profile.avatar_file_id === 'string') {
          const { avatar_source, avatar_file_id, ...withoutAvatar } = profile;
          void avatar_source;
          void avatar_file_id;
          nextProfile = {
            ...withoutAvatar,
            avatar_revision: nextAvatarRevision(profile),
          };
        }
        const currentReferences = [
          nextProfile?.background_photo?.file_id,
          ...(Array.isArray(nextProfile?.photos) ? nextProfile.photos : [])
            .map((item) => item?.file_id)
            .filter((value) => typeof value === 'string' && value),
        ].filter((value) => typeof value === 'string' && value);
        if (typeof nextProfile?.avatar_file_id === 'string')
          currentReferences.push(nextProfile.avatar_file_id);
        if (nextProfile) {
          await tx
            .collection('profiles')
            .doc(openid)
            .set({
              data: writableDocument({
                ...nextProfile,
                strava: { status: 'disconnected' },
                updated_at: db.serverDate(),
              }),
            });
        }
        await tx.collection('audit_logs').add({ data: audit });
        return currentReferences;
      });

      const retained = new Set(referencedFileIds);
      const cleanupAfter = new Date(new Date(audit.created_at).getTime() + 24 * 60 * 60 * 1000);
      await forEachByIdPage(
        db.collection('profile_media'),
        command,
        { owner_openid: openid, origin: 'strava', status: 'active' },
        async (media) => {
          if (
            typeof media?._id !== 'string' ||
            typeof media.file_id !== 'string' ||
            retained.has(media.file_id)
          )
            return;
          await db
            .collection('profile_media')
            .doc(media._id)
            .update({
              data: {
                status: 'unreferenced',
                referenced_at: null,
                cleanup_after: cleanupAfter,
                delete_lease_id: '',
                updated_at: db.serverDate(),
              },
            });
        },
      );
    },
  };
}

module.exports = { maybeGet, createReadinessStore };
