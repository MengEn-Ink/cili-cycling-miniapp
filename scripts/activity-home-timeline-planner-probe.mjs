#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CloudBaseCliRunner } from './bootstrap-cloudbase.mjs';

export const PROBE_AS_OF = new Date('2026-10-09T08:00:00.000Z');
export const PROBE_COLLECTION = 'tmp_activity_home_timeline_f8d1d2e2';
const REGION = 'ap-shanghai';
const API_VERSION = '2018-06-08';
const PAGE_SIZE = 20;
const READ_LIMIT = PAGE_SIZE + 1;
const DATE_READBACK_IDS = Object.freeze([
  'finished-000',
  'ongoing-000',
  'past-published-000',
  'scheduled-000',
]);

const INDEXES = Object.freeze([
  {
    name: 'legacy_status_event_start',
    keys: [
      ['status', 1],
      ['event_start', 1],
    ],
  },
  {
    name: 'public_event_start',
    keys: [
      ['status', 1],
      ['event_start', 1],
      ['_id', 1],
      ['event_end', 1],
    ],
  },
  {
    name: 'public_event_end',
    keys: [
      ['status', 1],
      ['event_end', -1],
      ['_id', -1],
      ['event_start', -1],
    ],
  },
]);

export function assertTemporaryCollection(name) {
  if (name !== PROBE_COLLECTION) throw new Error('只允许临时集合');
}

function bsonDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('BSON Date 非法');
  return { $date: { $numberLong: String(date.getTime()) } };
}

function bsonDateAt(asOf, offsetMinutes) {
  return bsonDate(new Date(asOf.getTime() + offsetMinutes * 60_000));
}

function bsonDateMillis(value) {
  const raw = value?.$date;
  const milliseconds =
    typeof raw === 'string'
      ? Date.parse(raw)
      : raw && typeof raw === 'object' && /^-?\d+$/.test(raw.$numberLong)
        ? Number(raw.$numberLong)
        : Number.NaN;
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function visibleFlag(index) {
  return index % 12 === 0 ? {} : { is_deleted: false };
}

export function buildFixtures(asOf) {
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime()))
    throw new Error('probe as_of 非法');
  const fixtures = [];
  for (let index = 0; index < 25; index += 1) {
    const pair = Math.floor(index / 2);
    fixtures.push({
      _id: `ongoing-${String(index).padStart(3, '0')}`,
      kind: 'ongoing',
      title: `进行中 ${index}`,
      status: 'published',
      event_start: bsonDateAt(asOf, -720 + pair * 20),
      event_end: bsonDateAt(asOf, 120 + pair * 5),
      ...visibleFlag(index),
    });
    fixtures.push({
      _id: `scheduled-${String(index).padStart(3, '0')}`,
      kind: 'scheduled',
      title: `未开始 ${index}`,
      status: 'published',
      event_start: bsonDateAt(asOf, 60 + pair * 20),
      event_end: bsonDateAt(asOf, 300 + pair * 20),
      ...visibleFlag(index),
    });
    fixtures.push({
      _id: `finished-${String(index).padStart(3, '0')}`,
      kind: 'finished',
      title: `提前结束 ${index}`,
      status: 'finished',
      event_start: bsonDateAt(asOf, -1440 - pair * 20),
      event_end: index === 0 ? bsonDateAt(asOf, 360) : bsonDateAt(asOf, -60 - pair * 20),
      ...visibleFlag(index),
    });
    fixtures.push({
      _id: `past-published-${String(index).padStart(3, '0')}`,
      kind: 'past-published',
      title: `自然结束 ${index}`,
      status: 'published',
      event_start: bsonDateAt(asOf, -1800 - pair * 20),
      event_end: bsonDateAt(asOf, -600 - pair * 20),
      ...visibleFlag(index),
    });
  }
  fixtures.push(
    {
      _id: 'deleted-ongoing',
      kind: 'deleted',
      status: 'published',
      is_deleted: true,
      event_start: bsonDateAt(asOf, -30),
      event_end: bsonDateAt(asOf, 30),
    },
    {
      _id: 'deleted-history',
      kind: 'deleted',
      status: 'finished',
      is_deleted: true,
      event_start: bsonDateAt(asOf, -300),
      event_end: bsonDateAt(asOf, -200),
    },
    {
      _id: 'draft-future',
      kind: 'invalid-status',
      status: 'draft',
      is_deleted: false,
      event_start: bsonDateAt(asOf, 20),
      event_end: bsonDateAt(asOf, 120),
    },
    {
      _id: 'archived-history',
      kind: 'invalid-status',
      status: 'archived',
      is_deleted: false,
      event_start: bsonDateAt(asOf, -200),
      event_end: bsonDateAt(asOf, -100),
    },
    {
      _id: 'invalid-end',
      kind: 'invalid-time',
      status: 'published',
      is_deleted: false,
      event_start: bsonDateAt(asOf, 10),
      event_end: 'invalid-time',
    },
    {
      _id: 'reversed-time',
      kind: 'invalid-time',
      status: 'published',
      is_deleted: false,
      event_start: bsonDateAt(asOf, 240),
      event_end: bsonDateAt(asOf, 120),
    },
    {
      _id: 'missing-start',
      kind: 'invalid-time',
      status: 'published',
      is_deleted: false,
      event_end: bsonDateAt(asOf, 120),
    },
    {
      _id: 'missing-end',
      kind: 'invalid-time',
      status: 'published',
      is_deleted: false,
      event_start: bsonDateAt(asOf, 120),
    },
  );
  return fixtures;
}

