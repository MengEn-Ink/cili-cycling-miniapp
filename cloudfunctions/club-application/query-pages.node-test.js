'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readJoinableClubDocuments } = require('./query-pages');

function pagedQuery(values, calls) {
  let offset = 0;
  let limit = 0;
  return {
    orderBy(field, direction) {
      calls.push({ type: 'orderBy', field, direction });
      return this;
    },
    skip(value) {
      offset = value;
      calls.push({ type: 'skip', value });
      return this;
    },
    limit(value) {
      limit = value;
      calls.push({ type: 'limit', value });
      return this;
    },
    async get() {
      calls.push({ type: 'get', offset, limit });
      return { data: values.slice(offset, offset + limit) };
    },
  };
}

test('分页读取全部 active memberships 和公开 clubs 后过滤，不能遗漏第 101 个可加入俱乐部', async () => {
  const clubId = (index) => `club_${String(index).padStart(4, '0')}`;
  const memberships = Array.from({ length: 101 }, (_, index) => ({
    _id: `membership_${String(index).padStart(4, '0')}`,
    club_id: clubId(index),
  }));
  const clubs = Array.from({ length: 102 }, (_, index) => ({ _id: clubId(index) }));
  const membershipCalls = [];
  const clubCalls = [];

  const result = await readJoinableClubDocuments(
    pagedQuery(memberships, membershipCalls),
    pagedQuery(clubs, clubCalls),
  );

  assert.deepEqual(
    result.map((club) => club._id),
    [clubId(101)],
  );
  assert.deepEqual(
    membershipCalls.filter((call) => call.type === 'get').map((call) => call.offset),
    [0, 100],
  );
  assert.deepEqual(
    clubCalls.filter((call) => call.type === 'get').map((call) => call.offset),
    [0, 100],
  );
  assert.ok(
    [...membershipCalls, ...clubCalls]
      .filter((call) => call.type === 'orderBy')
      .every((call) => call.field === '_id' && call.direction === 'asc'),
  );
});
