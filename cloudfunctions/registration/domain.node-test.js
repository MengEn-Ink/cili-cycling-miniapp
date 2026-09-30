'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DomainError,
  assertCanCancel,
  isOccupying,
  publicRegistration,
  validateOptions,
} = require('./domain/domain');

function expectValidationFailure(options) {
  assert.throws(
    () => validateOptions(options),
    (error) => error instanceof DomainError && error.code === 'VALIDATION_FAILED',
  );
}

test('集合方式两个合法值均被规范化保留，且旧字段不会写入', () => {
  for (const gatheringMode of ['self_drive', 'support_vehicle']) {
    const result = validateOptions({
      gathering_mode: gatheringMode,
      experience: 'regular',
      bike_mode: 'rent',
      rental_need: 'legacy',
      remark: 'ok',
    });
    assert.deepEqual(result, {
      gathering_mode: gatheringMode,
      experience: 'regular',
      remark: 'ok',
    });
    assert.equal('bike_mode' in result, false);
    assert.equal('rental_need' in result, false);
  }
});

test('集合方式缺失或未知时拒绝', () => {
  expectValidationFailure({ experience: 'regular' });
  expectValidationFailure({ gathering_mode: 'unknown', experience: 'regular' });
  expectValidationFailure({ bike_mode: 'own', experience: 'regular' });
});

test('已签到继续占位但不可取消', () => {
  assert.equal(isOccupying('checked_in'), true);
  assert.throws(
    () => assertCanCancel({ openid: 'member', status: 'checked_in' }, 'member'),
    (error) => error instanceof DomainError && error.code === 'INVALID_TRANSITION',
  );
});

test('报名公开投影包含签到时间但不泄露签到管理员 openid', () => {
  const result = publicRegistration({
    _id: 'r1',
    activity_id: 'a1',
    status: 'checked_in',
    checked_in_at: new Date('2026-09-30T10:00:00.000Z'),
    checkin_operator_openid: 'admin-secret',
    profile_snapshot: {},
  });
  assert.equal(result.status, 'checked_in');
  assert.equal(result.checked_in_at.toISOString(), '2026-09-30T10:00:00.000Z');
  assert.equal('checkin_operator_openid' in result, false);
});
