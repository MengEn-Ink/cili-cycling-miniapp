'use strict';

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

function cloudPath(fileId) {
  const match = /^cloud:\/\/[^/]+\/(.+)$/.exec(safeText(fileId));
  return match ? match[1] : '';
}

function trustedCover(fileId, applicantOpenid) {
  const owner = safeText(applicantOpenid);
  return Boolean(owner && cloudPath(fileId).startsWith(`club-applications/${owner}/`));
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
    } catch (error) {
      console.warn(warning, error?.message || error);
    }
  }
  return urls;
}

async function resolveApplicationCovers(cloud, applications, applicantOpenid = '') {
  const values = Array.isArray(applications) ? applications : [];
  const trustedIds = values.flatMap((application) => {
    const owner = safeText(applicantOpenid || application?.applicant_openid);
    return ['avatar_file_id', 'cover_file_id']
      .map((field) => safeText(application?.[field]))
      .filter((fileId) => trustedCover(fileId, owner));
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
      avatar_url: trustedCover(avatarId, owner) ? urls.get(avatarId) || '' : '',
      cover_url: trustedCover(coverId, owner) ? urls.get(coverId) || '' : '',
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
    safeText(club?.avatar_url),
    safeText(club?.cover_file_id),
  ]);
  const urls = await resolveFileIds(cloud, fileIds, '[club-application] resolve club media failed');
  const publicUrl = (value) => {
    const fileId = safeText(value);
    return /^https:\/\//i.test(fileId) ? fileId : urls.get(fileId) || '';
  };
  return values.map((club) => ({
    ...club,
    avatar_url: publicUrl(club?.avatar_url),
    cover_url: publicUrl(club?.cover_file_id),
  }));
}

module.exports = {
  resolveApplicationCover,
  resolveApplicationCovers,
  resolveJoinableClubAvatars,
  trustedCover,
};
