'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  canonicalPublicAvatar,
  canonicalPublicBackground,
  compatibleProfileCategory,
  mediaDocumentId,
  publicAvatarSource,
  publicBackgroundSource,
} = require('./public-avatar');

const MEDIA_SECRET = 'activity-read-test-media-secret-32-bytes';
const OWNER_OPENID = 'member-openid';
const SOURCE_FILE_ID = 'cloud://env/profiles/avatar.jpg';

function canonicalFixture() {
  const sha256 = crypto.createHash('sha256').update('avatar-bytes').digest('hex');
  const ownerAlias = crypto
    .createHmac('sha256', MEDIA_SECRET)
    .update(OWNER_OPENID)
    .digest('hex')
    .slice(0, 32);
  return {
    profile: {
      avatar_file_id: SOURCE_FILE_ID,
      avatar_source: 'custom',
      avatar_revision: 3,
      avatar_visibility: 'public',
      avatar_visibility_revision: 3,
    },
    record: {
      _id: mediaDocumentId(SOURCE_FILE_ID),
      file_id: SOURCE_FILE_ID,
      source_file_id: SOURCE_FILE_ID,
      canonical_file_id: `cloud://env/profile-canonical/${ownerAlias}/${mediaDocumentId(SOURCE_FILE_ID)}/${sha256}.jpg`,
      sha256,
      size: 1024,
      mime: 'image/jpeg',
      owner_openid: OWNER_OPENID,
      category: 'other',
      origin: 'custom',
      status: 'active',
    },
  };
}

test('publicAvatarSource 忽略历史可见性字段但仍要求版本、来源和 cloud 头像有效', () => {
  const { profile } = canonicalFixture();
  assert.equal(publicAvatarSource(profile), SOURCE_FILE_ID);
  assert.equal(
    publicAvatarSource({
      ...profile,
      avatar_visibility: undefined,
      avatar_visibility_revision: undefined,
    }),
    SOURCE_FILE_ID,
  );
  assert.equal(publicAvatarSource({ ...profile, avatar_visibility: 'private' }), SOURCE_FILE_ID);
  assert.equal(publicAvatarSource({ ...profile, avatar_visibility_revision: 2 }), SOURCE_FILE_ID);

  const invalidProfiles = [
    ['缺少 profile', undefined],
    ['缺少 revision', { ...profile, avatar_revision: undefined }],
    ['负 revision', { ...profile, avatar_revision: -1 }],
    ['非整数 revision', { ...profile, avatar_revision: 1.5 }],
    ['缺少 source', { ...profile, avatar_source: undefined }],
    ['非法 source', { ...profile, avatar_source: 'forged' }],
    ['外部 URL', { ...profile, avatar_file_id: 'https://images.example/avatar.jpg' }],
    ['过长 file ID', { ...profile, avatar_file_id: `cloud://${'x'.repeat(506)}` }],
  ];

  for (const [name, candidate] of invalidProfiles) {
    assert.equal(publicAvatarSource(candidate), '', name);
  }
});

test('canonicalPublicAvatar 只返回完整匹配的 canonical file ID', () => {
  const { profile, record } = canonicalFixture();

  assert.equal(
    canonicalPublicAvatar(profile, record, OWNER_OPENID, MEDIA_SECRET),
    record.canonical_file_id,
  );
});

test('新上传头像可用 source 或 canonical 引用且包含用途目录', () => {
  const { profile, record } = canonicalFixture();
  const current = {
    ...record,
    category: 'profile-avatar',
    canonical_category: 'profile-avatar',
    canonical_file_id: record.canonical_file_id.replace(
      `/${record._id}/`,
      `/profile-avatar/${record._id}/`,
    ),
  };
  for (const reference of [SOURCE_FILE_ID, current.canonical_file_id]) {
    assert.equal(
      canonicalPublicAvatar(
        { ...profile, avatar_file_id: reference },
        current,
        OWNER_OPENID,
        MEDIA_SECRET,
      ),
      current.canonical_file_id,
    );
  }
});

test('背景保存的 canonical 引用兼容新用途目录与旧路径', () => {
  const { record } = canonicalFixture();
  for (const category of ['', 'profile-background']) {
    const current = {
      ...record,
      category: category || 'ride',
      ...(category ? { canonical_category: category } : {}),
      canonical_file_id: category
        ? record.canonical_file_id.replace(`/${record._id}/`, `/${category}/${record._id}/`)
        : record.canonical_file_id,
    };
    const profile = { background_photo: { file_id: current.canonical_file_id, category: 'ride' } };
    assert.equal(
      canonicalPublicBackground(profile, current, OWNER_OPENID, MEDIA_SECRET),
      current.canonical_file_id,
    );
  }
});

