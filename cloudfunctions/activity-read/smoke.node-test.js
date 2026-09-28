'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
test('部署包包含共享领域依赖', () => {
  const domain = require('./domain');
  assert.equal(typeof domain.toErrorResponse, 'function');
  assert.equal(typeof domain.registrationId, 'function');
});
