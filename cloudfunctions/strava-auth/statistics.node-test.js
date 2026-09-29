'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { statistics } = require('./oauth/core');

function ride(overrides = {}) {
  return {
    type: 'Ride',
    distance: 1000,
    moving_time: 100,
    total_elevation_gain: 10,
    start_date: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

test('统计正常活动的最长骑行与最近活动时间', () => {
  const result = statistics(
    [
      ride({ distance: 5000, start_date: '2026-09-01T00:00:00Z' }),
      ride({ distance: 12000, start_date: '2026-09-10T00:00:00Z' }),
      ride({ distance: 8000, start_date: '2026-09-05T00:00:00Z' }),
    ],
    { coverageComplete: true },
  );
  assert.equal(result.longest_km, 12);
  assert.equal(result.latest_activity_at, '2026-09-10T00:00:00.000Z');
  assert.equal(result.activities_90d, 3);
});

test('活动数量很大时统计不再因展开传参上限崩溃', () => {
  const count = 200000;
  const activities = Array.from({ length: count }, (_value, index) =>
    ride({
      distance: index,
      start_date: `2026-08-01T00:${String(index % 60).padStart(2, '0')}:00Z`,
    }),
  );
  const result = statistics(activities, { coverageComplete: true });
  assert.equal(result.activities_90d, count);
  // 最大距离是最后一条（count - 1）
  assert.equal(result.longest_km, Number(((count - 1) / 1000).toFixed(2)));
});
