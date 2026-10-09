'use strict';

const crypto = require('node:crypto');
const { normalizeGender } = require('./domain');

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
const ADMIN_OPTION_FIELDS = ['experience', 'remark'];
const ADMIN_PROFILE_FIELDS = [
  'nickname',
  'gender',
  'real_name_masked',
  'phone_masked',
  'phone_source',
  'phone_verified',
];
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

function mediaDocumentId(fileId) {
  return crypto.createHash('sha256').update(fileId).digest('hex');
}

function canonicalFileId(record, sourceFileId, ownerOpenid, mediaSecret) {
  if (
    !record ||
    typeof record.canonical_file_id !== 'string' ||
    typeof record.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    !Number.isSafeInteger(record.size) ||
    record.size <= 0 ||
    record.size > 5 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(record.mime) ||
    typeof mediaSecret !== 'string' ||
    mediaSecret.length < 32
  )
    return '';
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[record.mime];
  const ownerAlias = crypto
    .createHmac('sha256', mediaSecret)
    .update(ownerOpenid)
    .digest('hex')
    .slice(0, 32);
  const expectedPath = `profile-canonical/${ownerAlias}/${mediaDocumentId(sourceFileId)}/${record.sha256}.${extension}`;
  const slash = record.canonical_file_id.indexOf('/', 'cloud://'.length);
  const actualPath =
    record.canonical_file_id.startsWith('cloud://') && slash >= 0
      ? record.canonical_file_id.slice(slash + 1)
      : '';
  return actualPath === expectedPath ? record.canonical_file_id : '';
}

function capabilityCandidates(profile, mediaRecords, ownerOpenid, mediaSecret) {
  const value = profile && typeof profile === 'object' ? profile : {};
  const records = new Map(
    (Array.isArray(mediaRecords) ? mediaRecords : []).map((record) => [
      record && record.file_id,
      record,
    ]),
  );
  const registered = (fileId, category) => {
    const record = records.get(fileId);
    const canonical = canonicalFileId(record, fileId, ownerOpenid, mediaSecret);
    return (
      record &&
      record._id === mediaDocumentId(fileId) &&
      record.file_id === fileId &&
      record.owner_openid === ownerOpenid &&
      record.category === category &&
      record.status === 'active' &&
      canonical
    );
  };
  const photos = Array.isArray(value.photos)
    ? value.photos
        .filter((photo) => photo && typeof photo === 'object')
        .map((photo) => ({
          source_file_id: safeCloudFileId(photo.file_id),
          category: typeof photo.category === 'string' ? photo.category : '',
          source: 'user',
          visibility: photo.visibility === 'public' ? 'public' : 'private',
        }))
        .filter(
          (photo) =>
            photo.source_file_id &&
            PROFILE_PHOTO_CATEGORIES.has(photo.category) &&
            registered(photo.source_file_id, photo.category),
        )
        .map((photo) => ({
          ...photo,
          file_id: photo.source_file_id,
          storage_file_id: canonicalFileId(
            records.get(photo.source_file_id),
            photo.source_file_id,
            ownerOpenid,
            mediaSecret,
          ),
        }))
    : [];
  const ordered = [
    ...photos.filter((photo) => isRidingCategory(photo.category)),
    ...photos.filter((photo) => !isRidingCategory(photo.category)),
  ];
  const avatar = safeCloudFileId(value.avatar_file_id);
  const avatarRecord = records.get(avatar);
  if (avatar && registered(avatar, avatarRecord && avatarRecord.category))
    ordered.push({
      file_id: avatar,
      storage_file_id: canonicalFileId(avatarRecord, avatar, ownerOpenid, mediaSecret),
      category: 'other',
      source: 'avatar',
      visibility: 'private',
    });

  const seen = new Set();
  return ordered.filter((item) => {
    if (seen.has(item.file_id) || seen.size >= MAX_CAPABILITY_IMAGES) return false;
    seen.add(item.file_id);
    return true;
  });
}

function adminCapabilityMedia(profile, mediaRecords, ownerOpenid, mediaSecret) {
  return {
    file_ids: capabilityCandidates(profile, mediaRecords, ownerOpenid, mediaSecret).map(
      (item) => item.storage_file_id,
    ),
  };
}

async function resolveAdminCapabilityMedia(
  profile,
  mediaRecords,
  ownerOpenid,
  getTempFileURL,
  mediaSecret,
) {
  const candidates = capabilityCandidates(profile, mediaRecords, ownerOpenid, mediaSecret);
  if (candidates.length === 0) return { photos: [], avatar_url: '' };
  let response;
  try {
    response = await getTempFileURL({ fileList: candidates.map((item) => item.storage_file_id) });
  } catch {
    return { photos: [], avatar_url: '' };
  }
  const allowed = new Map(candidates.map((item) => [item.storage_file_id, item]));
  const resolved = new Map();
  for (const item of Array.isArray(response && response.fileList) ? response.fileList : []) {
    const candidate = allowed.get(item && item.fileID);
    const url = item && Number(item.status) === 0 ? safeHttpsUrl(item.tempFileURL) : '';
    if (candidate && url && !resolved.has(candidate.storage_file_id))
      resolved.set(candidate.storage_file_id, url);
  }
  const photos = candidates
    .filter((item) => item.source === 'user' && resolved.has(item.storage_file_id))
    .map((item) => ({
      url: resolved.get(item.storage_file_id),
      category: item.category,
      source: 'user',
    }));
  const avatar = candidates.find((item) => item.source === 'avatar');
  return {
    photos,
    avatar_url: avatar ? resolved.get(avatar.storage_file_id) || '' : '',
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
  const gatheringMode = registration && registration.options && registration.options.gathering_mode;
  if (['self_drive', 'support_vehicle'].includes(gatheringMode)) {
    safe.options.gathering_mode = gatheringMode;
  }
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
    gender: normalizeGender(
      typeof value.gender === 'string'
        ? value.gender
        : typeof safe.profile_snapshot.gender === 'string'
          ? safe.profile_snapshot.gender
          : '',
    ),
    phone_source: ['wechat', 'manual', 'legacy'].includes(safe.profile_snapshot.phone_source)
      ? safe.profile_snapshot.phone_source
      : '',
    phone_verified: safe.profile_snapshot.phone_verified === true,
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
    gender: normalizeGender(value.gender),
    photos,
    strava: pick(value.strava, SOCIAL_STRAVA_FIELDS),
  };
}

async function adminCapabilityDetail({
  authorize,
  loadRegistration,
  loadProfile,
  loadMediaRecords,
  getTempFileURL,
  mediaSecret,
  projectRegistration,
}) {
  await authorize();
  const registration = await loadRegistration();
  if (!registration) return undefined;
  const profile = registration.openid ? await loadProfile(registration.openid) : undefined;
  const mediaRecords = registration.openid
    ? await loadMediaRecords(registration.openid, profile)
    : [];
  const resolvedMedia = await resolveAdminCapabilityMedia(
    profile,
    mediaRecords,
    registration.openid,
    getTempFileURL,
    mediaSecret,
  );
  return adminCapabilityView(projectRegistration(registration), profile, resolvedMedia);
}

module.exports = {
  adminCapabilityMedia,
  resolveAdminCapabilityMedia,
  adminCapabilityView,
  socialCapabilityView,
  adminCapabilityDetail,
};
