'use strict';

const { ProfileError, ownerAvatarMedia, ownerMedia } = require('./core');

function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

async function resolveBackgrounds(media, getTempFileURL) {
  if (!media.length) return [];
  const storageFileId = (item) => item.storage_file_id;
  let response;
  try {
    response = await getTempFileURL({ fileList: media.map(storageFileId) });
  } catch {
    return [];
  }
  const byId = new Map(media.map((item) => [storageFileId(item), item]));
  const resolved = new Map();
  for (const item of Array.isArray(response && response.fileList) ? response.fileList : []) {
    const source = byId.get(item && item.fileID);
    const url = item && Number(item.status) === 0 ? safeHttpsUrl(item.tempFileURL) : '';
    if (source && url && !resolved.has(storageFileId(source)))
      resolved.set(storageFileId(source), url);
  }
  return media
    .filter((item) => resolved.has(storageFileId(item)))
    .map((item) => ({
      file_id: item.file_id,
      url: resolved.get(storageFileId(item)),
      source: item.source,
      category: item.category,
    }));
}

async function buildCapabilityCard(
  { profile, mediaRecords = [] },
  { openid, mediaSecret, now = new Date(), getTempFileURL },
) {
  if (typeof openid !== 'string' || !openid)
    throw new ProfileError('UNAUTHENTICATED', '无法取得微信身份');
  const [backgrounds, avatar] = await Promise.all([
    resolveBackgrounds(ownerMedia(profile, openid, mediaSecret, mediaRecords), getTempFileURL),
    resolveBackgrounds(
      [ownerAvatarMedia(profile, openid, mediaSecret, mediaRecords)].filter(Boolean),
      getTempFileURL,
    ),
  ]);
  const avatarUrl = avatar[0]?.url || '';
  return {
    generated_at: now.toISOString(),
    profile: {
      display_name: typeof profile?.nickname === 'string' ? profile.nickname : '',
      gender: profile?.gender === '男' || profile?.gender === '女' ? profile.gender : '',
      avatar_url: avatarUrl,
    },
    backgrounds,
  };
}

module.exports = {
  buildCapabilityCard,
};
