'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('getCard 只使用 WXContext OPENID 且客户端 openid 不进入查询', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  assert.match(source, /getWXContext\(\)/);
  assert.match(source, /getCard\(OPENID\)/);
  assert.doesNotMatch(source, /getCard\(event\.openid\)/);
  assert.doesNotMatch(source, /getCollectionDoc\([^,]+,\s*event\.openid/);
});