function cursorSegmentFilter(definition, boundary, segment) {
  if (!boundary) return definition.filter;
  const { field, direction, filter } = definition;
  const operator = direction === 1 ? '$gt' : '$lt';
  if (segment === 'same-time')
    return { ...filter, [field]: boundary.time, _id: { [operator]: boundary.id } };
  if (segment === 'cross-time') {
    const existingRange = filter[field];
    const range =
      existingRange && typeof existingRange === 'object' && !Array.isArray(existingRange)
        ? existingRange
        : {};
    return { ...filter, [field]: { ...range, [operator]: boundary.time } };
  }
  throw new Error(`cursor segment 非法: ${segment}`);
}

function streamDefinitions(asOf) {
  const time = bsonDate(asOf);
  return [
    {
      name: 'ongoing',
      expectedIndex: 'public_event_start',
      field: 'event_start',
      direction: 1,
      filter: {
        status: 'published',
        is_deleted: { $ne: true },
        event_start: { $lte: time },
        event_end: { $gt: time },
      },
      cursor: { time: bsonDateAt(asOf, -620), id: 'ongoing-011' },
    },
    {
      name: 'scheduled',
      expectedIndex: 'public_event_start',
      field: 'event_start',
      direction: 1,
      filter: {
        status: 'published',
        is_deleted: { $ne: true },
        event_start: { $gt: time },
        event_end: { $gt: time },
      },
      cursor: { time: bsonDateAt(asOf, 160), id: 'scheduled-011' },
    },
    {
      name: 'finished',
      expectedIndex: 'public_event_end',
      field: 'event_end',
      direction: -1,
      filter: { status: 'finished', is_deleted: { $ne: true } },
      cursor: { time: bsonDateAt(asOf, -160), id: 'finished-011' },
    },
    {
      name: 'past-published',
      expectedIndex: 'public_event_end',
      field: 'event_end',
      direction: -1,
      filter: {
        status: 'published',
        is_deleted: { $ne: true },
        event_end: { $lte: time },
      },
      cursor: { time: bsonDateAt(asOf, -700), id: 'past-published-011' },
    },
  ];
}

function streamSort(definition, segment) {
  return segment === 'same-time'
    ? { _id: definition.direction }
    : { [definition.field]: definition.direction, _id: definition.direction };
}

