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
  issueMediaUploadPath,
  mediaOwnerPrefix,
  validateMediaUpdate,
  ownerMedia,
  writableDocument,
  toError,
} = require('./core');
const key = require('node:crypto').randomBytes(32).toString('base64');
const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
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

test('媒体上传路径使用服务端 secret 派生 opaque owner alias', () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000';
  const first = issueMediaUploadPath('openid-owner-a', mediaSecret, () => uuid);
  const second = issueMediaUploadPath('openid-owner-b', mediaSecret, () => uuid);
  assert.match(
    first.cloud_path,
    /^profiles\/[a-f0-9]{32}\/123e4567-e89b-42d3-a456-426614174000\.jpg$/,
  );
  assert.notEqual(first.cloud_path, second.cloud_path);
  assert.equal(first.cloud_path.includes('openid-owner-a'), false);
  assert.equal(mediaOwnerPrefix('openid-owner-a', mediaSecret), first.cloud_path.slice(0, -40));
  assert.throws(() => issueMediaUploadPath('', mediaSecret, () => uuid), {
    code: 'UNAUTHENTICATED',
  });
  assert.throws(() => issueMediaUploadPath('openid-owner-a', 'short', () => uuid), {
    code: 'MEDIA_SECRET_INVALID',
  });
});

test('资料更新只接受本用户签发媒体，同时允许原样保留 legacy 媒体', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const otherPrefix = mediaOwnerPrefix('openid-owner-b', mediaSecret);
  const current = {
    avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg',
    photos: [{ file_id: 'cloud://env/profiles/legacy/ride.jpg', category: 'ride' }],
  };
  assert.doesNotThrow(() =>
    validateMediaUpdate(
      current,
      {
        avatar_file_id: current.avatar_file_id,
        photos: [
          current.photos[0],
          {
            file_id: `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`,
            category: 'bike',
          },
        ],
      },
      'openid-owner-a',
      mediaSecret,
    ),
  );
  assert.throws(
    () =>
      validateMediaUpdate(
        current,
        {
          avatar_file_id: `cloud://env/${otherPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`,
        },
        'openid-owner-a',
        mediaSecret,
      ),
    { code: 'MEDIA_NOT_OWNED' },
  );
});

test('能力卡媒体只选择当前 owner 签发文件，legacy 与他人文件均不可见', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const otherPrefix = mediaOwnerPrefix('openid-owner-b', mediaSecret);
  assert.deepEqual(
    ownerMedia(
      {
        avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg',
        photos: [
          { file_id: 'cloud://env/profiles/legacy/ride.jpg', category: 'ride' },
          {
            file_id: `cloud://env/${otherPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`,
            category: 'bike',
          },
          {
            file_id: `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174001.jpg`,
            category: 'other',
          },
        ],
      },
      'openid-owner-a',
      mediaSecret,
    ),
    [
      {
        file_id: `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174001.jpg`,
        category: 'other',
        source: 'user_photo',
      },
    ],
  );
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
