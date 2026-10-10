'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const VALID_STATUSES = new Set(['draft', 'published', 'finished']);

function comparable(value) {
  if (value instanceof Date) return value.getTime();
  return value;
}

function bsonRank(value) {
  if (typeof value === 'string') return 2;
  if (value && typeof value === 'object' && !(value instanceof Date)) return 3;
  if (typeof value === 'boolean') return 8;
  if (value instanceof Date) return 9;
  if (typeof value === 'number') return 1;
  return 0;
}

function compareValues(left, right) {
  const rank = bsonRank(left) - bsonRank(right);
  if (rank) return rank < 0 ? -1 : 1;
  const a = comparable(left);
  const b = comparable(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

function equal(left, right) {
  return bsonRank(left) === bsonRank(right) && comparable(left) === comparable(right);
}

function operation(kind, value) {
  const node = {
    __queryKind: 'operation',
    kind,
    value,
    or(other) {
      return logic('or', [node, other]);
    },
    and(other) {
      return logic('and', [node, other]);
    },
  };
  return node;
}

function logic(kind, values) {
  const flattened = values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
  return { __queryKind: 'logic', kind, values: flattened };
}

function queryCommand() {
  return {
    eq: (value) => operation('eq', value),
    neq: (value) => operation('neq', value),
    gt: (value) => operation('gt', value),
    gte: (value) => operation('gte', value),
    lt: (value) => operation('lt', value),
    lte: (value) => operation('lte', value),
    in: (value) => operation('in', value),
    nin: (value) => operation('nin', value),
    exists: (value) => operation('exists', value),
    or: (...values) => logic('or', values),
    and: (...values) => logic('and', values),
  };
}

function matchesOperation(value, present, expression) {
  const right = expression.value;
  switch (expression.kind) {
    case 'eq':
      return present && equal(value, right);
    case 'neq':
      return !present || !equal(value, right);
    case 'gt':
      return present && compareValues(value, right) > 0;
    case 'gte':
      return present && compareValues(value, right) >= 0;
    case 'lt':
      return present && compareValues(value, right) < 0;
    case 'lte':
      return present && compareValues(value, right) <= 0;
    case 'in':
      return Array.isArray(right) && right.some((candidate) => equal(value, candidate));
    case 'nin':
      return !Array.isArray(right) || !right.some((candidate) => equal(value, candidate));
    case 'exists':
      return present === right;
    default:
      throw new Error(`unsupported query operation: ${expression.kind}`);
  }
}

function matchesValue(value, present, expression) {
  if (expression && expression.__queryKind === 'operation')
    return matchesOperation(value, present, expression);
  if (expression && expression.__queryKind === 'logic') {
    const results = expression.values.map((item) => matchesValue(value, present, item));
    return expression.kind === 'or' ? results.some(Boolean) : results.every(Boolean);
  }
  return present && equal(value, expression);
}

function matchesRecord(record, expression) {
  if (!expression || typeof expression !== 'object') return false;
  if (expression.__queryKind === 'logic') {
    const results = expression.values.map((item) => matchesRecord(record, item));
    return expression.kind === 'or' ? results.some(Boolean) : results.every(Boolean);
  }
  return Object.entries(expression).every(([field, value]) =>
    matchesValue(record[field], Object.prototype.hasOwnProperty.call(record, field), value),
  );
}

function queryOperationValues(expression, kind, values = []) {
  if (!expression || typeof expression !== 'object') return values;
  if (expression.__queryKind === 'operation') {
    if (expression.kind === kind) values.push(expression.value);
    if (expression.value && typeof expression.value === 'object')
      queryOperationValues(expression.value, kind, values);
    return values;
  }
  if (expression.__queryKind === 'logic') {
    for (const value of expression.values) queryOperationValues(value, kind, values);
    return values;
  }
  for (const value of Object.values(expression)) queryOperationValues(value, kind, values);
  return values;
}

function compareRecords(left, right, orders) {
  for (const { field, direction } of orders) {
    const result = compareValues(left[field], right[field]);
    if (result === 0) continue;
    return direction === 'desc' ? -result : result;
  }
  return 0;
}

function loadMain({ records, openid = 'owner-a', admin = true }) {
  const state = { reads: [] };
  const command = queryCommand();

  function activitiesQuery() {
    const conditions = [];
    const orders = [];
    let pageLimit;
    let offset = 0;
    return {
      where(condition) {
        conditions.push(condition);
        return this;
      },
      orderBy(field, direction) {
        orders.push({ field, direction });
        return this;
      },
      skip(value) {
        offset = value;
        return this;
      },
      limit(value) {
        pageLimit = value;
        return this;
      },
      async get() {
        state.reads.push({ conditions, orders, limit: pageLimit, skip: offset });
        const filtered = records.filter((record) =>
          conditions.every((condition) => matchesRecord(record, condition)),
        );
        const sorted = orders.length
          ? [...filtered].sort((left, right) => compareRecords(left, right, orders))
          : filtered;
        return { data: sorted.slice(offset, offset + (pageLimit ?? 100)) };
      },
    };
  }

  function collection(name) {
    if (name === 'activities') return activitiesQuery();
    if (name === 'admins') {
      return {
        doc(id) {
          return { get: async () => ({ data: admin ? { _id: id, enabled: true } : undefined }) };
        },
      };
    }
    throw new Error(`unexpected collection: ${name}`);
  }

  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => ({ collection, command }),
    getWXContext: () => ({ OPENID: openid }),
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('./index')];
    return { main: require('./index').main, state };
  } finally {
    Module._load = originalLoad;
  }
}

