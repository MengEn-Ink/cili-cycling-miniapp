'use strict';

const crypto = require('node:crypto');
const { submitMediaCheck } = require('./content-contract');

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_SUBMITTING_LEASE_MS = 5 * 60 * 1000;

function mediaCheckScene(category) {
  return typeof category === 'string' && category.startsWith('profile-') ? 1 : 4;
}

function reviewBinding(record) {
  return {
    media_id: record._id,
    owner_openid: record.owner_openid,
    category: record.category,
    generation:
      Number.isSafeInteger(record.generation) && record.generation >= 1 ? record.generation : 1,
    canonical_file_id: record.canonical_file_id,
    sha256: record.sha256,
  };
}

async function submitReservedMediaReview({
  openid,
  mediaRecord,
  store,
  getMediaUrl,
  mediaCheckAsync,
  operationId = crypto.randomUUID(),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  submittingLeaseMs = DEFAULT_SUBMITTING_LEASE_MS,
  now = new Date(),
}) {
  const binding = reviewBinding(mediaRecord);
  const reservation = await store.reserveMediaCheck(
    openid,
    binding,
    operationId,
    maxAttempts,
    now,
    submittingLeaseMs,
  );
  if (reservation.completed)
    return {
      status: 'pending',
      operationId,
      traceId: reservation.trace_id,
      attempts: reservation.attempt,
    };
  if (reservation.recoverable)
    return store.ackMediaCheckSubmission(
      openid,
      binding,
      operationId,
      reservation.attempt,
      reservation.trace,
      now,
    );
  if (reservation.unknown)
    throw Object.assign(new Error('图片审核外部提交结果未知，禁止自动重试'), {
      code: 'MEDIA_CHECK_SUBMISSION_UNKNOWN',
    });
  if (reservation.replayed)
    throw Object.assign(new Error('图片审核操作正在处理中'), {
      code: 'MEDIA_CHECK_OPERATION_IN_PROGRESS',
    });

  let trace;
  try {
    const mediaUrl = await getMediaUrl(binding.canonical_file_id);
    trace = await submitMediaCheck({
      mediaId: binding.media_id,
      ownerOpenid: binding.owner_openid,
      category: binding.category,
      generation: binding.generation,
      canonicalFileId: binding.canonical_file_id,
      sha256: binding.sha256,
      scene: mediaCheckScene(binding.category),
      mediaUrl,
      mediaCheckAsync,
      now,
    });
  } catch (error) {
    await store.failMediaCheckOperation(openid, binding, operationId, error, now);
    throw error;
  }

  await store.recordMediaCheckSubmission(
    openid,
    binding,
    operationId,
    reservation.attempt,
    trace,
    now,
  );
  return store.ackMediaCheckSubmission(
    openid,
    binding,
    operationId,
    reservation.attempt,
    trace,
    now,
  );
}

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_SUBMITTING_LEASE_MS,
  mediaCheckScene,
  reviewBinding,
  submitReservedMediaReview,
};
