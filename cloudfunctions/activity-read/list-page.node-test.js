'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeListCursor,
  encodeListCursor,
  listActivityPage,
  parseListPageRequest,
} = require('./list-page');

const AS_OF = new Date('2026-10-09T08:00:00.000Z');

function operator(name, value) {
  return {
    __operator: name,
    value,
    and(other) {
      return { __operator: 'and', value: [this, other] };
    },
  };
}

function createCommand() {
  return {
    eq: (value) => operator('eq', value),
    neq: (value) => operator('neq', value),
    gt: (value) => operator('gt', value),
    gte: (value) => operator('gte', value),
    lt: (value) => operator('lt', value),
    lte: (value) => operator('lte', value),
    and: (conditions) => operator('and', conditions),
    or: (conditions) => operator('or', conditions),
  };
}

function comparable(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function matchesOperator(actual, condition) {
  const left = comparable(actual);
  const right = comparable(condition.value);
  if (condition.__operator === 'eq') return left === right;
  if (condition.__operator === 'neq') return left !== right;
  if (condition.__operator === 'gt') return left > right;
  if (condition.__operator === 'gte') return left >= right;
  if (condition.__operator === 'lt') return left < right;
  if (condition.__operator === 'lte') return left <= right;
  if (condition.__operator === 'and')
    return condition.value.every((item) => matchesOperator(actual, item));
  throw new Error(`unsupported field operator: ${condition.__operator}`);
}

function matches(document, condition) {
  if (condition && condition.__operator === 'and')
    return condition.value.every((item) => matches(document, item));
  if (condition && condition.__operator === 'or')
    return condition.value.some((item) => matches(document, item));
  return Object.entries(condition || {}).every(([field, expected]) => {
    const actual = document[field];
    return expected && expected.__operator
      ? matchesOperator(actual, expected)
      : comparable(actual) === comparable(expected);
  });
}

function compareValues(left, right, direction) {
  const first = comparable(left);
  const second = comparable(right);
  if (first === second) return 0;
  return (first < second ? -1 : 1) * (direction === 'desc' ? -1 : 1);
}

function createDatabase(documents) {
  const calls = [];
  return {
    calls,
    db: {
      collection(name) {
        assert.equal(name, 'activities');
        return {
          where(condition) {
            const call = { name, condition, order: [], limit: undefined };
            calls.push(call);
            const query = {
              orderBy(field, direction) {
                call.order.push([field, direction]);
                return query;
              },
              limit(value) {
                call.limit = value;
                return query;
              },
              async get() {
                assert.ok(Number.isInteger(call.limit), 'query must set a limit');
                const data = documents
                  .filter((item) => matches(item, condition))
                  .sort((left, right) => {
                    for (const [field, direction] of call.order) {
                      const compared = compareValues(left[field], right[field], direction);
                      if (compared) return compared;
                    }
                    return 0;
                  })
                  .slice(0, call.limit);
                return { data };
              },
            };
            return query;
          },
        };
      },
    },
  };
}

function activity(id, overrides = {}) {
  return {
    _id: id,
    title: id,
    status: 'published',
    is_deleted: false,
    event_start: '2026-10-10T08:00:00.000Z',
    event_end: '2026-10-10T12:00:00.000Z',
    ...overrides,
  };
}

function request(view, cursor, pageSize = 20) {
  return parseListPageRequest(
    {
      action: 'listPage',
      view,
      page_size: pageSize,
      ...(cursor === undefined ? {} : { cursor }),
    },
    AS_OF,
  );
}

async function page(documents, view, cursor, pageSize = 20) {
  const database = createDatabase(documents);
  const result = await listActivityPage({
    db: database.db,
    command: createCommand(),
    request: request(view, cursor, pageSize),
    now: AS_OF,
  });
  return { ...result, calls: database.calls };
}

test('future 先读取进行中流再以未开始流补页，正在进行归 future', async () => {
  const documents = [
    activity('ongoing-1', {
      event_start: '2026-10-09T06:00:00.000Z',
      event_end: '2026-10-09T10:00:00.000Z',
    }),
    activity('scheduled-1', {
      event_start: '2026-10-09T09:00:00.000Z',
      event_end: '2026-10-09T11:00:00.000Z',
    }),
    activity('past-1', {
      event_start: '2026-10-09T04:00:00.000Z',
      event_end: '2026-10-09T08:00:00.000Z',
    }),
  ];

  const result = await page(documents, 'future');

  assert.deepEqual(
    result.items.map((item) => item._id),
    ['ongoing-1', 'scheduled-1'],
  );
  assert.equal(result.nextCursor, null);
  assert.equal(result.calls.length, 2);
  assert.deepEqual(
    result.calls.map((call) => call.order),
    [
      [
        ['event_start', 'asc'],
        ['_id', 'asc'],
      ],
      [
        ['event_start', 'asc'],
        ['_id', 'asc'],
      ],
    ],
  );
});

test('history 全局归并 finished 与自然结束 published', async () => {
  const documents = [
    activity('finished-newer', {
      status: 'finished',
      event_start: '2026-10-12T06:00:00.000Z',
      event_end: '2026-10-12T10:00:00.000Z',
    }),
    activity('published-middle', {
      event_start: '2026-10-09T05:00:00.000Z',
      event_end: '2026-10-09T07:00:00.000Z',
    }),
    activity('finished-older', {
      status: 'finished',
      event_start: '2026-10-08T05:00:00.000Z',
      event_end: '2026-10-08T07:00:00.000Z',
    }),
  ];

  const result = await page(documents, 'history');

  assert.deepEqual(
    result.items.map((item) => item._id),
    ['finished-newer', 'published-middle', 'finished-older'],
  );
  assert.equal(result.nextCursor, null);
  assert.equal(result.calls.length, 2);
});

test('event_end 等于 as_of 只进入 history', async () => {
  const boundary = activity('boundary', {
    event_start: '2026-10-09T06:00:00.000Z',
    event_end: AS_OF.toISOString(),
  });

  const future = await page([boundary], 'future');
  const history = await page([boundary], 'history');

  assert.deepEqual(future.items, []);
  assert.deepEqual(
    history.items.map((item) => item._id),
    ['boundary'],
  );
});

test('同时间戳按 _id 稳定 keyset，41 条按 20+20+1 无漏无重', async () => {
  const documents = Array.from({ length: 41 }, (_, index) =>
    activity(`future-${String(index).padStart(2, '0')}`),
  );

  const first = await page(documents, 'future');
  const second = await page(documents, 'future', first.nextCursor);
  const third = await page(documents, 'future', second.nextCursor);
  const ids = [...first.items, ...second.items, ...third.items].map((item) => item._id);

  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 20);
  assert.equal(third.items.length, 1);
  assert.equal(third.nextCursor, null);
  assert.deepEqual(
    ids,
    documents.map((item) => item._id),
  );
  assert.equal(new Set(ids).size, 41);
});

