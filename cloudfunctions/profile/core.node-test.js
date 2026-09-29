'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  keyFrom,
  encrypt,
  decrypt,
  maskName,
  maskPhone,
  response,
  buildUpdate,
  phoneUpdate,
  selectCapabilityPhotos,
  capabilityCard,
  writableDocument,
  toError,
} = require('./core');
const key = require('node:crypto').randomBytes(32).toString('base64');
test('AES-256-GCM 可往返且随机 IV', () => {
  const a = encrypt('敏感值', key);
  const b = encrypt('敏感值', key);
  assert.equal(decrypt(a, key), '敏感值');
  assert.notEqual(a.iv, b.iv);
  assert.equal(a.alg, 'A256GCM');
});
test('密钥缺失、非法和密文篡改均 fail closed', () => {
  assert.throws(() => keyFrom(), { code: 'PII_KEY_INVALID' });
  assert.throws(() => keyFrom(Buffer.alloc(31).toString('base64')), { code: 'PII_KEY_INVALID' });
  const v = encrypt('x', key);
  v.ciphertext = Buffer.from('tampered').toString('base64');
  assert.throws(() => decrypt(v, key), { code: 'PII_DECRYPT_FAILED' });
});
test('脱敏与响应不返回敏感明文/密文', () => {
  assert.equal(maskName('曹蒙恩'), '曹**');
  assert.equal(maskPhone('13812345678'), '138****5678');
  const source = {
    nickname: '骑手',
    real_name_cipher: {},
    real_name_masked: '曹**',
    phone_cipher: {},
    phone_masked: '138****5678',
    id_type: '身份证',
    id_number_cipher: { ciphertext: 'legacy-secret' },
    id_number_masked: '110***********1234',
  };
  const dto = response(source);
  assert.equal(dto.completeness, 75);
  assert.deepEqual(dto.sensitive_status, {
    real_name: true,
    phone: true,
    phone_verified: false,
    phone_source: 'legacy',
    emergency_phone: false,
  });
  assert.equal(JSON.stringify(dto).includes('cipher'), false);
  assert.equal(JSON.stringify(dto).includes('id_number'), false);
  assert.equal(Object.hasOwn(dto, 'id_type'), false);
  assert.equal(response({ ...source, gender: '男' }).completeness, 75);
  assert.equal(response({ ...source, emergency_name: '联系人' }).completeness, 75);
  assert.equal(
    response({
      nickname: '骑手',
      real_name_cipher: {},
      phone_cipher: {},
      emergency_name: '联系人',
      emergency_phone_cipher: {},
    }).completeness,
    100,
  );
});
test('update 加密敏感字段并把手填手机号标记为未验证', () => {
  const data = buildUpdate(
    {
      nickname: '骑手',
      real_name: '曹蒙恩',
      phone: '13812345678',
      emergency_phone: '13912345678',
      photos: [{ file_id: 'cloud://a', category: 'ride' }],
    },
    key,
  );
  assert.equal(decrypt(data.real_name_cipher, key), '曹蒙恩');
  assert.equal(Object.hasOwn(data, 'id_number_cipher'), false);
  assert.equal(decrypt(data.phone_cipher, key), '13812345678');
  assert.equal(data.phone_source, 'manual');
  assert.equal(data.phone_verified, false);
  assert.throws(() => buildUpdate({ phone: 'not-phone' }, key), { code: 'PHONE_INVALID' });
  assert.throws(() => buildUpdate({ id_type: '身份证' }, key), { code: 'FORBIDDEN_FIELD' });
  assert.throws(() => buildUpdate({ id_number: 'anything' }, key), { code: 'FORBIDDEN_FIELD' });
  assert.throws(() => buildUpdate({ phone_source: 'wechat' }, key), { code: 'FORBIDDEN_FIELD' });
  assert.throws(() => buildUpdate({ openid: 'forged' }, key), { code: 'FORBIDDEN_FIELD' });
});
test('微信手机号仅由服务端结果构造并标记为已验证', () => {
  const data = phoneUpdate('13812345678', key, 'wechat');
  assert.equal(decrypt(data.phone_cipher, key), '13812345678');
  assert.equal(data.phone_masked, '138****5678');
  assert.equal(data.phone_source, 'wechat');
  assert.equal(data.phone_verified, true);
  assert.throws(() => phoneUpdate('not-phone', key), { code: 'PHONE_INVALID' });
  assert.throws(() => phoneUpdate('13812345678', key, 'imported'), {
    code: 'PHONE_SOURCE_INVALID',
  });
});

