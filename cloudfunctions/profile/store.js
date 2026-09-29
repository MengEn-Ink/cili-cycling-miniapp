'use strict';

const {
  ProfileError,
  isOwnerMedia,
  mediaPath,
  mediaDocumentId,
  avatarUrlFingerprint,
  mediaRegistration,
  registeredMedia,
  validateAvatarSelection,
  writableDocument,
} = require('./core');

function staleImport() {
  throw new ProfileError('STRAVA_AVATAR_STALE', 'Strava 头像导入已失效');
}

function busyImport() {
  throw new ProfileError('STRAVA_AVATAR_BUSY', '已有 Strava 头像导入正在进行');
}

function matchesAvatarFingerprint(value, expected) {
  try {
    return avatarUrlFingerprint(value) === expected;
  } catch {
    return false;
  }
}

function sameInstant(left, right) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function validCredential(current, fence, openid, requireLease = true) {
  return Boolean(
    current &&
    fence &&
    current._id === openid &&
    current.openid === openid &&
    current.athlete_id === fence.athlete_id &&
    current.credential_generation === fence.credential_generation &&
    matchesAvatarFingerprint(current.athlete_avatar_url, fence.avatar_url_fingerprint) &&
    (!requireLease ||
      (current.avatar_import_lease_id === fence.intent_id &&
        sameInstant(current.avatar_import_lease_expires_at, fence.lease_expires_at))),
  );
}

function sameCredentialIdentity(current, expected, openid) {
  return Boolean(
    current &&
    expected &&
    current._id === openid &&
    current.openid === openid &&
    current.athlete_id === expected.athlete_id &&
    current.athlete_avatar_url === expected.athlete_avatar_url,
  );
}

function validIntent(intent, openid, fence, statuses) {
  return Boolean(
    intent &&
    fence &&
    intent._id === fence.intent_id &&
    intent.owner_openid === openid &&
    intent.athlete_id === fence.athlete_id &&
    intent.credential_generation === fence.credential_generation &&
    intent.avatar_url_fingerprint === fence.avatar_url_fingerprint &&
    sameInstant(intent.lease_expires_at, fence.lease_expires_at) &&
    statuses.includes(intent.status),
  );
}

function fenceFromIntent(intent) {
  return {
    intent_id: intent?._id,
    credential_generation: intent?.credential_generation,
    athlete_id: intent?.athlete_id,
    avatar_url_fingerprint: intent?.avatar_url_fingerprint,
    lease_expires_at: intent?.lease_expires_at,
  };
}

function nextAvatarRevision(profile) {
  const current =
    Number.isSafeInteger(profile?.avatar_revision) && profile.avatar_revision >= 0
      ? profile.avatar_revision
      : 0;
  if (current >= Number.MAX_SAFE_INTEGER)
    throw new ProfileError('AVATAR_REVISION_EXHAUSTED', '头像版本无法继续递增');
  return current + 1;
}

