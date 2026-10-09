'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { canonicalMediaPath, mediaDocumentId, mediaOwnerPrefix } = require('./core');

let subject = {};
try {
  subject = require('./capability-card');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const deriveCapabilityState = subject.deriveCapabilityState || (() => 'missing');
const buildCapabilityCard =
  subject.buildCapabilityCard || (async () => ({ state: 'missing', backgrounds: [] }));

const now = new Date('2026-09-29T12:00:00.000Z');
const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
const openid = 'openid-owner-a';
const prefix = mediaOwnerPrefix(openid, mediaSecret);
const envelope = { alg: 'A256GCM', iv: 'iv', tag: 'tag', ciphertext: 'ciphertext' };
const credential = {
  athlete_id: '42',
  access_token_cipher: envelope,
  refresh_token_cipher: envelope,
  sync_status: 'ready',
};
const snapshot = {
  athlete_id: '42',
  lifetime_rides: 486,
  lifetime_distance_km: 18240.7,
  lifetime_moving_hours: 734.5,
  lifetime_elevation_m: 215400,
  total_km: 812.5,
  activities_90d: 28,
  longest_km: 126.3,
  total_elevation_m: 9300,
  weighted_avg_speed_kmh: 25.6,
  coverage_from: '2026-07-01T12:00:00.000Z',
  coverage_to: '2026-09-29T12:00:00.000Z',
  coverage_complete: true,
  synced_at: '2026-09-29T11:00:00.000Z',
};
const canonicalFor = (fileId, owner = openid) => {
  const sha256 = crypto.createHash('sha256').update(`bytes:${fileId}`).digest('hex');
  return {
    canonicalFileId: `cloud://env/${canonicalMediaPath(owner, fileId, sha256, 'jpg', mediaSecret)}`,
    sha256,
  };
};
const mediaRecord = (fileId, category, status = 'active', owner = openid, origin) => {
  let canonical;
  try {
    canonical = canonicalFor(fileId, owner);
  } catch {
    canonical = undefined;
  }
  return {
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    ...(canonical
      ? {
          source_file_id: fileId,
          canonical_file_id: canonical.canonicalFileId,
          sha256: canonical.sha256,
          size: 5,
          mime: 'image/jpeg',
        }
      : {}),
    owner_openid: owner,
    category,
    status,
    ...(origin ? { origin } : {}),
  };
};

test('个人名片状态严格区分 ready/partial/syncing/failed/disconnected', () => {
  assert.equal(deriveCapabilityState({ credential, snapshot }, now), 'ready');
  assert.equal(
    deriveCapabilityState({ credential, snapshot: { ...snapshot, coverage_complete: false } }, now),
    'partial',
  );
  assert.equal(
    deriveCapabilityState({ credential, snapshot: { ...snapshot, total_km: null } }, now),
    'partial',
  );
  assert.equal(
    deriveCapabilityState(
      { credential, snapshot: { ...snapshot, synced_at: '2026-09-27T11:00:00.000Z' } },
      now,
    ),
    'partial',
  );
  assert.equal(
    deriveCapabilityState({ credential: { ...credential, sync_status: 'running' } }, now),
    'syncing',
  );
  assert.equal(
    deriveCapabilityState({ credential: { ...credential, sync_status: 'failed' } }, now),
    'failed',
  );
  assert.equal(deriveCapabilityState({}, now), 'disconnected');
});

test('单一响应只返回累计与 90 天 allowlist、null 语义和 owner 媒体临时 URL', async () => {
  const ownedRide = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const ownedOther = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const canonicalRide = canonicalFor(ownedRide).canonicalFileId;
  const canonicalOther = canonicalFor(ownedOther).canonicalFileId;
  const response = await buildCapabilityCard(
    {
      profile: {
        nickname: '山野骑手',
        gender: '男',
        real_name_masked: '曹**',
        phone_masked: '138****5678',
        emergency_name: '联系人',
        id_number_cipher: { ciphertext: 'legacy-secret' },
        avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg',
        photos: [
          { file_id: ownedOther, category: 'other' },
          { file_id: ownedRide, category: 'ride' },
          { file_id: 'cloud://env/profiles/legacy/ride.jpg', category: 'ride' },
        ],
      },
      credential,
      snapshot: { ...snapshot, longest_km: null },
      mediaRecords: [mediaRecord(ownedRide, 'ride'), mediaRecord(ownedOther, 'other')],
    },
    {
      openid,
      mediaSecret,
      now,
      getTempFileURL: async ({ fileList }) => ({
        fileList: fileList.map((fileID) => ({
          fileID,
          tempFileURL: `https://temporary.example/${fileID === canonicalRide ? 'ride' : fileID === canonicalOther ? 'other' : 'avatar'}`,
          status: 0,
        })),
      }),
    },
  );
  assert.deepEqual(response, {
    state: 'partial',
    generated_at: '2026-09-29T12:00:00.000Z',
    profile: {
      display_name: '山野骑手',
      gender: '男',
      avatar_url: '',
    },
    backgrounds: [
      { url: 'https://temporary.example/ride', source: 'user_photo', category: 'ride' },
    ],
    summary: {
      lifetime_rides: 486,
      lifetime_distance_km: 18240.7,
      lifetime_moving_hours: 734.5,
      lifetime_elevation_m: 215400,
      total_km_90d: 812.5,
      rides_90d: 28,
      longest_km: null,
      elevation_m_90d: 9300,
      weighted_avg_speed_kmh: 25.6,
    },
    coverage: {
      from: '2026-07-01T12:00:00.000Z',
      to: '2026-09-29T12:00:00.000Z',
      complete: true,
    },
    synced_at: '2026-09-29T11:00:00.000Z',
    strava_profile_url: 'https://www.strava.com/athletes/42',
    needs_strava_reauth: false,
  });
  const serialized = JSON.stringify(response);
  for (const forbidden of [
    'cloud://',
    'file_id',
    'openid',
    'real_name',
    'phone',
    'emergency',
    'remark',
    'token',
    'cipher',
    'id_number',
    'audit',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('个人名片投影当前骑手的合法 Strava 注册时间', async () => {
  const response = await buildCapabilityCard(
    {
      profile: { nickname: '骑手' },
      credential,
      snapshot: { ...snapshot, athlete_created_at: '2019-05-18T09:30:00.000Z' },
    },
    {
      openid,
      mediaSecret,
      now,
      getTempFileURL: async () => ({ fileList: [] }),
    },
  );
  assert.equal(response.strava_joined_at, '2019-05-18T09:30:00.000Z');
});

test('个人名片对非法或未来 Strava 注册时间省略字段', async () => {
  const response = await buildCapabilityCard(
    {
      profile: { nickname: '骑手' },
      credential,
      snapshot: { ...snapshot, athlete_created_at: '2099-01-01T00:00:00.000Z' },
    },
    {
      openid,
      mediaSecret,
      now,
      getTempFileURL: async () => ({ fileList: [] }),
    },
  );
  assert.equal(Object.hasOwn(response, 'strava_joined_at'), false);
});

test('个人名片只解析已验证 canonical 对象，source 覆盖不进入展示链', async () => {
  const sourceFileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174099.jpg`;
  const canonicalPath = canonicalMediaPath(
    openid,
    sourceFileId,
    'a'.repeat(64),
    'jpg',
    mediaSecret,
  );
  const canonicalFileId = `cloud://env/${canonicalPath}`;
  const requested = [];
  const card = await buildCapabilityCard(
    {
      profile: {
        nickname: '骑手',
        avatar_file_id: sourceFileId,
        avatar_source: 'custom',
        photos: [{ file_id: sourceFileId, category: 'other' }],
      },
      credential,
      snapshot,
      mediaRecords: [
        {
          ...mediaRecord(sourceFileId, 'other', 'active', openid, 'custom'),
          source_file_id: sourceFileId,
          canonical_file_id: canonicalFileId,
          sha256: 'a'.repeat(64),
          size: 5,
          mime: 'image/jpeg',
        },
      ],
    },
    {
      openid,
      mediaSecret,
      now,
      getTempFileURL: async ({ fileList }) => {
        requested.push(...fileList);
        return {
          fileList: fileList.map((fileID) => ({
            fileID,
            tempFileURL: 'https://temporary.example/canonical.jpg',
            status: 0,
          })),
        };
      },
    },
  );

  assert.deepEqual(requested, [canonicalFileId, canonicalFileId]);
  assert.equal(requested.includes(sourceFileId), false);
  assert.equal(card.profile.avatar_url, 'https://temporary.example/canonical.jpg');
});

test('存量 active registry 缺 canonical 绑定时隐藏并回退', async () => {
  const sourceFileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174098.jpg`;
  let storageReads = 0;
  const card = await buildCapabilityCard(
    {
      profile: {
        nickname: '骑手',
        avatar_file_id: sourceFileId,
        avatar_source: 'custom',
        photos: [{ file_id: sourceFileId, category: 'other' }],
      },
      credential,
      snapshot,
      mediaRecords: [
        {
          _id: mediaDocumentId(sourceFileId),
          file_id: sourceFileId,
          owner_openid: openid,
          category: 'other',
          origin: 'custom',
          status: 'active',
        },
      ],
    },
    {
      openid,
      mediaSecret,
      now,
      getTempFileURL: async () => {
        storageReads += 1;
        return { fileList: [] };
      },
    },
  );

  assert.equal(storageReads, 0);
  assert.deepEqual(card.backgrounds, []);
  assert.equal(card.profile.avatar_url, '');
});

test('临时 URL 整体失败降级为空背景而不让名片失败', async () => {
  const owned = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const response = await buildCapabilityCard(
    {
      profile: { nickname: '骑手', photos: [{ file_id: owned, category: 'ride' }] },
      credential,
      snapshot,
      mediaRecords: [mediaRecord(owned, 'ride')],
    },
    {
      openid,
      mediaSecret,
      now,
      getTempFileURL: async () => {
        throw new Error('storage unavailable');
      },
    },
  );
  assert.equal(response.state, 'ready');
  assert.deepEqual(response.backgrounds, []);
});

test('临时 URL 逐项失败、非 https 与未知文件均被剔除', async () => {
  const ride = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const bike = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const other = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174002.jpg`;
  const canonicalRide = canonicalFor(ride).canonicalFileId;
  const canonicalBike = canonicalFor(bike).canonicalFileId;
  const canonicalOther = canonicalFor(other).canonicalFileId;
  const response = await buildCapabilityCard(
    {
      profile: {
        nickname: '骑手',
        photos: [
          { file_id: ride, category: 'ride' },
          { file_id: bike, category: 'bike' },
          { file_id: other, category: 'other' },
        ],
      },
      credential,
      snapshot,
      mediaRecords: [
        mediaRecord(ride, 'ride'),
        mediaRecord(bike, 'bike'),
        mediaRecord(other, 'other'),
      ],
    },
    {
      openid,
      mediaSecret,
      now,
      getTempFileURL: async () => ({
        fileList: [
          { fileID: canonicalRide, tempFileURL: 'https://temporary.example/ride', status: 0 },
          { fileID: canonicalBike, tempFileURL: 'https://temporary.example/bike', status: -1 },
          { fileID: canonicalOther, tempFileURL: 'http://temporary.example/other', status: 0 },
          {
            fileID: 'cloud://env/profiles/unknown/file.jpg',
            tempFileURL: 'https://temporary.example/unknown',
            status: 0,
          },
        ],
      }),
    },
  );
  assert.deepEqual(response.backgrounds, [
    { url: 'https://temporary.example/ride', source: 'user_photo', category: 'ride' },
  ]);
});

test('HMAC 路径存在但 registry 缺失、非 active 或 owner 不匹配时不解析临时 URL', async () => {
  const owned = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  let calls = 0;
  for (const mediaRecords of [
    [],
    [mediaRecord(owned, 'ride', 'unreferenced')],
    [mediaRecord(owned, 'ride', 'active', 'openid-owner-b')],
  ]) {
    const response = await buildCapabilityCard(
      {
        profile: { nickname: '骑手', photos: [{ file_id: owned, category: 'ride' }] },
        credential,
        snapshot,
        mediaRecords,
      },
      {
        openid,
        mediaSecret,
        now,
        getTempFileURL: async () => {
          calls += 1;
          return { fileList: [] };
        },
      },
    );
    assert.deepEqual(response.backgrounds, []);
  }
  assert.equal(calls, 0);
});

test('未登记 legacy 或来源不匹配的头像绝不传给临时 URL API', async () => {
  const avatar = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  let requested = [];
  for (const input of [
    { profile: { avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg' }, mediaRecords: [] },
    {
      profile: { avatar_file_id: avatar, avatar_source: 'strava' },
      mediaRecords: [mediaRecord(avatar, 'other')],
    },
  ]) {
    const result = await buildCapabilityCard(
      { ...input, credential, snapshot },
      {
        openid,
        mediaSecret,
        now,
        getTempFileURL: async ({ fileList }) => {
          requested.push(...fileList);
          return { fileList: [] };
        },
      },
    );
    assert.deepEqual(result.backgrounds, []);
  }
  assert.deepEqual(requested, []);
});

test('个人名片拒绝缺失的可信 WXContext 身份', async () => {
  await assert.rejects(
    buildCapabilityCard(
      { profile: {}, credential: undefined, snapshot: undefined },
      { openid: '', mediaSecret, now, getTempFileURL: async () => ({ fileList: [] }) },
    ),
    (error) => error && error.code === 'UNAUTHENTICATED',
  );
});

test('头像仅从当前 profile 引用且 owner/active/origin 匹配的背景结果解析', async () => {
  const avatar = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174010.jpg`;
  const getTempFileURL = async ({ fileList }) => ({
    fileList: fileList.map((fileID) => ({
      fileID,
      tempFileURL: 'https://temp.url/avatar.jpg',
      status: 0,
    })),
  });

  const cardStrava = await buildCapabilityCard(
    {
      profile: { avatar_source: 'strava', avatar_file_id: avatar },
      credential,
      snapshot,
      mediaRecords: [mediaRecord(avatar, 'other', 'active', openid, 'strava')],
    },
    { openid, mediaSecret, now, getTempFileURL },
  );
  assert.equal(cardStrava.profile.avatar_url, 'https://temp.url/avatar.jpg');
  assert.equal(cardStrava.needs_strava_reauth, false);

  const cardStravaMissing = await buildCapabilityCard(
    {
      profile: { avatar_source: 'strava', avatar_file_id: avatar },
      credential,
      snapshot,
      mediaRecords: [],
    },
    { openid, mediaSecret, now, getTempFileURL },
  );
  assert.equal(cardStravaMissing.profile.avatar_url, '');
  assert.equal(cardStravaMissing.needs_strava_reauth, true);

  const cardWechat = await buildCapabilityCard(
    {
      profile: { avatar_source: 'wechat', avatar_file_id: avatar },
      credential,
      snapshot,
      mediaRecords: [mediaRecord(avatar, 'other', 'active', openid, 'wechat')],
    },
    { openid, mediaSecret, now, getTempFileURL },
  );
  assert.equal(cardWechat.profile.avatar_url, 'https://temp.url/avatar.jpg');
});

test('头像独立于单张背景上限解析且与 photos 重复时仍保留头像 URL', async () => {
  const rideA = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174020.jpg`;
  const rideB = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174021.jpg`;
  const rideC = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174022.jpg`;
  const avatar = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174023.jpg`;
  const canonicalAvatar = canonicalFor(avatar).canonicalFileId;
  const profile = {
    avatar_source: 'strava',
    avatar_file_id: avatar,
    photos: [
      { file_id: rideA, category: 'ride' },
      { file_id: rideB, category: 'bike' },
      { file_id: rideC, category: 'other' },
      { file_id: avatar, category: 'other' },
    ],
  };
  const mediaRecords = [
    mediaRecord(rideA, 'ride'),
    mediaRecord(rideB, 'bike'),
    mediaRecord(rideC, 'other'),
    mediaRecord(avatar, 'other', 'active', openid, 'strava'),
  ];

  const card = await buildCapabilityCard(
    { profile, credential, snapshot, mediaRecords },
    {
      openid,
      mediaSecret,
      now,
      getTempFileURL: async ({ fileList }) => ({
        fileList: fileList.map((fileID) => ({
          fileID,
          tempFileURL: `https://temporary.example/${fileID === canonicalAvatar ? 'avatar' : 'photo'}`,
          status: 0,
        })),
      }),
    },
  );

  assert.deepEqual(card.backgrounds, [
    { url: 'https://temporary.example/photo', source: 'user_photo', category: 'ride' },
  ]);
  assert.equal(card.profile.avatar_url, 'https://temporary.example/avatar');
  assert.equal(card.needs_strava_reauth, false);
});

test('个人名片性别非法或缺失时收敛为空字符串且不返回称号', async () => {
  const card = await buildCapabilityCard(
    {
      profile: { nickname: '骑手', gender: '保密', title: '旧称号', photos: [] },
      credential: undefined,
      snapshot: undefined,
    },
    { openid, mediaSecret, now },
  );
  assert.equal(card.profile.gender, '');
  assert.equal('title' in card.profile, false);
});
