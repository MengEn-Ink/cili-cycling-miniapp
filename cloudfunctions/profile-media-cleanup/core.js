'use strict';

const crypto = require('node:crypto');
const TIMER_TRIGGER = 'profile-media-cleanup-worker';
const MAX_BATCH = 20;

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
    record.status !== 'unreferenced' ||
    typeof record.owner_openid !== 'string' ||
    !record.owner_openid ||
    typeof record.file_id !== 'string' ||
    !record.file_id.startsWith('cloud://')
  )
    return null;
  const cleanupAt = new Date(record.cleanup_after);
  if (!Number.isFinite(cleanupAt.getTime()) || cleanupAt > now) return null;
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
      delete_attempts: Number(record.delete_attempts || 0) + 1,
      updated_at: now,
    },
  };
}

function deleteAccepted(response, fileId) {
  return Boolean(
    response &&
    Array.isArray(response.fileList) &&
    response.fileList.some((item) => item && item.fileID === fileId && Number(item.status) === 0),
  );
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
    } catch {
      await store.markFailed(id, { leaseId, now, errorCode: 'DELETE_FAILED' });
      result.failed += 1;
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
  authorizeCleanup,
  profileReferences,
  claimDecision,
  drainMediaCleanup,
  responseError,
};
