'use strict';

const {
  ProfileError,
  isOwnerMedia,
  mediaPath,
  mediaDocumentId,
  clientUploadIntentId,
  clientUploadIntent,
  canonicalUploadIntent,
  canonicalUploadIntentId,
  canonicalMediaBinding,
  registeredMedia,
  assertMediaSecurityPassed,
  validateAvatarSelection,
  writableDocument,
} = require('./core');
const { assertProfileWritable, profileGeneration } = require('./privacy-contract');

function profileReferencesMedia(profile, fileId) {
  if (!profile || typeof profile !== 'object') return false;
  if (profile.avatar_file_id === fileId) return true;
  if (profile.background_photo && profile.background_photo.file_id === fileId) return true;
  return (Array.isArray(profile.photos) ? profile.photos : []).some(
    (item) => item && item.file_id === fileId,
  );
}

const FINAL_SECURITY_STATUSES = new Set(['pass', 'review', 'risky']);

function sameMediaCheckBinding(trace, media) {
  return Boolean(
    trace &&
    media &&
    trace.media_id === media._id &&
    trace.owner_openid === media.owner_openid &&
    trace.category === media.category &&
    trace.generation === media.generation &&
    trace.canonical_file_id === media.canonical_file_id &&
    trace.sha256 === media.sha256,
  );
}

