'use strict';

const crypto = require('node:crypto');
const { get } = require('./media-store');
const { validIntentCloudPath, validCanonicalMedia, MAX_DELETE_ATTEMPTS } = require('./media-core');
const { LEASE_MS, MAX_ATTEMPTS, ROW_BATCH } = require('./core');
const { createStravaStore } = require('./strava-store');
const {
  profileGeneration,
  scrubProfile,
  contactFields,
  registrationNeedsContact,
  MEDIA_REFERENCES,
  hasMediaReferences,
} = require('./privacy-contract');
const PERSONAL_CATEGORIES = new Set([
  'profile-avatar',
  'profile-background',
  'ride',
  'bike',
  'other',
]);
const RUNNABLE = ['requested', 'processing', 'awaiting_media', 'restricted', 'retryable'];
const BUSINESS_CATEGORIES = new Set([
  'activity-image',
  'activity-group-qr',
  'activity-route-preview',
  'club-avatar',
  'club-cover',
]);
const REFERENCES = MEDIA_REFERENCES;
const MAX_MEDIA_TARGETS = 256;
const withoutId = ({ _id, ...data }) => data;
function retainSnapshotTargets(request, snapshot) {
  const targets = [
    ...new Set(
      [
        ...(request.media_targets || []),
        snapshot?.avatar_file_id,
        snapshot?.background_photo?.file_id,
        ...(Array.isArray(snapshot?.photos) ? snapshot.photos.map((photo) => photo?.file_id) : []),
      ].filter((value) => typeof value === 'string' && value),
    ),
  ];
  if (targets.length > MAX_MEDIA_TARGETS) {
    request.manual_required = true;
    return false;
  }
  request.media_targets = targets;
  return true;
}
function createPrivacyStore(db, secret) {
  const command = db.command;
  const page = async (tx, name, condition, cursor, limit) =>
    (
      await tx
        .collection(name)
        .where({ ...condition, ...(cursor ? { _id: command.gt(cursor) } : {}) })
        .orderBy('_id', 'asc')
        .limit(limit)
        .get()
    ).data;
  const fenced = (request, fence) =>
    request &&
    RUNNABLE.includes(request.status) &&
    request.lease_id === fence.leaseId &&
    new Date(request.lease_expires_at) > fence.now;
  const matchesProfile = (profile, request) =>
    profile &&
    profileGeneration(profile) === request.generation &&
    profile.deletion_request_id === request._id;
  const canProcess = (profile, request) =>
    matchesProfile(profile, request) ||
    (request.replay_epoch && profile && profileGeneration(profile) > request.generation);
  const references = (tx, targets) => hasMediaReferences(tx, command, targets);
  const classify = (row) => {
    if (PERSONAL_CATEGORIES.has(row.category)) return 'personal';
    if (BUSINESS_CATEGORIES.has(row.category)) return 'business';
    if (row.category) return 'review';
    const category = row.cloud_path?.split('/')[2];
    if (category?.startsWith('activity-') || category?.startsWith('club-')) return 'business';
    return 'personal';
  };
  const mediaValid = (row) => {
    const slash = typeof row.file_id === 'string' ? row.file_id.indexOf('/', 8) : -1;
    return (
      slash >= 0 &&
      row._id === crypto.createHash('sha256').update(row.file_id).digest('hex') &&
      validIntentCloudPath(
        { ...row, kind: 'client_upload', cloud_path: row.file_id.slice(slash + 1) },
        secret,
      ) &&
      validCanonicalMedia(row, secret)
    );
  };
  const enroll = async (tx, name, row, request, now) => {
    if (classify(row) === 'business') return;
    if ((row.generation || row.privacy_generation || 1) > request.generation) return;
    const isMedia = name === 'profile_media';
    const canonicalTarget =
      !isMedia &&
      row.kind === 'canonical_upload' &&
      row.file_id === row.source_file_id &&
      typeof row.canonical_file_id === 'string' &&
      row.canonical_file_id.startsWith('cloud://') &&
      row.canonical_file_id.slice(row.canonical_file_id.indexOf('/', 8) + 1) === row.cloud_path
        ? row.canonical_file_id
        : undefined;
    const targets = [row.file_id, row.canonical_file_id, row.source_file_id];
    const valid = isMedia ? mediaValid(row) : validIntentCloudPath(row, secret);
    const blocked = classify(row) === 'review' || !valid || (await references(tx, targets));
    const terminalFailure =
      ['invalid', 'aborted', 'delete_failed_terminal', 'privacy_manual_review'].includes(
        row.status,
      ) ||
      (row.status !== 'deleted' && Number(row.delete_attempts || 0) >= MAX_DELETE_ATTEMPTS);
    const manual = blocked || terminalFailure;
    const freshReplay = request.replay_epoch && row.privacy_replay_epoch !== request.replay_epoch;
    if (manual) request.manual_required = true;
    // Keep identifiers and exhausted attempts: the existing cleanup worker owns object deletion.
    const settledAt = row.created_at
      ? new Date(new Date(row.created_at).getTime() + 36 * 60 * 1000)
      : now;
    const cleanupAt = settledAt > now ? settledAt : now;
    const data = {
      privacy_request_id: request._id,
      privacy_generation: request.generation,
      ...(request.replay_epoch ? { privacy_replay_epoch: request.replay_epoch } : {}),
      ...(freshReplay
        ? {
            privacy_deleted_epoch: '',
            delete_lease_id: '',
            delete_lease_expires_at: null,
            delete_confirmation_pending: false,
            recovery_delete_pending: false,
            ...(row.status === 'deleted' ? { delete_attempts: 0 } : {}),
          }
        : {}),
      ...(canonicalTarget ? { file_id: canonicalTarget } : {}),
      updated_at: now,
      ...(manual
        ? {
            status: 'privacy_manual_review',
            privacy_error_code: blocked
              ? 'MEDIA_REFERENCE_OR_TARGET_REVIEW'
              : 'MEDIA_CLEANUP_EXHAUSTED',
          }
        : freshReplay
          ? {
              status: isMedia ? 'unreferenced' : 'prepared',
              cleanup_after: cleanupAt,
            }
          : row.status === 'deleted'
            ? {}
            : ['deleting', 'recovering', 'delete_failed', 'delete_confirming'].includes(row.status)
              ? {}
              : {
                  status: isMedia ? 'unreferenced' : 'prepared',
                  cleanup_after: cleanupAt,
                  delete_lease_id: '',
                }),
    };
    await tx.collection(name).doc(row._id).update({ data });
  };
  const store = {
    listEligible: async (now, limit) => {
      const queues = [];
      for (const status of RUNNABLE) {
        const result = await db
          .collection('privacy_requests')
          .where({ status, retry_at: command.lte(now) })
          .orderBy('retry_at', 'asc')
          .orderBy('_id', 'asc')
          .limit(limit)
          .get();
        queues.push(...result.data);
      }
      return queues
        .filter((row) => !row.lease_id || new Date(row.lease_expires_at) <= now)
        .sort(
          (left, right) =>
            new Date(left.retry_at) - new Date(right.retry_at) || left._id.localeCompare(right._id),
        )
        .slice(0, limit)
        .map((row) => row._id);
    },
    claim: (id, fence) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('privacy_requests');
        const request = await get(collection, id);
        if (
          !request ||
          !RUNNABLE.includes(request.status) ||
          new Date(request.retry_at) > fence.now ||
          (request.lease_id && new Date(request.lease_expires_at) > fence.now)
        )
          return false;
        const profile = await get(tx.collection('profiles'), request.owner_openid);
        if (!canProcess(profile, request)) return false;
        const attempts = Number(request.attempts || 0) + (request.lease_id ? 1 : 0);
        if (attempts >= MAX_ATTEMPTS) {
          await collection.doc(id).update({
            data: {
              attempts,
              status: 'manual_review',
              retry_at: null,
              lease_id: '',
              lease_expires_at: null,
              last_error_code: 'PRIVACY_LEASE_EXHAUSTED',
              updated_at: fence.now,
            },
          });
          if (matchesProfile(profile, request))
            await tx
              .collection('profiles')
              .doc(request.owner_openid)
              .update({ data: { deletion_status: 'manual_review', updated_at: fence.now } });
          return false;
        }
        await collection.doc(id).update({
          data: {
            attempts,
            lease_id: fence.leaseId,
            lease_expires_at: new Date(fence.now.getTime() + LEASE_MS),
            retry_at: new Date(fence.now.getTime() + LEASE_MS),
            status: 'processing',
            updated_at: fence.now,
          },
        });
        return true;
      }),
    process: (id, fence, limit = ROW_BATCH) =>
      db.runTransaction(async (tx) => {
        const requests = tx.collection('privacy_requests');
        const request = await get(requests, id);
        if (!fenced(request, fence)) return false;
        const profiles = tx.collection('profiles');
        const profile = await get(profiles, request.owner_openid);
        if (!canProcess(profile, request)) return false;
        const bounded = Math.max(1, Math.min(ROW_BATCH, limit));
        const { now } = fence;
        const stravaStore = createStravaStore(db);
        if (!request.strava_generation) {
          const strava = await stravaStore.disconnectTx(
            tx,
            request.owner_openid,
            now,
            request.generation,
          );
          request.strava_generation = strava.generation;
        }
        const cursors = { ...request.cursors };
        let phase = request.phase;
        let status = 'processing';
        if (phase === 'registrations' || phase === 'restricted') {
          const rows = await page(
            tx,
            'registrations',
            { openid: request.owner_openid },
            cursors[phase],
            bounded,
          );
          for (const row of rows) {
            if ((row.profile_generation || row.privacy_generation || 1) > request.generation)
              continue;
            const activity = row.activity_id
              ? await get(tx.collection('activities'), row.activity_id)
              : undefined;
            const restricted = registrationNeedsContact(row, activity, now);
            const retained = retainSnapshotTargets(request, row.profile_snapshot);
            const data = {
              ...row,
              profile_snapshot: retained ? {} : row.profile_snapshot,
              privacy_generation: request.generation,
              privacy_public_suppressed: true,
              ...(restricted
                ? {
                    privacy_contact: {
                      ...contactFields(
                        row.privacy_contact ||
                          (matchesProfile(profile, request) ? profile : row.profile_snapshot),
                      ),
                      basis: 'active_event_contact',
                    },
                  }
                : {}),
              ...(row.options ? { options: { ...row.options, remark: '' } } : {}),
              updated_at: now,
            };
            if (!restricted) delete data.privacy_contact;
            await tx
              .collection('registrations')
              .doc(row._id)
              .set({ data: withoutId(data) });
            if (restricted) request.restricted_found = true;
          }
          if (rows.length) cursors[phase] = rows.at(-1)._id;
          if (rows.length < bounded) {
            if (phase === 'registrations') {
              if (matchesProfile(profile, request))
                await profiles
                  .doc(request.owner_openid)
                  .set({ data: withoutId(scrubProfile(profile)) });
              phase = 'media';
            } else if (request.restricted_found) {
              phase = 'restricted';
              status = 'restricted';
              cursors.restricted = '';
              request.restricted_found = false;
            } else {
              phase = 'verify_media';
              cursors.verify_media = '';
              request.pending_media = false;
            }
          }
        } else if (phase === 'media' || phase === 'imports') {
          const name = phase === 'media' ? 'profile_media' : 'profile_media_imports';
          const rows = await page(
            tx,
            name,
            { owner_openid: request.owner_openid },
            cursors[phase],
            bounded,
          );
          for (const row of rows) await enroll(tx, name, row, request, now);
          if (rows.length) cursors[phase] = rows.at(-1)._id;
          if (rows.length < bounded) phase = phase === 'media' ? 'imports' : 'targets';
        } else if (phase === 'targets') {
          const offset = Number(cursors.targets || 0);
          const targets = (request.media_targets || []).slice(offset, offset + bounded);
          for (const target of targets) {
            const direct = await get(
              tx.collection('profile_media'),
              crypto.createHash('sha256').update(target).digest('hex'),
            );
            if (direct?.privacy_request_id === id) continue;
            const match = await tx
              .collection('profile_media')
              .where({
                privacy_request_id: id,
                canonical_file_id: target,
              })
              .limit(1)
              .get();
            if (match.data.length) continue;
            const intents = await tx
              .collection('profile_media_imports')
              .where({ privacy_request_id: id, file_id: target })
              .limit(1)
              .get();
            if (!intents.data.length) request.manual_required = true;
          }
          cursors.targets = offset + targets.length;
          if (targets.length < bounded) phase = 'verify_media';
        } else if (phase === 'verify_media' || phase === 'verify_imports') {
          const name = phase === 'verify_media' ? 'profile_media' : 'profile_media_imports';
          const rows = await page(tx, name, { privacy_request_id: id }, cursors[phase], bounded);
          for (const row of rows) {
            if (
              row.status !== 'deleted' ||
              (request.replay_epoch &&
                (row.privacy_replay_epoch !== request.replay_epoch ||
                  row.privacy_deleted_epoch !== request.replay_epoch))
            )
              request.pending_media = true;
            if (
              ['privacy_manual_review', 'delete_failed_terminal', 'invalid', 'aborted'].includes(
                row.status,
              )
            )
              request.manual_required = true;
          }
          if (rows.length) cursors[phase] = rows.at(-1)._id;
          if (rows.length < bounded) {
            if (phase === 'verify_media') phase = 'verify_imports';
            else if (request.manual_required) status = 'manual_review';
            else if (request.pending_media) {
              status = 'awaiting_media';
              phase = 'verify_media';
              cursors.verify_media = '';
              cursors.verify_imports = '';
              request.pending_media = false;
            } else {
              phase = 'restricted';
              cursors.restricted = '';
              request.restricted_found = false;
              // A final full registration pass catches active contacts after media compensation.
              if (request.contact_checked) {
                phase = 'strava_revocation';
              } else request.contact_checked = true;
            }
          }
        } else if (phase === 'strava_revocation') {
          const strava = await stravaStore.deletionStatusTx(
            tx,
            request.owner_openid,
            request.strava_generation,
            request.generation,
          );
          if (strava.revocation_complete) {
            status = 'completed';
            phase = 'done';
          } else status = strava.state === 'manual_review' ? 'manual_review' : 'retryable';
        }
        if (status === 'restricted') request.contact_checked = false;
        const terminal = ['completed', 'manual_review'].includes(status);
        const retryAt = terminal
          ? null
          : ['restricted', 'awaiting_media'].includes(status)
            ? new Date(now.getTime() + 10 * 60 * 1000)
            : now;
        await requests.doc(id).update({
          data: {
            phase,
            status,
            cursors,
            attempts: 0,
            manual_required: request.manual_required === true,
            pending_media: request.pending_media === true,
            restricted_found: request.restricted_found === true,
            contact_checked: request.contact_checked === true,
            media_targets: request.media_targets || [],
            strava_generation: request.strava_generation,
            lease_id: '',
            lease_expires_at: null,
            retry_at: retryAt,
            last_error_code:
              phase === 'strava_revocation' && status !== 'completed'
                ? 'STRAVA_REVOCATION_INCOMPLETE'
                : status === 'manual_review'
                  ? 'PRIVACY_MEDIA_MANUAL_REVIEW'
                  : '',
            ...(status === 'completed' ? { completed_at: now } : {}),
            updated_at: now,
          },
        });
        if (matchesProfile(profile, request))
          await profiles
            .doc(request.owner_openid)
            .update({ data: { deletion_status: status, updated_at: now } });
        return true;
      }),
    markFailed: (id, fence) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('privacy_requests');
        const request = await get(collection, id);
        if (!fenced(request, fence)) return false;
        const attempts = Number(request.attempts || 0) + 1;
        const status = attempts >= MAX_ATTEMPTS ? 'manual_review' : 'retryable';
        await collection.doc(id).update({
          data: {
            attempts,
            status,
            last_error_code: 'PRIVACY_BATCH_FAILED',
            retry_at:
              status === 'manual_review'
                ? null
                : new Date(fence.now.getTime() + 5 * 60 * 1000 * 2 ** attempts),
            lease_id: '',
            lease_expires_at: null,
            updated_at: fence.now,
          },
        });
        const profile = await get(tx.collection('profiles'), request.owner_openid);
        if (
          profile?.deletion_request_id === id &&
          profileGeneration(profile) === request.generation
        )
          await tx
            .collection('profiles')
            .doc(request.owner_openid)
            .update({ data: { deletion_status: status, updated_at: fence.now } });
        return true;
      }),
    replayDeletion: (id, now) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('privacy_requests');
        const request = await get(collection, id);
        if (!request || request.kind !== 'profile_deletion')
          return { status: 'blocked', code: 'DELETION_NOT_FOUND' };
        if (request.replay_epoch && RUNNABLE.includes(request.status))
          return { status: 'already_running', generation: request.generation };
        if (request.status !== 'completed')
          return { status: 'blocked', code: 'DELETION_NOT_COMPLETED' };
        const profiles = tx.collection('profiles');
        const profile = await get(profiles, request.owner_openid);
        if (
          profile &&
          profileGeneration(profile) <= request.generation &&
          profile.deletion_status &&
          profile.deletion_status !== 'active' &&
          profile.deletion_request_id !== id
        )
          return { status: 'blocked', code: 'PROFILE_REQUEST_CONFLICT' };
        if (!profile || profileGeneration(profile) <= request.generation) {
          if (!retainSnapshotTargets(request, profile))
            return { status: 'blocked', code: 'MEDIA_TARGET_ACCOUNTING_LIMIT' };
          await profiles.doc(request.owner_openid).set({
            data: {
              ...withoutId(scrubProfile(profile || {}, true)),
              generation: request.generation,
              deletion_status: 'requested',
              deletion_request_id: id,
              updated_at: now,
            },
          });
        }
        await collection.doc(id).update({
          data: {
            status: 'requested',
            phase: 'registrations',
            cursors: {},
            attempts: 0,
            retry_at: now,
            lease_id: '',
            lease_expires_at: null,
            manual_required: false,
            pending_media: false,
            restricted_found: false,
            contact_checked: false,
            replay_epoch: crypto.randomUUID(),
            media_targets: request.media_targets || [],
            completed_at: null,
            updated_at: now,
          },
        });
        return { status: 'queued', generation: request.generation };
      }),
  };
  return store;
}
module.exports = { createPrivacyStore, PERSONAL_CATEGORIES, REFERENCES };
