'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { importStravaAvatar } = require('./avatar-import');
const { createProfileStore } = require('./store');

test('部署包包含专用头像设置与 Strava 导入入口', () => {
  const source = readFileSync(require.resolve('./index'), 'utf8');
  assert.match(source, /event\.action === 'setAvatar'/);
  assert.match(source, /event\.action === 'importStravaAvatar'/);
  assert.equal(typeof createProfileStore, 'function');
  assert.equal(typeof importStravaAvatar, 'function');
});
