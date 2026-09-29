'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DomainError, validateOptions } = require('./domain/domain');

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