function explainCommand(collection, definition, boundary, segment) {
  return {
    explain: {
      find: collection,
      filter: cursorSegmentFilter(definition, boundary, segment),
      sort: streamSort(definition, segment),
      limit: READ_LIMIT,
    },
    verbosity: 'executionStats',
  };
}

export function buildExplainCommands(collection, asOf) {
  assertTemporaryCollection(collection);
  const definitions = streamDefinitions(asOf);
  return [
    ...definitions.map((definition) => ({
      name: definition.name,
      collection,
      expectedIndex: definition.expectedIndex,
      limit: READ_LIMIT,
      command: explainCommand(collection, definition),
    })),
    ...definitions.flatMap((definition) =>
      ['same-time', 'cross-time'].map((segment) => ({
        name: `${definition.name}-cursor-${segment}`,
        collection,
        expectedIndex: definition.expectedIndex,
        limit: READ_LIMIT,
        command: explainCommand(collection, definition, definition.cursor, segment),
      })),
    ),
  ];
}

function exactIndexPayload(index) {
  return {
    IndexName: index.name,
    MgoKeySchema: {
      MgoIndexKeys: index.keys.map(([Name, direction]) => ({
        Name,
        Direction: String(direction),
      })),
      MgoIsUnique: false,
      MgoIsSparse: false,
    },
  };
}

function sanitizeError(value) {
  return String(value ?? '未知错误')
    .replace(
      /(secret(?:id|key)?|token|authorization|credential|password)["'\s:=]+[^\s,"']+/gi,
      '$1=<已隐藏>',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
}

function responseBody(value) {
  if (!value || typeof value !== 'object') return value;
  return value.data ?? value.Response ?? value;
}

function requestIdOf(value) {
  const body = responseBody(value);
  return (
    body?.RequestId ??
    body?.requestId ??
    body?.request_id ??
    value?.RequestId ??
    value?.requestId ??
    value?.request_id ??
    ''
  );
}

function parseJsonValue(value) {
  if (typeof value !== 'string') return value;
  return JSON.parse(value);
}

function extractMgoDocuments(value) {
  const body = responseBody(value);
  const raw = body?.Data ?? body?.data ?? body?.Results ?? body?.results;
  const entries = Array.isArray(raw) ? raw : raw === undefined ? [body] : [raw];
  return entries.map((entry) => {
    const parsed = parseJsonValue(entry);
    if (parsed && typeof parsed === 'object' && typeof parsed.Result === 'string')
      return parseJsonValue(parsed.Result);
    if (parsed && typeof parsed === 'object' && typeof parsed.result === 'string')
      return parseJsonValue(parsed.result);
    return parsed;
  });
}

export function unwrapSingleMgoDocument(value, action) {
  const documents = (Array.isArray(value) ? value : [value]).filter(Boolean);
  if (documents.length !== 1) throw new Error(`${action} 未返回唯一 Mongo 结果`);
  const document = documents[0];
  if (Array.isArray(document)) return unwrapSingleMgoDocument(document, action);
  if (typeof document !== 'object') throw new Error(`${action} 未返回唯一 Mongo 结果`);
  return document;
}

function singleMgoDocument(value, action) {
  return unwrapSingleMgoDocument(extractMgoDocuments(value), action);
}

export function unwrapMgoQueryDocuments(value, action = 'QUERY') {
  let documents;
  try {
    documents = extractMgoDocuments(value);
    while (documents.length === 1 && Array.isArray(documents[0])) documents = documents[0];
  } catch {
    throw new Error(`${action} 多文档响应包含非法 entry`);
  }
  if (!documents.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)))
    throw new Error(`${action} 多文档响应包含非法 entry`);
  return documents;
}

function collectPlanNodes(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (typeof value.stage === 'string') output.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') collectPlanNodes(child, output);
  }
  return output;
}

function objectShape(value, depth = 0) {
  if (!value || typeof value !== 'object') return typeof value;
  if (depth >= 3) return Array.isArray(value) ? `array(${value.length})` : 'object';
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, objectShape(child, depth + 1)]),
  );
}