test('canonical 引用仍拒绝用途、源文件、owner、状态及路径错配', () => {
  const { profile, record } = canonicalFixture();
  const referenced = { ...profile, avatar_file_id: record.canonical_file_id };
  for (const invalid of [
    { ...record, canonical_category: 'activity-image' },
    { ...record, source_file_id: 'cloud://env/profiles/forged.jpg' },
    { ...record, owner_openid: 'other-owner' },
    { ...record, status: 'unreferenced' },
    { ...record, canonical_file_id: record.canonical_file_id.replace(record._id, 'a'.repeat(64)) },
  ]) {
    assert.equal(canonicalPublicAvatar(referenced, invalid, OWNER_OPENID, MEDIA_SECRET), '');
  }
  assert.equal(
    canonicalPublicAvatar(referenced, record, OWNER_OPENID, MEDIA_SECRET),
    record.canonical_file_id,
  );
});

test('canonicalPublicAvatar 对任一非法媒体元数据或 secret 均 fail closed', () => {
  const { profile, record } = canonicalFixture();
  const invalidCases = [
    ['record 缺失', undefined, MEDIA_SECRET],
    ['record._id 不匹配', { ...record, _id: 'wrong-id' }, MEDIA_SECRET],
    ['file_id 不匹配', { ...record, file_id: 'cloud://env/profiles/other.jpg' }, MEDIA_SECRET],
    [
      'source_file_id 不匹配',
      { ...record, source_file_id: 'cloud://env/profiles/other.jpg' },
      MEDIA_SECRET,
    ],
    ['owner_openid 不匹配', { ...record, owner_openid: 'another-member' }, MEDIA_SECRET],
    ['category 不匹配', { ...record, category: 'ride' }, MEDIA_SECRET],
    ['origin 不匹配', { ...record, origin: 'wechat' }, MEDIA_SECRET],
    ['status 不匹配', { ...record, status: 'unreferenced' }, MEDIA_SECRET],
    ['canonical_file_id 缺失', { ...record, canonical_file_id: undefined }, MEDIA_SECRET],
    [
      'canonical_file_id 非 cloud',
      { ...record, canonical_file_id: 'https://images.example/avatar.jpg' },
      MEDIA_SECRET,
    ],
    [
      'canonical_file_id 路径伪造',
      { ...record, canonical_file_id: 'cloud://env/profile-canonical/forged/avatar.jpg' },
      MEDIA_SECRET,
    ],
    ['sha256 缺失', { ...record, sha256: undefined }, MEDIA_SECRET],
    ['sha256 非法', { ...record, sha256: 'x'.repeat(64) }, MEDIA_SECRET],
    ['size 非整数', { ...record, size: 1.5 }, MEDIA_SECRET],
    ['size 非正数', { ...record, size: 0 }, MEDIA_SECRET],
    ['size 超限', { ...record, size: 5 * 1024 * 1024 + 1 }, MEDIA_SECRET],
    ['mime 不支持', { ...record, mime: 'image/gif' }, MEDIA_SECRET],
    ['secret 缺失', record, undefined],
    ['secret 为空', record, ''],
    ['secret 过短', record, 'short-secret'],
  ];

  for (const [name, candidateRecord, secret] of invalidCases) {
    assert.equal(canonicalPublicAvatar(profile, candidateRecord, OWNER_OPENID, secret), '', name);
  }
});

test('canonicalPublicAvatar 接受生产登记类别 profile-avatar', () => {
  const { profile, record } = canonicalFixture();
  const productionRecord = { ...record, category: 'profile-avatar', origin: 'wechat' };
  const wechatProfile = { ...profile, avatar_source: 'wechat' };
  assert.equal(
    canonicalPublicAvatar(wechatProfile, productionRecord, OWNER_OPENID, MEDIA_SECRET),
    record.canonical_file_id,
  );
});

