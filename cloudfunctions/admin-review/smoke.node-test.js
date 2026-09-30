'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
test('部署包包含共享审批编排', () => {
  const domain = require('./domain');
  assert.equal(typeof domain.reviewRegistration, 'function');
  assert.equal(typeof domain.checkInRegistration, 'function');
  assert.equal(typeof domain.isEnabledAdmin, 'function');
});

test('管理员云函数使用独立 checkIn 路由', () => {
  const source = readFileSync(require.resolve('./index'), 'utf8');
  assert.match(source, /event\.action === 'checkIn'/);
  assert.match(source, /checkInRegistration\(/);
});
