'use strict';

const crypto = require('node:crypto');

const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const AVATAR_SOURCES = new Set(['wechat', 'custom']);
const PHOTO_CATEGORIES = new Set(['ride', 'bike', 'other']);
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

function mediaDocumentId(fileId) {
  return crypto.createHash('sha256').update(fileId).digest('hex');
}

function publicAvatarSource(profile) {
  if (
    !profile ||
    !Number.isSafeInteger(profile.avatar_revision) ||
    profile.avatar_revision < 0 ||
    !AVATAR_SOURCES.has(profile.avatar_source) ||
    typeof profile.avatar_file_id !== 'string' ||
    !profile.avatar_file_id.startsWith('cloud://') ||
    profile.avatar_file_id.length > 512
  )
    return '';
  return profile.avatar_file_id;
}

function publicBackgroundSource(profile) {
  const value =
    profile && Object.prototype.hasOwnProperty.call(profile, 'background_photo')
      ? profile.background_photo
      : profile && Array.isArray(profile.photos)
        ? profile.photos.find(validPhoto)
        : undefined;
  return validPhoto(value) ? { fileId: value.file_id, category: value.category } : undefined;
}

function validPhoto(value) {
  return (
    value &&
    typeof value.file_id === 'string' &&
    value.file_id.startsWith('cloud://') &&
    value.file_id.length <= 512 &&
    PHOTO_CATEGORIES.has(value.category)
  );
}

// 媒体登记使用 profile-avatar / profile-background，而公开资料字段沿用 other / ride。
// 与 profile/core.js 的 compatibleProfileCategory 保持一致，避免授权后头像与背景无法解析。
function compatibleProfileCategory(recordCategory, profileCategory) {
  return (
    recordCategory === profileCategory ||
    (recordCategory === 'profile-background' && profileCategory === 'ride') ||
    (recordCategory === 'profile-avatar' && profileCategory === 'other')
  );
}

function canonicalPublicMedia(
  referenceFileId,
  record,
  ownerOpenid,
  secretValue,
  expectedCategory,
  expectedOrigin,
  expectedCanonicalCategory,
) {
  const secret = typeof secretValue === 'string' ? secretValue.trim() : '';
  const sourceFileId = record && record.file_id;
  const canonicalCategory = record && record.canonical_category;
  const extension = MIME_EXTENSIONS[record && record.mime];
  if (
    !referenceFileId ||
    typeof ownerOpenid !== 'string' ||
    !ownerOpenid ||
    secret.length < 32 ||
    !record ||
    typeof sourceFileId !== 'string' ||
    !sourceFileId.startsWith('cloud://') ||
    sourceFileId.length > 512 ||
    record._id !== mediaDocumentId(sourceFileId) ||
    (referenceFileId !== sourceFileId && referenceFileId !== record.canonical_file_id) ||
    record.source_file_id !== sourceFileId ||
    record.owner_openid !== ownerOpenid ||
    !compatibleProfileCategory(record.category, expectedCategory) ||
    (canonicalCategory !== undefined &&
      canonicalCategory !== '' &&
      canonicalCategory !== expectedCanonicalCategory) ||
    record.origin !== expectedOrigin ||
    record.status !== 'active' ||
    typeof record.canonical_file_id !== 'string' ||
    !record.canonical_file_id.startsWith('cloud://') ||
    typeof record.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    !Number.isSafeInteger(record.size) ||
    record.size <= 0 ||
    record.size > MAX_PROFILE_IMAGE_BYTES ||
    !extension
  )
    return '';
  const ownerAlias = crypto
    .createHmac('sha256', secret)
    .update(ownerOpenid)
    .digest('hex')
    .slice(0, 32);
  const categoryPath = canonicalCategory ? `${canonicalCategory}/` : '';
  const expectedPath = `profile-canonical/${ownerAlias}/${categoryPath}${mediaDocumentId(sourceFileId)}/${record.sha256}.${extension}`;
  const slash = record.canonical_file_id.indexOf('/', 'cloud://'.length);
  const actualPath = slash >= 0 ? record.canonical_file_id.slice(slash + 1) : '';
  return actualPath === expectedPath ? record.canonical_file_id : '';
}

function canonicalPublicAvatar(profile, record, ownerOpenid, secretValue) {
  return canonicalPublicMedia(
    publicAvatarSource(profile),
    record,
    ownerOpenid,
    secretValue,
    'other',
    profile && profile.avatar_source,
    'profile-avatar',
  );
}

function canonicalPublicBackground(profile, record, ownerOpenid, secretValue) {
  const source = publicBackgroundSource(profile);
  return canonicalPublicMedia(
    source && source.fileId,
    record,
    ownerOpenid,
    secretValue,
    source && source.category,
    'custom',
    'profile-background',
  );
}

module.exports = {
  canonicalPublicAvatar,
  canonicalPublicBackground,
  compatibleProfileCategory,
  mediaDocumentId,
  publicAvatarSource,
  publicBackgroundSource,
};
