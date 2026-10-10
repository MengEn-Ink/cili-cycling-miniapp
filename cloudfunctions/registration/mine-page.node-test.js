'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const functionRoot = __dirname;
const sdkPath = require.resolve('wx-server-sdk', { paths: [functionRoot] });

const cmd = (op, ...args) => ({ __op: op, args });

function looseEqual(a, b) {
  if (a instanceof Date || b instanceof Date)
    return new Date(a).getTime() === new Date(b).getTime();
  return JSON.stringify(a) === JSON.stringify(b);
}

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  const na = new Date(a).getTime();
  const nb = new Date(b).getTime();
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na < nb ? -1 : na > nb ? 1 : 0;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function evalFieldCommand(actual, node) {
  const [arg] = node.args;
  if (node.__op === 'in') return arg.some((value) => looseEqual(value, actual));
  if (node.__op === 'lt') return compareValues(actual, arg) < 0;
  if (node.__op === 'eq') return looseEqual(actual, arg);
  throw new Error(`unexpected field command ${node.__op}`);
}

function evalDocCommand(doc, node) {
  const [filters] = node.args;
  if (node.__op === 'and') return filters.every((filter) => matchDoc(doc, filter));
  if (node.__op === 'or') return filters.some((filter) => matchDoc(doc, filter));
  throw new Error(`unexpected doc command ${node.__op}`);
}

function matchDoc(doc, filter) {
  if (filter && filter.__op) return evalDocCommand(doc, filter);
  return Object.entries(filter).every(([key, expected]) => {
    if (expected && expected.__op) return evalFieldCommand(doc[key], expected);
    return looseEqual(doc[key], expected);
  });
}

class FakeQuery {
  constructor(rows) {
    this.rows = rows;
    this.filters = [];
    this.sorts = [];
    this.limitN = null;
  }
  where(filter) {
    this.filters.push(filter);
    return this;
  }
  orderBy(field, direction) {
    this.sorts.push([field, direction]);
    return this;
  }
  limit(n) {
    this.limitN = n;
    return this;
  }
  async get() {
    let rows = this.rows.filter((row) => this.filters.every((filter) => matchDoc(row, filter)));
    rows = rows.map((row) => ({ ...row }));
    rows.sort((left, right) => {
      for (const [field, direction] of this.sorts) {
        const result = compareValues(left[field], right[field]);
        if (result !== 0) return direction === 'asc' ? result : -result;
      }
      return 0;
    });
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return { data: rows };
  }
}

function buildStore() {
  const registrations = [];
  const base = new Date('2026-09-01T00:00:00.000Z').getTime();
  for (let i = 0; i < 101; i += 1) {
    const padded = String(i).padStart(3, '0');
    registrations.push({
      _id: `reg${padded}`,
      openid: 'openA',
      activity_id: `act${padded}`,
      created_at: new Date(base + i * 60_000),
      status: 'approved',
      activity_snapshot: {
        title: `快照活动 ${padded}`,
        event_start: new Date(base + i * 60_000).toISOString(),
        status: 'published',
      },
    });
  }
  const tieAt = new Date(base + 51 * 60_000);
  const tieIds = ['actTie_a', 'actTie_B', 'actTie_c'];
  for (let i = 0; i < 3; i += 1) {
    registrations[50 + i].activity_id = tieIds[i];
    registrations[50 + i].created_at = tieAt;
    registrations[50 + i].activity_snapshot.title = `快照 ${tieIds[i]}`;
  }
  const activities = [];
  const activityRow = (id, patch = {}) => ({
    _id: id,
    title: `线上活动 ${id}`,
    status: 'published',
    event_start: new Date(base).toISOString(),
    event_end: new Date(base).toISOString(),
    ...patch,
  });
  for (let i = 0; i < 40; i += 1) activities.push(activityRow(`act${String(i).padStart(3, '0')}`));
  for (let i = 40; i < 50; i += 1)
    activities.push(activityRow(`act${String(i).padStart(3, '0')}`, { status: 'finished' }));
  for (let i = 50; i < 70; i += 1)
    activities.push(
      activityRow(`act${String(i).padStart(3, '0')}`, {
        is_deleted: true,
        status: i < 60 ? 'published' : 'finished',
      }),
    );
  for (let i = 70; i < 90; i += 1)
    activities.push(activityRow(`act${String(i).padStart(3, '0')}`, { status: 'draft' }));
  return { registrations, activities };
}

