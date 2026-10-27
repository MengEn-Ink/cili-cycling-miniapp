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
  validateAvatarSelection,
  writableDocument,
} = require('./core');

function profileReferencesMedia(profile, fileId) {
  if (!profile || typeof profile !== 'object') return false;
  if (profile.avatar_file_id === fileId) return true;
  if (profile.background_photo && profile.background_photo.file_id === fileId) return true;
  return (Array.isArray(profile.photos) ? profile.photos : []).some(
    (item) => item && item.file_id === fileId,
  );
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

const FINAL_SECURITY_STATUSES = new Set(['pass', 'review', 'risky']);
const ACTIVE_SECURITY_STATUSES = new Set(['submitting', 'pending', 'submission_unknown']);
const NON_REVIEWABLE_MEDIA_STATUSES = new Set(['deleting', 'deleted', 'delete_failed_terminal']);

function validDate(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function mediaGeneration(record) {
  return Number.isSafeInteger(record?.generation) && record.generation >= 1 ? record.generation : 1;
}

function sameMediaCheckBinding(expected, current) {
  return Boolean(
    expected &&
    current &&
    expected.media_id === current._id &&
    expected.owner_openid === current.owner_openid &&
    expected.category === current.category &&
    expected.generation === mediaGeneration(current) &&
    expected.canonical_file_id === current.canonical_file_id &&
    expected.sha256 === current.sha256 &&
    !NON_REVIEWABLE_MEDIA_STATUSES.has(current.status),
  );
}

function mediaCheckError(code, message) {
  return new ProfileError(code, message);
}

function createProfileStore(db) {
  return {
    getMedia: (id) => get(db.collection('profile_media'), id),
    getClientUpload: (id) => get(db.collection('profile_media_imports'), id),
    prepareClientUpload: (openid, intent, secretValue) =>
      db.runTransaction(async (tx) => {
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
          if (
            existing.kind === 'client_upload' &&
            existing.owner_openid === openid &&
            existing.cloud_path === intent.cloud_path &&
            existing.status === 'prepared'
          )
            return existing;
          throw new ProfileError('MEDIA_UPLOAD_INTENT_CONFLICT', '媒体上传凭据冲突');
        }
        await imports.doc(intent._id).set({ data: writableDocument(intent) });
        return intent;
      }),
    prepareCanonicalUpload: (openid, sourceIntentId, intent, secretValue, now = new Date()) =>
      db.runTransaction(async (tx) => {
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
        const record = buildRecord(existing);
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
    reserveMediaCheck: (
      openid,
      binding,
      operationId,
      maxAttempts = 2,
      now = new Date(),
      submittingLeaseMs = 5 * 60 * 1000,
    ) =>
      db.runTransaction(async (tx) => {
        const media = tx.collection('profile_media');
        const operations = tx.collection('content_media_check_operations');
        const current = await get(media, binding.media_id);
        if (
          current?.owner_openid !== openid ||
          !sameMediaCheckBinding(binding, current) ||
          FINAL_SECURITY_STATUSES.has(current.security_status)
        )
          throw mediaCheckError('MEDIA_CHECK_BINDING_STALE', '图片审核绑定已失效');
        if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/u.test(operationId))
          throw mediaCheckError('MEDIA_CHECK_OPERATION_INVALID', '图片审核操作无效');
        if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5)
          throw mediaCheckError('MEDIA_CHECK_BUDGET_INVALID', '图片审核预算无效');
        if (
          !Number.isSafeInteger(submittingLeaseMs) ||
          submittingLeaseMs < 1000 ||
          submittingLeaseMs > 60 * 60 * 1000
        )
          throw mediaCheckError('MEDIA_CHECK_LEASE_INVALID', '图片审核租约无效');

        const existing = await get(operations, operationId);
        if (existing) {
          if (
            existing.operation_id !== operationId ||
            !sameMediaCheckBinding(existing, current) ||
            current.security_operation_id !== operationId ||
            current.security_attempts !== existing.attempt
          )
            throw mediaCheckError('MEDIA_CHECK_OPERATION_CONFLICT', '图片审核操作冲突');
          if (
            existing.status === 'pending' &&
            current.security_status === 'pending' &&
            existing.trace_id === current.security_trace_id
          )
            return { ...existing, completed: true };
          if (
            existing.status === 'submission_unknown' &&
            current.security_status === 'submission_unknown'
          )
            return { ...existing, unknown: true };
          if (
            existing.status === 'submitted' &&
            current.security_status === 'submitting' &&
            typeof existing.trace_id === 'string' &&
            existing.trace_id
          )
            return {
              ...existing,
              recoverable: true,
              trace: {
                _id: existing.trace_id,
                trace_id: existing.trace_id,
                ...binding,
                submitted_at: existing.submitted_at,
              },
            };
          if (existing.status === 'reserved' && current.security_status === 'submitting') {
            const reservedAt = validDate(existing.reserved_at || existing.created_at);
            if (
              reservedAt !== undefined &&
              new Date(now).getTime() - reservedAt < submittingLeaseMs
            )
              return { ...existing, replayed: true };
            await operations.doc(operationId).update({
              data: {
                status: 'submission_unknown',
                error_code: 'MEDIA_CHECK_SUBMISSION_UNKNOWN',
                lease_expired_at: now,
                updated_at: now,
              },
            });
            await media.doc(binding.media_id).update({
              data: {
                security_status: 'submission_unknown',
                security_error_code: 'MEDIA_CHECK_SUBMISSION_UNKNOWN',
                security_failed_at: now,
                updated_at: now,
              },
            });
            return {
              ...existing,
              status: 'submission_unknown',
              unknown: true,
              error_code: 'MEDIA_CHECK_SUBMISSION_UNKNOWN',
            };
          }
          throw mediaCheckError('MEDIA_CHECK_OPERATION_CONFLICT', '图片审核操作冲突');
        }
        if (ACTIVE_SECURITY_STATUSES.has(current.security_status))
          throw mediaCheckError('MEDIA_CHECK_IN_PROGRESS', '图片审核正在处理中');

        const attempt = Number.isSafeInteger(current.security_attempts)
          ? current.security_attempts + 1
          : 1;
        if (attempt > maxAttempts)
          throw mediaCheckError('MEDIA_CHECK_RETRY_EXHAUSTED', '图片审核重试次数已用尽');
        const operation = {
          _id: operationId,
          operation_id: operationId,
          ...binding,
          attempt,
          status: 'reserved',
          reserved_at: now,
          created_at: now,
          updated_at: now,
        };
        const { _id, ...operationData } = operation;
        await operations.doc(_id).set({ data: operationData });
        await media.doc(binding.media_id).update({
          data: {
            security_status: 'submitting',
            security_operation_id: operationId,
            security_attempts: attempt,
            security_error_code: '',
            security_reserved_at: now,
            updated_at: now,
          },
        });
        return operation;
      }),
    recordMediaCheckSubmission: (openid, binding, operationId, attempt, trace, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const media = tx.collection('profile_media');
        const operations = tx.collection('content_media_check_operations');
        const [current, operation] = await Promise.all([
          get(media, binding.media_id),
          get(operations, operationId),
        ]);
        const valid =
          current?.owner_openid === openid &&
          sameMediaCheckBinding(binding, current) &&
          sameMediaCheckBinding(operation, current) &&
          current.security_operation_id === operationId &&
          current.security_status === 'submitting' &&
          operation?.attempt === attempt &&
          trace?.media_id === binding.media_id &&
          trace?.owner_openid === binding.owner_openid &&
          trace?.category === binding.category &&
          trace?.generation === binding.generation &&
          trace?.canonical_file_id === binding.canonical_file_id &&
          trace?.sha256 === binding.sha256 &&
          typeof trace?.trace_id === 'string' &&
          trace.trace_id;
        if (!valid) throw mediaCheckError('MEDIA_CHECK_BINDING_STALE', '图片审核绑定已失效');
        if (operation.status === 'submitted') {
          if (operation.trace_id !== trace.trace_id)
            throw mediaCheckError('MEDIA_CHECK_OPERATION_CONFLICT', '图片审核操作冲突');
          return { ...operation, trace };
        }
        if (operation.status !== 'reserved')
          throw mediaCheckError('MEDIA_CHECK_OPERATION_CONFLICT', '图片审核操作冲突');
        const submittedAt = trace.submitted_at || now;
        await operations.doc(operationId).update({
          data: {
            status: 'submitted',
            trace_id: trace.trace_id,
            submitted_at: submittedAt,
            updated_at: now,
          },
        });
        return { ...operation, status: 'submitted', trace_id: trace.trace_id, submittedAt, trace };
      }),
    ackMediaCheckSubmission: (openid, binding, operationId, attempt, trace, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const media = tx.collection('profile_media');
        const operations = tx.collection('content_media_check_operations');
        const traces = tx.collection('content_media_checks');
        const [current, operation] = await Promise.all([
          get(media, binding.media_id),
          get(operations, operationId),
        ]);
        if (
          operation?.status === 'pending' &&
          current?.security_status === 'pending' &&
          operation.trace_id === trace?.trace_id &&
          current.security_trace_id === trace?.trace_id &&
          sameMediaCheckBinding(binding, current) &&
          sameMediaCheckBinding(operation, current)
        )
          return {
            status: 'pending',
            operationId,
            traceId: trace.trace_id,
            attempts: attempt,
          };
        if (
          current?.owner_openid !== openid ||
          !sameMediaCheckBinding(binding, current) ||
          !sameMediaCheckBinding(operation, current) ||
          !['reserved', 'submitted'].includes(operation?.status) ||
          (operation.status === 'submitted' && operation.trace_id !== trace?.trace_id) ||
          current.security_operation_id !== operationId ||
          current.security_status !== 'submitting' ||
          operation.attempt !== attempt ||
          trace?.media_id !== binding.media_id ||
          trace?.owner_openid !== binding.owner_openid ||
          trace?.category !== binding.category ||
          trace?.generation !== binding.generation ||
          trace?.canonical_file_id !== binding.canonical_file_id ||
          trace?.sha256 !== binding.sha256
        )
          throw mediaCheckError('MEDIA_CHECK_BINDING_STALE', '图片审核绑定已失效');

        const document = {
          ...trace,
          operation_id: operationId,
          attempts: attempt,
          status: 'pending',
          submitted_at: trace.submitted_at || now,
          updated_at: now,
        };
        await traces.doc(document._id).set({ data: writableDocument(document) });
        await operations.doc(operationId).update({
          data: { status: 'pending', trace_id: document.trace_id, updated_at: now },
        });
        await media.doc(binding.media_id).update({
          data: {
            security_status: 'pending',
            security_trace_id: document.trace_id,
            security_operation_id: operationId,
            security_submitted_at: document.submitted_at,
            updated_at: now,
          },
        });
        return {
          status: 'pending',
          operationId,
          traceId: document.trace_id,
          attempts: attempt,
        };
      }),
    failMediaCheckOperation: (openid, binding, operationId, error, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const media = tx.collection('profile_media');
        const operations = tx.collection('content_media_check_operations');
        const [current, operation] = await Promise.all([
          get(media, binding.media_id),
          get(operations, operationId),
        ]);
        if (
          current?.owner_openid !== openid ||
          !sameMediaCheckBinding(binding, current) ||
          !sameMediaCheckBinding(operation, current) ||
          operation?.status !== 'reserved' ||
          current.security_operation_id !== operationId ||
          current.security_status !== 'submitting'
        )
          return { status: 'ignored' };
        const code = String(error?.code || 'MEDIA_CHECK_RETRY');
        await operations.doc(operationId).update({
          data: { status: 'retryable', error_code: code, failed_at: now, updated_at: now },
        });
        await media.doc(binding.media_id).update({
          data: {
            security_status: 'retryable',
            security_error_code: code,
            security_failed_at: now,
            updated_at: now,
          },
        });
        return { status: 'retryable', operationId, errorCode: code };
      }),
    setAvatar: (openid, source, fileId, secretValue, now = new Date()) =>
      db.runTransaction(async (tx) => {
        const profiles = tx.collection('profiles');
        const media = tx.collection('profile_media');
        const current = (await get(profiles, openid)) || {};
        const findMedia = async (referencedFileId) => {
          if (!referencedFileId) return undefined;
          const direct = await get(media, mediaDocumentId(referencedFileId));
          if (direct) return direct;
          const result = await media
            .where({ canonical_file_id: referencedFileId, owner_openid: openid })
            .limit(2)
            .get();
          return Array.isArray(result?.data) && result.data.length === 1
            ? result.data[0]
            : undefined;
        };
        const selectedRecord = await findMedia(fileId);
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
          avatar_visibility: 'public',
          avatar_visibility_revision: avatarRevision,
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

module.exports = {
  missing,
  get,
  profileReferencesMedia,
  sameMediaCheckBinding,
  createProfileStore,
};
