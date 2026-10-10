'use strict';

const { fail, publicActivity } = require('./domain-index');

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 512;
const MAX_PAGE_SIZE = 50;
const VALID_STATUSES = ['draft', 'published', 'finished'];
const STATUS_FILTERS = new Set(['all', ...VALID_STATUSES]);
const PHASES = ['dated', 'legacy', 'undated'];
const MIN_ACTIVITY_DATE = new Date(0);
const MAX_ACTIVITY_DATE = new Date(8640000000000000);

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function canonicalDate(value) {
  if (typeof value !== 'string' || value.length > 64) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function invalidCursor() {
  fail('VALIDATION_FAILED', '分页游标格式错误');
}

function validPhaseCursor(cursor, phase) {
  if (cursor.id === null)
    return exactKeys(cursor, ['id', 'phase', 'status_filter', 'v']) && phase !== 'dated';
  return (
    exactKeys(cursor, ['event_start', 'id', 'phase', 'status_filter', 'v']) &&
    canonicalDate(cursor.event_start) &&
    validId(cursor.id)
  );
}

function decodeCursor(value) {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > MAX_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    invalidCursor();
  try {
    const decoded = Buffer.from(value, 'base64url');
    if (!decoded.length || decoded.toString('base64url') !== value) invalidCursor();
    const cursor = JSON.parse(decoded.toString('utf8'));
    if (
      !cursor ||
      cursor.v !== CURSOR_VERSION ||
      !PHASES.includes(cursor.phase) ||
      !STATUS_FILTERS.has(cursor.status_filter)
    )
      invalidCursor();
    if (cursor.phase === 'undated') {
      if (
        !exactKeys(cursor, ['id', 'phase', 'status_filter', 'v']) ||
        (cursor.id !== null && !validId(cursor.id))
      )
        invalidCursor();
      return cursor;
    }
    if (!validPhaseCursor(cursor, cursor.phase)) invalidCursor();
    return cursor;
  } catch (error) {
    if (error && error.code === 'VALIDATION_FAILED') throw error;
    invalidCursor();
  }
}

function encodeCursor(cursor) {
  const encoded = Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  if (encoded.length > MAX_CURSOR_LENGTH) invalidCursor();
  return encoded;
}

function parsePageRequest(event) {
  if (!hasOwn(event, 'page_size')) fail('VALIDATION_FAILED', '缺少分页大小');
  if (!Number.isInteger(event.page_size) || event.page_size < 1 || event.page_size > MAX_PAGE_SIZE)
    fail('VALIDATION_FAILED', '分页大小格式错误');
  const statusFilter = event.status_filter === undefined ? 'all' : event.status_filter;
  if (!STATUS_FILTERS.has(statusFilter)) fail('VALIDATION_FAILED', '活动状态筛选格式错误');
  const decoded = decodeCursor(event.cursor);
  if (decoded && decoded.status_filter !== statusFilter) invalidCursor();
  return {
    pageSize: event.page_size,
    statusFilter,
    cursor: decoded || {
      v: CURSOR_VERSION,
      phase: 'dated',
      status_filter: statusFilter,
      id: null,
    },
  };
}

function eventStartIso(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (canonicalDate(value)) return value;
  fail('INTERNAL_ERROR', '活动开始时间格式错误');
}

function phaseBase(command, { openid, isAdmin, phase, statusFilter }) {
  return {
    ...(isAdmin ? {} : { created_by: openid }),
    status:
      phase === 'undated'
        ? 'draft'
        : statusFilter === 'all'
          ? command.in(VALID_STATUSES)
          : statusFilter,
    is_deleted: command.neq(true),
    event_start:
      phase === 'dated'
        ? command.gte(MIN_ACTIVITY_DATE).and(command.lte(MAX_ACTIVITY_DATE))
        : phase === 'legacy'
          ? command.gte('').and(command.lt({}))
          : command.exists(false),
  };
}

function listCondition(command, options) {
  const base = phaseBase(command, options);
  const { phase, cursor } = options;
  if (!cursor || cursor.id === null) return base;
  if (phase === 'undated') return { ...base, _id: command.lt(cursor.id) };
  const start = phase === 'dated' ? new Date(cursor.event_start) : cursor.event_start;
  return command.and(
    base,
    command.or(
      { event_start: command.lt(start) },
      command.and({ event_start: command.eq(start) }, { _id: command.lt(cursor.id) }),
    ),
  );
}

async function readPhase(db, options) {
  if (
    options.phase === 'undated' &&
    options.statusFilter !== 'all' &&
    options.statusFilter !== 'draft'
  )
    return [];
  let query = db.collection('activities').where(listCondition(db.command, options));
  if (options.phase !== 'undated') query = query.orderBy('event_start', 'desc');
  query = query.orderBy('_id', 'desc').limit(options.limit);
  const result = await query.get();
  if (!result || !Array.isArray(result.data)) throw new Error('invalid activity page');
  return result.data;
}

function itemCursor(phase, item, statusFilter) {
  if (phase === 'undated')
    return encodeCursor({
      v: CURSOR_VERSION,
      phase,
      status_filter: statusFilter,
      id: item ? item._id : null,
    });
  return encodeCursor({
    v: CURSOR_VERSION,
    phase,
    status_filter: statusFilter,
    event_start: eventStartIso(item.event_start),
    id: item._id,
  });
}

function phaseStartCursor(phase, statusFilter) {
  return { v: CURSOR_VERSION, phase, status_filter: statusFilter, id: null };
}

function output(items, nextCursor) {
  return {
    items: items.map((item) => publicActivity(item, { revealContact: true })),
    next_cursor: nextCursor,
  };
}

async function firstNonEmptyPhase(db, common, startIndex) {
  for (let index = startIndex; index < PHASES.length; index += 1) {
    const phase = PHASES[index];
    const records = await readPhase(db, {
      ...common,
      phase,
      cursor: phaseStartCursor(phase, common.statusFilter),
      limit: 1,
    });
    if (records.length) return phase;
  }
  return null;
}

async function listActivitiesPage(db, identity, event) {
  const { pageSize, cursor, statusFilter } = parsePageRequest(event);
  const common = { openid: identity.openid, isAdmin: identity.isAdmin, statusFilter };
  const items = [];
  const startIndex = PHASES.indexOf(cursor.phase);

  for (let index = startIndex; index < PHASES.length; index += 1) {
    const phase = PHASES[index];
    const remaining = pageSize - items.length;
    const records = await readPhase(db, {
      ...common,
      phase,
      cursor: index === startIndex ? cursor : phaseStartCursor(phase, statusFilter),
      limit: remaining + 1,
    });
    if (records.length > remaining) {
      const included = records.slice(0, remaining);
      items.push(...included);
      return output(items, itemCursor(phase, included.at(-1), statusFilter));
    }
    items.push(...records);
    if (items.length === pageSize) {
      const nextPhase = await firstNonEmptyPhase(db, common, index + 1);
      return output(
        items,
        nextPhase ? encodeCursor(phaseStartCursor(nextPhase, statusFilter)) : null,
      );
    }
  }

  return output(items, null);
}

module.exports = {
  CURSOR_VERSION,
  MAX_CURSOR_LENGTH,
  MAX_PAGE_SIZE,
  decodeCursor,
  listActivitiesPage,
};
