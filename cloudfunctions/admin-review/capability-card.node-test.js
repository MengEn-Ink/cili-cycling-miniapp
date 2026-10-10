'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  adminCapabilityMedia,
  resolveAdminCapabilityMedia,
  adminCapabilityView,
  socialCapabilityView,
  adminCapabilityDetail,
} = require('./capability-card');

const profile = {
  nickname: '山野骑手',
  gender: '男',
  avatar_file_id: 'cloud://avatar',
  photos: [
    { file_id: 'cloud://other', category: 'other' },
    { file_id: 'cloud://ride-1', category: 'ride', location: 'secret' },
    { file_id: 'cloud://ride-2', category: 'bike', token: 'secret-token' },
  ],
  real_name_cipher: { ciphertext: 'secret' },
  phone_cipher: { ciphertext: 'secret' },
  emergency_name: '联系人',
  emergency_phone_cipher: { ciphertext: 'secret' },
  id_type: '身份证',
  id_number_cipher: { ciphertext: 'legacy-secret' },
  openid: 'private-openid',
};
const owner = 'member-openid';
const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
const canonicalFor = (fileId, ownerOpenid = owner) => {
  const ownerAlias = crypto
    .createHmac('sha256', mediaSecret)
    .update(ownerOpenid)
    .digest('hex')
    .slice(0, 32);
  const sourceDigest = crypto.createHash('sha256').update(fileId).digest('hex');
  const sha256 = crypto.createHash('sha256').update(`bytes:${fileId}`).digest('hex');
  return {
    canonicalFileId: `cloud://env/profile-canonical/${ownerAlias}/${sourceDigest}/${sha256}.jpg`,
    sha256,
  };
};
const mediaRecord = (fileId, category, status = 'active', ownerOpenid = owner) => ({
  _id: crypto.createHash('sha256').update(fileId).digest('hex'),
  file_id: fileId,
  source_file_id: fileId,
  canonical_file_id: canonicalFor(fileId, ownerOpenid).canonicalFileId,
  sha256: canonicalFor(fileId, ownerOpenid).sha256,
  size: 5,
  mime: 'image/jpeg',
  owner_openid: ownerOpenid,
  category,
  status,
});
const records = [
  mediaRecord('cloud://other', 'other'),
  mediaRecord('cloud://ride-1', 'ride'),
  mediaRecord('cloud://ride-2', 'bike'),
  mediaRecord('cloud://avatar', 'other'),
];

test('管理员媒体白名单按骑行照片、其他照片、头像排序去重并最多保留三张', () => {
  assert.deepEqual(adminCapabilityMedia(profile, records, owner, mediaSecret), {
    file_ids: ['cloud://ride-1', 'cloud://ride-2', 'cloud://other'].map(
      (fileId) => canonicalFor(fileId).canonicalFileId,
    ),
  });
  assert.deepEqual(
    adminCapabilityMedia(
      {
        avatar_file_id: 'cloud://avatar',
        photos: [
          { file_id: 'cloud://ride-1', category: 'ride' },
          { file_id: 'cloud://ride-2', category: 'bike' },
        ],
      },
      records,
      owner,
      mediaSecret,
    ),
    {
      file_ids: ['cloud://ride-1', 'cloud://ride-2', 'cloud://avatar'].map(
        (fileId) => canonicalFor(fileId).canonicalFileId,
      ),
    },
  );
});

test('管理员媒体按当前背景、legacy 骑行媒体、其他媒体和头像排序去重并最多三张', () => {
  const current = 'cloud://current';
  const rideOne = 'cloud://legacy-ride-1';
  const rideTwo = 'cloud://legacy-ride-2';
  const legacyOther = 'cloud://legacy-other';
  const avatar = 'cloud://current-avatar';
  const mediaRecords = [
    mediaRecord(current, 'other'),
    mediaRecord(rideOne, 'ride'),
    mediaRecord(rideTwo, 'bike'),
    mediaRecord(legacyOther, 'other'),
    mediaRecord(avatar, 'other'),
  ];

  assert.deepEqual(
    adminCapabilityMedia(
      {
        background_photo: { file_id: current, category: 'other' },
        photos: [
          { file_id: rideOne, category: 'ride' },
          { file_id: current, category: 'other' },
          { file_id: legacyOther, category: 'other' },
          { file_id: rideTwo, category: 'bike' },
        ],
        avatar_file_id: avatar,
      },
      mediaRecords,
      owner,
      mediaSecret,
    ),
    {
      file_ids: [current, rideOne, rideTwo].map((fileId) => canonicalFor(fileId).canonicalFileId),
    },
  );
});