function missing(error) {
  const code = String(error?.errCode || error?.code || '');
  const message = String(error?.errMsg || error?.message || '');
  return (
    ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(code) ||
    (Number(error?.errCode) === -502001 && /document.+(?:not exist|not found)/i.test(message))
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

function createProfileStore(db) {
  const remove = () => db.command.remove();
  return {
    registerMedia: (id, buildRecord) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profile_media');
        const existing = await get(collection, id);
        const record = buildRecord(existing);
        if (!existing) {
          const { _id, ...data } = record;
          await collection.doc(_id).set({ data });
        } else if (
          !Object.prototype.hasOwnProperty.call(existing, 'origin') &&
          Object.prototype.hasOwnProperty.call(record, 'origin')
        ) {
          await collection.doc(id).update({ data: { origin: record.origin } });
        }
        return record;
      }),
    setAvatar: (openid, source, fileId, secretValue, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const profiles = tx.collection('profiles');
        const media = tx.collection('profile_media');
        const current = (await get(profiles, openid)) || {};
        const selectedId = mediaDocumentId(fileId);
        const selectedRecord = await get(media, selectedId);
        const selected = validateAvatarSelection(
          source,
          fileId,
          openid,
          secretValue,
          selectedRecord,
        );
        const backfillOrigin =
          selectedRecord && !Object.prototype.hasOwnProperty.call(selectedRecord, 'origin');
        const currentSource = current.avatar_file_id
          ? ['wechat', 'strava', 'custom'].includes(current.avatar_source)
            ? current.avatar_source
            : 'custom'
          : undefined;
        if (
          current.avatar_file_id === fileId &&
          currentSource === source &&
          selectedRecord.status === 'active' &&
          !backfillOrigin
        )
          return current;
        const previousFileId = current.avatar_file_id;
        const previousId = previousFileId ? mediaDocumentId(previousFileId) : '';
        const previous =
          previousId && previousId !== selectedId ? await get(media, previousId) : undefined;
        const updatedAt = db.serverDate();
        const next = writableDocument({
          ...current,
          _id: openid,
          avatar_source: source,
          avatar_file_id: fileId,
          avatar_revision: nextAvatarRevision(current),
          updated_at: updatedAt,
        });
        await profiles.doc(openid).set({ data: next });
        await media.doc(selectedId).update({
          data: {
            ...(backfillOrigin ? { origin: selected.origin } : {}),
            status: 'active',
            referenced_at: updatedAt,
            cleanup_after: null,
          },
        });
        const retainedByPhotos = (Array.isArray(current.photos) ? current.photos : []).some(
          (item) => item && item.file_id === previousFileId,
        );
        if (
          previous &&
          !retainedByPhotos &&
          registeredMedia(
            previous,
            { file_id: previousFileId, category: previous.category },
            openid,
          )
        ) {
          await media.doc(previousId).update({
            data: {
              status: 'unreferenced',
              referenced_at: null,
              cleanup_after: new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000),
              delete_lease_id: '',
              updated_at: updatedAt,
            },
          });
        }
        return next;
      }),
    prepareAvatarImport: (openid, expectedCredential, intent, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const credentials = tx.collection('strava_credentials');
        const imports = tx.collection('profile_media_imports');
        const current = await get(credentials, openid);
        if (!sameCredentialIdentity(current, expectedCredential, openid)) staleImport();
        const hasCurrentGeneration =
          Number.isSafeInteger(current.credential_generation) && current.credential_generation >= 1;
        if (
          hasCurrentGeneration &&
          current.credential_generation !== expectedCredential.credential_generation
        )
          staleImport();
        const generation = hasCurrentGeneration ? current.credential_generation : 1;
        const leasedIntent = { ...intent, credential_generation: generation };
        if (
          !leasedIntent ||
          typeof leasedIntent._id !== 'string' ||
          !leasedIntent._id ||
          leasedIntent.owner_openid !== openid ||
          leasedIntent.athlete_id !== current.athlete_id ||
          leasedIntent.avatar_url_fingerprint !==
            avatarUrlFingerprint(current.athlete_avatar_url) ||
          leasedIntent.status !== 'leased' ||
          !Number.isFinite(new Date(leasedIntent.lease_expires_at).getTime()) ||
          new Date(leasedIntent.lease_expires_at) <= now ||
          Object.prototype.hasOwnProperty.call(leasedIntent, 'cloud_path')
        )
          staleImport();
        const activeLeaseId = current.avatar_import_lease_id;
        const activeLeaseExpiresAt = new Date(current.avatar_import_lease_expires_at);
        const activeLease =
          typeof activeLeaseId === 'string' &&
          !!activeLeaseId &&
          Number.isFinite(activeLeaseExpiresAt.getTime()) &&
          activeLeaseExpiresAt > now;
        if (activeLease) {
          if (activeLeaseId !== leasedIntent._id) busyImport();
          const existing = await get(imports, activeLeaseId);
          if (validIntent(existing, openid, fenceFromIntent(leasedIntent), ['leased']))
            return existing;
          staleImport();
        }
        if (activeLeaseId) {
          const previousIntent = await get(imports, activeLeaseId);
          if (
            previousIntent &&
            previousIntent.owner_openid === openid &&
            !['completed', 'deleted', 'invalid', 'delete_failed_terminal'].includes(
              previousIntent.status,
            )
          ) {
            const hasUploadTarget =
              typeof previousIntent.cloud_path === 'string' && !!previousIntent.cloud_path;
            await imports.doc(activeLeaseId).update({
              data: {
                status: hasUploadTarget ? 'orphaned' : 'aborted',
                cleanup_after: hasUploadTarget ? now : null,
                last_error_code: 'STRAVA_AVATAR_LEASE_REPLACED',
                failed_at: now,
                updated_at: db.serverDate(),
              },
            });
          }
        }
        if (await get(imports, leasedIntent._id)) staleImport();
        await credentials.doc(openid).update({
          data: {
            credential_generation: generation,
            avatar_import_lease_id: leasedIntent._id,
            avatar_import_started_at: leasedIntent.created_at,
            avatar_import_lease_expires_at: leasedIntent.lease_expires_at,
          },
        });
        await imports.doc(leasedIntent._id).set({ data: writableDocument(leasedIntent) });
        return leasedIntent;
      }),
    prepareAvatarUpload: (openid, fence, cloudPath, secretValue, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const credential = await get(tx.collection('strava_credentials'), openid);
        const imports = tx.collection('profile_media_imports');
        const intent = await get(imports, fence?.intent_id);
        if (
          !validCredential(credential, fence, openid) ||
          !validIntent(intent, openid, fence, ['leased']) ||
          !isOwnerMedia(`cloud://env/${cloudPath}`, openid, secretValue)
        )
          staleImport();
        await imports.doc(fence.intent_id).update({
          data: {
            status: 'prepared',
            cloud_path: cloudPath,
            prepared_at: now,
            updated_at: db.serverDate(),
          },
        });
        return true;
      }),
    markAvatarImportUploaded: (openid, fence, fileId, secretValue, now) =>
      db.runTransaction(async (tx) => {
        const credential = await get(tx.collection('strava_credentials'), openid);
        const imports = tx.collection('profile_media_imports');
        const intent = await get(imports, fence?.intent_id);
        if (
          !validCredential(credential, fence, openid) ||
          !validIntent(intent, openid, fence, ['prepared']) ||
          !isOwnerMedia(fileId, openid, secretValue) ||
          mediaPath(fileId) !== intent.cloud_path
        )
          staleImport();
        await imports.doc(fence.intent_id).update({
          data: {
            status: 'uploaded',
            file_id: fileId,
            media_id: mediaDocumentId(fileId),
            uploaded_at: now,
            updated_at: db.serverDate(),
          },
        });
        return true;
      }),
    completeAvatarImport: (openid, fence, secretValue, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const credentials = tx.collection('strava_credentials');
        const imports = tx.collection('profile_media_imports');
        const media = tx.collection('profile_media');
        const profiles = tx.collection('profiles');
        const credential = await get(credentials, openid);
        const intent = await get(imports, fence?.intent_id);
        const currentProfile = (await get(profiles, openid)) || {};
        if (validIntent(intent, openid, fence, ['completed'])) {
          if (
            validCredential(credential, fence, openid, false) &&
            currentProfile.avatar_source === 'strava' &&
            currentProfile.avatar_file_id === intent.file_id
          )
            return currentProfile;
          staleImport();
        }
        if (
          !validCredential(credential, fence, openid) ||
          !validIntent(intent, openid, fence, ['uploaded'])
        )
          staleImport();
        const fileId = intent.file_id;
        if (
          !isOwnerMedia(fileId, openid, secretValue) ||
          mediaPath(fileId) !== intent.cloud_path ||
          intent.media_id !== mediaDocumentId(fileId)
        )
          staleImport();
        const selectedId = mediaDocumentId(fileId);
        const existingMedia = await get(media, selectedId);
        const selected = mediaRegistration(
          fileId,
          'other',
          'strava',
          openid,
          secretValue,
          now,
          existingMedia,
        );
        const previousFileId = currentProfile.avatar_file_id;
        const previousId = previousFileId ? mediaDocumentId(previousFileId) : '';
        const retainedByPhotos = (
          Array.isArray(currentProfile.photos) ? currentProfile.photos : []
        ).some((item) => item && item.file_id === previousFileId);
        const previous =
          previousId && previousId !== selectedId && !retainedByPhotos
            ? await get(media, previousId)
            : undefined;
        const updatedAt = db.serverDate();
        const activeMedia = writableDocument({
          ...selected,
          status: 'active',
          referenced_at: updatedAt,
          cleanup_after: null,
        });
        await media.doc(selectedId).set({ data: activeMedia });
        const next = writableDocument({
          ...currentProfile,
          _id: openid,
          avatar_source: 'strava',
          avatar_file_id: fileId,
          avatar_revision: nextAvatarRevision(currentProfile),
          updated_at: updatedAt,
        });
        await profiles.doc(openid).set({ data: next });
        if (
          previous &&
          registeredMedia(
            previous,
            { file_id: previousFileId, category: previous.category },
            openid,
          )
        ) {
          await media.doc(previousId).update({
            data: {
              status: 'unreferenced',
              referenced_at: null,
              cleanup_after: new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000),
              delete_lease_id: '',
              updated_at: updatedAt,
            },
          });
        }
        await imports.doc(fence.intent_id).update({
          data: {
            status: 'completed',
            completed_at: now,
            cleanup_after: null,
            updated_at: updatedAt,
          },
        });
        await credentials.doc(openid).update({
          data: {
            avatar_import_lease_id: remove(),
            avatar_import_started_at: remove(),
            avatar_import_lease_expires_at: remove(),
          },
        });
        return next;
      }),
    failAvatarImport: (openid, fence, fileId, errorCode, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const imports = tx.collection('profile_media_imports');
        const intent = await get(imports, fence?.intent_id);
        if (validIntent(intent, openid, fence, ['completed'])) return { completed: true };
        if (validIntent(intent, openid, fence, ['orphaned'])) return { orphaned: true };
        if (validIntent(intent, openid, fence, ['aborted'])) return { aborted: true };
        if (!validIntent(intent, openid, fence, ['leased', 'prepared', 'uploaded'])) staleImport();
        const hasFile = typeof fileId === 'string' && !!fileId;
        const hasUploadTarget = typeof intent.cloud_path === 'string' && !!intent.cloud_path;
        if (hasFile && (!hasUploadTarget || mediaPath(fileId) !== intent.cloud_path)) staleImport();
        const needsCleanup = hasFile || hasUploadTarget;
        await imports.doc(fence.intent_id).update({
          data: {
            status: needsCleanup ? 'orphaned' : 'aborted',
            ...(hasFile
              ? {
                  file_id: fileId,
                  media_id: mediaDocumentId(fileId),
                  cleanup_after: now,
                }
              : { cleanup_after: needsCleanup ? now : null }),
            last_error_code:
              typeof errorCode === 'string' && errorCode
                ? errorCode
                : 'STRAVA_AVATAR_IMPORT_FAILED',
            failed_at: now,
            updated_at: db.serverDate(),
          },
        });
        const credential = await get(tx.collection('strava_credentials'), openid);
        if (
          credential &&
          credential.credential_generation === fence.credential_generation &&
          credential.avatar_import_lease_id === fence.intent_id
        ) {
          await tx
            .collection('strava_credentials')
            .doc(openid)
            .update({
              data: {
                avatar_import_lease_id: remove(),
                avatar_import_started_at: remove(),
                avatar_import_lease_expires_at: remove(),
              },
            });
        }
        return needsCleanup ? { orphaned: true } : { aborted: true };
      }),
    mergePhone: (openid, fields) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profiles');
        const current = await get(collection, openid);
        const updatedAt = db.serverDate();
        const patch = { ...fields, updated_at: updatedAt };
        if (current) await collection.doc(openid).update({ data: patch });
        else await collection.doc(openid).set({ data: patch });
        return { ...(current || {}), ...patch };
      }),
  };
}

module.exports = { missing, get, createProfileStore };
