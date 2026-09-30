'use strict';

const crypto = require('node:crypto');
const TIMER_TRIGGER = 'profile-media-cleanup-worker';
const MAX_BATCH = 20;
const DELETE_LEASE_MS = 5 * 60 * 1000;
const STORAGE_SETTLE_MARGIN_MS = 30 * 1000;
const RECOVERY_LEASE_MS = 5 * 60 * 1000;
const RECOVERY_CONFIRMATION_MS = RECOVERY_LEASE_MS;
const MAX_DELETE_ATTEMPTS = 3;
const RETRY_BASE_MS = 5 * 60 * 1000;

function coded(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function authorizeCleanup(event, openid) {
  if (openid || !event || event.Type !== 'Timer' || event.TriggerName !== TIMER_TRIGGER)
    coded('SERVICE_IDENTITY_REQUIRED', '仅允许配置的定时触发器调用媒体清理');
  return 'timer-worker';
}

function profileReferences(profile, fileId) {
  if (!profile || typeof profile !== 'object') return false;
  if (profile.avatar_file_id === fileId) return true;
  return (Array.isArray(profile.photos) ? profile.photos : []).some(
    (item) => item && item.file_id === fileId,
  );
}

function mediaOwnerPrefix(openid, secretValue) {
  const secret = String(secretValue || '').trim();
  if (typeof openid !== 'string' || !openid) coded('MEDIA_OWNER_INVALID', '媒体所有者无效');
  if (secret.length < 32) coded('MEDIA_SECRET_INVALID', '媒体路径服务未配置');
  const alias = crypto.createHmac('sha256', secret).update(openid).digest('hex').slice(0, 32);
  return `profiles/${alias}/`;
}

function validImportCloudPath(record, secretValue) {
  if (!record || typeof record.cloud_path !== 'string') return false;
  const prefix = mediaOwnerPrefix(record.owner_openid, secretValue);
  const filename = record.cloud_path.slice(prefix.length);
  return (
    record.cloud_path.startsWith(prefix) &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:jpg|png|webp)$/i.test(
      filename,
    )
  );
}

function validCanonicalIntentPath(record, secretValue) {
  if (
    !record ||
    record.kind !== 'canonical_upload' ||
    typeof record.source_file_id !== 'string' ||
    typeof record.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    !Number.isSafeInteger(record.size) ||
    record.size <= 0 ||
    record.size > 5 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(record.mime)
  )
    return false;
  const sourceSlash = record.source_file_id.indexOf('/', 'cloud://'.length);
  const sourcePath =
    record.source_file_id.startsWith('cloud://') && sourceSlash >= 0
      ? record.source_file_id.slice(sourceSlash + 1)
      : '';
  if (
    !validImportCloudPath(
      { owner_openid: record.owner_openid, cloud_path: sourcePath },
      secretValue,
    )
  )
    return false;
  const ownerAlias = mediaOwnerPrefix(record.owner_openid, secretValue).split('/')[1];
  const sourceDigest = crypto.createHash('sha256').update(record.source_file_id).digest('hex');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[record.mime];
  return (
    record.cloud_path ===
    `profile-canonical/${ownerAlias}/${sourceDigest}/${record.sha256}.${extension}`
  );
}

function validCanonicalMedia(record, secretValue) {
  if (!record || !record.canonical_file_id) return true;
  if (
    typeof record.file_id !== 'string' ||
    typeof record.owner_openid !== 'string' ||
    typeof record.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    !Number.isSafeInteger(record.size) ||
    record.size <= 0 ||
    record.size > 5 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(record.mime)
  )
    return false;
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[record.mime];
  const ownerAlias = mediaOwnerPrefix(record.owner_openid, secretValue).split('/')[1];
  const sourceDigest = crypto.createHash('sha256').update(record.file_id).digest('hex');
  const expectedPath = `profile-canonical/${ownerAlias}/${sourceDigest}/${record.sha256}.${extension}`;
  const slash = record.canonical_file_id.indexOf('/', 'cloud://'.length);
  const actualPath =
    record.canonical_file_id.startsWith('cloud://') && slash >= 0
      ? record.canonical_file_id.slice(slash + 1)
      : '';
  return actualPath === expectedPath;
}