function activity(id, start, overrides = {}, { legacyTime = false } = {}) {
  return {
    _id: id,
    title: id,
    status: 'draft',
    created_by: 'owner-a',
    ...(start === undefined ? {} : { event_start: legacyTime ? start : new Date(start) }),
    ...overrides,
  };
}

function timestamp(index) {
  return new Date(Date.UTC(2030, 0, 1, 0, index, 0)).toISOString();
}

function assertOpaqueCursor(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^[A-Za-z0-9_-]+$/);
  assert.equal(value.includes('{'), false);
  assert.equal(value.includes('event_start'), false);
}

function encodedCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodedCursor(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function readAll(main, pageSize = 50) {
  const items = [];
  let cursor;
  for (let page = 0; page < 10; page += 1) {
    const response = await main({
      action: 'list',
      page_size: pageSize,
      ...(cursor ? { cursor } : {}),
    });
    assert.equal(response.ok, true);
    assert.ok(response.data && !Array.isArray(response.data));
    assert.ok(Array.isArray(response.data.items));
    assert.ok(response.data.next_cursor === null || typeof response.data.next_cursor === 'string');
    items.push(...response.data.items);
    if (response.data.next_cursor === null) return items;
    assertOpaqueCursor(response.data.next_cursor);
    assert.notEqual(response.data.next_cursor, cursor);
    cursor = response.data.next_cursor;
  }
  assert.fail('pagination did not terminate');
}

test('分页协议完整返回 101 条活动并按 50+50+1 结束', async () => {
  const records = Array.from({ length: 101 }, (_, index) =>
    activity(`a${String(index).padStart(3, '0')}`, timestamp(index)),
  );
  const { main, state } = loadMain({ records });

  const items = await readAll(main);

  assert.equal(items.length, 101);
  assert.equal(new Set(items.map((item) => item._id)).size, 101);
  assert.deepEqual(
    state.reads.map((read) => read.limit),
    [51, 51, 51, 50, 50],
  );
});

test('相同 event_start 使用 _id DESC keyset，跨页无重复或遗漏', async () => {
  const sharedStart = timestamp(1);
  const records = Array.from({ length: 101 }, (_, index) =>
    activity(`same-${String(index).padStart(3, '0')}`, sharedStart),
  );
  const { main } = loadMain({ records });

  const items = await readAll(main);

  assert.deepEqual(
    items.map((item) => item._id),
    records
      .map((item) => item._id)
      .sort()
      .reverse(),
  );
});

test('删除和非法 status 在 limit 前排除，缺失 is_deleted 的旧记录仍保留', async () => {
  const deleted = Array.from({ length: 60 }, (_, index) =>
    activity(`deleted-${index}`, timestamp(300 + index), { is_deleted: true }),
  );
  const invalid = Array.from({ length: 60 }, (_, index) =>
    activity(`invalid-${index}`, timestamp(200 + index), { status: 'archived' }),
  );
  const valid = Array.from({ length: 51 }, (_, index) =>
    activity(`valid-${String(index).padStart(3, '0')}`, timestamp(index), {
      status: ['draft', 'published', 'finished'][index % 3],
      ...(index % 2 === 0 ? { is_deleted: false } : {}),
    }),
  );
  const { main } = loadMain({ records: [...deleted, ...invalid, ...valid] });

  const items = await readAll(main);

  assert.equal(items.length, 51);
  assert.ok(items.every((item) => VALID_STATUSES.has(item.status)));
  assert.ok(items.every((item) => item._id.startsWith('valid-')));
  assert.ok(items.some((item) => item._id === 'valid-001'));
});

test('dated 阶段完成后进入 undated draft 阶段并保持 _id DESC', async () => {
  const records = [
    activity('dated-new', timestamp(2), { status: 'published' }),
    activity('dated-old', timestamp(1), { status: 'finished' }),
    activity('undated-b', undefined),
    activity('undated-a', undefined),
    activity('undated-published', undefined, { status: 'published' }),
  ];
  const { main, state } = loadMain({ records });

  const dated = await main({ action: 'list', page_size: 2 });
  assert.deepEqual(
    dated.data.items.map((item) => item._id),
    ['dated-new', 'dated-old'],
  );
  assert.deepEqual(decodedCursor(dated.data.next_cursor), {
    v: 1,
    phase: 'undated',
    status_filter: 'all',
    id: null,
  });

  const undated = await main({
    action: 'list',
    page_size: 2,
    cursor: dated.data.next_cursor,
  });
  assert.deepEqual(
    undated.data.items.map((item) => item._id),
    ['undated-b', 'undated-a'],
  );
  assert.equal(undated.data.next_cursor, null);
  assert.deepEqual(
    state.reads.map((read) => ({
      limit: read.limit,
      order: read.orders.map((entry) => entry.field),
    })),
    [
      { limit: 3, order: ['event_start', '_id'] },
      { limit: 1, order: ['event_start', '_id'] },
      { limit: 1, order: ['_id'] },
      { limit: 3, order: ['_id'] },
    ],
  );
});

test('BSON Date 与 legacy ISO 时间分阶段读取且 cursor 边界查询保持 Date', async () => {
  const records = [
    activity('date-new', timestamp(4)),
    activity('date-middle', timestamp(3)),
    activity('date-old', timestamp(2)),
    activity('legacy-new', timestamp(5), {}, { legacyTime: true }),
    activity('legacy-old', timestamp(1), {}, { legacyTime: true }),
    activity('undated', undefined),
  ];
  const { main, state } = loadMain({ records });

  const items = await readAll(main, 2);

  assert.deepEqual(
    items.map((item) => item._id),
    ['date-new', 'date-middle', 'date-old', 'legacy-new', 'legacy-old', 'undated'],
  );
  const dateBoundaryValues = state.reads.flatMap((read) =>
    read.conditions.flatMap((condition) => [
      ...queryOperationValues(condition, 'eq'),
      ...queryOperationValues(condition, 'lt'),
    ]),
  );
  assert.ok(dateBoundaryValues.some((value) => value instanceof Date && value.getTime() > 0));
  assert.equal(
    dateBoundaryValues.some((value) => typeof value === 'string' && value === timestamp(3)),
    false,
  );
  assert.ok(
    state.reads.some(
      (read) =>
        JSON.stringify(read.orders) ===
        JSON.stringify([
          { field: 'event_start', direction: 'desc' },
          { field: '_id', direction: 'desc' },
        ]),
    ),
  );
});

test('status_filter 在数据库 limit 前生效并绑定 cursor', async () => {
  const records = Array.from({ length: 120 }, (_, index) =>
    activity(`status-${String(index).padStart(3, '0')}`, timestamp(index), {
      status: index % 3 === 0 ? 'published' : 'draft',
    }),
  );
  const { main } = loadMain({ records });

  const first = await main({ action: 'list', page_size: 20, status_filter: 'published' });
  assert.equal(first.ok, true);
  assert.equal(first.data.items.length, 20);
  assert.ok(first.data.items.every((item) => item.status === 'published'));

  const second = await main({
    action: 'list',
    page_size: 20,
    status_filter: 'published',
    cursor: first.data.next_cursor,
  });
  assert.equal(second.ok, true);
  assert.ok(second.data.items.every((item) => item.status === 'published'));
  assert.equal(
    new Set([...first.data.items, ...second.data.items].map((item) => item._id)).size,
    40,
  );

  const mismatched = await main({
    action: 'list',
    page_size: 20,
    status_filter: 'draft',
    cursor: first.data.next_cursor,
  });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.error.code, 'VALIDATION_FAILED');
});