test('管理员媒体只接受 profile 白名单内的 cloud file ID', () => {
  assert.deepEqual(
    adminCapabilityMedia(
      {
        avatar_file_id: 'https://attacker.example/avatar',
        photos: [
          { file_id: 'cloud://ok', category: 'ride' },
          { file_id: 'cloud://unknown', category: 'portrait' },
          { file_id: 'file://local', category: 'ride' },
          { file_id: 'x'.repeat(513), category: 'ride' },
          { file_id: 'cloud://ok', category: 'bike' },
        ],
      },
      [mediaRecord('cloud://ok', 'ride')],
      owner,
      mediaSecret,
    ),
    { file_ids: [canonicalFor('cloud://ok').canonicalFileId] },
  );
});

test('CloudBase 临时 URL 解析剔除失败项、非 https 和未知项', async () => {
  const calls = [];
  const canonicalRide = canonicalFor('cloud://ride-1').canonicalFileId;
  const canonicalBike = canonicalFor('cloud://ride-2').canonicalFileId;
  const canonicalOther = canonicalFor('cloud://other').canonicalFileId;
  const result = await resolveAdminCapabilityMedia(
    profile,
    records,
    owner,
    async ({ fileList }) => {
      calls.push(fileList);
      return {
        fileList: [
          {
            fileID: canonicalRide,
            tempFileURL: 'https://temporary.example/ride-1',
            status: 0,
          },
          {
            fileID: canonicalBike,
            tempFileURL: 'https://temporary.example/ride-2',
            status: -1,
          },
          {
            fileID: canonicalOther,
            tempFileURL: 'http://temporary.example/other',
            status: 0,
          },
          {
            fileID: 'cloud://unknown',
            tempFileURL: 'https://temporary.example/unknown',
            status: 0,
          },
        ],
      };
    },
    mediaSecret,
  );
  assert.deepEqual(calls, [[canonicalRide, canonicalBike, canonicalOther]]);
  assert.deepEqual(result, {
    photos: [
      {
        url: 'https://temporary.example/ride-1',
        category: 'ride',
        source: 'user',
      },
    ],
    avatar_url: '',
  });
  assert.equal(JSON.stringify(result).includes('cloud://'), false);
  assert.equal(JSON.stringify(result).includes('file_id'), false);
});

test('管理员能力卡只为 registry 绑定的 canonical 对象签 URL', async () => {
  const sourceFileId = 'cloud://source/avatar';
  const ownerAlias = crypto
    .createHmac('sha256', mediaSecret)
    .update(owner)
    .digest('hex')
    .slice(0, 32);
  const canonicalFileId = `cloud://env/profile-canonical/${ownerAlias}/${crypto.createHash('sha256').update(sourceFileId).digest('hex')}/${'a'.repeat(64)}.jpg`;
  const record = {
    ...mediaRecord(sourceFileId, 'other', 'active', owner),
    origin: 'custom',
    source_file_id: sourceFileId,
    canonical_file_id: canonicalFileId,
    sha256: 'a'.repeat(64),
    size: 5,
    mime: 'image/jpeg',
  };
  const requested = [];

  const result = await resolveAdminCapabilityMedia(
    { avatar_file_id: sourceFileId, avatar_source: 'custom' },
    [record],
    owner,
    async ({ fileList }) => {
      requested.push(...fileList);
      return {
        fileList: fileList.map((fileID) => ({
          fileID,
          status: 0,
          tempFileURL: 'https://temporary.example/canonical.jpg',
        })),
      };
    },
    mediaSecret,
  );

  assert.deepEqual(requested, [canonicalFileId]);
  assert.equal(result.avatar_url, 'https://temporary.example/canonical.jpg');
});

