'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  keyFrom,
  encrypt,
  decrypt,
  maskName,
  maskPhone,
  maskId,
  response,
  buildUpdate,
  phoneUpdate,
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
  assert.equal(maskId('110101199001011234'), '110***********1234');
  const dto = response({
    nickname: '骑手',
    real_name_cipher: {},
    real_name_masked: '曹**',
    phone_cipher: {},
    phone_masked: '138****5678',
  });
  assert.equal(dto.completeness, 38);
  assert.equal(JSON.stringify(dto).includes('cipher'), false);
});
test('update 加密三类敏感字段并拒绝客户端 phone/可信字段', () => {
  const data = buildUpdate(
    {
      nickname: '骑手',
      real_name: '曹蒙恩',
      id_number: '110101199001011234',
      emergency_phone: '13912345678',
      photos: [{ file_id: 'cloud://a', category: 'ride' }],
    },
    key,
  );
  assert.equal(decrypt(data.real_name_cipher, key), '曹蒙恩');
  assert.equal(data.id_number_masked.endsWith('1234'), true);
  assert.throws(() => buildUpdate({ phone: '13812345678' }, key), { code: 'PHONE_CODE_REQUIRED' });
  assert.throws(() => buildUpdate({ openid: 'forged' }, key), { code: 'FORBIDDEN_FIELD' });
});
test('微信手机号仅由服务端结果构造并加密', () => {
  const data = phoneUpdate('13812345678', key);
  assert.equal(decrypt(data.phone_cipher, key), '13812345678');
  assert.equal(data.phone_masked, '138****5678');
  assert.throws(() => phoneUpdate('not-phone', key), { code: 'PHONE_INVALID' });
});
