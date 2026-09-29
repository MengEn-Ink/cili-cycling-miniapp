'use strict';

const MAX_CAPABILITY_IMAGES = 3;
const PROFILE_PHOTO_CATEGORIES = new Set(['ride', 'bike', 'other']);
const RIDING_CATEGORIES = new Set(['ride', 'bike']);
const ADMIN_REGISTRATION_FIELDS = [
  '_id',
  'activity_id',
  'status',
  'serial_no',
  'created_at',
  'updated_at',
];
const ADMIN_OPTION_FIELDS = ['bike_mode', 'experience', 'rental_need', 'remark'];
const ADMIN_PROFILE_FIELDS = ['nickname', 'real_name_masked', 'phone_masked'];
const ADMIN_STRAVA_FIELDS = [
  'years_on_strava',
  'total_km',
  'activities_90d',
  'longest_km',
  'total_elevation_m',
  'weighted_avg_speed_kmh',
  'latest_activity_at',
  'synced_at',
  'coverage_from',
  'coverage_to',
  'coverage_complete',
];
const SOCIAL_STRAVA_FIELDS = ['total_km', 'activities_90d', 'longest_km'];

function pick(object, keys) {
  return keys.reduce((output, key) => {
    if (object && object[key] !== undefined) output[key] = object[key];
    return output;
  }, {});
}

function safeCloudFileId(value) {
  return typeof value === 'string' && value.startsWith('cloud://') && value.length <= 512
    ? value
    : '';
}

function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function isRidingCategory(value) {
  return typeof value === 'string' && RIDING_CATEGORIES.has(value.trim().toLowerCase());
}

function capabilityCandidates(profile) {
  const value = profile && typeof profile === 'object' ? profile : {};
  const photos = Array.isArray(value.photos)
    ? value.photos
        .filter((photo) => photo && typeof photo === 'object')
        .map((photo) => ({
          file_id: safeCloudFileId(photo.file_id),
          category: typeof photo.category === 'string' ? photo.category : '',
          source: 'user',
          visibility: photo.visibility === 'public' ? 'public' : 'private',
        }))
        .filter((photo) => photo.file_id && PROFILE_PHOTO_CATEGORIES.has(photo.category))
    : [];
  const ordered = [
    ...photos.filter((photo) => isRidingCategory(photo.category)),
    ...photos.filter((photo) => !isRidingCategory(photo.category)),
  ];
  const avatar = safeCloudFileId(value.avatar_file_id);
  if (avatar)
    ordered.push({ file_id: avatar, category: '', source: 'avatar', visibility: 'private' });

  const seen = new Set();
  return ordered.filter((item) => {
    if (seen.has(item.file_id) || seen.size >= MAX_CAPABILITY_IMAGES) return false;
    seen.add(item.file_id);
    return true;
  });
}

function adminCapabilityMedia(profile) {
  return { file_ids: capabilityCandidates(profile).map((item) => item.file_id) };
}

async function resolveAdminCapabilityMedia(profile, getTempFileURL) {
  const candidates = capabilityCandidates(profile);
  if (candidates.length === 0) return { photos: [], avatar_url: '' };
  const response = await getTempFileURL({ fileList: candidates.map((item) => item.file_id) });
  const allowed = new Map(candidates.map((item) => [item.file_id, item]));
  const resolved = new Map();
  for (const item of Array.isArray(response && response.fileList) ? response.fileList : []) {
    const candidate = allowed.get(item && item.fileID);
    const url = item && Number(item.status) === 0 ? safeHttpsUrl(item.tempFileURL) : '';
    if (candidate && url && !resolved.has(candidate.file_id)) resolved.set(candidate.file_id, url);
  }
  const photos = candidates
    .filter((item) => item.source === 'user' && resolved.has(item.file_id))
    .map((item) => ({
      url: resolved.get(item.file_id),
      category: item.category,
      source: 'user',
    }));
  const avatar = candidates.find((item) => item.source === 'avatar');
  return {
    photos,
    avatar_url: avatar ? resolved.get(avatar.file_id) || '' : '',
  };
}