test('成员分页每一页仅返回可信 OPENID 对应 owner 的活动', async () => {
  const other = Array.from({ length: 60 }, (_, index) =>
    activity(`other-${index}`, timestamp(200 + index), { created_by: 'owner-b' }),
  );
  const own = Array.from({ length: 51 }, (_, index) =>
    activity(`own-${String(index).padStart(3, '0')}`, timestamp(index)),
  );
  const { main } = loadMain({ records: [...other, ...own], admin: false });

  const items = await readAll(main);

  assert.equal(items.length, 51);
  assert.ok(items.every((item) => item._id.startsWith('own-')));
});

test('分页读取不使用 skip，且每次数据库 limit 不超过 page_size+1', async () => {
  const records = Array.from({ length: 20 }, (_, index) =>
    activity(`a-${index}`, timestamp(index)),
  );
  const { main, state } = loadMain({ records });

  await main({ action: 'list', page_size: 7 });

  assert.ok(state.reads.length > 0);
  assert.ok(state.reads.every((read) => Number.isInteger(read.limit) && read.limit <= 8));
  assert.ok(state.reads.every((read) => read.skip === 0));
});

test('非法 page_size 与 cursor fail closed', async (t) => {
  const invalidEvents = [
    { action: 'list', page_size: 0 },
    { action: 'list', page_size: 51 },
    { action: 'list', page_size: 1.5 },
    { action: 'list', page_size: '50' },
    { action: 'list', page_size: 50, cursor: 'not-base64url!' },
    { action: 'list', cursor: 'YWJj' },
    { action: 'list', page_size: 50, cursor: 'A'.repeat(513) },
    {
      action: 'list',
      page_size: 50,
      cursor: encodedCursor({ phase: 'dated', event_start: timestamp(1), id: 'a1' }),
    },
    {
      action: 'list',
      page_size: 50,
      cursor: encodedCursor({ v: 2, phase: 'dated', event_start: timestamp(1), id: 'a1' }),
    },
    {
      action: 'list',
      page_size: 50,
      cursor: encodedCursor({
        v: 1,
        phase: 'dated',
        event_start: timestamp(1),
        id: 'a1',
        extra: true,
      }),
    },
    {
      action: 'list',
      page_size: 50,
      cursor: encodedCursor({ v: 1, phase: 'future', id: 'a1' }),
    },
    {
      action: 'list',
      page_size: 50,
      cursor: encodedCursor({ v: 1, phase: 'dated', event_start: 'invalid', id: 'a1' }),
    },
    {
      action: 'list',
      page_size: 50,
      cursor: encodedCursor({ v: 1, phase: 'undated', id: '' }),
    },
  ];
  for (const event of invalidEvents) {
    await t.test(JSON.stringify(event), async () => {
      const { main } = loadMain({ records: [] });
      const response = await main(event);
      assert.equal(response.ok, false);
      assert.equal(response.error.code, 'VALIDATION_FAILED');
    });
  }
});

test('旧 action=list 不带分页字段时继续返回裸数组', async () => {
  const { main } = loadMain({ records: [activity('legacy', timestamp(1))] });

  const response = await main({ action: 'list' });

  assert.equal(response.ok, true);
  assert.ok(Array.isArray(response.data));
  assert.equal(response.data[0]._id, 'legacy');
});