function mediaCheckDto(media, trace) {
  if (!media) return undefined;
  const securityStatus = media.security_status || 'missing';
  return {
    mediaId: media._id,
    fileId: media.file_id,
    canonicalFileId: media.canonical_file_id || '',
    category: media.category,
    generation: media.generation,
    securityStatus,
    traceId: media.security_trace_id || '',
    retryable: securityStatus === 'retryable',
    activated: media.status === 'active' && securityStatus === 'pass',
    ...(media.security_error_code ? { errorCode: media.security_error_code } : {}),
    attempts:
      Number.isSafeInteger(trace?.attempts) && trace.attempts >= 0 ? trace.attempts : undefined,
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

function createProfileStore(db) {
  const findMediaByFileId = async (collection, openid, fileId) => {
    if (!fileId) return undefined;
    const direct = await get(collection, mediaDocumentId(fileId));
    if (direct && direct.owner_openid === openid) return direct;
    const result =
      typeof collection.where === 'function'
        ? await collection.where({ canonical_file_id: fileId, owner_openid: openid }).limit(2).get()
        : { data: [] };
    return Array.isArray(result?.data) && result.data.length === 1 ? result.data[0] : undefined;
  };
  return {
    getMedia: (id) => get(db.collection('profile_media'), id),
    getClientUpload: (id) => get(db.collection('profile_media_imports'), id),
    assertWritable: (openid, generation) =>
      db.runTransaction(async (tx) =>
        assertProfileWritable(await get(tx.collection('profiles'), openid), generation),
      ),
    prepareClientUpload: (openid, intent, secretValue, generation) =>
      db.runTransaction(async (tx) => {
        const profile = await get(tx.collection('profiles'), openid);
        const currentGeneration = assertProfileWritable(profile, generation);
        const imports = tx.collection('profile_media_imports');
        if (
          !intent ||
          intent.kind !== 'client_upload' ||
          intent.owner_openid !== openid ||
          intent.status !== 'prepared' ||
          !isOwnerMedia(`cloud://intent/${intent.cloud_path}`, openid, secretValue) ||
          intent._id !== clientUploadIntentId(intent.cloud_path) ||
          !Number.isFinite(new Date(intent.created_at).getTime()) ||
          !Number.isFinite(new Date(intent.cleanup_after).getTime()) ||
          new Date(intent.cleanup_after) <= new Date(intent.created_at)
        )
          throw new ProfileError('MEDIA_UPLOAD_INTENT_INVALID', '媒体上传凭据无效');
        const existing = await get(imports, intent._id);
        if (existing) {
          assertProfileWritable(profile, existing.generation);
          if (
            existing.kind === 'client_upload' &&
            existing.owner_openid === openid &&
            existing.cloud_path === intent.cloud_path &&
            existing.status === 'prepared'
          )
            return existing;
          throw new ProfileError('MEDIA_UPLOAD_INTENT_CONFLICT', '媒体上传凭据冲突');
        }
        const bound = { ...intent, generation: currentGeneration };
        await imports.doc(intent._id).set({ data: writableDocument(bound) });
        return bound;
      }),
    prepareCanonicalUpload: (openid, sourceIntentId, intent, secretValue, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const currentProfile = await get(tx.collection('profiles'), openid);
        assertProfileWritable(currentProfile, intent.generation);
        const imports = tx.collection('profile_media_imports');
        const expectedCanonical = canonicalUploadIntent(
          openid,
          intent.source_file_id,
          {
            sha256: intent.sha256,
            size: intent.size,
            mime: intent.mime,
            extension: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[
              intent.mime
            ],
          },
          secretValue,
          intent.created_at,
          intent.category || '',
        );
        if (
          intent._id !== expectedCanonical._id ||
          intent.cloud_path !== expectedCanonical.cloud_path ||
          intent.owner_openid !== openid ||
          intent.kind !== 'canonical_upload' ||
          intent.status !== 'prepared'
        )
          throw new ProfileError('MEDIA_UPLOAD_INTENT_INVALID', '媒体上传凭据无效');
        let sourceIntent = await get(imports, sourceIntentId);
        if (sourceIntent) assertProfileWritable(currentProfile, sourceIntent.generation);
        let reopenedLegacySource = false;
        if (!sourceIntent) {
          const expectedSourceIntentId = clientUploadIntentId(mediaPath(intent.source_file_id));
          if (sourceIntentId !== expectedSourceIntentId)
            throw new ProfileError('MEDIA_UPLOAD_INTENT_INVALID', '媒体上传凭据无效');
          sourceIntent = clientUploadIntent(
            openid,
            mediaPath(intent.source_file_id),
            secretValue,
            now,
          );
          sourceIntent.file_id = intent.source_file_id;
          sourceIntent.media_id = mediaDocumentId(intent.source_file_id);
          await imports.doc(sourceIntentId).set({ data: writableDocument(sourceIntent) });
        } else if (
          sourceIntent.kind === 'client_upload' &&
          sourceIntent.status === 'completed' &&
          sourceIntentId === clientUploadIntentId(mediaPath(intent.source_file_id)) &&
          sourceIntent.owner_openid === openid &&
          sourceIntent.cloud_path === mediaPath(intent.source_file_id) &&
          sourceIntent.file_id === intent.source_file_id &&
          sourceIntent.media_id === mediaDocumentId(intent.source_file_id) &&
          sourceIntent.canonical_intent_id === intent._id &&
          sourceIntent.canonical_path === intent.cloud_path &&
          !sourceIntent.canonical_file_id
        ) {
          const mediaId = mediaDocumentId(intent.source_file_id);
          const mediaRecord = await get(tx.collection('profile_media'), mediaId);
          const profile = await get(tx.collection('profiles'), openid);
          const hasCanonicalBinding =
            mediaRecord &&
            ['canonical_file_id', 'sha256', 'size', 'mime', 'canonical_category'].some((field) =>
              Object.prototype.hasOwnProperty.call(mediaRecord, field),
            );
          if (
            !mediaRecord ||
            mediaRecord._id !== mediaId ||
            mediaRecord.file_id !== intent.source_file_id ||
            mediaRecord.owner_openid !== openid ||
            mediaRecord.status !== 'active' ||
            hasCanonicalBinding ||
            !profileReferencesMedia(profile, intent.source_file_id)
          )
            throw new ProfileError('MEDIA_UPLOAD_INTENT_INVALID', '媒体上传凭据无效');
          sourceIntent = {
            ...clientUploadIntent(openid, mediaPath(intent.source_file_id), secretValue, now),
            file_id: intent.source_file_id,
            media_id: mediaId,
          };
          reopenedLegacySource = true;
          await imports.doc(sourceIntentId).set({ data: writableDocument(sourceIntent) });
        }
        const clientSource =
          sourceIntent.kind === 'client_upload' &&
          sourceIntent.status === 'prepared' &&
          sourceIntentId === clientUploadIntentId(mediaPath(intent.source_file_id));
        if (
          !clientSource ||
          sourceIntent.owner_openid !== openid ||
          sourceIntent.cloud_path !== mediaPath(intent.source_file_id) ||
          (sourceIntent.canonical_intent_id && sourceIntent.canonical_intent_id !== intent._id)
        )
          throw new ProfileError('MEDIA_UPLOAD_INTENT_INVALID', '媒体上传凭据无效');
        const existing = await get(imports, intent._id);
        const reopenCanonical =
          reopenedLegacySource &&
          existing?.status === 'deleted' &&
          existing.kind === 'canonical_upload' &&
          existing.owner_openid === openid &&
          existing.source_file_id === intent.source_file_id &&
          existing.cloud_path === intent.cloud_path &&
          existing.sha256 === intent.sha256 &&
          existing.size === intent.size &&
          existing.mime === intent.mime;
        if (
          existing &&
          (existing.kind !== 'canonical_upload' ||
            existing.owner_openid !== openid ||
            existing.source_file_id !== intent.source_file_id ||
            existing.cloud_path !== intent.cloud_path ||
            existing.sha256 !== intent.sha256 ||
            existing.size !== intent.size ||
            existing.mime !== intent.mime ||
            (existing.status !== 'prepared' && !reopenCanonical))
        )
          throw new ProfileError('MEDIA_UPLOAD_INTENT_CONFLICT', '媒体上传凭据冲突');
        if (!existing || reopenCanonical)
          await imports.doc(intent._id).set({ data: writableDocument(intent) });
        await imports.doc(sourceIntentId).update({
          data: {
            canonical_intent_id: intent._id,
            canonical_path: intent.cloud_path,
            file_id: intent.source_file_id,
            media_id: mediaDocumentId(intent.source_file_id),
            sha256: intent.sha256,
            size: intent.size,
            mime: intent.mime,
            updated_at: db.serverDate(),
          },
        });
        return !existing || reopenCanonical ? intent : existing;
      }),
    completeClientMedia: (
      openid,
      fileId,
      sourceIntentId,
      canonicalIntentId,
      binding,
      secretValue,
      buildRecord,
      now = new Date(),
    ) =>
      db.runTransaction(async (tx) => {
        const profile = await get(tx.collection('profiles'), openid);
        const canonical = canonicalMediaBinding(
          openid,
          fileId,
          binding?.canonical_file_id,
          {
            sha256: binding?.sha256,
            size: binding?.size,
            mime: binding?.mime,
            extension: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[
              binding?.mime
            ],
          },
          secretValue,
          binding?.canonical_category || '',
        );
        const expectedSourceIntentId = clientUploadIntentId(mediaPath(fileId));
        const expectedCanonicalIntentId = canonicalUploadIntentId(
          mediaPath(canonical.canonical_file_id),
        );
        if (
          sourceIntentId !== expectedSourceIntentId ||
          canonicalIntentId !== expectedCanonicalIntentId
        )
          throw new ProfileError('MEDIA_UPLOAD_INTENT_INVALID', '媒体上传凭据无效');
        const imports = tx.collection('profile_media_imports');
        const sourceIntent = await get(imports, sourceIntentId);
        const canonicalIntent = await get(imports, canonicalIntentId);
        assertProfileWritable(profile, sourceIntent?.generation);
        assertProfileWritable(profile, canonicalIntent?.generation);
        if (
          !sourceIntent ||
          sourceIntent.kind !== 'client_upload' ||
          sourceIntent.owner_openid !== openid ||
          sourceIntent.cloud_path !== mediaPath(fileId) ||
          sourceIntent.status !== 'prepared' ||
          sourceIntent.canonical_intent_id !== canonicalIntentId ||
          sourceIntent.canonical_path !== mediaPath(canonical.canonical_file_id) ||
          sourceIntent.sha256 !== canonical.sha256 ||
          sourceIntent.size !== canonical.size ||
          sourceIntent.mime !== canonical.mime ||
          !canonicalIntent ||
          canonicalIntent.kind !== 'canonical_upload' ||
          canonicalIntent.owner_openid !== openid ||
          canonicalIntent.source_file_id !== fileId ||
          canonicalIntent.cloud_path !== mediaPath(canonical.canonical_file_id) ||
          canonicalIntent.status !== 'prepared'
        )
          throw new ProfileError('MEDIA_UPLOAD_INTENT_INVALID', '媒体上传凭据无效');
        const media = tx.collection('profile_media');
        const mediaId = mediaDocumentId(fileId);
        const existing = await get(media, mediaId);
        const record = { ...buildRecord(existing), generation: profileGeneration(profile) };
        if (!existing) {
          const { _id, ...data } = record;
          await media.doc(_id).set({ data });
        } else {
          await media.doc(mediaId).set({ data: writableDocument(record) });
        }
        const completed = {
          status: 'completed',
          file_id: fileId,
          media_id: mediaId,
          canonical_file_id: canonical.canonical_file_id,
          completed_at: now,
          cleanup_after: null,
          updated_at: db.serverDate(),
        };
        const sourceCleanup = {
          ...completed,
          status: 'uploaded',
          cleanup_after: new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000),
        };
        await imports.doc(sourceIntentId).update({ data: sourceCleanup });
        await imports.doc(canonicalIntentId).update({ data: completed });
        return record;
      }),
    persistMediaCheckSubmission: (openid, mediaId, trace, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const media = tx.collection('profile_media');
        const traces = tx.collection('content_media_checks');
        const current = await get(media, mediaId);
        if (
          !current ||
          current._id !== mediaId ||
          current.owner_openid !== openid ||
          !sameMediaCheckBinding(trace, current) ||
          FINAL_SECURITY_STATUSES.has(current.security_status)
        )
          throw new ProfileError('MEDIA_CHECK_BINDING_STALE', '图片审核绑定已失效');
        const previousTrace = current.security_trace_id
          ? await get(traces, current.security_trace_id)
          : undefined;
        const attempts =
          Number.isSafeInteger(trace.attempts) && trace.attempts > 1
            ? trace.attempts
            : (Number.isSafeInteger(previousTrace?.attempts) ? previousTrace.attempts : 0) + 1;
        const document = {
          ...trace,
          attempts,
          status: 'pending',
          submitted_at: trace.submitted_at || now,
          updated_at: now,
        };
        await traces.doc(document._id).set({ data: writableDocument(document) });
        await media.doc(mediaId).update({
          data: {
            security_status: 'pending',
            security_trace_id: document.trace_id,
            security_error_code: '',
            security_submitted_at: document.submitted_at,
            updated_at: now,
          },
        });
        return mediaCheckDto(
          { ...current, security_status: 'pending', security_trace_id: document.trace_id },
          document,
        );
      }),
    markMediaCheckRetryable: (openid, mediaId, error, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const media = tx.collection('profile_media');
        const current = await get(media, mediaId);
        if (
          !current ||
          current.owner_openid !== openid ||
          FINAL_SECURITY_STATUSES.has(current.security_status)
        )
          throw new ProfileError('MEDIA_CHECK_BINDING_STALE', '图片审核绑定已失效');
        const code = String(error?.code || 'MEDIA_CHECK_RETRY');
        await media.doc(mediaId).update({
          data: {
            security_status: 'retryable',
            security_error_code: code,
            security_failed_at: now,
            updated_at: now,
          },
        });
        return mediaCheckDto({
          ...current,
          security_status: 'retryable',
          security_error_code: code,
        });
      }),
    mediaStatus: (openid, fileId) =>
      db.runTransaction(async (tx) => {
        const media = tx.collection('profile_media');
        const traces = tx.collection('content_media_checks');
        const current = await findMediaByFileId(media, openid, fileId);
        if (!current) throw new ProfileError('MEDIA_NOT_FOUND', '媒体登记不存在');
        const trace = current.security_trace_id
          ? await get(traces, current.security_trace_id)
          : undefined;
        return mediaCheckDto(current, trace);
      }),
    mediaForCheckRetry: (openid, fileId, generation) =>
      db.runTransaction(async (tx) => {
        const media = tx.collection('profile_media');
        const traces = tx.collection('content_media_checks');
        const current = await findMediaByFileId(media, openid, fileId);
        if (!current) throw new ProfileError('MEDIA_NOT_FOUND', '媒体登记不存在');
        const profile = await get(tx.collection('profiles'), openid);
        const currentGeneration = assertProfileWritable(profile, generation);
        if (generation !== currentGeneration)
          throw new ProfileError('PROFILE_GENERATION_MISMATCH', '资料版本已变化，请重新读取');
        assertProfileWritable(profile, current.generation);
        if (current.security_status !== 'retryable')
          throw new ProfileError('MEDIA_RETRY_NOT_ALLOWED', '当前图片状态不可重试');
        const trace = current.security_trace_id
          ? await get(traces, current.security_trace_id)
          : undefined;
        if (Number.isSafeInteger(trace?.attempts) && trace.attempts >= 2)
          throw new ProfileError('MEDIA_RETRY_EXHAUSTED', '图片审核重试次数已用尽');
        if (!current.canonical_file_id || !current.sha256)
          throw new ProfileError('MEDIA_CHECK_INPUT_INVALID', '图片审核参数无效');
        return current;
      }),
    setAvatar: (openid, source, fileId, secretValue, now = new Date(), generation) =>
      db.runTransaction(async (tx) => {
        const profiles = tx.collection('profiles');
        const media = tx.collection('profile_media');
        const current = (await get(profiles, openid)) || {};
        assertProfileWritable(current, generation);
        const findMedia = (referencedFileId) => findMediaByFileId(media, openid, referencedFileId);
        const selectedRecord = await findMedia(fileId);
        assertProfileWritable(current, selectedRecord?.generation);
        const selectedId = selectedRecord?._id || '';
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
          ? ['wechat', 'custom'].includes(current.avatar_source)
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
        assertMediaSecurityPassed(selectedRecord);
        const previousFileId = current.avatar_file_id;
        const previous =
          previousFileId && !profileReferencesMedia({ avatar_file_id: fileId }, previousFileId)
            ? await findMedia(previousFileId)
            : undefined;
        const previousId = previous?._id || '';
        const updatedAt = db.serverDate();
        const avatarRevision = nextAvatarRevision(current);
        const next = writableDocument({
          ...current,
          _id: openid,
          avatar_source: source,
          avatar_file_id: fileId,
          avatar_revision: avatarRevision,
          avatar_visibility: 'private',
          avatar_visibility_revision: null,
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
        const retainedByProfile = profileReferencesMedia(
          { ...current, avatar_file_id: undefined },
          previousFileId,
        );
        if (
          previous &&
          previousId !== selectedId &&
          !retainedByProfile &&
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
    mergePhone: (openid, fields, generation) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profiles');
        const current = await get(collection, openid);
        assertProfileWritable(current, generation);
        const updatedAt = db.serverDate();
        const patch = { ...fields, updated_at: updatedAt };
        if (current) await collection.doc(openid).update({ data: patch });
        else await collection.doc(openid).set({ data: patch });
        return { ...(current || {}), ...patch };
      }),
  };
}

module.exports = { missing, get, profileReferencesMedia, createProfileStore };
