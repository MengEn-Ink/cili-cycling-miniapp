'use strict';

const crypto = require('node:crypto');

const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const AVATAR_SOURCES = new Set(['wechat', 'strava', 'custom']);
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

function mediaDocumentId(fileId) {
  return crypto.createHash('sha256').update(fileId).digest('hex');
}

function publicAvatarSource(profile) {
  if (
    !profile ||
    profile.avatar_visibility !== 'public' ||
    !Number.isSafeInteger(profile.avatar_revision) ||
    profile.avatar_revision < 0 ||
    profile.avatar_visibility_revision !== profile.avatar_revision ||
    !AVATAR_SOURCES.has(profile.avatar_source) ||
    typeof profile.avatar_file_id !== 'string' ||
    !profile.avatar_file_id.startsWith('cloud://') ||
    profile.avatar_file_id.length > 512
  )
    return '';
  return profile.avatar_file_id;
}

function canonicalPublicAvatar(profile, record, ownerOpenid, secretValue) {
  const sourceFileId = publicAvatarSource(profile);
  const secret = typeof secretValue === 'string' ? secretValue.trim() : '';
  const extension = MIME_EXTENSIONS[record && record.mime];
  const expectedOrigin = profile && profile.avatar_source;
  if (
    !sourceFileId ||
    typeof ownerOpenid !== 'string' ||
    !ownerOpenid ||
    secret.length < 32 ||
    !record ||
    record._id !== mediaDocumentId(sourceFileId) ||
    record.file_id !== sourceFileId ||
    record.source_file_id !== sourceFileId ||
    record.owner_openid !== ownerOpenid ||
    record.category !== 'other' ||
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
  const expectedPath = `profile-canonical/${ownerAlias}/${mediaDocumentId(sourceFileId)}/${record.sha256}.${extension}`;
  const slash = record.canonical_file_id.indexOf('/', 'cloud://'.length);
  const actualPath = slash >= 0 ? record.canonical_file_id.slice(slash + 1) : '';
  return actualPath === expectedPath ? record.canonical_file_id : '';
}

module.exports = { canonicalPublicAvatar, mediaDocumentId, publicAvatarSource };
