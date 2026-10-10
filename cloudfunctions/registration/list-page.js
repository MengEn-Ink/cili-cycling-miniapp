'use strict';

const { fail } = require('./domain');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 20;
const MAX_CURSOR_LENGTH = 512;
const CURSOR_VERSION = 1;

function validationFailed() {
  fail('VALIDATION_FAILED', '分页参数无效');
}

function normalizePageSize(value) {
  if (value === undefined || value === null) return DEFAULT_PAGE_SIZE;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE)
    validationFailed();
  return value;
}

function encodeMyCursor(boundary) {
  const createdAt =
    boundary.createdAt instanceof Date ? boundary.createdAt : new Date(boundary.createdAt);
  if (Number.isNaN(createdAt.getTime())) fail('DATA_INTEGRITY_ERROR', '报名时间无法安全分页');
  if (typeof boundary.activityId !== 'string' || !boundary.activityId)
    fail('DATA_INTEGRITY_ERROR', '报名活动缺失，无法安全分页');
  const payload = JSON.stringify({
    v: CURSOR_VERSION,
    t: createdAt.toISOString(),
    a: boundary.activityId,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeMyCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > MAX_CURSOR_LENGTH)
    validationFailed();
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    validationFailed();
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.v !== CURSOR_VERSION ||
    typeof parsed.t !== 'string' ||
    typeof parsed.a !== 'string' ||
    !parsed.a
  )
    validationFailed();
  const createdAt = new Date(parsed.t);
  if (Number.isNaN(createdAt.getTime())) validationFailed();
  return { createdAt, activityId: parsed.a };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizePageSize,
  encodeMyCursor,
  decodeMyCursor,
};