function assertExplainPlan(document, expectedIndex, name) {
  const winningPlan = document?.queryPlanner?.winningPlan;
  if (!winningPlan)
    throw new Error(
      `${name} explain 缺少 winningPlan；结构=${JSON.stringify(objectShape(document))}`,
    );
  const nodes = collectPlanNodes(winningPlan);
  const stages = nodes.map((node) => node.stage);
  if (stages.some((stage) => /SORT/i.test(stage))) throw new Error(`${name} 出现阻塞 SORT`);
  if (!stages.includes('IXSCAN')) throw new Error(`${name} 未使用 IXSCAN`);
  if (!stages.includes('FETCH')) throw new Error(`${name} 未在 limit 前执行 FETCH`);
  if (!stages.includes('LIMIT')) throw new Error(`${name} 缺少 LIMIT`);
  const indexes = nodes.map((node) => node.indexName).filter(Boolean);
  if (!indexes.includes(expectedIndex))
    throw new Error(`${name} 未命中预期索引 ${expectedIndex}，实际 ${indexes.join(',') || '无'}`);
  const stats = document.executionStats ?? {};
  const nReturned = finiteNumberOrNull(stats.nReturned);
  if (nReturned !== null && nReturned > READ_LIMIT)
    throw new Error(`${name} 返回超过 ${READ_LIMIT}`);
  return {
    stages,
    index: expectedIndex,
    nReturned,
    totalKeysExamined: finiteNumberOrNull(stats.totalKeysExamined),
    totalDocsExamined: finiteNumberOrNull(stats.totalDocsExamined),
  };
}

function finiteNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mongoEnvelope(collection, commandType, command) {
  assertTemporaryCollection(collection);
  return [
    {
      TableName: collection,
      CommandType: commandType,
      Command: JSON.stringify(command),
    },
  ];
}

function executeMgo(
  runner,
  target,
  collection,
  commandType,
  command,
  action,
  resultMode = 'single',
) {
  const value = runner.execute(
    action,
    [
      'db',
      'nosql',
      'execute',
      '--json',
      '--command',
      JSON.stringify(mongoEnvelope(collection, commandType, command)),
    ],
    target,
  );
  return {
    requestId: requestIdOf(value),
    document:
      resultMode === 'query-many'
        ? unwrapMgoQueryDocuments(value, 'QUERY')
        : singleMgoDocument(value, action),
    raw: value,
  };
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function listCollections(runner, target) {
  const response = runner.api(
    'ListTables',
    { EnvId: target.envId, MgoLimit: 1000, MgoOffset: 0 },
    target,
  );
  return {
    requestId: response.RequestId,
    collections: (response.Tables ?? [])
      .map((item) => ({ name: item.TableName }))
      .filter((x) => x.name),
  };
}

async function waitForCollection(runner, target, collection, present) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const listed = await listCollections(runner, target);
    const found = listed.collections.some((item) => item.name === collection);
    if (found === present) return listed;
    if (Date.now() >= deadline) throw new Error(`临时集合可见性未在 30 秒内收敛: ${present}`);
    await sleep(1_000);
  }
}

function validDate(value) {
  return bsonDateMillis(value) !== null;
}

function validActivity(item) {
  const start = bsonDateMillis(item?.event_start);
  const end = bsonDateMillis(item?.event_end);
  return item && item.is_deleted !== true && start !== null && end !== null && start < end;
}

function compareTuple(left, right, field, direction) {
  const byTime = (bsonDateMillis(left[field]) - bsonDateMillis(right[field])) * direction;
  return (
    byTime ||
    Buffer.compare(Buffer.from(left._id, 'utf8'), Buffer.from(right._id, 'utf8')) * direction
  );
}

function dateReadbackCommand(collection) {
  return {
    find: collection,
    filter: {
      _id: { $in: DATE_READBACK_IDS },
      event_start: { $type: 'date' },
      event_end: { $type: 'date' },
    },
    sort: { _id: 1 },
    limit: DATE_READBACK_IDS.length,
  };
}

