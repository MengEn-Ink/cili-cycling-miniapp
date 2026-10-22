'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildCapabilityCard: buildPublicCard } = require('./capability-card');
const { withPublicConsent } = require('../shared/consent-fixture');
const buildCapabilityCard = (data, options) =>
  buildPublicCard({ ...data, profile: withPublicConsent(data.profile) }, options);
const { canonicalMediaPath, mediaDocumentId, mediaOwnerPrefix } = require('./core');

const now = new Date('2026-09-29T12:00:00.000Z');
const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
const openid = 'openid-owner-a';
const prefix = mediaOwnerPrefix(openid, mediaSecret);

function canonicalFor(fileId) {
  const sha256 = crypto.createHash('sha256').update(`bytes:${fileId}`).digest('hex');
  return {
    fileId: `cloud://env/${canonicalMediaPath(openid, fileId, sha256, 'jpg', mediaSecret)}`,
    sha256,
  };
}

function mediaRecord(fileId, category, origin = 'custom') {
  const canonical = canonicalFor(fileId);
  return {
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    source_file_id: fileId,
    canonical_file_id: canonical.fileId,
    sha256: canonical.sha256,
    size: 5,
    mime: 'image/jpeg',
    owner_openid: openid,
    category,
    origin,
    status: 'active',
  };
}

test('个人名片只返回资料、照片和生成时间，不投影第三方账号数据', async () => {
  const background = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const canonical = canonicalFor(background).fileId;
  const card = await buildCapabilityCard(
    {
      profile: {
        nickname: '山野骑手',
        gender: '男',
        background_photo: { file_id: background, category: 'ride' },
      },
      credential: { access_token_cipher: { ciphertext: 'secret' } },
      snapshot: { activities_90d: 99 },
      mediaRecords: [mediaRecord(background, 'ride')],
    },
    {
      openid,
      mediaSecret,
      now,
      getTempFileURL: async ({ fileList }) => ({
        fileList: fileList.map((fileID) => ({
          fileID,
          tempFileURL: fileID === canonical ? 'https://temporary.example/ride.jpg' : '',
          status: 0,
        })),
      }),
    },
  );

  assert.deepEqual(card, {
    generated_at: now.toISOString(),
    profile: { display_name: '山野骑手', gender: '男', avatar_url: '' },
    backgrounds: [
      {
        file_id: background,
        url: 'https://temporary.example/ride.jpg',
        source: 'user_photo',
        category: 'ride',
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(card), /token|snapshot|summary|coverage|sync|strava/i);
});

test('显式背景槽位优先并继续签发其余合法照片，缺失时回退旧照片', async () => {
  const current = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const legacy = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174002.jpg`;
  const records = [mediaRecord(current, 'other'), mediaRecord(legacy, 'ride')];
  const getTempFileURL = async ({ fileList }) => ({
    fileList: fileList.map((fileID) => ({
      fileID,
      tempFileURL: `https://temporary.example/${fileID === canonicalFor(current).fileId ? 'current' : 'legacy'}.jpg`,
      status: 0,
    })),
  });

  const explicit = await buildCapabilityCard(
    {
      profile: {
        background_photo: { file_id: current, category: 'other' },
        photos: [{ file_id: legacy, category: 'ride' }],
      },
      mediaRecords: records,
    },
    { openid, mediaSecret, now, getTempFileURL },
  );
  assert.deepEqual(
    explicit.backgrounds.map((item) => ({ file_id: item.file_id, url: item.url })),
    [
      { file_id: current, url: 'https://temporary.example/current.jpg' },
      { file_id: legacy, url: 'https://temporary.example/legacy.jpg' },
    ],
  );

  const fallback = await buildCapabilityCard(
    { profile: { photos: [{ file_id: legacy, category: 'ride' }] }, mediaRecords: records },
    { openid, mediaSecret, now, getTempFileURL },
  );
  assert.deepEqual(fallback.backgrounds, [
    {
      file_id: legacy,
      url: 'https://temporary.example/legacy.jpg',
      source: 'user_photo',
      category: 'ride',
    },
  ]);
});