test('deleted、draft、未知状态、缺失或非法时间不占窗口', async () => {
  const invalid = [
    activity('deleted', { is_deleted: true }),
    activity('draft', { status: 'draft' }),
    activity('unknown', { status: 'archived' }),
    activity('missing-end', { event_end: undefined }),
    activity('invalid-end', { event_end: 'invalid-time' }),
    activity('reversed', {
      event_start: '2026-10-11T08:00:00.000Z',
      event_end: '2026-10-10T08:00:00.000Z',
    }),
  ];
  const valid = Array.from({ length: 21 }, (_, index) =>
    activity(`valid-${String(index).padStart(2, '0')}`, {
      event_start: `2026-10-12T${String(index).padStart(2, '0')}:00:00.000Z`,
      event_end: `2026-10-13T${String(index).padStart(2, '0')}:00:00.000Z`,
    }),
  );

  const result = await page([...invalid, ...valid], 'future');

  assert.equal(result.items.length, 20);
  assert.equal(
    result.items.every((item) => item._id.startsWith('valid-')),
    true,
  );
  assert.equal(typeof result.nextCursor, 'string');
});

test('每个 read limit<=page_size+1，单页正常路径 future/history 各<=2 reads', async () => {
  const documents = [
    activity('ongoing', {
      event_start: '2026-10-09T06:00:00.000Z',
      event_end: '2026-10-09T10:00:00.000Z',
    }),
    activity('scheduled'),
    activity('finished', {
      status: 'finished',
      event_start: '2026-10-08T05:00:00.000Z',
      event_end: '2026-10-08T07:00:00.000Z',
    }),
    activity('past-published', {
      event_start: '2026-10-09T05:00:00.000Z',
      event_end: '2026-10-09T07:00:00.000Z',
    }),
  ];

  const future = await page(documents, 'future', undefined, 7);
  const history = await page(documents, 'history', undefined, 7);

  assert.ok(future.calls.length <= 2);
  assert.ok(history.calls.length <= 2);
  assert.equal(
    [...future.calls, ...history.calls].every((call) => call.limit <= 8),
    true,
  );
});