function assertDateReadback(items) {
  if (!Array.isArray(items)) throw new Error('BSON Date 回读结果非法');
  const ids = items.map((item) => item._id);
  if (JSON.stringify(ids) !== JSON.stringify(DATE_READBACK_IDS))
    throw new Error(`BSON Date 回读 ID 不完整: ${ids.join(',') || '无'}`);
  for (const item of items) {
    if (!validDate(item.event_start) || !validDate(item.event_end))
      throw new Error(`BSON Date 回读类型非法: ${item._id}`);
  }
  return ids;
}

function queryCommand(collection, definition, boundary, segment, limit = READ_LIMIT) {
  return {
    find: collection,
    filter: cursorSegmentFilter(definition, boundary, segment),
    sort: streamSort(definition, segment),
    limit,
  };
}

async function readStream(executeQuery, collection, definition) {
  const items = [];
  const requestIds = [];
  let boundary;
  for (let batch = 0; batch < 10; batch += 1) {
    let candidates;
    if (!boundary) {
      const response = await executeQuery({
        name: `smoke-${definition.name}-${batch + 1}`,
        collection,
        command: queryCommand(collection, definition),
      });
      requestIds.push(response.requestId);
      candidates = response.items;
    } else {
      const sameTime = await executeQuery({
        name: `smoke-${definition.name}-${batch + 1}-same-time`,
        collection,
        command: queryCommand(collection, definition, boundary, 'same-time'),
      });
      requestIds.push(sameTime.requestId);
      candidates = sameTime.items.slice(0, READ_LIMIT);
      if (candidates.length < READ_LIMIT) {
        const crossTime = await executeQuery({
          name: `smoke-${definition.name}-${batch + 1}-cross-time`,
          collection,
          command: queryCommand(
            collection,
            definition,
            boundary,
            'cross-time',
            READ_LIMIT - candidates.length,
          ),
        });
        requestIds.push(crossTime.requestId);
        candidates.push(...crossTime.items.slice(0, READ_LIMIT - candidates.length));
      }
    }
    items.push(...candidates.filter(validActivity));
    if (candidates.length < READ_LIMIT) return { items, requestIds };
    const last = candidates.at(-1);
    boundary = { time: last[definition.field], id: last._id };
  }
  throw new Error(`${definition.name} smoke 超过 10 个批次`);
}

function assertSmokeView(name, items, field, direction) {
  if (items.length < 41) throw new Error(`${name} smoke 少于 41 条`);
  const ids = items.map((item) => item._id);
  if (new Set(ids).size !== ids.length) throw new Error(`${name} smoke 出现重复 ID`);
  for (let index = 1; index < items.length; index += 1) {
    if (compareTuple(items[index - 1], items[index], field, direction) > 0)
      throw new Error(`${name} smoke 全局排序错误`);
  }
  if (items.some((item) => item.is_deleted === true || !validActivity(item)))
    throw new Error(`${name} smoke 包含不可见或非法记录`);
  const pages = [];
  for (let offset = 0; offset < items.length; offset += PAGE_SIZE)
    pages.push(items.slice(offset, offset + PAGE_SIZE).map((item) => item._id));
  if (pages[0]?.length !== 20 || pages[1]?.length !== 20 || !pages[2]?.length)
    throw new Error(`${name} smoke 未形成 20+20+N`);
  return { count: items.length, pages, ids };
}

