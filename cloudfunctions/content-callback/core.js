'use strict';

const FINAL_STATUSES = new Set(['pass', 'review', 'risky']);
const RETRYABLE_STATUS = 'retryable';

function mediaGeneration(record) {
  return Number.isSafeInteger(record?.generation) && record.generation >= 1 ? record.generation : 1;
}

function sameBinding(trace, operation, media) {
  return Boolean(
    trace &&
    operation &&
    media &&
    trace.media_id === media._id &&
    trace.owner_openid === media.owner_openid &&
    trace.category === media.category &&
    trace.generation === mediaGeneration(media) &&
    trace.canonical_file_id === media.canonical_file_id &&
    trace.sha256 === media.sha256 &&
    trace.trace_id === media.security_trace_id &&
    trace.operation_id === operation.operation_id &&
    operation.operation_id === media.security_operation_id &&
    operation.media_id === trace.media_id &&
    operation.owner_openid === trace.owner_openid &&
    operation.category === trace.category &&
    operation.generation === trace.generation &&
    operation.canonical_file_id === trace.canonical_file_id &&
    operation.sha256 === trace.sha256 &&
    operation.trace_id === trace.trace_id &&
    media.security_status === 'pending' &&
    operation.status === 'pending' &&
    !['deleting', 'deleted', 'delete_failed_terminal'].includes(media.status),
  );
}

function validateDecision(decision) {
  if (!decision || typeof decision.traceId !== 'string' || !decision.traceId)
    throw Object.assign(new Error('图片审核回调无效'), { code: 'CALLBACK_DECISION_INVALID' });
  if (decision.outcome === 'retryable' && Number.isInteger(decision.errorCode)) return;
  if (decision.outcome === 'decision' && FINAL_STATUSES.has(decision.suggest)) return;
  throw Object.assign(new Error('图片审核回调无效'), { code: 'CALLBACK_DECISION_INVALID' });
}

async function applyMediaDecision(store, decision, now = new Date()) {
  validateDecision(decision);
  return store.transaction(async (tx) => {
    const trace = await tx.getTrace(decision.traceId);
    if (!trace || trace.trace_id !== decision.traceId) {
      const error = new Error('图片审核提交尚未可见');
      error.code = 'CALLBACK_TRACE_NOT_READY';
      error.retryable = true;
      throw error;
    }
    if (FINAL_STATUSES.has(trace.status) || trace.status === RETRYABLE_STATUS)
      return { status: trace.status };
    if (trace.status !== 'pending') return { status: 'ignored' };
    const operation = await tx.getOperation(trace.operation_id);
    const media = await tx.getMedia(trace.media_id);
    if (!sameBinding(trace, operation, media)) return { status: 'ignored' };

    if (decision.outcome === 'retryable') {
      await tx.updateMedia({
        security_status: RETRYABLE_STATUS,
        security_error_code: String(decision.errorCode),
        security_failed_at: now,
        updated_at: now,
      });
      await tx.updateOperation({
        status: RETRYABLE_STATUS,
        error_code: String(decision.errorCode),
        failed_at: now,
        updated_at: now,
      });
      await tx.updateTrace({
        status: RETRYABLE_STATUS,
        error_code: String(decision.errorCode),
        failed_at: now,
        updated_at: now,
      });
      return { status: RETRYABLE_STATUS };
    }

    const detailCount = Array.isArray(decision.detail) ? decision.detail.length : 0;
    await tx.updateMedia({
      security_status: decision.suggest,
      security_decided_at: now,
      security_detail_count: detailCount,
      updated_at: now,
    });
    await tx.updateOperation({
      status: decision.suggest,
      decided_at: now,
      detail_count: detailCount,
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
