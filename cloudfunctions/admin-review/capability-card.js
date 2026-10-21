'use strict';

const crypto = require('node:crypto');
const { normalizeGender, publicRegistration } = require('./domain');
const {
  visibleProfile,
  projectPrivateRegistration,
  registrationContactProfile,
} = require('./domain/privacy');

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
  'emergency_name',
  'emergency_phone_masked',
];

function decryptPhone(cipher, keyValue) {
  let key;
  try {
    key = Buffer.from(keyValue || '', 'base64');
  } catch {
    key = Buffer.alloc(0);
  }
  if (key.length !== 32)
    throw Object.assign(new Error('资料加密服务未配置'), { code: 'PII_KEY_INVALID' });
  if (
    !cipher ||
    cipher.alg !== 'A256GCM' ||
    typeof cipher.iv !== 'string' ||
    typeof cipher.tag !== 'string' ||
    typeof cipher.ciphertext !== 'string'
  )
    return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(cipher.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(cipher.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(cipher.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw Object.assign(new Error('手机号解密失败'), { code: 'PII_DECRYPT_FAILED' });
  }
}

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
  const value = visibleProfile(profile) || {};
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
  const background = value.background_photo;
  const currentBackground =
    background &&
    typeof background === 'object' &&
    safeCloudFileId(background.file_id) &&
    PROFILE_PHOTO_CATEGORIES.has(background.category) &&
    registered(background.file_id, background.category)
      ? [
          {
            source_file_id: background.file_id,
            file_id: background.file_id,
            storage_file_id: canonicalFileId(
              records.get(background.file_id),
              background.file_id,
              ownerOpenid,
              mediaSecret,
            ),
            category: background.category,
            source: 'user',
            visibility: 'private',
          },
        ]
      : [];
  const ordered = [
    ...currentBackground,
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

function adminCapabilityView(registration, profile, resolvedMedia, piiKey) {
  const rawRegistration = registration;
  registration = projectPrivateRegistration(registration, profile);
  const suppressed = registration.profile_snapshot !== rawRegistration?.profile_snapshot;
  const contact = registrationContactProfile(rawRegistration, profile);
  profile = suppressed ? contact : visibleProfile(profile);
  if (suppressed) resolvedMedia = {};
  const safe = pick(registration, ADMIN_REGISTRATION_FIELDS);
  safe.options = pick(registration && registration.options, ADMIN_OPTION_FIELDS);
  const gatheringMode = registration && registration.options && registration.options.gathering_mode;
  if (['self_drive', 'support_vehicle'].includes(gatheringMode)) {
    safe.options.gathering_mode = gatheringMode;
  }
  safe.profile_snapshot = pick(registration && registration.profile_snapshot, ADMIN_PROFILE_FIELDS);
  safe.review_history = Array.isArray(registration && registration.review_history)
    ? registration.review_history.map((item) => pick(item, ['reviewed_at', 'action', 'comment']))
    : [];

  const media = safeResolvedMedia(resolvedMedia);
  const value = profile && typeof profile === 'object' ? profile : {};
  // 审核管理员查看完整实名与联系方式；*_masked 字段仅为旧客户端兼容保留。
  const realName =
    piiKey && value.real_name_cipher ? decryptPhone(value.real_name_cipher, piiKey) : '';
  if (realName) safe.profile_snapshot.real_name = realName;
  const phone = piiKey && value.phone_cipher ? decryptPhone(value.phone_cipher, piiKey) : '';
  if (phone) safe.profile_snapshot.phone = phone;
  const emergencyPhone =
    piiKey && value.emergency_phone_cipher
      ? decryptPhone(value.emergency_phone_cipher, piiKey)
      : '';
  if (emergencyPhone) safe.profile_snapshot.emergency_phone = emergencyPhone;
  if (typeof value.emergency_name === 'string')
    safe.profile_snapshot.emergency_name = value.emergency_name;
  const profilePhoneSource = ['wechat', 'manual', 'legacy'].includes(value.phone_source)
    ? value.phone_source
    : value.phone_cipher
      ? 'legacy'
      : '';
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
    phone_source: phone
      ? profilePhoneSource
      : ['wechat', 'manual', 'legacy'].includes(safe.profile_snapshot.phone_source)
        ? safe.profile_snapshot.phone_source
        : '',
    phone_verified: phone
      ? value.phone_verified === true
      : safe.profile_snapshot.phone_verified === true,
    photos: media.photos,
    avatar_url: media.avatar_url,
  };
  return safe;
}

function socialCapabilityView(profile, resolvedMedia) {
  const value = visibleProfile(profile) || {};
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
  };
}

async function adminCapabilityDetail({
  authorize,
  loadRegistration,
  loadProfile,
  loadMediaRecords,
  getTempFileURL,
  mediaSecret,
  piiKey,
  requirePhoneKey = false,
  projectRegistration,
}) {
  await authorize();
  const registration = await loadRegistration();
  if (!registration) return undefined;
  const profile = registration.openid ? await loadProfile(registration.openid) : undefined;
  const suppressed =
    projectPrivateRegistration(registration, profile).profile_snapshot !==
    registration.profile_snapshot;
  const mediaProfile = suppressed ? {} : visibleProfile(profile);
  if (
    requirePhoneKey &&
    profile &&
    (profile.real_name_cipher || profile.phone_cipher || profile.emergency_phone_cipher)
  ) {
    if (profile.real_name_cipher) decryptPhone(profile.real_name_cipher, piiKey);
    if (profile.phone_cipher) decryptPhone(profile.phone_cipher, piiKey);
    if (profile.emergency_phone_cipher) decryptPhone(profile.emergency_phone_cipher, piiKey);
  }
  const mediaRecords = registration.openid
    ? await loadMediaRecords(registration.openid, mediaProfile)
    : [];
  const resolvedMedia = await resolveAdminCapabilityMedia(
    mediaProfile,
    mediaRecords,
    registration.openid,
    getTempFileURL,
    mediaSecret,
  );
  const projected = projectRegistration(projectPrivateRegistration(registration, profile));
  return adminCapabilityView(
    {
      ...projected,
      privacy_generation: registration.privacy_generation,
      profile_generation: registration.profile_generation,
      privacy_contact: registration.privacy_contact,
    },
    profile,
    resolvedMedia,
    piiKey,
  );
}

// 管理列表项：复用与详情一致的公开投影 + 实名/手机号解密，但不签发媒体临时地址。
// 列表只展示身份与状态，照片仍由进入详情后按需签发。
function adminRegistrationListItem(registration, profile, piiKey) {
  try {
    return adminCapabilityView(
      {
        ...publicRegistration(registration),
        privacy_generation: registration.privacy_generation,
        profile_generation: registration.profile_generation,
        privacy_contact: registration.privacy_contact,
      },
      profile,
      { photos: [], avatar_url: '' },
      piiKey,
    );
  } catch (error) {
    // 单个用户密文损坏或密钥不可用时 fail closed：该项不回退明文，列表其余用户不受影响。
    if (error && typeof error.code === 'string' && error.code.startsWith('PII_')) {
      return publicRegistration(projectPrivateRegistration(registration, profile));
    }
    throw error;
  }
}

// 管理列表编排：先鉴权（非管理员在读取任何报名前拒绝），再批量取 profiles 并按详情同链路解密。
async function adminRegistrationList({ authorize, listRegistrations, loadProfiles, piiKey }) {
  await authorize();
  const registrations = await listRegistrations();
  const safeRegistrations = Array.isArray(registrations) ? registrations : [];
  const openids = [
    ...new Set(
      safeRegistrations
        .map((registration) => registration && registration.openid)
        .filter((openid) => typeof openid === 'string' && openid),
    ),
  ];
  const profileMap = await loadProfiles(openids);
  return safeRegistrations.map((registration) =>
    adminRegistrationListItem(
      registration,
      registration.openid ? profileMap.get(registration.openid) : undefined,
      piiKey,
    ),
  );
}

module.exports = {
  adminCapabilityMedia,
  resolveAdminCapabilityMedia,
  adminCapabilityView,
  adminRegistrationListItem,
  adminRegistrationList,
  socialCapabilityView,
  adminCapabilityDetail,
};
