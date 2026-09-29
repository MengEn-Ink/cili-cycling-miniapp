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
  mediaDocumentId,
  avatarUrlFingerprint,
  mediaRegistration,
  clientAvatarSource,
  clientMediaOrigin,
  validateAvatarSelection,
  inspectMediaObject,
  verifyMediaObject,
  validateMediaUpdate,
  ownerMedia,
  normalizeAvatarProfile,
  writableDocument,
  toError,
} = require('./core');
const key = require('node:crypto').randomBytes(32).toString('base64');
const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
test('Strava 头像 URL 只以稳定 SHA-256 指纹进入持久 lease', () => {
  const url = 'https://dgalywyr863hv.cloudfront.net/private/avatar.jpg';
  const fingerprint = avatarUrlFingerprint(url);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(fingerprint.includes(url), false);
  assert.notEqual(fingerprint, avatarUrlFingerprint(`${url}?changed=1`));
});
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
  assert.equal(Object.hasOwn(dto, 'avatar_source'), false);
  assert.equal(dto.has_completed_guidance, false);
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
  assert.equal(Object.hasOwn(dto, 'owner_openid'), false);
  assert.equal(Object.hasOwn(dto, 'origin'), false);
  assert.equal(Object.hasOwn(dto, 'status'), false);
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
test('头像响应只返回规范来源，并为合法 legacy 头像推断 custom', () => {
  assert.deepEqual(response({ avatar_file_id: 'cloud://env/legacy.jpg' }), {
    ...response({}),
    avatar_file_id: 'cloud://env/legacy.jpg',
    avatar_source: 'custom',
  });
  assert.equal(
    response({ avatar_file_id: 'cloud://env/wechat.jpg', avatar_source: 'wechat' }).avatar_source,
    'wechat',
  );
  assert.equal(Object.hasOwn(response({ avatar_source: 'strava' }), 'avatar_source'), false);
  assert.equal(Object.hasOwn(response({ avatar_file_id: '' }), 'avatar_source'), false);
  assert.equal(response({ avatar_revision: 7 }).avatar_revision, 7);
  assert.equal(response({ avatar_revision: -1 }).avatar_revision, 0);
  assert.equal(response({ avatar_revision: 1.5 }).avatar_revision, 0);
  for (const value of [
    { avatar_file_id: 'https://example.test/avatar.jpg' },
    { avatar_file_id: 'cloud://env/avatar.jpg', avatar_source: 'forged' },
  ]) {
    const dto = response(value);
    assert.equal(dto.avatar_file_id, '');
    assert.equal(Object.hasOwn(dto, 'avatar_source'), false);
  }
});

test('普通资料保存规范化头像字段且不持久化旧默认或非法 source', () => {
  assert.deepEqual(normalizeAvatarProfile({ nickname: 'Rider', avatar_source: 'wechat' }), {
    nickname: 'Rider',
  });
  assert.deepEqual(
    normalizeAvatarProfile({
      nickname: 'Rider',
      avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg',
    }),
    {
      nickname: 'Rider',
      avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg',
      avatar_source: 'custom',
    },
  );
  assert.deepEqual(
    normalizeAvatarProfile({
      nickname: 'Rider',
      avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg',
      avatar_source: 'forged',
    }),
    { nickname: 'Rider' },
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
      has_completed_guidance: true,
    },
    key,
  );
  assert.equal(data.has_completed_guidance, true);
  assert.equal(decrypt(data.real_name_cipher, key), '曹蒙恩');
  assert.equal(Object.hasOwn(data, 'id_number_cipher'), false);
  assert.equal(decrypt(data.phone_cipher, key), '13812345678');
  assert.equal(data.phone_source, 'manual');
  assert.equal(data.phone_verified, false);
  assert.throws(() => buildUpdate({ phone: 'not-phone' }, key), { code: 'PHONE_INVALID' });
  assert.throws(() => buildUpdate({ id_type: '身份证' }, key), { code: 'FORBIDDEN_FIELD' });
  assert.throws(() => buildUpdate({ id_number: 'anything' }, key), { code: 'FORBIDDEN_FIELD' });
  assert.throws(() => buildUpdate({ phone_source: 'wechat' }, key), { code: 'FORBIDDEN_FIELD' });
  assert.throws(() => buildUpdate({ avatar_source: 'wechat' }, key), {
    code: 'FORBIDDEN_FIELD',
  });
  assert.throws(() => buildUpdate({ openid: 'forged' }, key), { code: 'FORBIDDEN_FIELD' });
});