test('非法数据连续五批仍无法收敛时返回 DATA_INTEGRITY_ERROR 且不返回部分页', async () => {
  const documents = Array.from({ length: 105 }, (_, index) =>
    activity(`invalid-${String(index).padStart(3, '0')}`, {
      event_start: `2026-11-${String(Math.floor(index / 24) + 1).padStart(2, '0')}T${String(
        index % 24,
      ).padStart(2, '0')}:00:00.000Z`,
      event_end: 'invalid-time',
    }),
  );
  const database = createDatabase(documents);

  await assert.rejects(
    () =>
      listActivityPage({
        db: database.db,
        command: createCommand(),
        request: request('future'),
        now: AS_OF,
      }),
    (error) => error && error.code === 'DATA_INTEGRITY_ERROR',
  );
  assert.ok(database.calls.length <= 10);
  assert.equal(
    database.calls.every((call) => call.limit <= 21),
    true,
  );
});

test('cursor 可往返并保留服务端 as_of 与边界', () => {
  const value = {
    v: 1,
    view: 'future',
    as_of: AS_OF.toISOString(),
    boundary: { time: '2026-10-10T08:00:00.000Z', id: 'activity-1' },
  };

  const cursor = encodeListCursor(value);

  assert.deepEqual(decodeListCursor(cursor, 'future'), value);
  assert.deepEqual(request('future', cursor).boundary, {
    time: new Date(value.boundary.time),
    id: value.boundary.id,
  });
});

test('非法 cursor/request 在数据库读取前统一 VALIDATION_FAILED', async (t) => {
  const valid = {
    v: 1,
    view: 'future',
    as_of: AS_OF.toISOString(),
    boundary: { time: '2026-10-10T08:00:00.000Z', id: 'activity-1' },
  };
  const encodeRaw = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const cases = [
    ['非 base64url', '***'],
    ['非法 JSON', Buffer.from('{').toString('base64url')],
    ['超长', 'a'.repeat(513)],
    ['缺失版本', encodeRaw({ ...valid, v: undefined })],
    ['错误版本', encodeRaw({ ...valid, v: 2 })],
    ['额外字段', encodeRaw({ ...valid, extra: true })],
    ['非法 view', encodeRaw({ ...valid, view: 'all' })],
    ['非法 as_of', encodeRaw({ ...valid, as_of: 'not-a-date' })],
    ['缺失 boundary', encodeRaw({ ...valid, boundary: undefined })],
    ['boundary 额外字段', encodeRaw({ ...valid, boundary: { ...valid.boundary, extra: 1 } })],
    [
      '非法 boundary time',
      encodeRaw({ ...valid, boundary: { ...valid.boundary, time: 'not-a-date' } }),
    ],
    ['空 ID', encodeRaw({ ...valid, boundary: { ...valid.boundary, id: '' } })],
  ];

  for (const [name, cursor] of cases) {
    await t.test(name, () => {
      assert.throws(
        () => parseListPageRequest({ action: 'listPage', view: 'future', cursor }, AS_OF),
        (error) => error && error.code === 'VALIDATION_FAILED',
      );
    });
  }

  const cursor = encodeRaw(valid);
  assert.throws(
    () => parseListPageRequest({ action: 'listPage', view: 'history', cursor }, AS_OF),
    (error) => error && error.code === 'VALIDATION_FAILED',
  );
  for (const event of [
    { action: 'listPage', view: 'all' },
    { action: 'listPage', view: 'future', page_size: 0 },
    { action: 'listPage', view: 'future', page_size: 21 },
    { action: 'listPage', view: 'future', page_size: 1.5 },
  ]) {
    assert.throws(
      () => parseListPageRequest(event, AS_OF),
      (error) => error && error.code === 'VALIDATION_FAILED',
    );
  }
});
