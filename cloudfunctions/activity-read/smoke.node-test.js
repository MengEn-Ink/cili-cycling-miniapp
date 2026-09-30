'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
test('部署包包含共享领域依赖', () => {
  const domain = require('./domain');
  assert.equal(typeof domain.toErrorResponse, 'function');
  assert.equal(typeof domain.registrationId, 'function');
});

test('部署包包含公开头像 canonical 校验模块', () => {
  assert.equal(existsSync(resolve(__dirname, 'public-avatar.js')), true);
});