test('管理员能力卡隐藏缺少 canonical 绑定的 legacy registry', async () => {
  const sourceFileId = 'cloud://source/legacy-avatar';
  let storageReads = 0;
  const result = await resolveAdminCapabilityMedia(
    { avatar_file_id: sourceFileId, avatar_source: 'custom' },
    [
      {
        _id: crypto.createHash('sha256').update(sourceFileId).digest('hex'),
        file_id: sourceFileId,
        owner_openid: owner,
        category: 'other',
        origin: 'custom',
        status: 'active',
      },
    ],
    owner,
    async () => {
      storageReads += 1;
      return { fileList: [] };
    },
    mediaSecret,
  );

  assert.equal(storageReads, 0);
  assert.deepEqual(result, { photos: [], avatar_url: '' });
});

test('管理员详情先鉴权再解析媒体，鉴权失败不读取资料也不调用 CloudBase URL API', async () => {
  const events = [];
  await assert.rejects(
    adminCapabilityDetail({
      authorize: async () => {
        events.push('authorize');
        throw new Error('ADMIN_REQUIRED');
      },
      loadRegistration: async () => {
        events.push('registration');
        return {};
      },
      loadProfile: async () => {
        events.push('profile');
        return profile;
      },
      loadMediaRecords: async () => {
        events.push('media-records');
        return records;
      },
      getTempFileURL: async () => {
        events.push('temp-url');
        return { fileList: [] };
      },
      mediaSecret,
      projectRegistration: (value) => value,
    }),
    /ADMIN_REQUIRED/,
  );
  assert.deepEqual(events, ['authorize']);
});

test('管理员卡只解析当前 profile 仍引用且 owner/status/category 匹配的媒体记录', async () => {
  const calls = [];
  const result = await resolveAdminCapabilityMedia(
    {
      photos: [
        { file_id: 'cloud://ride-1', category: 'ride' },
        { file_id: 'cloud://ride-2', category: 'bike' },
      ],
    },
    [
      mediaRecord('cloud://ride-1', 'ride', 'unreferenced'),
      mediaRecord('cloud://ride-2', 'bike', 'active', 'another-owner'),
      mediaRecord('cloud://not-referenced', 'ride'),
    ],
    owner,
    async ({ fileList }) => {
      calls.push(fileList);
      return { fileList: [] };
    },
    mediaSecret,
  );
  assert.deepEqual(result, { photos: [], avatar_url: '' });
  assert.deepEqual(calls, []);
});

test('管理员卡临时 URL 整体失败时降级为空媒体', async () => {
  const result = await resolveAdminCapabilityMedia(
    profile,
    records,
    owner,
    async () => {
      throw new Error('storage unavailable');
    },
    mediaSecret,
  );
  assert.deepEqual(result, { photos: [], avatar_url: '' });
});

