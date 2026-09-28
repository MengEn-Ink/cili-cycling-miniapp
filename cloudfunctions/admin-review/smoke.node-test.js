'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
test('部署包包含共享审批编排', () => {
  const domain = require('./domain');
  assert.equal(typeof domain.reviewRegistration, 'function');
  assert.equal(typeof domain.isEnabledAdmin, 'function');
});
