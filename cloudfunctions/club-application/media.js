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

async function resolveApplicationCovers(cloud, applications, applicantOpenid = '') {
  const values = Array.isArray(applications) ? applications : [];
  const trustedIds = Array.from(
    new Set(
      values
        .map((application) => {
          const fileId = safeText(application?.cover_file_id);
          const owner = safeText(applicantOpenid || application?.applicant_openid);
          return trustedCover(fileId, owner) ? fileId : '';
        })
        .filter(Boolean),
    ),
  );
  const urls = new Map();
  for (let offset = 0; offset < trustedIds.length; offset += 50) {
    const batch = trustedIds.slice(offset, offset + 50);
    try {
      const result = await cloud.getTempFileURL({ fileList: batch });
      const entries = Array.isArray(result?.fileList) ? result.fileList : [];
      entries.forEach((item) => {
        const fileId = safeText(item?.fileID);
        const url = safeText(item?.tempFileURL);
        if (batch.includes(fileId) && /^https:\/\//i.test(url)) urls.set(fileId, url);
      });
    } catch (error) {
      console.warn('[club-application] resolve cover batch failed', error?.message || error);
    }
  }
  return values.map((application) => {
    const fileId = safeText(application?.cover_file_id);
    const owner = safeText(applicantOpenid || application?.applicant_openid);
    return {
      ...application,
      cover_url: trustedCover(fileId, owner) ? urls.get(fileId) || '' : '',
    };
  });
}

async function resolveApplicationCover(cloud, application, applicantOpenid = '') {
  if (!application || typeof application !== 'object') return application;
  return (await resolveApplicationCovers(cloud, [application], applicantOpenid))[0];
}

module.exports = { resolveApplicationCover, resolveApplicationCovers, trustedCover };
