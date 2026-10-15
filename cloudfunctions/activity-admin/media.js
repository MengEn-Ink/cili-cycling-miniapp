const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const uniqueFileIds = (values) =>
  Array.from(new Set(values.map(safeText).filter((value) => value.startsWith('cloud://'))));

const safeTempFileMap = async (cloud, fileIds) => {
  const ids = uniqueFileIds(fileIds);
  if (!ids.length) return new Map();
  try {
    const result = await cloud.getTempFileURL({ fileList: ids });
    const entries = Array.isArray(result?.fileList) ? result.fileList : [];
    return new Map(
      entries
        .map((item) => [safeText(item?.fileID), safeText(item?.tempFileURL)])
        .filter(([fileId, url]) => fileId && /^https:\/\//i.test(url)),
    );
  } catch (error) {
    console.warn('[activity-admin] resolve media failed', error?.message || error);
    return new Map();
  }
};

const activityMediaFileIds = (activity) => {
  if (!activity || typeof activity !== 'object') return [];
  return [
    ...(Array.isArray(activity.images) ? activity.images : []),
    activity.cover_image,
    activity.group_qr_code,
    activity.route?.gpx_file_id,
    activity.route?.generated_preview_file_id,
  ]
    .map(safeText)
    .filter(Boolean);
};

const cloudPath = (fileId) => {
  const match = /^cloud:\/\/[^/]+\/(.+)$/.exec(safeText(fileId));
  return match ? match[1] : '';
};

const trustedOwnerPath = (fileId, openid) => {
  const path = cloudPath(fileId);
  const owner = safeText(openid);
  return (
    owner &&
    [
      `profiles/activity-media/${owner}/`,
      `profiles/activity-group-qr/${owner}/`,
      `activity-routes/${owner}/`,
    ].some((prefix) => path.startsWith(prefix))
  );
};

const validateActivityMediaOwnership = (openid, nextActivity, currentActivity) => {
  const owner = safeText(openid);
  if (!owner) return false;
  const existing = new Set(activityMediaFileIds(currentActivity));
  const nextPublic = ['published', 'finished'].includes(nextActivity?.status);
  const currentPublic = ['published', 'finished'].includes(currentActivity?.status);
  return activityMediaFileIds(nextActivity).every((fileId) => {
    if (!fileId.startsWith('cloud://')) return true;
    if (existing.has(fileId) && (!nextPublic || currentPublic)) return true;
    return trustedOwnerPath(fileId, owner);
  });
};

const resolveActivityMedia = async (cloud, activity, openid) => {
  if (!activity || typeof activity !== 'object') return activity;
  const publiclyReadable = ['published', 'finished'].includes(activity.status);
  const canSign = (fileId) =>
    !safeText(fileId).startsWith('cloud://') ||
    publiclyReadable ||
    trustedOwnerPath(fileId, openid);
  const images = Array.isArray(activity.images) ? activity.images.map(safeText) : [];
  const coverImage = safeText(activity.cover_image);
  const groupQrCode = safeText(activity.group_qr_code);
  const generatedPreviewFileId = safeText(activity.route?.generated_preview_file_id);
  const mediaMap = await safeTempFileMap(
    cloud,
    [...images, coverImage, groupQrCode, generatedPreviewFileId].filter(canSign),
  );
  const resolve = (value) => {
    const normalized = safeText(value);
    if (/^https:\/\//i.test(normalized)) return normalized;
    return mediaMap.get(normalized) || '';
  };
  const result = {
    ...activity,
    image_preview_urls: images.map(resolve),
    cover_preview_url: resolve(coverImage),
    group_qr_preview_url: resolve(groupQrCode),
  };
  if (activity.route && typeof activity.route === 'object') {
    result.route = {
      ...activity.route,
      generated_preview_url:
        resolve(generatedPreviewFileId) || safeText(activity.route.generated_preview_url),
    };
  } else if (hasOwn(activity, 'route')) {
    result.route = activity.route;
  }
  return result;
};

module.exports = {
  resolveActivityMedia,
  validateActivityMediaOwnership,
};
