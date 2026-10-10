'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { listMinePage, parseMinePageRequest } = require('./mine-page');
const { projectTripActivity } = require('./trip-activity');

function compare(left, right) {
  if (left instanceof Date || right instanceof Date) {
    return new Date(left).getTime() - new Date(right).getTime();
  }
  if (typeof left === 'string' && typeof right === 'string')
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
  return left === right ? 0 : left < right ? -1 : 1;
}

function matches(document, condition) {
  if (condition.$and) return condition.$and.every((item) => matches(document, item));
  if (condition.$or) return condition.$or.some((item) => matches(document, item));
  return Object.entries(condition).every(([field, expected]) => {
    const actual = document[field];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if (Object.hasOwn(expected, '$lt')) return compare(actual, expected.$lt) < 0;
      if (Object.hasOwn(expected, '$eq')) return compare(actual, expected.$eq) === 0;
    }
    return compare(actual, expected) === 0;
  });
}

function fixture(records) {
  const state = { reads: [] };
  const command = {
    lt: (value) => ({ $lt: value }),
    eq: (value) => ({ $eq: value }),
    and: (...conditions) => ({ $and: conditions }),
    or: (...conditions) => ({ $or: conditions }),
  };
  const db = {
    collection(name) {
      assert.equal(name, 'registrations');
      return {
        where(condition) {
          const order = [];
          const query = {
            orderBy(field, direction) {
              order.push([field, direction]);
              return query;
            },
            limit(limit) {
              state.reads.push({ condition, order: [...order], limit });
              return {
                async get() {
                  const data = records
                    .filter((item) => matches(item, condition))
                    .sort((left, right) => {
                      for (const [field, direction] of order) {
                        const compared = compare(left[field], right[field]);
                        if (compared) return direction === 'asc' ? compared : -compared;
                      }
                      return 0;
                    })
                    .slice(0, limit);
                  return { data };
                },
              };
            },
          };
          return query;
        },
      };
    },
  };
  return { db, command, state };
}

function registration(id, createdAt, openid = 'member-openid') {
  return {
    _id: id,
    openid,
    activity_id: `activity-${id}`,
    status: 'approved',
    created_at: new Date(createdAt),
    updated_at: new Date(createdAt),
    profile_snapshot: {},
  };
}

async function readAll(records, pageSize = 50) {
  const { db, command, state } = fixture(records);
  const items = [];
  let cursor;
  for (let page = 0; page < 10; page += 1) {
    const result = await listMinePage({
      db,
      command,
      openid: 'member-openid',
      event: {
        action: 'minePage',
        page_size: pageSize,
        ...(cursor ? { cursor } : {}),
      },
    });
    items.push(...result.items);
    if (result.next_cursor === null) return { items, state };
    assert.match(result.next_cursor, /^[A-Za-z0-9_-]+$/);
    assert.notEqual(result.next_cursor, cursor);
    cursor = result.next_cursor;
  }
  assert.fail('pagination did not terminate');
}

test('minePage 以 50+50+1 完整返回 101 条本人报名且不使用 skip', async () => {
  const records = Array.from({ length: 101 }, (_, index) =>
    registration(
      `registration-${String(index).padStart(3, '0')}`,
      new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    ),
  );
  records.push(registration('other-member', '2027-01-01T00:00:00.000Z', 'other-openid'));

  const { items, state } = await readAll(records);

  assert.equal(items.length, 101);
  assert.equal(new Set(items.map((item) => item._id)).size, 101);
  assert.deepEqual(
    items.map((item) => item._id),
    records
      .filter((item) => item.openid === 'member-openid')
      .sort((left, right) => right.created_at.getTime() - left.created_at.getTime())
      .map((item) => item._id),
  );
  assert.deepEqual(
    state.reads.map((read) => read.limit),
    [51, 51, 51],
  );
  assert.ok(state.reads.every((read) => !Object.hasOwn(read, 'skip')));
});

test('相同 created_at 使用 UTF-8 binary _id DESC 跨页且无漏重', async () => {
  const shared = '2026-10-10T08:00:00.000Z';
  const alphabet = ['-', '_', 'A', 'Z', 'a', 'z'];
  const records = Array.from({ length: 101 }, (_, index) =>
    registration(`${alphabet[index % alphabet.length]}-${String(index).padStart(3, '0')}`, shared),
  );

  const { items } = await readAll(records, 7);
  const expected = records
    .map((item) => item._id)
    .sort((left, right) => Buffer.compare(Buffer.from(right, 'utf8'), Buffer.from(left, 'utf8')));

  assert.deepEqual(
    items.map((item) => item._id),
    expected,
  );
  assert.equal(new Set(items.map((item) => item._id)).size, 101);
});

test('非法 page_size 和 cursor 在数据库读取前 fail closed', async () => {
  const cases = [
    { page_size: 0 },
    { page_size: 51 },
    { page_size: 1.5 },
    { page_size: '50' },
    { page_size: 50, cursor: 'not-base64url!' },
    { page_size: 50, cursor: 'A'.repeat(513) },
    {
      page_size: 50,
      cursor: Buffer.from(JSON.stringify({ v: 2, created_at: 'x', id: 'r' })).toString('base64url'),
    },
  ];

  for (const event of cases) {
    assert.throws(
      () => parseMinePageRequest(event),
      (error) => error && error.code === 'VALIDATION_FAILED',
    );
  }
});

function activity(id, status, patch = {}) {
  return {
    _id: id,
    title: `活动 ${id}`,
    status,
    event_start: '2026-09-01T00:00:00.000Z',
    event_end: '2026-09-01T08:00:00.000Z',
    capacity: 20,
    occupied_count: 1,
    ...patch,
  };
}

test('行程投影保留正常活动并安全降级 draft、软删和物理缺失活动', () => {
  const now = new Date('2026-10-10T00:00:00.000Z');
  const base = registration('r-history', '2026-08-01T00:00:00.000Z');
  base.activity_id = 'a-history';
  base.activity_snapshot = {
    _id: 'a-history',
    title: '快照活动',
    status: 'published',
    event_start: '2026-08-02T00:00:00.000Z',
    event_end: '2026-08-02T08:00:00.000Z',
  };

  const published = projectTripActivity(
    base,
    activity('a-history', 'published', {
      event_start: '2026-11-01T00:00:00.000Z',
      event_end: '2026-11-01T08:00:00.000Z',
    }),
    now,
  );
  const finished = projectTripActivity(base, activity('a-history', 'finished'), now);
  const draft = projectTripActivity(base, activity('a-history', 'draft'), now);
  const deleted = projectTripActivity(
    base,
    activity('a-history', 'published', { is_deleted: true }),
    now,
  );
  const missing = projectTripActivity(base, undefined, now);

  assert.equal(published.status, 'published');
  assert.equal(finished.status, 'finished');
  assert.equal(draft.status, 'finished');
  assert.equal(deleted.status, 'finished');
  assert.equal(deleted.is_deleted, undefined);
  assert.equal(missing.title, '快照活动');
  assert.equal(missing.status, 'finished');
  assert.equal(missing.registration_state, 'closed');
  assert.equal(missing.closed_reason, 'finished');
});