async function loadHandler() {
  const store = buildStore();
  const commandApi = {
    in: (values) => cmd('in', values),
    lt: (value) => cmd('lt', value),
    eq: (value) => cmd('eq', value),
    and: (list) => cmd('and', list),
    or: (list) => cmd('or', list),
  };
  const fakeSdk = {
    DYNAMIC_CURRENT_ENV: 'env',
    init() {},
    database() {
      return {
        command: commandApi,
        collection(name) {
          return new FakeQuery(store[name] || []);
        },
      };
    },
    getWXContext() {
      return { OPENID: 'openA' };
    },
  };
  require.cache[sdkPath] = {
    id: sdkPath,
    path: require('node:path').dirname(sdkPath),
    filename: sdkPath,
    loaded: true,
    exports: fakeSdk,
    children: [],
    paths: [],
  };
  delete require.cache[require.resolve('./index.js')];
  return { handler: require('./index.js').main, store };
}

test('minePage 六页拉取 101 条报名，顺序为创建时间倒序、活动 ID 倒序，无漏重', async () => {
  const { handler, store } = await loadHandler();
  const collected = [];
  let cursor;
  let pages = 0;
  do {
    const response = await handler({ action: 'minePage', cursor, page_size: 20 });
    assert.equal(response.ok, true);
    pages += 1;
    collected.push(...response.data.items);
    cursor = response.data.next_cursor;
  } while (cursor);
  assert.equal(pages, 6);
  assert.equal(collected.length, 101);
  assert.equal(new Set(collected.map((item) => item._id)).size, 101);

  const expectedOrder = [...store.registrations]
    .map((row) => ({ activity_id: row.activity_id, created_at: row.created_at }))
    .sort((left, right) => {
      const byTime = right.created_at.getTime() - left.created_at.getTime();
      if (byTime !== 0) return byTime;
      return right.activity_id < left.activity_id
        ? -1
        : right.activity_id > left.activity_id
          ? 1
          : 0;
    })
    .map((row) => row.activity_id);
  assert.deepEqual(
    collected.map((item) => item.activity._id),
    expectedOrder,
  );
  const tieStart = expectedOrder.indexOf('actTie_c');
  assert.deepEqual(expectedOrder.slice(tieStart, tieStart + 3), [
    'actTie_c',
    'actTie_a',
    'actTie_B',
  ]);
});

test('下架/软删/草稿/物理缺失的活动在我的行程中均可解释展示', async () => {
  const { handler } = await loadHandler();
  const byId = new Map();
  let cursor;
  do {
    const response = await handler({ action: 'minePage', cursor, page_size: 20 });
    assert.equal(response.ok, true);
    for (const item of response.data.items) byId.set(item.activity._id, item.activity);
    cursor = response.data.next_cursor;
  } while (cursor);

  const published = byId.get('act000');
  assert.equal(published.title, '线上活动 act000');
  assert.equal(published.status, 'published');

  const softDeleted = byId.get('act069');
  assert.ok(softDeleted.title.length > 0, '软删活动标题可展示');
  assert.equal(softDeleted.status, 'finished');

  const draft = byId.get('act089');
  assert.equal(draft.title, '线上活动 act089');
  assert.equal(draft.status, 'finished', 'draft 下架活动统一按已结束展示');

  const missing = byId.get('act100');
  assert.ok(missing, '物理缺失活动仍出现在行程中');
  assert.equal(missing.title, '快照活动 100');
  assert.equal(missing.status, 'finished');
});

test('minePage 参数非法时返回 VALIDATION_FAILED', async () => {
  const { handler } = await loadHandler();
  for (const event of [
    { action: 'minePage', page_size: 0 },
    { action: 'minePage', page_size: 21 },
    { action: 'minePage', cursor: 'not-a-cursor' },
  ]) {
    const response = await handler(event);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, 'VALIDATION_FAILED');
  }
});

test('旧版 mine 动作保持返回数组，最多 50 条且顺序不变', async () => {
  const { handler } = await loadHandler();
  const response = await handler({ action: 'mine' });
  assert.equal(response.ok, true);
  assert.ok(Array.isArray(response.data));
  assert.equal(response.data.length, 50);
});