test('旧客户端只可原样回传当前规范化头像 ID 与来源，且两字段作为 no-op 丢弃', () => {
  const avatar = 'cloud://env/profiles/legacy/avatar.jpg';
  const current = { avatar_file_id: avatar, avatar_source: 'wechat' };
  assert.deepEqual(buildUpdate({ avatar_file_id: avatar }, key, current), {});
  assert.deepEqual(
    buildUpdate({ avatar_file_id: avatar, avatar_source: 'wechat' }, key, current),
    {},
  );
  assert.throws(
    () => buildUpdate({ avatar_file_id: avatar, avatar_source: 'custom' }, key, current),
    { code: 'FORBIDDEN_FIELD' },
  );
  assert.throws(() => buildUpdate({ avatar_file_id: avatar, avatar_source: '' }, key, current), {
    code: 'FORBIDDEN_FIELD',
  });
  assert.throws(
    () =>
      buildUpdate({ avatar_file_id: 'cloud://env/profiles/new/avatar.jpg' }, key, {
        avatar_file_id: avatar,
      }),
    { code: 'FORBIDDEN_FIELD' },
  );
  assert.throws(() => buildUpdate({ avatar_file_id: '' }, key, { avatar_file_id: avatar }), {
    code: 'FORBIDDEN_FIELD',
  });
  assert.throws(() => buildUpdate({ avatar_file_id: avatar }, key, {}), {
    code: 'FORBIDDEN_FIELD',
  });
});

test('旧客户端无头像默认组合仅在服务端也无头像时作为整体 no-op', () => {
  assert.deepEqual(buildUpdate({ avatar_file_id: '', avatar_source: 'wechat' }, key, {}), {});
  assert.throws(() => buildUpdate({ avatar_file_id: '' }, key, {}), {
    code: 'FORBIDDEN_FIELD',
  });
  assert.throws(() => buildUpdate({ avatar_source: 'wechat' }, key, {}), {
    code: 'FORBIDDEN_FIELD',
  });
  for (const avatar_source of ['custom', 'strava']) {
    assert.throws(() => buildUpdate({ avatar_file_id: '', avatar_source }, key, {}), {
      code: 'FORBIDDEN_FIELD',
    });
  }
  assert.throws(
    () =>
      buildUpdate({ avatar_file_id: '', avatar_source: 'wechat' }, key, {
        avatar_file_id: 'cloud://env/profiles/current.jpg',
        avatar_source: 'wechat',
      }),
    { code: 'FORBIDDEN_FIELD' },
  );
});

test('客户端头像来源只允许 wechat/custom，内部媒体来源仍支持 strava', () => {
  assert.equal(clientAvatarSource('wechat'), 'wechat');
  assert.equal(clientAvatarSource('custom'), 'custom');
  assert.throws(() => clientAvatarSource('strava'), { code: 'AVATAR_SOURCE_INVALID' });
  assert.equal(clientMediaOrigin('wechat'), 'wechat');
  assert.equal(clientMediaOrigin('custom'), 'custom');
  assert.equal(clientMediaOrigin(undefined), 'custom');
  assert.throws(() => clientMediaOrigin('strava'), { code: 'MEDIA_ORIGIN_INVALID' });
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
  assert.equal(
    issueMediaUploadPath('openid-owner-a', mediaSecret, () => uuid, 'png').cloud_path,
    `${mediaOwnerPrefix('openid-owner-a', mediaSecret)}${uuid}.png`,
  );
  assert.throws(() => issueMediaUploadPath('openid-owner-a', mediaSecret, () => uuid, 'svg'), {
    code: 'MEDIA_TYPE_INVALID',
  });
});

test('资料更新只接受本用户签发照片，同时拒绝绕过 setAvatar 修改头像', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const ownedFile = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const current = {
    avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg',
    photos: [{ file_id: 'cloud://env/profiles/legacy/ride.jpg', category: 'ride' }],
  };
  const plan = validateMediaUpdate(
    current,
    {
      photos: [
        current.photos[0],
        {
          file_id: ownedFile,
          category: 'bike',
        },
      ],
    },
    'openid-owner-a',
    mediaSecret,
    [
      {
        _id: mediaDocumentId(ownedFile),
        file_id: ownedFile,
        owner_openid: 'openid-owner-a',
        category: 'bike',
        status: 'unreferenced',
      },
    ],
  );
  assert.deepEqual(plan.activate_ids, [mediaDocumentId(ownedFile)]);
  assert.deepEqual(
    validateMediaUpdate(current, plan.data, 'openid-owner-a', mediaSecret, [
      {
        _id: mediaDocumentId(ownedFile),
        file_id: ownedFile,
        owner_openid: 'openid-owner-a',
        category: 'bike',
        status: 'unreferenced',
      },
    ]).activate_ids,
    [mediaDocumentId(ownedFile)],
  );
  assert.throws(
    () =>
      validateMediaUpdate(
        current,
        {
          avatar_file_id: current.avatar_file_id,
        },
        'openid-owner-a',
        mediaSecret,
        [],
      ),
    { code: 'FORBIDDEN_FIELD' },
  );
});

