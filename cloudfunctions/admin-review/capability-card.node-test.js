'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { adminCapabilityProfile } = require('./capability-card');

test('管理员能力卡 DTO 只保留头像和骑行训练照片白名单', () => {
  const dto = adminCapabilityProfile({
    avatar_file_id: 'cloud://avatar',
    photos: [
      { file_id: 'cloud://other', category: 'other' },
      { file_id: 'cloud://ride', category: 'ride', location: 'secret' },
      { file_id: 'cloud://training', category: 'training', token: 'secret-token' },
    ],
    real_name: '敏感姓名',
    phone: '13800000000',
    id_number: '110000000000000000',
    access_token: 'secret-token',
    openid: 'private-openid',
  });
  assert.deepEqual(dto, {
    avatar_file_id: 'cloud://avatar',
    photos: [
      { file_id: 'cloud://ride', category: 'ride' },
      { file_id: 'cloud://training', category: 'training' },
    ],
  });
  const serialized = JSON.stringify(dto);
  for (const field of ['real_name', 'phone', 'id_number', 'access_token', 'openid', 'location']) {
    assert.equal(serialized.includes(field), false);
  }
});

test('异常或超长 fileId 不进入管理员能力卡 DTO', () => {
  assert.deepEqual(
    adminCapabilityProfile({
      avatar_file_id: 'x'.repeat(513),
      photos: [{ file_id: { token: 'x' }, category: 'ride' }],
    }),
    { avatar_file_id: '', photos: [] },
  );
});
