'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  adminCapabilityMedia,
  resolveAdminCapabilityMedia,
  adminCapabilityView,
  socialCapabilityView,
  adminCapabilityDetail,
} = require('./capability-card');

const profile = {
  nickname: '山野骑手',
  title: '爬坡王',
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

test('管理员媒体白名单按骑行照片、其他照片、头像排序去重并最多保留三张', () => {
  assert.deepEqual(adminCapabilityMedia(profile), {
    file_ids: ['cloud://ride-1', 'cloud://ride-2', 'cloud://other'],
  });
  assert.deepEqual(
    adminCapabilityMedia({
      avatar_file_id: 'cloud://avatar',
      photos: [
        { file_id: 'cloud://ride-1', category: 'ride' },
        { file_id: 'cloud://ride-2', category: 'bike' },
      ],
    }),
    { file_ids: ['cloud://ride-1', 'cloud://ride-2', 'cloud://avatar'] },
  );
});

test('管理员媒体只接受 profile 白名单内的 cloud file ID', () => {
  assert.deepEqual(
    adminCapabilityMedia({
      avatar_file_id: 'https://attacker.example/avatar',
      photos: [
        { file_id: 'cloud://ok', category: 'ride' },
        { file_id: 'cloud://unknown', category: 'portrait' },
        { file_id: 'file://local', category: 'ride' },
        { file_id: 'x'.repeat(513), category: 'ride' },
        { file_id: 'cloud://ok', category: 'bike' },
      ],
    }),
    { file_ids: ['cloud://ok'] },
  );
});

test('CloudBase 临时 URL 解析剔除失败项、非 https 和未知项', async () => {
  const calls = [];
  const result = await resolveAdminCapabilityMedia(profile, async ({ fileList }) => {
    calls.push(fileList);
    return {
      fileList: [
        {
          fileID: 'cloud://ride-1',
          tempFileURL: 'https://temporary.example/ride-1',
          status: 0,
        },
        {
          fileID: 'cloud://ride-2',
          tempFileURL: 'https://temporary.example/ride-2',
          status: -1,
        },
        {
          fileID: 'cloud://other',
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
  });
  assert.deepEqual(calls, [['cloud://ride-1', 'cloud://ride-2', 'cloud://other']]);
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
      getTempFileURL: async () => {
        events.push('temp-url');
        return { fileList: [] };
      },
      projectRegistration: (value) => value,
    }),
    /ADMIN_REQUIRED/,
  );
  assert.deepEqual(events, ['authorize']);
});

test('管理员投影保留审批所需字段但不返回 raw file ID、token、openid 或身份证字段', () => {
  const response = adminCapabilityView(
    {
      _id: 'r1',
      activity_id: 'a1',
      status: 'pending',
      options: { bike_mode: 'own', experience: 'regular', remark: '不吃辣' },
      strava_status: 'connected',
      strava_snapshot: { activities_90d: 12, access_token: 'secret' },
      profile_snapshot: {
        nickname: '报名昵称',
        real_name_masked: '曹**',
        phone_masked: '138****5678',
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
    title: '爬坡王',
    phone_source: 'manual',
    phone_verified: false,
    photos: [{ url: 'https://temporary.example/ride-1', category: 'ride', source: 'user' }],
    avatar_url: 'https://temporary.example/avatar',
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
    title: '爬坡王',
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