async function executeSmoke({ collection, asOf, executeQuery }) {
  const streams = streamDefinitions(asOf);
  const results = new Map();
  const requestIds = [];
  for (const definition of streams) {
    const result = await readStream(executeQuery, collection, definition);
    results.set(definition.name, result.items);
    requestIds.push(...result.requestIds);
  }
  const future = [...results.get('ongoing'), ...results.get('scheduled')].sort((left, right) =>
    compareTuple(left, right, 'event_start', 1),
  );
  const history = [...results.get('finished'), ...results.get('past-published')].sort(
    (left, right) => compareTuple(left, right, 'event_end', -1),
  );
  const futureSummary = assertSmokeView('future', future, 'event_start', 1);
  const historySummary = assertSmokeView('history', history, 'event_end', -1);
  for (const legacyId of ['ongoing-000', 'scheduled-000', 'finished-000', 'past-published-000']) {
    if (![...future, ...history].some((item) => item._id === legacyId))
      throw new Error(`legacy is_deleted 缺失记录不可见: ${legacyId}`);
  }
  return { requestIds, future: futureSummary, history: historySummary };
}

export function createCliExecutor({ envId, region = REGION, runner = new CloudBaseCliRunner() }) {
  const target = { envId, region };
  return async function execute(operation) {
    assertTemporaryCollection(operation.collection);
    if (operation.kind === 'list-collections') return listCollections(runner, target);
    if (operation.kind === 'create') {
      const response = runner.api(
        'CreateTable',
        {
          EnvId: envId,
          TableName: operation.collection,
          PermissionInfo: { EnvId: envId, AclTag: 'ADMINONLY' },
        },
        target,
      );
      await waitForCollection(runner, target, operation.collection, true);
      return { requestId: response.RequestId };
    }
    if (operation.kind === 'create-index') {
      const response = runner.api(
        'UpdateTable',
        {
          EnvId: envId,
          TableName: operation.collection,
          CreateIndexes: [exactIndexPayload(operation.index)],
        },
        target,
      );
      return { requestId: response.RequestId };
    }
    if (operation.kind === 'insert') {
      const response = executeMgo(
        runner,
        target,
        operation.collection,
        'INSERT',
        { insert: operation.collection, documents: operation.documents, ordered: true },
        'probe-insert',
      );
      return { requestId: response.requestId, result: response.document };
    }
    if (operation.kind === 'verify-date-types') {
      const response = executeMgo(
        runner,
        target,
        operation.collection,
        'QUERY',
        dateReadbackCommand(operation.collection),
        'probe-date-readback',
        'query-many',
      );
      return { requestId: response.requestId, items: response.document };
    }
    if (operation.kind === 'explain') {
      const response = executeMgo(
        runner,
        target,
        operation.collection,
        'COMMAND',
        operation.command,
        `probe-explain-${operation.name}`,
      );
      return { requestId: response.requestId, plan: response.document };
    }
    if (operation.kind === 'smoke') {
      return executeSmoke({
        collection: operation.collection,
        asOf: operation.asOf,
        executeQuery: async (query) => {
          const response = executeMgo(
            runner,
            target,
            query.collection,
            'QUERY',
            query.command,
            query.name,
            'query-many',
          );
          return {
            requestId: response.requestId,
            items: response.document,
          };
        },
      });
    }
    if (operation.kind === 'drop') {
      const response = runner.api(
        'DeleteTable',
        { EnvId: envId, TableName: operation.collection },
        target,
      );
      await waitForCollection(runner, target, operation.collection, false);
      return { requestId: response.RequestId };
    }
    throw new Error(`未知 probe operation: ${operation.kind}`);
  };
}

