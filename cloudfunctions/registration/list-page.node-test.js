'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePageSize,
  encodeMyCursor,
  decodeMyCursor,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require('./list-page');

test('未提供 page_size 时使用默认值，边界值 1 与 20 合法', () => {
  assert.equal(normalizePageSize(undefined), DEFAULT_PAGE_SIZE);
  assert.equal(normalizePageSize(null), DEFAULT_PAGE_SIZE);
  assert.equal(normalizePageSize(1), 1);
  assert.equal(normalizePageSize(MAX_PAGE_SIZE), MAX_PAGE_SIZE);
});

test('非法 page_size 抛 VALIDATION_FAILED', () => {
  for (const bad of [0, 21, -1, 1.5, '2', true, [], {}, NaN]) {
    assert.throws(
      () => normalizePageSize(bad),
      (error) => error.code === 'VALIDATION_FAILED',
      `bad page_size ${String(bad)}`,
    );
  }
});

test('cursor 可往返并携带创建时间与活动 ID', () => {
  const boundary = { createdAt: new Date('2026-03-01T07:30:00.000Z'), activityId: 'act_029' };
  const cursor = encodeMyCursor(boundary);
  const decoded = decodeMyCursor(cursor);
  assert.equal(decoded.createdAt.getTime(), boundary.createdAt.getTime());
  assert.equal(decoded.activityId, 'act_029');
});

test('伪造或损坏的 cursor 抛 VALIDATION_FAILED', () => {
  const good = encodeMyCursor({
    createdAt: new Date('2026-03-01T07:30:00.000Z'),
    activityId: 'act_029',
  });
  assert.notEqual(good.length, 0);
  const tampered = good.slice(0, -2) + (good.endsWith('0') ? '1' : '0');
  for (const bad of [
    tampered,
    Buffer.from('not-json', 'utf8').toString('base64url'),
    Buffer.from(JSON.stringify({ v: 9, t: '2026-03-01', a: 'x' }), 'utf8').toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, t: 'not-a-date', a: 'x' }), 'utf8').toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, t: '2026-03-01', a: '' }), 'utf8').toString('base64url'),
  ]) {
    assert.throws(
      () => decodeMyCursor(bad),
      (error) => error.code === 'VALIDATION_FAILED',
      'bad cursor rejected',
    );
  }
  assert.throws(
    () => decodeMyCursor(123),
    (error) => error.code === 'VALIDATION_FAILED',
  );
});
