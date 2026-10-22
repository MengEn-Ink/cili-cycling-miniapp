'use strict';

const FINAL_STATUSES = new Set(['pass', 'review', 'risky']);

function sameBinding(trace, media) {
  return Boolean(
    trace &&
    media &&
    trace.media_id === media._id &&
    trace.owner_openid === media.owner_openid &&
    trace.category === media.category &&
    trace.generation === media.generation &&
    trace.canonical_file_id === media.canonical_file_id &&
    trace.sha256 === media.sha256 &&
    trace.trace_id === media.security_trace_id &&
    media.security_status === 'pending' &&
    !['deleting', 'deleted', 'delete_failed_terminal'].includes(media.status),
  );
}

async function applyMediaDecision(store, decision, now = new Date()) {
  if (
    !decision ||
    typeof decision.traceId !== 'string' ||
    !decision.traceId ||
    !FINAL_STATUSES.has(decision.suggest)
  ) {
    const error = new Error('图片审核回调无效');
    error.code = 'CALLBACK_DECISION_INVALID';
    throw error;
  }
  return store.transaction(async (tx) => {
    const trace = await tx.getTrace(decision.traceId);
    if (!trace || trace.trace_id !== decision.traceId) {
      const error = new Error('图片审核提交尚未可见');
      error.code = 'CALLBACK_TRACE_NOT_READY';
      error.retryable = true;
      throw error;
    }
    if (FINAL_STATUSES.has(trace.status)) return { status: trace.status };
    if (trace.status !== 'pending') return { status: 'ignored' };
    const media = await tx.getMedia(trace.media_id);
    if (!sameBinding(trace, media)) return { status: 'ignored' };
    const detailCount = Array.isArray(decision.detail) ? decision.detail.length : 0;
    await tx.updateMedia({
      security_status: decision.suggest,
      security_decided_at: now,
      security_detail_count: detailCount,
      updated_at: now,
    });
    await tx.updateTrace({
      status: decision.suggest,
      decided_at: now,
      detail_count: detailCount,
      updated_at: now,
    });
    return { status: decision.suggest };
  });
}

module.exports = { applyMediaDecision, sameBinding };
