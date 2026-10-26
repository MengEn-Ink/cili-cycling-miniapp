'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildCapabilityCard, buildOwnerMediaPreview } = require('./capability-card');
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

test('本人预览接受合法双引用与路径且不要求公开同意', async (t) => {
  assert.equal(typeof buildOwnerMediaPreview, 'function');
  assert.equal(buildCapabilityCard, buildOwnerMediaPreview);
  for (const category of ['other', 'profile-avatar'])
    for (const pathCategory of ['', 'profile-avatar'])
      for (const canonicalReference of [false, true])
        await t.test(`${category}/${pathCategory || 'legacy'}/${canonicalReference}`, async () => {
          const source = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174005.jpg`;
          const record = mediaRecord(source, category);
          if (pathCategory) {
            record.canonical_category = pathCategory;
            record.canonical_file_id = `cloud://env/${canonicalMediaPath(
              openid,
              source,
              record.sha256,
              'jpg',
              mediaSecret,
              pathCategory,
            )}`;
          }
          const preview = await buildOwnerMediaPreview(
            {
              profile: {
                nickname: '骑手',
                avatar_source: 'custom',
                avatar_file_id: canonicalReference ? record.canonical_file_id : source,
                avatar_visibility: 'private',
                avatar_public_consent: { status: 'withdrawn' },
              },
              mediaRecords: [record],
            },
            {
              openid,
              mediaSecret,
              now,
              getTempFileURL: async ({ fileList }) => {
                assert.deepEqual(fileList, [record.canonical_file_id]);
                return {
                  fileList: [
                    {
                      fileID: record.canonical_file_id,
                      status: 0,
                      tempFileURL: 'https://temporary.example/private-avatar.jpg',
                    },
                  ],
                };
              },
            },
          );
          assert.equal(preview.profile.avatar_url, 'https://temporary.example/private-avatar.jpg');
          assert.deepEqual(preview.backgrounds, []);
        });
});

test('本人头像预览拒绝其它用途和重复 canonical 绑定', async (t) => {
  const source = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174006.jpg`;
  const base = mediaRecord(source, 'other');
  for (const scenario of [
    ...['ride', 'bike', 'profile-background', 'activity-image', 'club-avatar'].map((category) => ({
      name: category,
      records: [{ ...base, category }],
    })),
    {
      name: '重复 binding',
      records: [
        base,
        { ...base, _id: 'second-binding', file_id: `cloud://env/${prefix}other.jpg` },
      ],
    },
  ])
    await t.test(scenario.name, async () => {
      let signed = false;
      const card = await buildCapabilityCard(
        {
          profile: { avatar_file_id: base.canonical_file_id, avatar_source: 'custom' },
          mediaRecords: scenario.records,
        },
        {
          openid,
          mediaSecret,
          now,
          getTempFileURL: async ({ fileList }) => {
            signed = true;
            return {
              fileList: fileList.map((fileID) => ({
                fileID,
                status: 0,
                tempFileURL: 'https://temporary.example/should-not-sign.jpg',
              })),
            };
          },
        },
      );
      assert.equal(card.profile.avatar_url, '');
      assert.equal(signed, false);
    });
});

test('本人背景预览拒绝重复绑定和跨用途路径', async (t) => {
  const source = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174007.jpg`;
  const base = mediaRecord(source, 'ride');
  const crossPurpose = {
    ...base,
    canonical_category: 'profile-avatar',
    canonical_file_id: `cloud://env/${canonicalMediaPath(
      openid,
      source,
      base.sha256,
      'jpg',
      mediaSecret,
      'profile-avatar',
    )}`,
  };
  for (const scenario of [
    {
      name: '重复 canonical',
      record: base,
      records: [{ ...base, _id: 'another-binding', file_id: 'cloud://env/other.jpg' }, base],
    },
    { name: '跨用途 canonical', record: crossPurpose, records: [crossPurpose] },
  ])
    await t.test(scenario.name, async () => {
      const card = await buildCapabilityCard(
        {
          profile: {
            background_photo: { file_id: scenario.record.canonical_file_id, category: 'ride' },
          },
          mediaRecords: scenario.records,
        },
        {
          openid,
          mediaSecret,
          now,
          getTempFileURL: async ({ fileList }) => ({
            fileList: fileList.map((fileID) => ({
              fileID,
              status: 0,
              tempFileURL: 'https://temporary.example/wrong-background.jpg',
            })),
          }),
        },
      );
      assert.deepEqual(card.backgrounds, []);
    });
});

test('本人显式移除背景后不签历史照片，缺字段仍兼容', async (t) => {
  const source = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174008.jpg`;
  const record = mediaRecord(source, 'ride');
  const photos = [{ file_id: source, category: 'ride' }];
  for (const scenario of [
    { name: '显式 null', profile: { background_photo: null, photos }, expected: 0 },
    { name: '显式 undefined', profile: { background_photo: undefined, photos }, expected: 0 },
    { name: '缺少槽位字段', profile: { photos }, expected: 1 },
  ])
    await t.test(scenario.name, async () => {
      let calls = 0;
      const card = await buildCapabilityCard(
        { profile: scenario.profile, mediaRecords: [record] },
        {
          openid,
          mediaSecret,
          now,
          getTempFileURL: async ({ fileList }) => {
            calls += 1;
            return {
              fileList: fileList.map((fileID) => ({
                fileID,
                status: 0,
                tempFileURL: 'https://temporary.example/legacy-background.jpg',
              })),
            };
          },
        },
      );
      assert.equal(card.backgrounds.length, scenario.expected);
      assert.equal(calls, scenario.expected);
    });
});