function claimDecision(record, profile, now, leaseId, mediaSecret) {
  if (
    !record ||
    typeof record.owner_openid !== 'string' ||
    !record.owner_openid ||
    typeof record.file_id !== 'string' ||
    !record.file_id.startsWith('cloud://')
  )
    return null;
  const due = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date <= now;
  };
  const expiredDeleteLease = record.status === 'deleting' && due(record.delete_lease_expires_at);
  if (expiredDeleteLease && Number(record.delete_attempts || 0) >= MAX_DELETE_ATTEMPTS) {
    return {
      kind: 'terminal',
      update: failureDecision(record, now, 'DELETE_LEASE_EXHAUSTED'),
    };
  }
  const eligible =
    (record.status === 'unreferenced' && due(record.cleanup_after)) ||
    expiredDeleteLease ||
    (record.status === 'delete_failed' &&
      Number(record.delete_attempts || 0) < MAX_DELETE_ATTEMPTS &&
      due(record.retry_at));
  if (!eligible) return null;
  if (record.canonical_file_id && !validCanonicalMedia(record, mediaSecret)) {
    return {
      kind: 'terminal',
      update: failureDecision(record, now, 'CANONICAL_TARGET_INVALID'),
    };
  }
  if (profile && profile._id !== record.owner_openid) return null;
  if (profileReferences(profile, record.file_id)) {
    return {
      kind: 'referenced',
      update: {
        status: 'active',
        referenced_at: now,
        cleanup_after: null,
        delete_lease_id: '',
        updated_at: now,
      },
    };
  }
  return {
    kind: 'claimed',
    update: {
      status: 'deleting',
      delete_lease_id: leaseId,
      delete_claimed_at: now,
      delete_lease_expires_at: new Date(now.getTime() + DELETE_LEASE_MS),
      delete_attempts: Number(record.delete_attempts || 0) + 1,
      updated_at: now,
    },
  };
}

function importClaimDecision(record, profile, now, leaseId, mediaSecret) {
  if (!record || typeof record.owner_openid !== 'string' || !record.owner_openid) return null;
  const due = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date <= now;
  };
  if (record.status === 'leased' && due(record.cleanup_after)) {
    return {
      kind: 'aborted',
      update: {
        status: 'aborted',
        cleanup_after: null,
        last_error_code: 'STRAVA_AVATAR_LEASE_EXPIRED',
        failed_at: now,
        updated_at: now,
      },
    };
  }
  const cloudPathValid =
    record.kind === 'canonical_upload'
      ? validCanonicalIntentPath(record, mediaSecret)
      : validImportCloudPath(record, mediaSecret);
  const slash =
    typeof record.file_id === 'string' && record.file_id.startsWith('cloud://')
      ? record.file_id.indexOf('/', 'cloud://'.length)
      : -1;
  const filePath = slash >= 0 ? record.file_id.slice(slash + 1) : '';
  if (record.file_id && (!cloudPathValid || filePath !== record.cloud_path)) {
    return {
      kind: 'invalid',
      update: { status: 'invalid', cleanup_after: null, updated_at: now },
    };
  }
  const expiredRecoveryLease =
    ['recovering', 'deleting'].includes(record.status) && due(record.delete_lease_expires_at);
  if (expiredRecoveryLease && Number(record.delete_attempts || 0) >= MAX_DELETE_ATTEMPTS) {
    return {
      kind: 'terminal',
      update: failureDecision(record, now, 'DELETE_LEASE_EXHAUSTED'),
    };
  }
  const eligible =
    (['prepared', 'uploaded', 'orphaned'].includes(record.status) && due(record.cleanup_after)) ||
    (record.status === 'delete_confirming' && due(record.cleanup_after)) ||
    expiredRecoveryLease ||
    (record.status === 'delete_failed' &&
      Number(record.delete_attempts || 0) < MAX_DELETE_ATTEMPTS &&
      due(record.retry_at));
  if (!eligible) return null;
  if (profile && profile._id !== record.owner_openid) return null;
  if (!record.file_id) {
    if (!cloudPathValid)
      return {
        kind: 'invalid',
        update: { status: 'invalid', cleanup_after: null, updated_at: now },
      };
    return {
      kind: 'resolve',
      update: {
        status: 'recovering',
        delete_lease_id: leaseId,
        delete_claimed_at: now,
        delete_lease_expires_at: new Date(now.getTime() + RECOVERY_LEASE_MS),
        delete_attempts: Number(record.delete_attempts || 0) + 1,
        updated_at: now,
      },
    };
  }
  if (profileReferences(profile, record.file_id)) {
    return {
      kind: 'completed',
      update: { status: 'completed', completed_at: now, cleanup_after: null, updated_at: now },
    };
  }
  return {
    kind: 'claimed',
    defer_completion:
      record.recovery_delete_pending === true && record.delete_confirmation_pending !== true,
    finalize_delete:
      record.status === 'delete_confirming' || record.delete_confirmation_pending === true,
    update: {
      status: 'deleting',
      ...(record.status === 'delete_confirming' ? { delete_confirmation_pending: true } : {}),
      delete_lease_id: leaseId,
      delete_claimed_at: now,
      delete_lease_expires_at: new Date(now.getTime() + DELETE_LEASE_MS),
      delete_attempts: Number(record.delete_attempts || 0) + 1,
      updated_at: now,
    },
  };
}