test('头像只解析当前资料引用的可信微信或自定义 canonical 媒体', async () => {
  const avatar = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174003.jpg`;
  const getTempFileURL = async ({ fileList }) => ({
    fileList: fileList.map((fileID) => ({
      fileID,
      tempFileURL: 'https://temporary.example/avatar.jpg',
      status: 0,
    })),
  });
  const trusted = await buildCapabilityCard(
    {
      profile: { nickname: '骑手', avatar_source: 'wechat', avatar_file_id: avatar },
      mediaRecords: [mediaRecord(avatar, 'other', 'wechat')],
    },
    { openid, mediaSecret, now, getTempFileURL },
  );
  assert.equal(trusted.profile.avatar_url, 'https://temporary.example/avatar.jpg');

  const retiredSource = await buildCapabilityCard(
    {
      profile: { nickname: '骑手', avatar_source: 'strava', avatar_file_id: avatar },
      mediaRecords: [mediaRecord(avatar, 'other', 'strava')],
    },
    { openid, mediaSecret, now, getTempFileURL },
  );
  assert.equal(retiredSource.profile.avatar_url, '');
});

test('临时 URL 失败、非 HTTPS 或 registry 不可信时安全降级', async () => {
  const background = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174004.jpg`;
  const base = {
    profile: { background_photo: { file_id: background, category: 'ride' } },
    mediaRecords: [mediaRecord(background, 'ride')],
  };
  const failed = await buildCapabilityCard(base, {
    openid,
    mediaSecret,
    now,
    getTempFileURL: async () => {
      throw new Error('storage unavailable');
    },
  });
  assert.deepEqual(failed.backgrounds, []);

  const unsafe = await buildCapabilityCard(base, {
    openid,
    mediaSecret,
    now,
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({
        fileID,
        tempFileURL: 'http://temporary.example/ride.jpg',
        status: 0,
      })),
    }),
  });
  assert.deepEqual(unsafe.backgrounds, []);

  const missingRegistry = await buildCapabilityCard(
    { profile: base.profile, mediaRecords: [] },
    { openid, mediaSecret, now, getTempFileURL: async () => ({ fileList: [] }) },
  );
  assert.deepEqual(missingRegistry.backgrounds, []);
});

test('个人名片拒绝缺失身份，非法性别收敛为空字符串', async () => {
  await assert.rejects(
    buildCapabilityCard(
      { profile: {}, mediaRecords: [] },
      { openid: '', mediaSecret, now, getTempFileURL: async () => ({ fileList: [] }) },
    ),
    (error) => error && error.code === 'UNAUTHENTICATED',
  );

  const card = await buildCapabilityCard(
    { profile: { nickname: '骑手', gender: '保密' }, mediaRecords: [] },
    { openid, mediaSecret, now, getTempFileURL: async () => ({ fileList: [] }) },
  );
  assert.deepEqual(card.profile, { display_name: '骑手', gender: '', avatar_url: '' });
});

test('public card consumes nickname-only and media-only choices independently', async () => {
  const avatar = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174005.jpg`;
  const profile = {
    nickname: 'Private name',
    gender: '女',
    avatar_source: 'wechat',
    avatar_file_id: avatar,
    avatar_revision: 1,
  };
  const calls = [];
  const options = {
    openid,
    mediaSecret,
    now,
    getTempFileURL: async ({ fileList }) => {
      calls.push(fileList);
      return {
        fileList: fileList.map((fileID) => ({
          fileID,
          status: 0,
          tempFileURL: 'https://temporary.example/avatar.jpg',
        })),
      };
    },
  };
  const nicknameOnly = await buildPublicCard(
    {
      profile: withPublicConsent(profile, { nickname: true, media: false }),
      mediaRecords: [mediaRecord(avatar, 'other', 'wechat')],
    },
    options,
  );
  assert.deepEqual(nicknameOnly.profile, {
    display_name: 'Private name',
    gender: '女',
    avatar_url: '',
  });
  assert.deepEqual(calls, []);
  const mediaOnly = await buildPublicCard(
    {
      profile: withPublicConsent(profile, { nickname: false, media: true }),
      mediaRecords: [mediaRecord(avatar, 'other', 'wechat')],
    },
    options,
  );
  assert.deepEqual(mediaOnly.profile, {
    display_name: '匿名骑友',
    gender: '',
    avatar_url: 'https://temporary.example/avatar.jpg',
  });
  assert.equal(calls.length, 1);
});