test('头像选择校验 source、owner、status 与 registry origin', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const fileId = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const record = {
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    owner_openid: 'openid-owner-a',
    category: 'other',
    origin: 'wechat',
    status: 'unreferenced',
  };
  assert.deepEqual(
    validateAvatarSelection('wechat', fileId, 'openid-owner-a', mediaSecret, record),
    record,
  );
  assert.throws(
    () => validateAvatarSelection('invalid', fileId, 'openid-owner-a', mediaSecret, record),
    { code: 'AVATAR_SOURCE_INVALID' },
  );
  assert.throws(
    () => validateAvatarSelection('wechat', fileId, 'openid-owner-a', mediaSecret, undefined),
    { code: 'MEDIA_NOT_FOUND' },
  );
  assert.throws(
    () =>
      validateAvatarSelection('wechat', fileId, 'openid-owner-a', mediaSecret, {
        ...record,
        owner_openid: 'openid-owner-b',
      }),
    { code: 'MEDIA_NOT_OWNED' },
  );
  assert.throws(
    () =>
      validateAvatarSelection('custom', fileId, 'openid-owner-a', mediaSecret, {
        ...record,
        origin: 'wechat',
      }),
    { code: 'MEDIA_ORIGIN_MISMATCH' },
  );
  assert.throws(
    () =>
      validateAvatarSelection('wechat', fileId, 'openid-owner-a', mediaSecret, {
        ...record,
        status: 'deleting',
      }),
    { code: 'MEDIA_STATUS_INVALID' },
  );
  const { origin: missingOrigin, ...legacyRecord } = record;
  void missingOrigin;
  assert.equal(
    validateAvatarSelection('custom', fileId, 'openid-owner-a', mediaSecret, legacyRecord).origin,
    'custom',
  );
  assert.throws(
    () => validateAvatarSelection('wechat', fileId, 'openid-owner-a', mediaSecret, legacyRecord),
    { code: 'MEDIA_ORIGIN_MISMATCH' },
  );
  assert.throws(
    () =>
      validateAvatarSelection('custom', fileId, 'openid-owner-a', mediaSecret, {
        ...record,
        origin: 'legacy',
      }),
    { code: 'MEDIA_ORIGIN_MISMATCH' },
  );
});

test('仅有合法 HMAC 前缀但无 owner registry 记录仍拒绝', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const fileId = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  assert.throws(
    () =>
      validateMediaUpdate(
        {},
        { photos: [{ file_id: fileId, category: 'ride' }] },
        'openid-owner-a',
        mediaSecret,
        [],
      ),
    { code: 'MEDIA_NOT_OWNED' },
  );
});

test('资料更新计划把被移除的 active 媒体降级为可清理状态', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const fileId = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const record = {
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    owner_openid: 'openid-owner-a',
    category: 'ride',
    status: 'active',
  };
  const plan = validateMediaUpdate(
    { photos: [{ file_id: fileId, category: 'ride' }] },
    { photos: [] },
    'openid-owner-a',
    mediaSecret,
    [record],
  );
  assert.deepEqual(plan.activate_ids, []);
  assert.deepEqual(plan.demote_ids, [record._id]);
});

test('普通保存移除非法头像组合时同步降级不再被 photos 引用的媒体', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const fileId = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const record = {
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    owner_openid: 'openid-owner-a',
    category: 'other',
    origin: 'custom',
    status: 'active',
  };
  const plan = validateMediaUpdate(
    { avatar_file_id: fileId, avatar_source: 'forged' },
    { nickname: 'Rider' },
    'openid-owner-a',
    mediaSecret,
    [record],
  );
  assert.deepEqual(plan.demote_ids, [record._id]);
  assert.deepEqual(
    validateMediaUpdate(
      {
        avatar_file_id: fileId,
        avatar_source: 'forged',
        photos: [{ file_id: fileId, category: 'other' }],
      },
      { nickname: 'Rider' },
      'openid-owner-a',
      mediaSecret,
      [record],
    ).demote_ids,
    [],
  );
});

