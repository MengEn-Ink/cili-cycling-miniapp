'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIdentity, isCollectionMissing } = require('./core');

const fakeOpenid = 'openid-for-unit-test-only';

test('有启用的管理员记录时返回管理员最小身份', () => {
  assert.deepEqual(buildIdentity(fakeOpenid, { enabled: true, is_super: true }), {
    openid: fakeOpenid,
    role: 'admin',
    isSuper: true,
  });
});

test('无记录或明确禁用时安全降级为 member', () => {
  assert.deepEqual(buildIdentity(fakeOpenid), {
    openid: fakeOpenid,
    role: 'member',
    isSuper: false,
  });
  assert.equal(buildIdentity(fakeOpenid, { enabled: false, is_super: true }).role, 'member');
});

test('仅识别明确的集合不存在错误', () => {
  assert.equal(
    isCollectionMissing({
      errCode: -502005,
      errMsg: 'database collection not exists | [ResourceNotFound] Db or Table not exist',
    }),
    true,
  );
  assert.equal(isCollectionMissing({ errCode: -502005, errMsg: 'request failed' }), false);
  assert.equal(isCollectionMissing({ errCode: -1, errMsg: 'Db or Table not exist' }), false);
});
