'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
test('部署包包含安全 callback 核心', () => {
  const core = require('./oauth/core');
  assert.equal(typeof core.callbackFlow, 'function');
  assert.equal(typeof core.consumeState, 'function');
});