test('compatibleProfileCategory 映射 profile-avatar↔other 与 profile-background↔ride', () => {
  assert.equal(compatibleProfileCategory('other', 'other'), true);
  assert.equal(compatibleProfileCategory('profile-avatar', 'other'), true);
  assert.equal(compatibleProfileCategory('other', 'profile-avatar'), false);
  assert.equal(compatibleProfileCategory('ride', 'ride'), true);
  assert.equal(compatibleProfileCategory('profile-background', 'ride'), true);
  assert.equal(compatibleProfileCategory('ride', 'profile-background'), false);
  assert.equal(compatibleProfileCategory('activity-image', 'other'), false);
  assert.equal(compatibleProfileCategory('bike', 'ride'), false);
});

test('公开头像兼容当前 source/canonical 引用与明确路径类别', async (t) => {
  for (const category of ['other', 'profile-avatar'])
    for (const pathCategory of [undefined, 'profile-avatar'])
      for (const canonicalReference of [false, true])
        await t.test(`${category}/${pathCategory || 'legacy'}/${canonicalReference}`, () => {
          const { profile, record } = canonicalFixture();
          record.category = category;
          if (pathCategory) {
            record.canonical_category = pathCategory;
            record.canonical_file_id = record.canonical_file_id.replace(
              `/${mediaDocumentId(record.file_id)}/`,
              `/${pathCategory}/${mediaDocumentId(record.file_id)}/`,
            );
          }
          if (canonicalReference) profile.avatar_file_id = record.canonical_file_id;
          assert.equal(
            canonicalPublicAvatar(profile, record, OWNER_OPENID, MEDIA_SECRET),
            record.canonical_file_id,
          );
        });
});

test('公开路径不能由业务 category 推测或使用其它用途的明确路径', () => {
  const { profile, record } = canonicalFixture();
  const modernPath = record.canonical_file_id.replace(
    `/${mediaDocumentId(record.file_id)}/`,
    `/profile-avatar/${mediaDocumentId(record.file_id)}/`,
  );
  for (const candidate of [
    { ...record, category: 'profile-avatar', canonical_file_id: modernPath },
    { ...record, canonical_category: 'profile-avatar' },
    { ...record, canonical_category: null },
    { ...record, canonical_category: false },
    { ...record, canonical_category: 'activity-image' },
    { ...record, canonical_category: 'profile-background' },
  ])
    assert.equal(canonicalPublicAvatar(profile, candidate, OWNER_OPENID, MEDIA_SECRET), '');

  const modern = {
    ...record,
    canonical_category: 'profile-avatar',
    canonical_file_id: modernPath,
  };
  for (const candidate of [
    { ...modern, source_file_id: 'cloud://env/other.jpg' },
    { ...modern, _id: mediaDocumentId(modern.canonical_file_id) },
    { ...modern, owner_openid: 'other-owner' },
    { ...modern, status: 'unreferenced' },
  ])
    assert.equal(
      canonicalPublicAvatar(
        { ...profile, avatar_file_id: modernPath },
        candidate,
        OWNER_OPENID,
        MEDIA_SECRET,
      ),
      '',
    );
});

test('公开背景兼容双引用且显式移除不恢复旧 photos', async (t) => {
  for (const category of ['ride', 'profile-background'])
    for (const pathCategory of [undefined, 'profile-background'])
      for (const canonicalReference of [false, true])
        await t.test(`${category}/${pathCategory || 'legacy'}/${canonicalReference}`, () => {
          const { record } = canonicalFixture();
          record.category = category;
          if (pathCategory) {
            record.canonical_category = pathCategory;
            record.canonical_file_id = record.canonical_file_id.replace(
              `/${mediaDocumentId(record.file_id)}/`,
              `/${pathCategory}/${mediaDocumentId(record.file_id)}/`,
            );
          }
          const profile = {
            background_photo: {
              file_id: canonicalReference ? record.canonical_file_id : record.file_id,
              category: 'ride',
            },
          };
          assert.equal(
            canonicalPublicBackground(profile, record, OWNER_OPENID, MEDIA_SECRET),
            record.canonical_file_id,
          );
        });
  const photos = [{ file_id: SOURCE_FILE_ID, category: 'ride' }];
  assert.deepEqual(publicBackgroundSource({ photos }), {
    fileId: SOURCE_FILE_ID,
    category: 'ride',
  });
  for (const background_photo of [null, undefined, { file_id: SOURCE_FILE_ID, category: 'bad' }])
    assert.equal(publicBackgroundSource({ background_photo, photos }), undefined);
});