test('CloudBase 写入会移除保留字段 _id', () => {
  const source = { _id: 'openid', nickname: '骑手' };
  assert.deepEqual(writableDocument(source), { nickname: '骑手' });
  assert.equal(source._id, 'openid');
});

test('未知错误仅暴露平台错误码而不泄露内部消息', () => {
  assert.deepEqual(toError({ errCode: -1, message: 'sensitive detail' }), {
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用', cause_code: '-1' },
  });
});

test('个人名片照片按骑行训练优先、其他补位、头像兜底并去重，最多三张', () => {
  assert.deepEqual(
    selectCapabilityPhotos({
      avatar_file_id: 'cloud://avatar',
      photos: [
        { file_id: 'cloud://other', category: 'other' },
        { file_id: 'cloud://ride', category: 'ride' },
        { file_id: 'cloud://training', category: 'training' },
        { file_id: 'cloud://avatar', category: 'other' },
      ],
    }),
    [
      { file_id: 'cloud://ride', category: 'ride', source: 'upload' },
      { file_id: 'cloud://training', category: 'training', source: 'upload' },
      { file_id: 'cloud://other', category: 'other', source: 'upload' },
    ],
  );
  assert.deepEqual(selectCapabilityPhotos({ avatar_file_id: 'cloud://avatar' }), [
    { file_id: 'cloud://avatar', category: 'avatar', source: 'avatar' },
  ]);
});

test('个人名片 DTO 仅暴露安全聚合字段且允许缺失快照', () => {
  const sensitive = {
    nickname: '骑手',
    avatar_file_id: 'cloud://avatar',
    real_name_masked: '曹**',
    phone_cipher: { ciphertext: 'secret' },
    emergency_name: '私密联系人',
    openid: 'private',
  };
  const disconnected = capabilityCard(sensitive, undefined, undefined, false);
  assert.equal(disconnected.readiness.state, 'disconnected');
  assert.equal(disconnected.metrics, null);
  const serialized = JSON.stringify(disconnected);
  for (const forbidden of [
    'real_name',
    'phone',
    'emergency',
    'cipher',
    'token',
    'openid',
    'private',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('个人名片覆盖 authorizing/syncing/failed/ready 与安全错误', () => {
  assert.equal(capabilityCard({}, undefined, undefined, true).readiness.state, 'authorizing');
  assert.equal(capabilityCard({}, { sync_status: 'running' }).readiness.state, 'syncing');
  const failed = capabilityCard({}, { sync_status: 'failed', sync_error_code: 'INTERNAL_SECRET' });
  assert.deepEqual(failed.readiness, {
    state: 'failed',
    error: { message: 'Strava 数据准备失败，请重试', retryable: true },
  });
  assert.equal(JSON.stringify(failed).includes('INTERNAL_SECRET'), false);
  const ready = capabilityCard(
    {},
    { sync_status: 'ready' },
    {
      total_km: 123,
      activities_90d: 8,
      longest_km: 50,
      total_elevation_m: 999,
      weighted_avg_speed_kmh: 25,
      latest_activity_at: null,
      synced_at: new Date('2026-09-29T00:00:00Z'),
      activities: [{ id: 'must-not-leak' }],
    },
  );
  assert.equal(ready.readiness.state, 'ready');
  assert.equal(ready.metrics.rides, 8);
  assert.equal(ready.metrics.latest_activity_at, null);
  assert.equal(JSON.stringify(ready).includes('must-not-leak'), false);
});