function safeResolvedMedia(resolvedMedia) {
  const value = resolvedMedia && typeof resolvedMedia === 'object' ? resolvedMedia : {};
  const photos = Array.isArray(value.photos)
    ? value.photos
        .filter((photo) => photo && typeof photo === 'object')
        .map((photo) => ({
          url: safeHttpsUrl(photo.url),
          category: typeof photo.category === 'string' ? photo.category : '',
          source: photo.source === 'avatar' ? 'avatar' : 'user',
        }))
        .filter((photo) => photo.url)
        .slice(0, MAX_CAPABILITY_IMAGES)
    : [];
  return { photos, avatar_url: safeHttpsUrl(value.avatar_url) };
}

function adminCapabilityView(registration, profile, resolvedMedia) {
  const safe = pick(registration, ADMIN_REGISTRATION_FIELDS);
  safe.options = pick(registration && registration.options, ADMIN_OPTION_FIELDS);
  safe.profile_snapshot = pick(registration && registration.profile_snapshot, ADMIN_PROFILE_FIELDS);
  safe.strava_status = registration && registration.strava_status;
  if (registration && registration.strava_snapshot) {
    safe.strava_snapshot = pick(registration.strava_snapshot, ADMIN_STRAVA_FIELDS);
  }
  if (registration && registration.exemption) {
    safe.exemption = pick(registration.exemption, ['reason', 'at']);
  }
  safe.review_history = Array.isArray(registration && registration.review_history)
    ? registration.review_history.map((item) => pick(item, ['reviewed_at', 'action', 'comment']))
    : [];

  const media = safeResolvedMedia(resolvedMedia);
  const value = profile && typeof profile === 'object' ? profile : {};
  safe.capability_profile = {
    nickname:
      typeof value.nickname === 'string'
        ? value.nickname
        : typeof safe.profile_snapshot.nickname === 'string'
          ? safe.profile_snapshot.nickname
          : '',
    title: typeof value.title === 'string' ? value.title : '',
    phone_source: ['wechat', 'manual', 'legacy'].includes(value.phone_source)
      ? value.phone_source
      : '',
    phone_verified: value.phone_verified === true,
    photos: media.photos,
    avatar_url: media.avatar_url,
  };
  return safe;
}

function socialCapabilityView(profile, resolvedMedia) {
  const value = profile && typeof profile === 'object' ? profile : {};
  const publicFileIds = new Set(
    (Array.isArray(value.photos) ? value.photos : [])
      .filter((photo) => photo && photo.visibility === 'public')
      .map((photo) => safeCloudFileId(photo.file_id))
      .filter(Boolean),
  );
  const photos = (Array.isArray(resolvedMedia && resolvedMedia.photos) ? resolvedMedia.photos : [])
    .filter((photo) => photo && publicFileIds.has(safeCloudFileId(photo.file_id)))
    .map((photo) => ({
      url: safeHttpsUrl(photo.url),
      category: typeof photo.category === 'string' ? photo.category : '',
      source: 'user',
    }))
    .filter((photo) => photo.url)
    .slice(0, MAX_CAPABILITY_IMAGES);
  return {
    nickname: typeof value.nickname === 'string' ? value.nickname : '',
    title: typeof value.title === 'string' ? value.title : '',
    photos,
    strava: pick(value.strava, SOCIAL_STRAVA_FIELDS),
  };
}

async function adminCapabilityDetail({
  authorize,
  loadRegistration,
  loadProfile,
  getTempFileURL,
  projectRegistration,
}) {
  await authorize();
  const registration = await loadRegistration();
  if (!registration) return undefined;
  const profile = registration.openid ? await loadProfile(registration.openid) : undefined;
  const resolvedMedia = await resolveAdminCapabilityMedia(profile, getTempFileURL);
  return adminCapabilityView(projectRegistration(registration), profile, resolvedMedia);
}

module.exports = {
  adminCapabilityMedia,
  resolveAdminCapabilityMedia,
  adminCapabilityView,
  socialCapabilityView,
  adminCapabilityDetail,
};
