'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TIMER_TRIGGER, authorizeInvocation, requireTrustedOpenid } = require('./access');
test('订阅配置提供可信身份校验边界', () => {
  assert.equal(typeof requireTrustedOpenid, 'function');
});
test('订阅配置要求登录但不要求管理员', async () => {
  let checked = false;
  const result = await authorizeInvocation({
    event: { action: 'subscription-config' },
    openid: 'member-openid',
    requireAdmin: async () => {
      checked = true;
    },
  });
  assert.equal(result.mode, 'subscription-config');
  assert.equal(checked, false);
  assert.throws(() => requireTrustedOpenid(''), { code: 'UNAUTHENTICATED' });
});
test('CloudBase timer 以服务身份进入 worker 且不查询管理员', async () => {
  let checked = false;
  const result = await authorizeInvocation({
    event: { Type: 'Timer', TriggerName: TIMER_TRIGGER },
    openid: '',
    requireAdmin: async () => {
      checked = true;
    },
  });
  assert.equal(result.mode, 'worker');
  assert.equal(checked, false);
});
test('手工调用必须通过管理员门禁', async () => {
  let checked;
  const result = await authorizeInvocation({
    event: {},
    openid: 'admin-openid',
    requireAdmin: async (openid) => {
      checked = openid;
    },
  });
  assert.equal(result.mode, 'manual');
  assert.equal(checked, 'admin-openid');
});
test('非管理员手工调用被拒绝', async () => {
  const error = new Error('需要管理员权限');
  error.code = 'ADMIN_REQUIRED';
  await assert.rejects(
    authorizeInvocation({
      event: {},
      openid: 'member',
      requireAdmin: async () => {
        throw error;
      },
    }),
    { code: 'ADMIN_REQUIRED' },
  );
});
test('无 OPENID 的伪 timer 名称被拒绝', async () => {
  await assert.rejects(
    authorizeInvocation({
      event: { Type: 'Timer', TriggerName: 'forged' },
      openid: '',
      requireAdmin: async () => {},
    }),
    { code: 'SERVICE_IDENTITY_REQUIRED' },
  );
});
