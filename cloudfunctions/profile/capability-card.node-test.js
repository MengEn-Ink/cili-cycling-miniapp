'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mediaDocumentId, mediaOwnerPrefix } = require('./core');

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
  athlete_id: 'athlete-1',
  access_token_cipher: envelope,
  refresh_token_cipher: envelope,
  sync_status: 'ready',
};
const snapshot = {
  athlete_id: 'athlete-1',
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
const mediaRecord = (fileId, category, status = 'active', owner = openid) => ({
  _id: mediaDocumentId(fileId),
  file_id: fileId,
  owner_openid: owner,
  category,
  status,
});

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

test('单一响应只返回 90 天 allowlist、null 语义和 owner 媒体临时 URL', async () => {
  const ownedRide = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const ownedOther = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const response = await buildCapabilityCard(
    {
      profile: {
        nickname: '山野骑手',
        title: '爬坡王',
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
      credential: {
        ...credential,
        athlete_avatar_url: 'https://temporary.example/strava-avatar.jpg',
      },
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
          tempFileURL: `https://temporary.example/${fileID === ownedRide ? 'ride' : 'other'}`,
          status: 0,
        })),
      }),
    },
  );
  assert.deepEqual(response, {
    state: 'partial',
    generated_at: '2026-09-29T12:00:00.000Z',
    profile: { display_name: '山野骑手', title: '爬坡王' },
    strava_avatar_url: 'https://temporary.example/strava-avatar.jpg',
    backgrounds: [
      { url: 'https://temporary.example/ride', source: 'user_photo', category: 'ride' },
      { url: 'https://temporary.example/other', source: 'user_photo', category: 'other' },
    ],
    summary: {
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
          { fileID: ride, tempFileURL: 'https://temporary.example/ride', status: 0 },
          { fileID: bike, tempFileURL: 'https://temporary.example/bike', status: -1 },
          { fileID: other, tempFileURL: 'http://temporary.example/other', status: 0 },
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

test('个人名片拒绝缺失的可信 WXContext 身份', async () => {
  await assert.rejects(
    buildCapabilityCard(
      { profile: {}, credential: undefined, snapshot: undefined },
      { openid: '', mediaSecret, now, getTempFileURL: async () => ({ fileList: [] }) },
    ),
    (error) => error && error.code === 'UNAUTHENTICATED',
  );
});
