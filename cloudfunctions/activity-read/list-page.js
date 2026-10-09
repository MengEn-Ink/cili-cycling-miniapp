'use strict';

const { fail } = require('./domain');

const PAGE_SIZE = 20;
const MAX_CURSOR_LENGTH = 512;
const MAX_STREAM_BATCHES = 5;
const CURSOR_VERSION = 1;
const VIEWS = new Set(['future', 'history']);

function validationFailed() {
  fail('VALIDATION_FAILED', '分页参数无效');
}

function dataIntegrityFailed() {
  fail('DATA_INTEGRITY_ERROR', '活动数据无法安全分页');
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validIsoString(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function normalizeCursor(value, expectedView) {
  if (!exactKeys(value, ['as_of', 'boundary', 'v', 'view'])) validationFailed();
  if (value.v !== CURSOR_VERSION || !VIEWS.has(value.view) || value.view !== expectedView)
    validationFailed();
  if (!validIsoString(value.as_of)) validationFailed();
  if (!exactKeys(value.boundary, ['id', 'time'])) validationFailed();
  if (!validIsoString(value.boundary.time)) validationFailed();
  if (typeof value.boundary.id !== 'string' || !value.boundary.id) validationFailed();
  return value;
}

function encodeListCursor(value) {
  const normalized = normalizeCursor(value, value && value.view);
  return Buffer.from(JSON.stringify(normalized), 'utf8').toString('base64url');
}

function decodeListCursor(cursor, expectedView) {
  try {
    if (
      typeof cursor !== 'string' ||
      !cursor ||
      cursor.length > MAX_CURSOR_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(cursor)
    )
      validationFailed();
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) validationFailed();
    return normalizeCursor(JSON.parse(bytes.toString('utf8')), expectedView);
  } catch (error) {
    if (error && error.code === 'VALIDATION_FAILED') throw error;
    validationFailed();
  }
}

function parseListPageRequest(event = {}, now = new Date()) {
  const view = event.view === undefined ? 'future' : event.view;
  if (!VIEWS.has(view)) validationFailed();
  const pageSize = event.page_size === undefined ? PAGE_SIZE : event.page_size;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE) validationFailed();
  const serverNow = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(serverNow.getTime())) validationFailed();
  if (event.cursor === undefined)
    return { view, pageSize, asOf: new Date(serverNow.getTime()), boundary: undefined };
  const cursor = decodeListCursor(event.cursor, view);
  return {
    view,
    pageSize,
    asOf: new Date(cursor.as_of),
    boundary: { time: new Date(cursor.boundary.time), id: cursor.boundary.id },
  };
}

function streamDefinitions(view, asOf, command) {
  const time = new Date(asOf.getTime());
  const visible = command.neq(true);
  if (view === 'future')
    return [
      {
        name: 'ongoing',
        field: 'event_start',
        direction: 'asc',
        filter: {
          status: 'published',
          is_deleted: visible,
          event_start: command.lte(time),
          event_end: command.gt(time),
        },
      },
      {
        name: 'scheduled',
        field: 'event_start',
        direction: 'asc',
        filter: {
          status: 'published',
          is_deleted: visible,
          event_start: command.gt(time),
          event_end: command.gt(time),
        },
      },
    ];
  return [
    {
      name: 'finished',
      field: 'event_end',
      direction: 'desc',
      filter: { status: 'finished', is_deleted: visible },
    },
    {
      name: 'past-published',
      field: 'event_end',
      direction: 'desc',
      filter: {
        status: 'published',
        is_deleted: visible,
        event_end: command.lte(time),
      },
    },
  ];
}

function streamSort(definition, segment) {
  return segment === 'same-time'
    ? [['_id', definition.direction]]
    : [
        [definition.field, definition.direction],
        ['_id', definition.direction],
      ];
}

function boundaryFilter(definition, command, boundary, segment) {
  if (!boundary) return definition.filter;
  const operator = definition.direction === 'asc' ? 'gt' : 'lt';
  const time = new Date(boundary.time.getTime());
  if (segment === 'same-time')
    return {
      ...definition.filter,
      [definition.field]: command.eq(time),
      _id: command[operator](boundary.id),
    };
  if (segment === 'cross-time') {
    const boundaryCondition = command[operator](time);
    const existing = definition.filter[definition.field];
    return {
      ...definition.filter,
      [definition.field]: existing ? existing.and(boundaryCondition) : boundaryCondition,
    };
  }
  dataIntegrityFailed();
}

async function executeQuery({ db, command, definition, boundary, segment, limit }) {
  let query = db
    .collection('activities')
    .where(boundaryFilter(definition, command, boundary, segment));
  for (const [field, direction] of streamSort(definition, segment))
    query = query.orderBy(field, direction);
  const result = await query.limit(limit).get();
  if (!result || !Array.isArray(result.data)) dataIntegrityFailed();
  return result.data;
}