function failureDecision(record, now, errorCode) {
  const attempts = Number(record && record.delete_attempts) || 0;
  const terminal = attempts >= MAX_DELETE_ATTEMPTS;
  return {
    status: terminal ? 'delete_failed_terminal' : 'delete_failed',
    delete_lease_id: '',
    delete_lease_expires_at: null,
    retry_at: terminal ? null : new Date(now.getTime() + RETRY_BASE_MS * 2 ** attempts),
    last_error_code: errorCode,
    delete_failed_at: now,
    updated_at: now,
  };
}

function isTrustedObjectMissing(value) {
  if (!value || typeof value !== 'object') return false;
  const codes = [value.status, value.errCode, value.code];
  return (
    codes.some((code) => Number(code) === -503003) ||
    codes.some((code) => String(code || '').trim() === 'STORAGE_FILE_NONEXIST') ||
    String(value.errMsg || '').trim() === 'STORAGE_FILE_NONEXIST'
  );
}

function deleteAccepted(response, fileId) {
  const item =
    response &&
    Array.isArray(response.fileList) &&
    response.fileList.find((entry) => entry && entry.fileID === fileId);
  return Boolean(item && (Number(item.status) === 0 || isTrustedObjectMissing(item)));
}

async function drainMediaCleanup({
  store,
  deleteFile,
  uploadFile,
  now = new Date(),
  randomUUID = crypto.randomUUID,
  limit = MAX_BATCH,
}) {
  const boundedLimit = Math.max(1, Math.min(MAX_BATCH, Number(limit) || MAX_BATCH));
  const [mediaIds, importIds] = await Promise.all([
    store.listEligible(now, boundedLimit),
    typeof store.listImportIntents === 'function'
      ? store.listImportIntents(now, boundedLimit)
      : Promise.resolve([]),
  ]);
  const work = [];
  const media = mediaIds.slice(0, boundedLimit);
  const imports = importIds.slice(0, boundedLimit);
  while (work.length < boundedLimit && (media.length || imports.length)) {
    const mediaId = media.shift();
    if (mediaId) work.push({ kind: 'media', id: mediaId });
    const importId = imports.shift();
    if (importId && work.length < boundedLimit) work.push({ kind: 'import', id: importId });
  }
  const result = { discovered: work.length, claimed: 0, deleted: 0, failed: 0, reactivated: 0 };
  for (const item of work) {
    const { id } = item;
    const leaseId = randomUUID();
    const claimed =
      item.kind === 'import'
        ? await store.claimImportIntent(id, { leaseId, now })
        : await store.claim(id, { leaseId, now });
    if (claimed && claimed.reactivated) {
      result.reactivated += 1;
      continue;
    }
    if (!claimed || claimed.invalid || claimed.completed || claimed.aborted) continue;
    if (claimed.claimed !== true && claimed.resolve_target !== true) continue;
    result.claimed += 1;
    const deferCompletion = claimed.resolve_target === true || claimed.defer_completion === true;
    const confirmAfter = new Date(now.getTime() + RECOVERY_CONFIRMATION_MS);
    try {
      let fileId = claimed.file_id;
      if (claimed.resolve_target) {
        if (typeof uploadFile !== 'function') coded('UPLOAD_UNAVAILABLE', '媒体恢复服务不可用');
        if (!(await store.isImportRecoveryLeaseCurrent(id, { leaseId, now }))) continue;
        const uploaded = await uploadFile({
          cloudPath: claimed.cloud_path,
          fileContent: Buffer.from([0]),
        });
        fileId = uploaded?.fileID;
        const slash =
          typeof fileId === 'string' && fileId.startsWith('cloud://')
            ? fileId.indexOf('/', 'cloud://'.length)
            : -1;
        if (slash < 0 || fileId.slice(slash + 1) !== claimed.cloud_path)
          coded('DELETE_TARGET_INVALID', '媒体删除目标无效');
        if (!(await store.attachImportDeleteTarget(id, { leaseId, now, fileId }))) {
          const reclaimed = await store.reclaimImportDeleteTarget(id, {
            leaseId,
            now,
            fileId,
            ownerOpenid: claimed.owner_openid,
            cloudPath: claimed.cloud_path,
            leaseExpiresAt: new Date(now.getTime() + RECOVERY_LEASE_MS),
          });
          if (!reclaimed) continue;
        }
      }
      const fileIds =
        item.kind === 'media' && Array.isArray(claimed.delete_file_ids)
          ? claimed.delete_file_ids
          : [fileId];
      const response = await deleteFile({ fileList: fileIds });
      if (!fileIds.every((target) => deleteAccepted(response, target)))
        coded('DELETE_REJECTED', '媒体删除未被接受');
      const marked =
        item.kind === 'import'
          ? await store.markImportDeleted(id, {
              leaseId,
              now,
              deferCompletion,
              confirmAfter,
            })
          : await store.markDeleted(id, { leaseId, now });
      if (marked) result.deleted += 1;
    } catch (error) {
      if (isTrustedObjectMissing(error)) {
        const marked =
          item.kind === 'import'
            ? await store.markImportDeleted(id, {
                leaseId,
                now,
                deferCompletion,
                confirmAfter,
              })
            : await store.markDeleted(id, { leaseId, now });
        if (marked) result.deleted += 1;
      } else {
        if (item.kind === 'import')
          await store.markImportFailed(id, { leaseId, now, errorCode: 'DELETE_FAILED' });
        else await store.markFailed(id, { leaseId, now, errorCode: 'DELETE_FAILED' });
        result.failed += 1;
      }
    }
  }
  return result;
}

function responseError(error) {
  return {
    ok: false,
    error: {
      code: typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
      message: typeof error?.code === 'string' ? error.message : '服务暂时不可用',
    },
  };
}

module.exports = {
  TIMER_TRIGGER,
  MAX_BATCH,
  DELETE_LEASE_MS,
  STORAGE_SETTLE_MARGIN_MS,
  RECOVERY_LEASE_MS,
  RECOVERY_CONFIRMATION_MS,
  MAX_DELETE_ATTEMPTS,
  authorizeCleanup,
  profileReferences,
  validImportCloudPath,
  validCanonicalIntentPath,
  validCanonicalMedia,
  claimDecision,
  importClaimDecision,
  failureDecision,
  isTrustedObjectMissing,
  drainMediaCleanup,
  responseError,
};
