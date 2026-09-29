'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let subject = {};
try {
  subject = require('./store');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const createCleanupStore = subject.createCleanupStore || (() => ({}));

test('discovery 使用 status/cleanup_after 索引条件、排序和硬上限', async () => {
  const calls = [];
  let status = '';
  const chain = {
    where(value) {
      status = value.status;
      calls.push(['where', value]);
      return this;
    },
    orderBy(field, direction) {
      calls.push(['orderBy', field, direction]);
      return this;
    },
    limit(value) {
      calls.push(['limit', value]);
      return this;
    },
    async get() {
      return { data: [{ _id: `media-${status}` }] };
    },
  };
  const db = {
    command: { lte: (value) => ({ $lte: value }) },
    collection(name) {
      assert.equal(name, 'profile_media');
      return chain;
    },
  };
  const result = await createCleanupStore(db).listEligible(
    new Date('2026-09-29T12:00:00.000Z'),
    20,
  );
  assert.deepEqual(result, ['media-unreferenced', 'media-deleting', 'media-delete_failed']);
  assert.deepEqual(calls, [
    [
      'where',
      {
        status: 'unreferenced',
        cleanup_after: { $lte: new Date('2026-09-29T12:00:00.000Z') },
      },
    ],
    ['orderBy', 'cleanup_after', 'asc'],
    ['limit', 20],
    [
      'where',
      {
        status: 'deleting',
        delete_lease_expires_at: { $lte: new Date('2026-09-29T12:00:00.000Z') },
      },
    ],
    ['orderBy', 'delete_lease_expires_at', 'asc'],
    ['limit', 20],
    [
      'where',
      {
        status: 'delete_failed',
        retry_at: { $lte: new Date('2026-09-29T12:00:00.000Z') },
      },
    ],
    ['orderBy', 'retry_at', 'asc'],
    ['limit', 20],
  ]);
});
