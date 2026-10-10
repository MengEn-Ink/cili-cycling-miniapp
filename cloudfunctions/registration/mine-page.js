'use strict';

const { fail } = require('./domain');

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 512;
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function canonicalDate(value) {
  if (typeof value !== 'string' || value.length > 64) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validId(value) {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 128;
}

function invalidPage() {
  fail('VALIDATION_FAILED', '报名分页参数无效');
}

function decodeCursor(value) {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > MAX_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    invalidPage();
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (!bytes.length || bytes.toString('base64url') !== value) invalidPage();
    const cursor = JSON.parse(bytes.toString('utf8'));
    if (
      !exactKeys(cursor, ['created_at', 'id', 'v']) ||
      cursor.v !== CURSOR_VERSION ||
      !canonicalDate(cursor.created_at) ||
      !validId(cursor.id)
    )
      invalidPage();
    return {
      createdAt: new Date(cursor.created_at),
      id: cursor.id,
    };
  } catch (error) {
    if (error && error.code === 'VALIDATION_FAILED') throw error;
    invalidPage();
  }
}

function encodeCursor(item) {
  const createdAt = item.created_at instanceof Date ? item.created_at : new Date(item.created_at);
  if (
    !Number.isFinite(createdAt.getTime()) ||
    !validId(item._id) ||
    (typeof item.created_at === 'string' && !canonicalDate(item.created_at))
  )
    fail('DATA_INTEGRITY_ERROR', '报名数据无法安全分页');
  const encoded = Buffer.from(
    JSON.stringify({
      v: CURSOR_VERSION,
      created_at: createdAt.toISOString(),
      id: item._id,
    }),
    'utf8',
  ).toString('base64url');
  if (encoded.length > MAX_CURSOR_LENGTH) fail('DATA_INTEGRITY_ERROR', '报名数据无法安全分页');
  return encoded;
}

function parseMinePageRequest(event = {}) {
  const pageSize = event.page_size === undefined ? PAGE_SIZE : event.page_size;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) invalidPage();
  return {
    pageSize,
    boundary: decodeCursor(event.cursor),
  };
}

function pageCondition(command, openid, boundary) {
  if (!boundary) return { openid };
  return command.and(
    { openid },
    command.or(
      { created_at: command.lt(boundary.createdAt) },
      command.and({ created_at: command.eq(boundary.createdAt) }, { _id: command.lt(boundary.id) }),
    ),
  );
}

async function listMinePage({ db, command, openid, event }) {
  if (
    !db ||
    !command ||
    typeof openid !== 'string' ||
    !openid ||
    !event ||
    typeof event !== 'object' ||
    Array.isArray(event)
  )
    fail('DATA_INTEGRITY_ERROR', '报名分页依赖无效');
  const { pageSize, boundary } = parseMinePageRequest(event);
  const result = await db
    .collection('registrations')
    .where(pageCondition(command, openid, boundary))
    .orderBy('created_at', 'desc')
    .orderBy('_id', 'desc')
    .limit(pageSize + 1)
    .get();
  if (!result || !Array.isArray(result.data)) fail('DATA_INTEGRITY_ERROR', '报名数据无法安全分页');
  const records = result.data;
  const items = records.slice(0, pageSize);
  for (const item of items) encodeCursor(item);
  return {
    items,
    next_cursor: records.length > pageSize ? encodeCursor(items.at(-1)) : null,
  };
}

module.exports = {
  CURSOR_VERSION,
  MAX_CURSOR_LENGTH,
  PAGE_SIZE,
  parseMinePageRequest,
  listMinePage,
};
