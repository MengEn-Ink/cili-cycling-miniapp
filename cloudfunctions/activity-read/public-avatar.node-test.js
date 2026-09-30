'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { canonicalPublicAvatar, mediaDocumentId, publicAvatarSource } = require('./public-avatar');

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

test('publicAvatarSource 只接受显式公开且版本和来源有效的 cloud 头像', () => {
  const { profile } = canonicalFixture();
  assert.equal(publicAvatarSource(profile), SOURCE_FILE_ID);

  const invalidProfiles = [
    ['缺少 profile', undefined],
    ['未授权', { ...profile, avatar_visibility: undefined }],
    ['私有', { ...profile, avatar_visibility: 'private' }],
    ['缺少 revision', { ...profile, avatar_revision: undefined }],
    ['负 revision', { ...profile, avatar_revision: -1 }],
    ['非整数 revision', { ...profile, avatar_revision: 1.5 }],
    ['授权 revision 不匹配', { ...profile, avatar_visibility_revision: 2 }],
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
