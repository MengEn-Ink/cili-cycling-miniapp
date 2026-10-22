'use strict';

const crypto = require('node:crypto');
const { safeClubMedia } = require('./privacy-contract');

class ClubMediaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ClubMediaError';
    this.code = code;
  }
}

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

function cloudPath(fileId) {
  const match = /^cloud:\/\/[^/]+\/(.+)$/.exec(safeText(fileId));
  return match ? match[1] : '';
}

function trustedCover(fileId, applicantOpenid, category = '') {
  const owner = safeText(applicantOpenid);
  const path = cloudPath(fileId);
  if (owner && path.startsWith(`club-applications/${owner}/`)) return true;
  const secret = safeText(process.env.PROFILE_MEDIA_PATH_SECRET);
  if (!owner || secret.length < 32) return false;
  const alias = crypto.createHmac('sha256', secret).update(owner).digest('hex').slice(0, 32);
  return new RegExp(
    `^profile-canonical/${alias}/${category || '(?:club-avatar|club-cover)'}/[a-f0-9]{64}/[a-f0-9]{64}\\.(?:jpg|png|webp)$`,
    'i',
  ).test(path);
}

const mediaSecurityCode = (status) =>
  ({
    pending: 'MEDIA_SECURITY_PENDING',
    retryable: 'MEDIA_SECURITY_RETRY_REQUIRED',
    review: 'MEDIA_SECURITY_REVIEW_REQUIRED',
    risky: 'MEDIA_SECURITY_RISKY',
  })[status] || 'MEDIA_SECURITY_REQUIRED';

const clubMediaReferences = (value) => [
  [value?.avatar_file_id || value?.avatar_url, 'club-avatar'],
  [value?.cover_file_id, 'club-cover'],
];

async function activateClubMediaReferences(tx, owner, value, now, currentValue) {
  if (typeof tx?.getProfileMediaByCanonical !== 'function') return;
  const references = clubMediaReferences(value);
  const currentReferences = new Set(
    clubMediaReferences(currentValue).map(
      ([fileId, category]) => `${category}:${safeText(fileId)}`,
    ),
  );
  for (const [rawFileId, category] of references) {
    const fileId = safeText(rawFileId);
    if (!fileId || !trustedCover(fileId, owner, category)) continue;
    if (!cloudPath(fileId).startsWith('profile-canonical/')) {
      if (currentReferences.has(`${category}:${fileId}`)) continue;
      throw new ClubMediaError('MEDIA_REGISTRATION_INVALID', '俱乐部媒体登记不可用');
    }
    const record = await tx.getProfileMediaByCanonical(fileId, owner, category);
    if (
      !record ||
      record.canonical_file_id !== fileId ||
      record.owner_openid !== owner ||
      record.category !== category ||
      !['unreferenced', 'active'].includes(record.status)
    )
      throw new ClubMediaError('MEDIA_REGISTRATION_INVALID', '俱乐部媒体登记不可用');
    const legacyCurrentReference =
      record.status === 'active' &&
      !record.security_status &&
      currentReferences.has(`${category}:${fileId}`);
    if (record.security_status !== 'pass' && !legacyCurrentReference)
      throw new ClubMediaError(
        mediaSecurityCode(record.security_status),
        '俱乐部媒体安全状态不可用',
      );
    if (record.status !== 'active') await tx.activateProfileMedia(record._id, now);
  }
}

async function resolveFileIds(cloud, fileIds, warning) {
  const ids = Array.from(new Set(fileIds.filter((value) => /^cloud:\/\/[^/]+\/.+/.test(value))));
  const urls = new Map();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    try {
      const result = await cloud.getTempFileURL({ fileList: batch });
      for (const item of Array.isArray(result?.fileList) ? result.fileList : []) {
        const fileId = safeText(item?.fileID);
        const url = safeText(item?.tempFileURL);
        if (batch.includes(fileId) && /^https:\/\//i.test(url)) urls.set(fileId, url);
      }
    } catch {
      console.warn(warning);
    }
  }
  return urls;
}

async function resolveApplicationCovers(cloud, applications, applicantOpenid = '') {
  const values = Array.isArray(applications) ? applications : [];
  const trustedIds = values.flatMap((application) => {
    const owner = safeText(applicantOpenid || application?.applicant_openid);
    return [
      ['avatar_file_id', 'club-avatar'],
      ['cover_file_id', 'club-cover'],
    ]
      .map(([field, category]) => {
        const fileId = safeText(application?.[field]);
        return trustedCover(fileId, owner, category) ? fileId : '';
      })
      .filter(Boolean);
  });
  const urls = await resolveFileIds(
    cloud,
    trustedIds,
    '[club-application] resolve application media batch failed',
  );
  return values.map((application) => {
    const owner = safeText(applicantOpenid || application?.applicant_openid);
    const avatarId = safeText(application?.avatar_file_id);
    const coverId = safeText(application?.cover_file_id);
    return {
      ...application,
      avatar_url: trustedCover(avatarId, owner, 'club-avatar') ? urls.get(avatarId) || '' : '',
      cover_url: trustedCover(coverId, owner, 'club-cover') ? urls.get(coverId) || '' : '',
    };
  });
}

async function resolveApplicationCover(cloud, application, applicantOpenid = '') {
  if (!application || typeof application !== 'object') return application;
  return (await resolveApplicationCovers(cloud, [application], applicantOpenid))[0];
}

async function resolveJoinableClubAvatars(cloud, clubs) {
  const values = Array.isArray(clubs) ? clubs : [];
  const fileIds = values.flatMap((club) => [
    safeClubMedia(safeText(club?.avatar_url)),
    safeClubMedia(safeText(club?.cover_file_id)),
  ]);
  const urls = await resolveFileIds(cloud, fileIds, '[club-application] resolve club media failed');
  const publicUrl = (value) => {
    const fileId = safeClubMedia(safeText(value));
    return /^https:\/\//i.test(fileId) ? fileId : urls.get(fileId) || '';
  };
  return values.map((club) => ({
    ...club,
    ...(club?.avatar_file_id === undefined
      ? {}
      : { avatar_file_id: safeClubMedia(club.avatar_file_id) }),
    ...(club?.cover_file_id === undefined
      ? {}
      : { cover_file_id: safeClubMedia(club.cover_file_id) }),
    avatar_url: publicUrl(club?.avatar_url),
    cover_url: publicUrl(club?.cover_file_id),
  }));
}

module.exports = {
  ClubMediaError,
  activateClubMediaReferences,
  resolveApplicationCover,
  resolveApplicationCovers,
  resolveJoinableClubAvatars,
  trustedCover,
};