test('管理员投影保留审批所需字段但不返回 raw file ID、token、openid 或身份证字段', () => {
  const response = adminCapabilityView(
    {
      _id: 'r1',
      activity_id: 'a1',
      status: 'pending',
      options: {
        gathering_mode: 'support_vehicle',
        bike_mode: 'own',
        rental_need: 'legacy',
        experience: 'regular',
        remark: '不吃辣',
      },
      strava_status: 'connected',
      strava_snapshot: { activities_90d: 12, access_token: 'secret' },
      profile_snapshot: {
        nickname: '报名昵称',
        gender: '女',
        real_name_masked: '曹**',
        phone_masked: '138****5678',
        phone_source: 'wechat',
        phone_verified: true,
        id_number_masked: '110***********1234',
      },
      openid: 'private-openid',
      token: 'secret-token',
      audit: { actor_openid: 'admin' },
    },
    { ...profile, phone_source: 'manual', phone_verified: false },
    {
      photos: [{ url: 'https://temporary.example/ride-1', category: 'ride', source: 'user' }],
      avatar_url: 'https://temporary.example/avatar',
    },
  );
  assert.deepEqual(response.capability_profile, {
    nickname: '山野骑手',
    gender: '男',
    phone_source: 'wechat',
    phone_verified: true,
    photos: [{ url: 'https://temporary.example/ride-1', category: 'ride', source: 'user' }],
    avatar_url: 'https://temporary.example/avatar',
  });
  assert.deepEqual(response.options, {
    gathering_mode: 'support_vehicle',
    experience: 'regular',
    remark: '不吃辣',
  });
  assert.equal(response.profile_snapshot.real_name_masked, '曹**');
  assert.equal(response.profile_snapshot.phone_masked, '138****5678');
  const serialized = JSON.stringify(response);
  for (const forbidden of [
    'cloud://',
    'file_id',
    'id_number',
    'id_type',
    'openid',
    'token',
    'audit',
    'emergency',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('管理员投影忽略历史旧集合字段和未知 gathering_mode', () => {
  for (const options of [
    { bike_mode: 'rent', rental_need: 'legacy', experience: 'regular' },
    { gathering_mode: 'unknown', experience: 'regular' },
  ]) {
    const response = adminCapabilityView(
      { _id: 'r1', activity_id: 'a1', status: 'pending', options },
      profile,
      { photos: [], avatar_url: '' },
    );
    assert.deepEqual(response.options, { experience: 'regular' });
    assert.equal(JSON.stringify(response).includes('bike_mode'), false);
    assert.equal(JSON.stringify(response).includes('rental_need'), false);
  }
});

test('social 投影采用独立白名单且绝不包含实名、电话、联系人、备注、标识符或审计数据', () => {
  const response = socialCapabilityView(
    {
      ...profile,
      photos: [
        { file_id: 'cloud://ride-1', category: 'ride', visibility: 'public' },
        { file_id: 'cloud://ride-2', category: 'ride' },
      ],
      strava: {
        total_km: 500,
        activities_90d: 12,
        longest_km: 88,
        access_token: 'secret',
      },
      real_name_masked: '曹**',
      phone_masked: '138****5678',
      registration_remark: '不吃辣',
      audit_logs: [{ actor_openid: 'admin' }],
    },
    {
      photos: [
        {
          url: 'https://temporary.example/ride-1',
          category: 'ride',
          source: 'user',
          file_id: 'cloud://ride-1',
        },
        {
          url: 'https://temporary.example/ride-2',
          category: 'ride',
          source: 'user',
          file_id: 'cloud://ride-2',
        },
      ],
      avatar_url: 'https://temporary.example/avatar',
    },
  );
  assert.deepEqual(response, {
    nickname: '山野骑手',
    gender: '男',
    photos: [{ url: 'https://temporary.example/ride-1', category: 'ride', source: 'user' }],
    strava: { total_km: 500, activities_90d: 12, longest_km: 88 },
  });
  const serialized = JSON.stringify(response);
  for (const forbidden of [
    'real_name',
    'phone',
    'emergency',
    'remark',
    'openid',
    'token',
    'audit',
    'cloud://',
    'file_id',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('能力卡性别优先当前资料，其次报名快照，非法值收敛为空', () => {
  const registration = {
    _id: 'r1',
    activity_id: 'a1',
    status: 'pending',
    options: { gathering_mode: 'self_drive', experience: 'regular' },
    profile_snapshot: {
      nickname: '快照骑手',
      gender: '女',
      phone_source: 'wechat',
      phone_verified: true,
    },
  };

  assert.equal(adminCapabilityView(registration, {}, undefined).capability_profile.gender, '女');
  assert.equal(
    adminCapabilityView(registration, { nickname: '当前骑手', gender: '男' }, undefined)
      .capability_profile.gender,
    '男',
  );
  assert.equal(
    adminCapabilityView(
      { ...registration, profile_snapshot: { gender: '保密' } },
      { gender: '未知' },
      undefined,
    ).capability_profile.gender,
    '',
  );
});