test('registerMedia 记录幂等且在 profile 引用前可清理', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const fileId = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const createdAt = new Date('2026-09-29T12:00:00.000Z');
  const record = mediaRegistration(
    fileId,
    'ride',
    'custom',
    'openid-owner-a',
    mediaSecret,
    createdAt,
  );
  assert.deepEqual(record, {
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    owner_openid: 'openid-owner-a',
    category: 'ride',
    origin: 'custom',
    status: 'unreferenced',
    created_at: createdAt,
    cleanup_after: new Date('2026-09-30T12:00:00.000Z'),
  });
  assert.deepEqual(
    mediaRegistration(fileId, 'ride', 'custom', 'openid-owner-a', mediaSecret, createdAt, record),
    record,
  );
  assert.throws(
    () => mediaRegistration(fileId, 'ride', 'custom', 'openid-owner-b', mediaSecret, createdAt),
    { code: 'MEDIA_NOT_OWNED' },
  );
  assert.throws(
    () =>
      mediaRegistration(fileId, 'ride', 'strava', 'openid-owner-a', mediaSecret, createdAt, record),
    { code: 'MEDIA_REGISTRATION_CONFLICT' },
  );
  const { origin, ...legacyRecord } = record;
  void origin;
  assert.deepEqual(
    mediaRegistration(
      fileId,
      'ride',
      'custom',
      'openid-owner-a',
      mediaSecret,
      createdAt,
      legacyRecord,
    ),
    record,
  );
  assert.throws(
    () =>
      mediaRegistration(
        fileId,
        'ride',
        'wechat',
        'openid-owner-a',
        mediaSecret,
        createdAt,
        legacyRecord,
      ),
    { code: 'MEDIA_REGISTRATION_CONFLICT' },
  );
  assert.throws(
    () =>
      mediaRegistration(fileId, 'ride', 'custom', 'openid-owner-a', mediaSecret, createdAt, {
        ...record,
        origin: 'legacy',
      }),
    { code: 'MEDIA_REGISTRATION_CONFLICT' },
  );
});

test('registerMedia 落库前必须由服务端确认对象存在且返回 https URL', async () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const fileId = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  await assert.doesNotReject(
    verifyMediaObject(fileId, async () => ({
      fileList: [{ fileID: fileId, tempFileURL: 'https://temporary.example/photo', status: 0 }],
    })),
  );
  assert.equal(
    await inspectMediaObject(fileId, async () => ({
      fileList: [{ fileID: fileId, status: -1, errMsg: 'file not found' }],
    })),
    'missing',
  );
  await assert.rejects(
    verifyMediaObject(fileId, async () => {
      throw new Error('storage unavailable');
    }),
    { code: 'MEDIA_OBJECT_VERIFY_FAILED' },
  );
  await assert.rejects(
    verifyMediaObject(fileId, async () => ({
      fileList: [
        { fileID: 'cloud://env/other', tempFileURL: 'https://temporary.example/x', status: 0 },
      ],
    })),
    { code: 'MEDIA_OBJECT_VERIFY_FAILED' },
  );
  await assert.rejects(
    verifyMediaObject(fileId, async () => ({
      fileList: [{ fileID: fileId, tempFileURL: 'http://insecure', status: 0 }],
    })),
    { code: 'MEDIA_OBJECT_VERIFY_FAILED' },
  );
});

test('能力卡媒体只选择当前 owner 签发文件，legacy 与他人文件均不可见', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const otherPrefix = mediaOwnerPrefix('openid-owner-b', mediaSecret);
  const ownedFile = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const profile = {
    avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg',
    photos: [
      { file_id: 'cloud://env/profiles/legacy/ride.jpg', category: 'ride' },
      {
        file_id: `cloud://env/${otherPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`,
        category: 'bike',
      },
      { file_id: ownedFile, category: 'other' },
    ],
  };
  assert.deepEqual(ownerMedia(profile, 'openid-owner-a', mediaSecret, []), []);
  assert.deepEqual(
    ownerMedia(profile, 'openid-owner-a', mediaSecret, [
      {
        _id: mediaDocumentId(ownedFile),
        file_id: ownedFile,
        owner_openid: 'openid-owner-a',
        category: 'other',
        status: 'active',
      },
    ]),
    [
      {
        file_id: ownedFile,
        category: 'other',
        source: 'user_photo',
      },
    ],
  );
});

test('能力卡头像必须同时匹配当前 profile 来源与 active owner registry', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const avatar = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const record = {
    _id: mediaDocumentId(avatar),
    file_id: avatar,
    owner_openid: 'openid-owner-a',
    category: 'other',
    origin: 'custom',
    status: 'active',
  };
  assert.deepEqual(
    ownerMedia({ avatar_file_id: avatar, avatar_source: 'forged' }, 'openid-owner-a', mediaSecret, [
      record,
    ]),
    [],
  );
  assert.deepEqual(
    ownerMedia({ avatar_file_id: avatar, avatar_source: 'strava' }, 'openid-owner-a', mediaSecret, [
      record,
    ]),
    [],
  );
  assert.deepEqual(
    ownerMedia({ avatar_file_id: avatar }, 'openid-owner-a', mediaSecret, [record]),
    [{ file_id: avatar, category: 'other', source: 'avatar' }],
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
