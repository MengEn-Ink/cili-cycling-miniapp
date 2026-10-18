const crypto = require('node:crypto');

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

const canonicalOwnerAlias = (openid, secret = process.env.PROFILE_MEDIA_PATH_SECRET) => {
  const owner = safeText(openid);
  const key = safeText(secret);
  if (!owner || key.length < 32) return '';
  return crypto.createHmac('sha256', key).update(owner).digest('hex').slice(0, 32);
};

const trustedOwnerPath = (fileId, openid, category = '') => {
  const path = cloudPath(fileId);
  const owner = safeText(openid);
  if (!owner || !path) return false;
  if (!category) return path.startsWith(`activity-routes/${owner}/`);
  const alias = canonicalOwnerAlias(owner);
  return Boolean(
    alias &&
    new RegExp(
      `^profile-canonical/${alias}/${category}/[a-f0-9]{64}/[a-f0-9]{64}\\.(?:jpg|png|webp)$`,
      'i',
    ).test(path),
  );
};

const sameMediaArray = (left, right) =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const canonicalOrUnchanged = (fileId, currentFileId, owner, category) => {
  const next = safeText(fileId);
  if (!next) return true;
  return (
    trustedOwnerPath(next, owner, category) ||
    (typeof fileId === 'string' && fileId === currentFileId)
  );
};

const validateActivityMediaOwnership = (openid, nextActivity, currentActivity) => {
  const owner = safeText(openid);
  if (!owner) return false;

  const nextImages = Array.isArray(nextActivity?.images) ? nextActivity.images : [];
  const imagesValid = nextImages.every((fileId) =>
    trustedOwnerPath(safeText(fileId), owner, 'activity-image'),
  );
  // 存量 legacy 图片仅允许整个数组按原值、原顺序保持；一旦编辑，所有值都必须是 canonical。
  if (!imagesValid && !sameMediaArray(nextImages, currentActivity?.images)) return false;
  if (
    !canonicalOrUnchanged(
      nextActivity?.cover_image,
      currentActivity?.cover_image,
      owner,
      'activity-image',
    ) ||
    !canonicalOrUnchanged(
      nextActivity?.group_qr_code,
      currentActivity?.group_qr_code,
      owner,
      'activity-group-qr',
    ) ||
    !canonicalOrUnchanged(
      nextActivity?.route?.generated_preview_file_id,
      currentActivity?.route?.generated_preview_file_id,
      owner,
      'activity-route-preview',
    )
  )
    return false;

  const nextGpx = safeText(nextActivity?.route?.gpx_file_id);
  return (
    !nextGpx ||
    trustedOwnerPath(nextGpx, owner) ||
    nextGpx === safeText(currentActivity?.route?.gpx_file_id)
  );
};

const activateActivityMediaReferences = async (tx, openid, activity, now) => {
  if (typeof tx?.getProfileMediaByCanonical !== 'function') return;
  const references = [
    ...(Array.isArray(activity?.images)
      ? activity.images.map((fileId) => [fileId, 'activity-image'])
      : []),
    [activity?.cover_image, 'activity-image'],
    [activity?.group_qr_code, 'activity-group-qr'],
    [activity?.route?.generated_preview_file_id, 'activity-route-preview'],
  ];
  const seen = new Set();
  for (const [rawFileId, category] of references) {
    const fileId = safeText(rawFileId);
    const key = `${category}:${fileId}`;
    if (!fileId || seen.has(key) || !trustedOwnerPath(fileId, openid, category)) continue;
    seen.add(key);
    if (!cloudPath(fileId).startsWith('profile-canonical/')) continue;
    const record = await tx.getProfileMediaByCanonical(fileId, openid, category);
    if (
      !record ||
      record.canonical_file_id !== fileId ||
      record.owner_openid !== openid ||
      record.category !== category ||
      !['unreferenced', 'active'].includes(record.status)
    )
      throw Object.assign(new Error('活动媒体登记不可用'), { code: 'MEDIA_REGISTRATION_INVALID' });
    if (record.status !== 'active') await tx.activateProfileMedia(record._id, now);
  }
};

const legacyReadableOwnerPath = (fileId, openid) => {
  const path = cloudPath(fileId);
  const owner = safeText(openid);
  return Boolean(
    owner &&
    (path.startsWith(`profiles/activity-media/${owner}/`) ||
      path.startsWith(`profiles/activity-group-qr/${owner}/`)),
  );
};

const resolveActivityMedia = async (cloud, activity, openid) => {
  if (!activity || typeof activity !== 'object') return activity;
  const publiclyReadable = ['published', 'finished'].includes(activity.status);
  const canSign = (fileId) =>
    !safeText(fileId).startsWith('cloud://') ||
    publiclyReadable ||
    trustedOwnerPath(fileId, openid) ||
    legacyReadableOwnerPath(fileId, openid);
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
  activateActivityMediaReferences,
  resolveActivityMedia,
  validateActivityMediaOwnership,
};