export async function runProbe({ envId, collection, execute }) {
  assertTemporaryCollection(collection);
  if (typeof envId !== 'string' || !envId) throw new Error('envId 非法');
  if (typeof execute !== 'function') throw new Error('execute 非法');
  let created = false;
  let primaryError;
  const summary = {
    envId,
    collection,
    fixtureCount: 0,
    createRequestId: '',
    indexRequestIds: [],
    insertRequestId: '',
    dateReadback: undefined,
    explains: [],
    smoke: undefined,
    cleanup: undefined,
  };
  try {
    const existing = await execute({ kind: 'list-collections', collection });
    if (existing.collections?.some((item) => item.name === collection))
      throw new Error('临时集合已存在，拒绝覆盖');
    const create = await execute({ kind: 'create', collection });
    created = true;
    summary.createRequestId = create.requestId;
    for (const index of INDEXES) {
      const response = await execute({ kind: 'create-index', collection, index });
      summary.indexRequestIds.push({ name: index.name, requestId: response.requestId });
    }
    const fixtures = buildFixtures(PROBE_AS_OF);
    const inserted = await execute({ kind: 'insert', collection, documents: fixtures });
    summary.fixtureCount = fixtures.length;
    summary.insertRequestId = inserted.requestId;
    const dateReadback = await execute({ kind: 'verify-date-types', collection });
    summary.dateReadback = {
      requestId: dateReadback.requestId,
      ids: assertDateReadback(dateReadback.items),
      bsonDateVerified: true,
    };
    for (const item of buildExplainCommands(collection, PROBE_AS_OF)) {
      let response;
      try {
        response = await execute({
          kind: 'explain',
          name: item.name,
          collection,
          command: item.command,
        });
        summary.explains.push({
          name: item.name,
          requestId: response.requestId,
          passed: true,
          ...assertExplainPlan(response.plan, item.expectedIndex, item.name),
        });
      } catch (error) {
        summary.explains.push({
          name: item.name,
          requestId: response?.requestId ?? '',
          passed: false,
          error: sanitizeError(error.message),
        });
        throw error;
      }
    }
    summary.smoke = await execute({ kind: 'smoke', collection, asOf: PROBE_AS_OF });
  } catch (error) {
    primaryError = error;
  } finally {
    let cleanupError;
    if (created) {
      try {
        const dropped = await execute({ kind: 'drop', collection });
        const listed = await execute({ kind: 'list-collections', collection });
        const remaining = (listed.collections ?? []).filter((item) => item.name === collection);
        if (remaining.length !== 0) throw new Error('临时集合清理未收敛');
        summary.cleanup = {
          dropRequestId: dropped.requestId,
          verifyRequestId: listed.requestId,
          remaining: 0,
        };
      } catch (error) {
        cleanupError = error;
      }
    }
    if (primaryError && cleanupError) {
      const aggregate = new AggregateError(
        [primaryError, cleanupError],
        `${primaryError.message}；同时清理失败：${cleanupError.message}`,
      );
      aggregate.probeSummary = summary;
      throw aggregate;
    }
    if (cleanupError) {
      cleanupError.probeSummary = summary;
      throw cleanupError;
    }
  }
  if (primaryError) {
    primaryError.probeSummary = summary;
    throw primaryError;
  }
  return summary;
}

function parseArgs(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--env-id' || arg === '--collection') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少参数`);
      index += 1;
      if (arg === '--env-id') options.envId = value;
      else options.collection = value;
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`不支持的参数: ${arg}`);
  }
  return options;
}

function usage() {
  return '用法: node scripts/activity-home-timeline-planner-probe.mjs --env-id ENV --collection tmp_activity_home_timeline_f8d1d2e2 --apply';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  assertTemporaryCollection(options.collection);
  const config = JSON.parse(readFileSync(new URL('../cloudbaserc.json', import.meta.url), 'utf8'));
  if (options.envId !== config.envId) throw new Error('只允许 cloudbaserc.json 指定测试环境');
  if (!options.apply) {
    console.log(
      JSON.stringify({
        mode: 'plan',
        envId: options.envId,
        collection: options.collection,
        fixtureCount: buildFixtures(PROBE_AS_OF).length,
        explainCount: buildExplainCommands(options.collection, PROBE_AS_OF).length,
      }),
    );
    return;
  }
  const summary = await runProbe({
    envId: options.envId,
    collection: options.collection,
    execute: createCliExecutor({ envId: options.envId }),
  });
  console.log(JSON.stringify({ mode: 'apply', passed: true, ...summary }, null, 2));
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        mode: 'error',
        passed: false,
        error: sanitizeError(error.message),
        ...(error.probeSummary ? { evidence: error.probeSummary } : {}),
      }),
    );
    process.exitCode = 1;
  });
}
