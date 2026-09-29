'use strict';

const crypto = require('node:crypto');
const TIMER_TRIGGER = 'profile-media-cleanup-worker';
const MAX_BATCH = 20;
const DELETE_LEASE_MS = 5 * 60 * 1000;
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

function claimDecision(record, profile, now, leaseId) {
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
  const eligible =
    (record.status === 'unreferenced' && due(record.cleanup_after)) ||
    (record.status === 'deleting' && due(record.delete_lease_expires_at)) ||
    (record.status === 'delete_failed' &&
      Number(record.delete_attempts || 0) < MAX_DELETE_ATTEMPTS &&
      due(record.retry_at));
  if (!eligible) return null;
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
  now = new Date(),
  randomUUID = crypto.randomUUID,
  limit = MAX_BATCH,
}) {
  const boundedLimit = Math.max(1, Math.min(MAX_BATCH, Number(limit) || MAX_BATCH));
  const ids = (await store.listEligible(now, boundedLimit)).slice(0, boundedLimit);
  const result = { discovered: ids.length, claimed: 0, deleted: 0, failed: 0, reactivated: 0 };
  for (const id of ids) {
    const leaseId = randomUUID();
    const claimed = await store.claim(id, { leaseId, now });
    if (claimed && claimed.reactivated) {
      result.reactivated += 1;
      continue;
    }
    if (!claimed || claimed.claimed !== true) continue;
    result.claimed += 1;
    try {
      const response = await deleteFile({ fileList: [claimed.file_id] });
      if (!deleteAccepted(response, claimed.file_id)) coded('DELETE_REJECTED', '媒体删除未被接受');
      if (await store.markDeleted(id, { leaseId, now })) result.deleted += 1;
    } catch (error) {
      if (isTrustedObjectMissing(error)) {
        if (await store.markDeleted(id, { leaseId, now })) result.deleted += 1;
      } else {
        await store.markFailed(id, { leaseId, now, errorCode: 'DELETE_FAILED' });
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
  MAX_DELETE_ATTEMPTS,
  authorizeCleanup,
  profileReferences,
  claimDecision,
  failureDecision,
  isTrustedObjectMissing,
  drainMediaCleanup,
  responseError,
};
