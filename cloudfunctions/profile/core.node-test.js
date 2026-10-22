'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const {
  keyFrom,
  encrypt,
  decrypt,
  maskName,
  maskPhone,
  response,
  profileReadiness,
  buildUpdate,
  phoneUpdate,
  issueMediaUploadPath,
  clientUploadIntent,
  canonicalMediaPath,
  isOwnerCanonicalMedia,
  canonicalUploadIntent,
  canonicalMediaBinding,
  mediaOwnerPrefix,
  mediaDocumentId,
  mediaRegistration,
  clientAvatarSource,
  clientMediaOrigin,
  validateAvatarSelection,
  inspectMediaObject,
  verifyMediaObject,
  verifyUploadedMedia,
  MEDIA_VERIFY_ATTEMPTS,
  validateMediaUpdate,
  effectiveBackgroundPhoto,
  ownerMedia,
  ownerAvatarMedia,
  normalizeAvatarProfile,
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
  // 完整度口径为 7 项（昵称/真实姓名/手机号/紧急联系人姓名/紧急联系人电话/性别/头像），各约 14%。
  // source 命中 昵称/真实姓名/手机号 共 3 项 → round(3/7*100)=43。
  assert.equal(dto.completeness, 43);
  assert.deepEqual(dto.missing, [
    '填写紧急联系人姓名',
    '填写紧急联系人电话',
    '选择性别',
    '设置头像',
  ]);
  assert.deepEqual(dto.missingKeys, ['emergency_name', 'emergency_phone', 'gender', 'avatar']);
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
  // 补一项 → 4/7，round(57.14)=57。
  assert.equal(response({ ...source, gender: '男' }).completeness, 57);
  assert.equal(response({ ...source, emergency_name: '联系人' }).completeness, 57);
  assert.equal(
    response({
      nickname: '骑手',
      real_name_cipher: {},
      phone_cipher: {},
      emergency_name: '联系人',
      emergency_phone_cipher: {},
      gender: '男',
      avatar_file_id: 'cloud://env/avatar.jpg',
      avatar_source: 'wechat',
    }).completeness,
    100,
  );
  // 完整资料的缺失项为空。
  assert.deepEqual(
    response({
      nickname: '骑手',
      real_name_cipher: {},
      phone_cipher: {},
      emergency_name: '联系人',
      emergency_phone_cipher: {},
      gender: '男',
      avatar_file_id: 'cloud://env/avatar.jpg',
      avatar_source: 'wechat',
    }).missing,
    [],
  );
});
test('profileReadiness 以 7 项口径计算完整度与缺失项，背景图不计入', () => {
  const full = {
    nickname: '骑手',
    real_name_cipher: {},
    phone_cipher: {},
    emergency_name: '联系人',
    emergency_phone_cipher: {},
    gender: '男',
    avatar_file_id: 'cloud://env/avatar.jpg',
    avatar_source: 'wechat',
  };
  const ready = profileReadiness(full);
  assert.equal(ready.completeness, 100);
  assert.deepEqual(ready.missing, []);
  assert.deepEqual(ready.missingKeys, []);

  // 空文档缺全部 7 项。
  const empty = profileReadiness({});
  assert.equal(empty.completeness, 0);
  assert.deepEqual(empty.missingKeys, [
    'nickname',
    'real_name',
    'phone',
    'emergency_name',
    'emergency_phone',
    'gender',
    'avatar',
  ]);

  // 背景图不影响完整度：补齐背景图仍为 100%，缺失背景图也不进入 missing。
  assert.equal(
    profileReadiness({ ...full, background_photo: { file_id: 'cloud://bg', category: 'ride' } })
      .completeness,
    100,
  );
  const partial = profileReadiness({ ...full, gender: '', avatar_file_id: '' });
  assert.equal(partial.completeness, 71); // 5/7 → round(71.4)
  assert.deepEqual(partial.missingKeys, ['gender', 'avatar']);
});
test('头像响应只返回规范来源，并为合法 legacy 头像推断 custom', () => {
  assert.deepEqual(response({ avatar_file_id: 'cloud://env/legacy.jpg' }), {
    ...response({}),
    avatar_file_id: 'cloud://env/legacy.jpg',
    avatar_source: 'custom',
    completeness: 14,
    missing: [
      '设置昵称',
      '填写真实姓名',
      '填写本人手机号',
      '填写紧急联系人姓名',
      '填写紧急联系人电话',
      '选择性别',
    ],
    missingKeys: ['nickname', 'real_name', 'phone', 'emergency_name', 'emergency_phone', 'gender'],
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
  assert.equal(response({}).avatar_visibility, 'private');
  assert.equal(response({}).avatar_visibility_revision, null);
  assert.equal(
    response({ avatar_visibility: 'public', avatar_visibility_revision: 7 }).avatar_visibility,
    'private',
  );
  assert.equal(
    response({ avatar_visibility: 'public', avatar_visibility_revision: 7 })
      .avatar_visibility_revision,
    null,
  );
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
  assert.throws(
    () =>
      buildUpdate(
        {
          photos: [
            { file_id: 'cloud://env/a.jpg', category: 'ride' },
            { file_id: 'cloud://env/b.jpg', category: 'ride' },
          ],
        },
        key,
      ),
    { code: 'VALIDATION_FAILED' },
  );
  assert.throws(() => buildUpdate({ phone: 'not-phone' }, key), { code: 'PHONE_INVALID' });
  assert.throws(() => buildUpdate({ id_type: '身份证' }, key), { code: 'FORBIDDEN_FIELD' });
  assert.throws(() => buildUpdate({ id_number: 'anything' }, key), { code: 'FORBIDDEN_FIELD' });
  assert.throws(() => buildUpdate({ phone_source: 'wechat' }, key), { code: 'FORBIDDEN_FIELD' });
  assert.throws(() => buildUpdate({ avatar_source: 'wechat' }, key), {
    code: 'FORBIDDEN_FIELD',
  });
  assert.throws(() => buildUpdate({ openid: 'forged' }, key), { code: 'FORBIDDEN_FIELD' });
});

test('背景槽位显式 null 阻止 legacy photos 首图回退', () => {
  const legacy = { file_id: 'cloud://env/profiles/legacy/ride.jpg', category: 'ride' };
  assert.deepEqual(effectiveBackgroundPhoto({ photos: [legacy] }), legacy);
  assert.equal(effectiveBackgroundPhoto({ background_photo: null, photos: [legacy] }), null);
});

test('旧客户端零或单图写入转换成背景槽位且不生成 photos 覆盖', () => {
  assert.deepEqual(buildUpdate({ photos: [] }, key, {}), { background_photo: null });
  assert.deepEqual(
    buildUpdate(
      { photos: [{ file_id: 'cloud://env/profiles/owner/next.jpg', category: 'ride' }] },
      key,
      {},
    ),
    {
      background_photo: {
        file_id: 'cloud://env/profiles/owner/next.jpg',
        category: 'ride',
      },
      media_revision: 1,
    },
  );
});

test('新旧背景协议不可混用且旧多图继续拒绝', () => {
  assert.throws(
    () =>
      buildUpdate(
        {
          background_photo: null,
          photos: [{ file_id: 'cloud://env/profiles/owner/next.jpg', category: 'ride' }],
        },
        key,
        {},
      ),
    { code: 'VALIDATION_FAILED' },
  );
  assert.throws(
    () =>
      buildUpdate(
        {
          photos: [
            { file_id: 'cloud://env/profiles/owner/a.jpg', category: 'ride' },
            { file_id: 'cloud://env/profiles/owner/b.jpg', category: 'bike' },
          ],
        },
        key,
        {},
      ),
    { code: 'VALIDATION_FAILED' },
  );
});

test('头像单独更新不触发整表必填校验', () => {
  assert.deepEqual(buildUpdate({}, key, {}), {});
});

test('整表保存校验性别和私人头像，拒绝可选公开照片不阻塞保存', () => {
  const complete = {
    gender: '男',
    avatar_file_id: 'cloud://env/profiles/owner/avatar.jpg',
    avatar_source: 'wechat',
    avatar_revision: 1,
    background_photo: { file_id: 'cloud://env/profiles/owner/bg.jpg', category: 'ride' },
  };

  // 1. 缺性别失败
  assert.throws(
    () => buildUpdate({ gender: '', background_photo: complete.background_photo }, key, complete),
    { code: 'VALIDATION_FAILED', message: '请选择性别' },
  );

  // 2. 缺头像失败 (从存量合并后仍缺失)
  assert.throws(
    () => buildUpdate({ gender: '女', background_photo: complete.background_photo }, key, {}),
    { code: 'AVATAR_REQUIRED', message: '请先设置头像' },
  );

  assert.doesNotThrow(() => buildUpdate({ gender: '女', background_photo: null }, key, complete));

  // 4. 存量完整，整表更新部分字段成功
  const update = buildUpdate({ gender: '女' }, key, complete);
  assert.equal(update.gender, '女');

  // 5. 试图清空性别失败
  assert.throws(() => buildUpdate({ gender: '' }, key, complete), { code: 'VALIDATION_FAILED' });

  assert.doesNotThrow(() => buildUpdate({ background_photo: null }, key, complete));

  // 7. 新旧合并后完整（含背景图）则成功
  assert.deepEqual(
    buildUpdate({ background_photo: complete.background_photo }, key, {
      gender: '男',
      avatar_file_id: complete.avatar_file_id,
      avatar_source: complete.avatar_source,
    }),
    { background_photo: complete.background_photo, media_revision: 1 },
  );
});

test('profile 响应区分缺失与显式空背景并完整保留 legacy photos', () => {
  const photos = [
    { file_id: 'cloud://env/profiles/owner/a.jpg', category: 'ride' },
    { file_id: 'cloud://env/profiles/owner/b.jpg', category: 'bike' },
  ];
  const legacy = response({ photos });
  assert.equal(Object.hasOwn(legacy, 'background_photo'), false);
  assert.deepEqual(legacy.photos, photos);

  const cleared = response({ background_photo: null, photos });
  assert.equal(Object.hasOwn(cleared, 'background_photo'), true);
  assert.equal(cleared.background_photo, null);
  assert.deepEqual(cleared.photos, photos);

  const current = response({ background_photo: photos[1], photos });
  assert.deepEqual(current.background_photo, photos[1]);
  assert.deepEqual(current.photos, photos);
});

test('普通保存拒绝公开授权，兼容 private 操作只撤回媒体同意', () => {
  const current = {
    avatar_file_id: 'cloud://env/profiles/owner/avatar.jpg',
    avatar_source: 'wechat',
    avatar_revision: 3,
  };
  assert.throws(() => buildUpdate({ avatar_visibility: 'public' }, key, current), {
    code: 'PUBLIC_CONSENT_ACTION_REQUIRED',
  });
  assert.deepEqual(buildUpdate({ avatar_visibility: 'private' }, key, current), {
    avatar_visibility: 'private',
    avatar_visibility_revision: null,
    public_consent: { media: { consented: false } },
  });
  assert.throws(() => buildUpdate({ avatar_visibility: 'public' }, key, {}), {
    code: 'PUBLIC_CONSENT_ACTION_REQUIRED',
  });
  assert.throws(() => buildUpdate({ avatar_visibility: 'friends' }, key, current), {
    code: 'VALIDATION_FAILED',
  });
  assert.throws(() => buildUpdate({ avatar_visibility_revision: 3 }, key, current), {
    code: 'FORBIDDEN_FIELD',
  });
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

test('客户端头像来源只允许微信授权，媒体登记仍兼容历史自定义来源', () => {
  assert.equal(clientAvatarSource('wechat'), 'wechat');
  assert.throws(() => clientAvatarSource('custom'), { code: 'AVATAR_SOURCE_INVALID' });
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
test('本人资料响应返回完整真实姓名、手机号与紧急联系人电话，未提供密钥时仍只返回旧兼容字段', () => {
  const data = phoneUpdate('13812345678', key, 'wechat');
  const profile = {
    nickname: '骑手',
    ...data,
    real_name_cipher: encrypt('曹蒙恩', key),
    real_name_masked: '曹**',
    emergency_phone_cipher: encrypt('13912345678', key),
    emergency_phone_masked: '139****0000',
  };
  assert.equal(response(profile, key).real_name, '曹蒙恩');
  assert.equal(response(profile, key).phone, '13812345678');
  assert.equal(response(profile, key).emergency_phone, '13912345678');
  assert.equal(response(profile).real_name, undefined);
  assert.equal(response(profile).phone, undefined);
  assert.equal(response(profile).emergency_phone, undefined);
  assert.equal(response(profile).real_name_masked, '曹**');
  assert.equal(response(profile).phone_masked, '138****5678');
  assert.equal(response(profile).emergency_phone_masked, '139****0000');
});

test('媒体上传路径使用服务端 secret 派生 opaque owner alias', () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000';
  const first = issueMediaUploadPath('openid-owner-a', mediaSecret, () => uuid);
  const second = issueMediaUploadPath('openid-owner-b', mediaSecret, () => uuid);
  assert.match(
    first.cloud_path,
    /^profiles\/[a-f0-9]{32}\/profile-avatar\/123e4567-e89b-42d3-a456-426614174000\.jpg$/,
  );
  assert.notEqual(first.cloud_path, second.cloud_path);
  assert.equal(first.cloud_path.includes('openid-owner-a'), false);
  assert.equal(first.cloud_path.startsWith(mediaOwnerPrefix('openid-owner-a', mediaSecret)), true);
  assert.throws(() => issueMediaUploadPath('', mediaSecret, () => uuid), {
    code: 'UNAUTHENTICATED',
  });
  assert.throws(() => issueMediaUploadPath('openid-owner-a', 'short', () => uuid), {
    code: 'MEDIA_SECRET_INVALID',
  });
  assert.equal(
    issueMediaUploadPath('openid-owner-a', mediaSecret, () => uuid, 'png').cloud_path,
    `${mediaOwnerPrefix('openid-owner-a', mediaSecret)}profile-avatar/${uuid}.png`,
  );
  assert.throws(() => issueMediaUploadPath('openid-owner-a', mediaSecret, () => uuid, 'svg'), {
    code: 'MEDIA_TYPE_INVALID',
  });
});

test('客户端上传 intent 由 owner-bound cloudPath 确定并在过期后进入 cleanup', () => {
  const openid = 'openid-owner-a';
  const now = new Date('2026-09-30T00:00:00.000Z');
  const cloudPath = issueMediaUploadPath(
    openid,
    mediaSecret,
    () => '123e4567-e89b-42d3-a456-426614174000',
  ).cloud_path;
  const intent = clientUploadIntent(openid, cloudPath, mediaSecret, now);

  assert.match(intent._id, /^client-upload-[a-f0-9]{64}$/);
  assert.deepEqual(intent, {
    _id: intent._id,
    kind: 'client_upload',
    owner_openid: openid,
    cloud_path: cloudPath,
    status: 'prepared',
    created_at: now,
    cleanup_after: new Date('2026-09-30T00:30:00.000Z'),
  });
  assert.throws(
    () =>
      clientUploadIntent(
        openid,
        issueMediaUploadPath(
          'openid-owner-b',
          mediaSecret,
          () => '123e4567-e89b-42d3-a456-426614174001',
        ).cloud_path,
        mediaSecret,
        now,
      ),
    { code: 'MEDIA_NOT_OWNED' },
  );
});

test('canonical path 同时绑定 owner、source 与已验证内容 hash', () => {
  const openid = 'openid-owner-a';
  const sourceFileId = `cloud://env/${mediaOwnerPrefix(openid, mediaSecret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const sha256 = 'a'.repeat(64);
  const now = new Date('2026-09-30T00:00:00.000Z');
  const path = canonicalMediaPath(openid, sourceFileId, sha256, 'jpg', mediaSecret);

  assert.match(path, /^profile-canonical\/[a-f0-9]{32}\/[a-f0-9]{64}\/[a-f0-9]{64}\.jpg$/);
  assert.equal(isOwnerCanonicalMedia(`cloud://env/${path}`, openid, mediaSecret), true);
  assert.equal(isOwnerCanonicalMedia(`cloud://env/${path}`, 'openid-owner-b', mediaSecret), false);
  assert.throws(() => canonicalMediaPath(openid, sourceFileId, 'bad', 'jpg', mediaSecret), {
    code: 'MEDIA_OBJECT_VERIFY_FAILED',
  });

  const canonicalFileId = `cloud://env/${path}`;
  const binding = canonicalMediaBinding(
    openid,
    sourceFileId,
    canonicalFileId,
    { sha256, size: 5, mime: 'image/jpeg', extension: 'jpg' },
    mediaSecret,
  );
  assert.deepEqual(binding, {
    source_file_id: sourceFileId,
    canonical_file_id: canonicalFileId,
    sha256,
    size: 5,
    mime: 'image/jpeg',
  });
  const intent = canonicalUploadIntent(
    openid,
    sourceFileId,
    { sha256, size: 5, mime: 'image/jpeg', extension: 'jpg' },
    mediaSecret,
    now,
  );
  assert.deepEqual(intent, {
    _id: `canonical-upload-${require('node:crypto').createHash('sha256').update(path).digest('hex')}`,
    kind: 'canonical_upload',
    owner_openid: openid,
    source_file_id: sourceFileId,
    cloud_path: path,
    sha256,
    size: 5,
    mime: 'image/jpeg',
    status: 'prepared',
    created_at: now,
    cleanup_after: new Date('2026-09-30T00:30:00.000Z'),
  });
});

test('media registry 绑定 source 与 canonical 版本且重复登记必须完全一致', () => {
  const openid = 'openid-owner-a';
  const category = 'profile-background';
  const sourceFileId = `cloud://env/${mediaOwnerPrefix(openid, mediaSecret)}${category}/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const sha256 = 'b'.repeat(64);
  const canonicalPath = canonicalMediaPath(
    openid,
    sourceFileId,
    sha256,
    'jpg',
    mediaSecret,
    category,
  );
  const canonicalFileId = `cloud://env/${canonicalPath}`;
  const binding = canonicalMediaBinding(
    openid,
    sourceFileId,
    canonicalFileId,
    { sha256, size: 5, mime: 'image/jpeg', extension: 'jpg' },
    mediaSecret,
    category,
  );
  const now = new Date('2026-09-30T00:00:00.000Z');
  const record = mediaRegistration(
    sourceFileId,
    category,
    'custom',
    openid,
    mediaSecret,
    now,
    undefined,
    binding,
  );

  assert.deepEqual(record, {
    _id: mediaDocumentId(sourceFileId),
    file_id: sourceFileId,
    owner_openid: openid,
    category,
    origin: 'custom',
    status: 'unreferenced',
    created_at: now,
    cleanup_after: new Date('2026-10-01T00:00:00.000Z'),
    ...binding,
  });
  assert.deepEqual(
    mediaRegistration(sourceFileId, category, 'custom', openid, mediaSecret, now, record, binding),
    record,
  );
  const otherSha256 = 'c'.repeat(64);
  const otherCanonicalFileId = `cloud://env/${canonicalMediaPath(
    openid,
    sourceFileId,
    otherSha256,
    'jpg',
    mediaSecret,
    category,
  )}`;
  const otherBinding = canonicalMediaBinding(
    openid,
    sourceFileId,
    otherCanonicalFileId,
    { sha256: otherSha256, size: 5, mime: 'image/jpeg', extension: 'jpg' },
    mediaSecret,
    category,
  );
  assert.throws(
    () =>
      mediaRegistration(
        sourceFileId,
        category,
        'custom',
        openid,
        mediaSecret,
        now,
        record,
        otherBinding,
      ),
    { code: 'MEDIA_REGISTRATION_CONFLICT' },
  );
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
        security_status: 'pass',
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
        security_status: 'pass',
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

test('设置显式背景槽位会激活新媒体并保留全部 legacy photos 引用', () => {
  const owner = 'openid-owner-a';
  const ownerPrefix = mediaOwnerPrefix(owner, mediaSecret);
  const legacyA = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const legacyB = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const nextFileId = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174002.jpg`;
  const mediaRecord = (fileId, category, status) => ({
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    owner_openid: owner,
    category,
    status,
    ...(status === 'unreferenced' ? { security_status: 'pass' } : {}),
  });
  const plan = validateMediaUpdate(
    {
      photos: [
        { file_id: legacyA, category: 'ride' },
        { file_id: legacyB, category: 'bike' },
      ],
    },
    { background_photo: { file_id: nextFileId, category: 'ride' } },
    owner,
    mediaSecret,
    [
      mediaRecord(legacyA, 'ride', 'active'),
      mediaRecord(legacyB, 'bike', 'active'),
      mediaRecord(nextFileId, 'ride', 'unreferenced'),
    ],
  );

  assert.deepEqual(plan.data, {
    background_photo: { file_id: nextFileId, category: 'ride' },
  });
  assert.deepEqual(plan.activate_ids, [mediaDocumentId(nextFileId)]);
  assert.deepEqual(plan.demote_ids, []);
});

test('替换显式背景只降级不再被头像或 legacy photos 引用的旧槽位', () => {
  const owner = 'openid-owner-a';
  const ownerPrefix = mediaOwnerPrefix(owner, mediaSecret);
  const legacy = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const previous = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const nextFileId = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174002.jpg`;
  const mediaRecord = (fileId, category, status) => ({
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    owner_openid: owner,
    category,
    status,
    ...(status === 'unreferenced' ? { security_status: 'pass' } : {}),
  });
  const plan = validateMediaUpdate(
    {
      background_photo: { file_id: previous, category: 'other' },
      photos: [{ file_id: legacy, category: 'ride' }],
    },
    { background_photo: { file_id: nextFileId, category: 'ride' } },
    owner,
    mediaSecret,
    [
      mediaRecord(legacy, 'ride', 'active'),
      mediaRecord(previous, 'other', 'active'),
      mediaRecord(nextFileId, 'ride', 'unreferenced'),
    ],
  );

  assert.deepEqual(plan.activate_ids, [mediaDocumentId(nextFileId)]);
  assert.deepEqual(plan.demote_ids, [mediaDocumentId(previous)]);
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
  const category = 'profile-background';
  const fileId = `cloud://env/${ownerPrefix}${category}/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const createdAt = new Date('2026-09-29T12:00:00.000Z');
  const record = mediaRegistration(
    fileId,
    category,
    'custom',
    'openid-owner-a',
    mediaSecret,
    createdAt,
  );
  assert.deepEqual(record, {
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    owner_openid: 'openid-owner-a',
    category,
    origin: 'custom',
    status: 'unreferenced',
    created_at: createdAt,
    cleanup_after: new Date('2026-09-30T12:00:00.000Z'),
  });
  assert.deepEqual(
    mediaRegistration(fileId, category, 'custom', 'openid-owner-a', mediaSecret, createdAt, record),
    record,
  );
  assert.throws(
    () => mediaRegistration(fileId, category, 'custom', 'openid-owner-b', mediaSecret, createdAt),
    { code: 'MEDIA_NOT_OWNED' },
  );
  assert.throws(
    () =>
      mediaRegistration(
        fileId,
        category,
        'strava',
        'openid-owner-a',
        mediaSecret,
        createdAt,
        record,
      ),
    { code: 'MEDIA_ORIGIN_INVALID' },
  );
  const { origin, ...legacyRecord } = record;
  void origin;
  assert.deepEqual(
    mediaRegistration(
      fileId,
      category,
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
        category,
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
      mediaRegistration(fileId, category, 'custom', 'openid-owner-a', mediaSecret, createdAt, {
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

function storageRequestFactory(responses, calls = []) {
  return (_url, options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = (_milliseconds, handler) => {
      request.timeoutHandler = handler;
    };
    request.destroy = (error) => queueMicrotask(() => request.emit('error', error));
    request.end = () => {
      calls.push(options.method);
      const next = responses.shift();
      if (next instanceof Error) {
        request.emit('error', next);
        return;
      }
      callback(
        Object.assign(Readable.from(next.chunks || []), {
          statusCode: next.statusCode ?? 200,
          headers: next.headers || {},
        }),
      );
    };
    return request;
  };
}

test('registerMedia 以可信临时 URL 先验大小并有界流式校验真实图片 magic', async () => {
  const { verifyUploadedImageObject, MAX_PROFILE_IMAGE_BYTES } = require('./core');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  const calls = [];
  const verified = await verifyUploadedImageObject(
    'https://storage.example/image.jpg?signature=opaque',
    {
      requestFactory: storageRequestFactory(
        [
          { headers: { 'content-length': String(jpeg.length) } },
          { headers: { 'content-length': String(jpeg.length) }, chunks: [jpeg] },
        ],
        calls,
      ),
    },
  );
  assert.deepEqual(verified, {
    bytes: jpeg,
    sha256: require('node:crypto').createHash('sha256').update(jpeg).digest('hex'),
    size: jpeg.length,
    mime: 'image/jpeg',
    extension: 'jpg',
  });
  assert.deepEqual(calls, ['HEAD', 'GET']);

  const headOnly = [];
  await assert.rejects(
    verifyUploadedImageObject('https://storage.example/large.jpg', {
      requestFactory: storageRequestFactory(
        [{ headers: { 'content-length': String(MAX_PROFILE_IMAGE_BYTES + 1) } }],
        headOnly,
      ),
    }),
    { code: 'MEDIA_OBJECT_TOO_LARGE' },
  );
  assert.deepEqual(headOnly, ['HEAD']);

  await assert.rejects(
    verifyUploadedImageObject('https://storage.example/missing-size.jpg', {
      requestFactory: storageRequestFactory([{ headers: {} }]),
    }),
    { code: 'MEDIA_OBJECT_VERIFY_FAILED' },
  );

  await assert.rejects(
    verifyUploadedImageObject('https://storage.example/stream-too-large.jpg', {
      maxBytes: 16,
      requestFactory: storageRequestFactory([
        { headers: { 'content-length': '16' } },
        { headers: {}, chunks: [Buffer.alloc(12), Buffer.alloc(5)] },
      ]),
    }),
    { code: 'MEDIA_OBJECT_TOO_LARGE' },
  );

  const invalid = Buffer.from('not-an-image');
  await assert.rejects(
    verifyUploadedImageObject('https://storage.example/not-image.jpg', {
      requestFactory: storageRequestFactory([
        { headers: { 'content-length': String(invalid.length) } },
        { headers: { 'content-length': String(invalid.length) }, chunks: [invalid] },
      ]),
    }),
    { code: 'MEDIA_OBJECT_TYPE_INVALID' },
  );
  await assert.rejects(
    verifyUploadedImageObject('https://storage.example/unavailable.jpg', {
      requestFactory: storageRequestFactory([new Error('storage unavailable')]),
    }),
    { code: 'MEDIA_OBJECT_VERIFY_FAILED' },
  );
});

test('能力卡背景只选择当前 owner 签发槽位，legacy 与他人文件均不可见', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const otherPrefix = mediaOwnerPrefix('openid-owner-b', mediaSecret);
  const ownedFile = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const ownedSha256 = 'd'.repeat(64);
  const ownedCanonicalFileId = `cloud://env/${canonicalMediaPath(
    'openid-owner-a',
    ownedFile,
    ownedSha256,
    'jpg',
    mediaSecret,
  )}`;
  const profile = {
    avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg',
    background_photo: { file_id: ownedFile, category: 'other' },
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
        source_file_id: ownedFile,
        canonical_file_id: ownedCanonicalFileId,
        sha256: ownedSha256,
        size: 5,
        mime: 'image/jpeg',
      },
    ]),
    [
      {
        file_id: ownedFile,
        storage_file_id: ownedCanonicalFileId,
        category: 'other',
        source: 'user_photo',
      },
    ],
  );
});

test('能力卡头像必须同时匹配当前 profile 来源与 active owner registry', () => {
  const ownerPrefix = mediaOwnerPrefix('openid-owner-a', mediaSecret);
  const avatar = `cloud://env/${ownerPrefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const avatarSha256 = 'e'.repeat(64);
  const canonicalAvatar = `cloud://env/${canonicalMediaPath(
    'openid-owner-a',
    avatar,
    avatarSha256,
    'jpg',
    mediaSecret,
  )}`;
  const record = {
    _id: mediaDocumentId(avatar),
    file_id: avatar,
    owner_openid: 'openid-owner-a',
    category: 'other',
    origin: 'custom',
    status: 'active',
    source_file_id: avatar,
    canonical_file_id: canonicalAvatar,
    sha256: avatarSha256,
    size: 5,
    mime: 'image/jpeg',
  };
  assert.deepEqual(
    ownerAvatarMedia(
      { avatar_file_id: avatar, avatar_source: 'forged' },
      'openid-owner-a',
      mediaSecret,
      [record],
    ),
    undefined,
  );
  assert.deepEqual(
    ownerAvatarMedia(
      { avatar_file_id: avatar, avatar_source: 'strava' },
      'openid-owner-a',
      mediaSecret,
      [record],
    ),
    undefined,
  );
  assert.deepEqual(
    ownerAvatarMedia({ avatar_file_id: avatar }, 'openid-owner-a', mediaSecret, [record]),
    {
      file_id: avatar,
      storage_file_id: canonicalAvatar,
      category: 'other',
      source: 'avatar',
    },
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

test('上传后媒体短暂不可见时有界重试，就绪后返回成功', async () => {
  const fileId = 'cloud://owner-other-file';
  let calls = 0;
  const waits = [];
  const getTempFileURL = async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('file not found'), { errMsg: 'file not found' });
    return { fileList: [{ fileID: fileId, status: 0, tempFileURL: 'https://example.com/a.png' }] };
  };
  const result = await verifyUploadedMedia(fileId, getTempFileURL, async (ms) => {
    waits.push(ms);
  });
  assert.equal(result, 'https://example.com/a.png');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [100]);
});

test('媒体在所有重试后仍不可见则抛最后错误并按递增延迟等待', async () => {
  const fileId = 'cloud://owner-other-file';
  let calls = 0;
  const waits = [];
  await assert.rejects(
    verifyUploadedMedia(
      fileId,
      async () => {
        calls += 1;
        throw Object.assign(new Error('not exist'), { errMsg: 'document not exist' });
      },
      async (ms) => {
        waits.push(ms);
      },
    ),
    { code: 'MEDIA_OBJECT_NOT_FOUND' },
  );
  assert.equal(calls, MEDIA_VERIFY_ATTEMPTS);
  assert.deepEqual(waits, [100, 200, 300]);
});

test('通用媒体授权按 category 隔离且拒绝用途互串', () => {
  const uuid = () => '123e4567-e89b-42d3-a456-426614174000';
  const issued = issueMediaUploadPath('owner-category', mediaSecret, uuid, 'webp', 'club-avatar');
  assert.match(
    issued.cloud_path,
    /^profiles\/[a-f0-9]{32}\/club-avatar\/123e4567-e89b-42d3-a456-426614174000\.webp$/,
  );
  const fileId = `cloud://env/${issued.cloud_path}`;
  assert.equal(
    mediaRegistration(fileId, 'club-avatar', 'custom', 'owner-category', mediaSecret).category,
    'club-avatar',
  );
  assert.throws(
    () => mediaRegistration(fileId, 'club-cover', 'custom', 'owner-category', mediaSecret),
    { code: 'MEDIA_CATEGORY_MISMATCH' },
  );
  assert.throws(
    () => mediaRegistration(fileId, 'club-avatar', 'custom', 'other-owner', mediaSecret),
    { code: 'MEDIA_NOT_OWNED' },
  );
});

test('canonical 路径携带业务用途并保持旧格式可验证', () => {
  const source = `cloud://env/${
    issueMediaUploadPath(
      'canonical-owner',
      mediaSecret,
      () => '123e4567-e89b-42d3-a456-426614174000',
      'jpg',
      'activity-image',
    ).cloud_path
  }`;
  const digest = 'a'.repeat(64);
  const categorized = canonicalMediaPath(
    'canonical-owner',
    source,
    digest,
    'jpg',
    mediaSecret,
    'activity-image',
  );
  assert.match(categorized, /\/activity-image\/[a-f0-9]{64}\/a{64}\.jpg$/);
  assert.equal(
    isOwnerCanonicalMedia(
      `cloud://env/${categorized}`,
      'canonical-owner',
      mediaSecret,
      'activity-image',
    ),
    true,
  );
  const legacy = canonicalMediaPath('canonical-owner', source, digest, 'jpg', mediaSecret);
  assert.equal(
    isOwnerCanonicalMedia(`cloud://env/${legacy}`, 'canonical-owner', mediaSecret),
    true,
  );
});

test('资料背景新写入 canonical 并激活 source registry，移除后仍按同一 registry 降级', () => {
  const openid = 'openid-owner-a';
  const sourceFileId = `cloud://env/${mediaOwnerPrefix(openid, mediaSecret)}profile-background/123e4567-e89b-42d3-a456-426614174001.jpg`;
  const sha256 = 'f'.repeat(64);
  const canonicalFileId = `cloud://env/${canonicalMediaPath(
    openid,
    sourceFileId,
    sha256,
    'jpg',
    mediaSecret,
    'profile-background',
  )}`;
  const record = {
    _id: mediaDocumentId(sourceFileId),
    file_id: sourceFileId,
    source_file_id: sourceFileId,
    canonical_file_id: canonicalFileId,
    canonical_category: 'profile-background',
    sha256,
    size: 5,
    mime: 'image/jpeg',
    owner_openid: openid,
    category: 'profile-background',
    origin: 'custom',
    status: 'unreferenced',
    security_status: 'pass',
  };
  const background = { file_id: canonicalFileId, category: 'ride' };
  const activation = validateMediaUpdate(
    { avatar_file_id: 'https://images.example/legacy-avatar.jpg' },
    { photos: [background], background_photo: background },
    openid,
    mediaSecret,
    [record],
  );
  assert.deepEqual(activation.activate_ids, [record._id]);
  assert.equal(activation.data.background_photo.file_id, canonicalFileId);
  assert.notEqual(activation.data.background_photo.file_id, sourceFileId);

  const removal = validateMediaUpdate(
    { photos: [background], background_photo: background },
    { photos: [], background_photo: null },
    openid,
    mediaSecret,
    [{ ...record, status: 'active' }],
  );
  assert.deepEqual(removal.demote_ids, [record._id]);
});
