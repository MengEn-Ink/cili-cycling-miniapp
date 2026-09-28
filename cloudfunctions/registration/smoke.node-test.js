'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
test('部署包包含共享报名编排', () => {
  const domain = require('./domain');
  assert.equal(typeof domain.submitRegistration, 'function');
  assert.equal(typeof domain.cancelRegistration, 'function');
});
