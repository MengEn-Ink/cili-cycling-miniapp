'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createProfileStore } = require('./store');

test('部署包只保留用户上传与微信头像入口', () => {
  const source = readFileSync(require.resolve('./index'), 'utf8');
  assert.match(source, /event\.action === 'setAvatar'/);
  assert.match(source, /cloud\.getTempFileURL/);
  assert.match(source, /canonicalizeClientMedia/);
  assert.doesNotMatch(source, /importStravaAvatar|strava_credentials|strava_snapshots/);
  assert.doesNotMatch(source, /cloud\.downloadFile/);
  assert.equal(typeof createProfileStore, 'function');
});
