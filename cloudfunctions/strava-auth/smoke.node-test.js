'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
test('部署包包含 OAuth 核心', () => {
  const core = require('./oauth/core');
  assert.equal(typeof core.syncFlow, 'function');
  assert.equal(typeof core.createState, 'function');
});