function dateEpoch(value) {
  if (!(value instanceof Date) && typeof value !== 'string') return undefined;
  const date = value instanceof Date ? value : new Date(value);
  const epoch = date.getTime();
  return Number.isFinite(epoch) ? epoch : undefined;
}

function validDate(value) {
  return dateEpoch(value) !== undefined;
}

function validForStream(item, definition, asOf) {
  if (
    !item ||
    typeof item._id !== 'string' ||
    !item._id ||
    item.is_deleted === true ||
    !validDate(item.event_start) ||
    !validDate(item.event_end) ||
    dateEpoch(item.event_start) >= dateEpoch(item.event_end)
  )
    return false;
  const start = dateEpoch(item.event_start);
  const end = dateEpoch(item.event_end);
  const time = asOf.getTime();
  if (definition.name === 'ongoing')
    return item.status === 'published' && start <= time && end > time;
  if (definition.name === 'scheduled')
    return item.status === 'published' && start > time && end > time;
  if (definition.name === 'finished') return item.status === 'finished';
  return item.status === 'published' && end <= time;
}

function nextBoundary(candidates, definition) {
  const last = candidates.at(-1);
  if (!last || typeof last._id !== 'string' || !last._id || !validDate(last[definition.field]))
    dataIntegrityFailed();
  return { time: new Date(dateEpoch(last[definition.field])), id: last._id };
}

async function readStream({ db, command, definition, boundary, target, asOf }) {
  const items = [];
  let scanBoundary = boundary;
  for (let batch = 0; batch < MAX_STREAM_BATCHES; batch += 1) {
    let candidates;
    if (!scanBoundary) {
      candidates = await executeQuery({
        db,
        command,
        definition,
        limit: target,
      });
    } else {
      const sameTime = await executeQuery({
        db,
        command,
        definition,
        boundary: scanBoundary,
        segment: 'same-time',
        limit: target,
      });
      candidates = sameTime.slice(0, target);
      if (candidates.length < target) {
        const crossTime = await executeQuery({
          db,
          command,
          definition,
          boundary: scanBoundary,
          segment: 'cross-time',
          limit: target - candidates.length,
        });
        candidates.push(...crossTime.slice(0, target - candidates.length));
      }
    }
    items.push(...candidates.filter((item) => validForStream(item, definition, asOf)));
    if (items.length >= target) return items.slice(0, target);
    if (candidates.length < target) return items;
    scanBoundary = nextBoundary(candidates, definition);
  }
  dataIntegrityFailed();
}

function compareItems(left, right, field, direction) {
  const multiplier = direction === 'asc' ? 1 : -1;
  const leftTime = dateEpoch(left[field]);
  const rightTime = dateEpoch(right[field]);
  if (leftTime === undefined || rightTime === undefined) dataIntegrityFailed();
  const byTime = (leftTime === rightTime ? 0 : leftTime < rightTime ? -1 : 1) * multiplier;
  const byId = Buffer.compare(Buffer.from(left._id, 'utf8'), Buffer.from(right._id, 'utf8'));
  return byTime || byId * multiplier;
}

async function listActivityPage({ db, command, request, now }) {
  if (!db || !command || !request) dataIntegrityFailed();
  const asOf = request.asOf instanceof Date ? request.asOf : new Date(now);
  if (!Number.isFinite(asOf.getTime())) dataIntegrityFailed();
  const definitions = streamDefinitions(request.view, asOf, command);
  const target = request.pageSize + 1;
  const streams = [];
  for (const definition of definitions)
    streams.push(
      await readStream({
        db,
        command,
        definition,
        boundary: request.boundary,
        target,
        asOf,
      }),
    );
  const field = request.view === 'future' ? 'event_start' : 'event_end';
  const direction = request.view === 'future' ? 'asc' : 'desc';
  const seen = new Set();
  const merged = streams
    .flat()
    .sort((left, right) => compareItems(left, right, field, direction))
    .filter((item) => {
      if (seen.has(item._id)) return false;
      seen.add(item._id);
      return true;
    });
  const items = merged.slice(0, request.pageSize);
  const hasMore = merged.length > request.pageSize;
  const last = items.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeListCursor({
          v: CURSOR_VERSION,
          view: request.view,
          as_of: asOf.toISOString(),
          boundary: { time: new Date(dateEpoch(last[field])).toISOString(), id: last._id },
        })
      : null;
  return { items, nextCursor };
}

module.exports = {
  PAGE_SIZE,
  MAX_CURSOR_LENGTH,
  MAX_STREAM_BATCHES,
  parseListPageRequest,
  encodeListCursor,
  decodeListCursor,
  listActivityPage,
};
