'use strict';
const crypto = require('node:crypto');
const AVATAR_SOURCES = ['wechat', 'strava', 'custom'];
const CLIENT_AVATAR_SOURCES = ['wechat', 'custom'];
class ProfileError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function keyFrom(value) {
  let key;
  try {
    key = Buffer.from(value || '', 'base64');
  } catch {
    key = Buffer.alloc(0);
  }
  if (
    key.length !== 32 ||
    key.toString('base64').replace(/=+$/, '') !== String(value || '').replace(/=+$/, '')
  )
    throw new ProfileError('PII_KEY_INVALID', '资料加密服务未配置');
  return key;
}
function encrypt(value, keyValue) {
  const key = keyFrom(keyValue);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return {
    v: 1,
    alg: 'A256GCM',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}
function decrypt(value, keyValue) {
  const key = keyFrom(keyValue);
  if (
    !value ||
    value.alg !== 'A256GCM' ||
    typeof value.iv !== 'string' ||
    typeof value.tag !== 'string' ||
    typeof value.ciphertext !== 'string'
  )
    throw new ProfileError('PII_CIPHERTEXT_INVALID', '敏感资料密文无效');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new ProfileError('PII_DECRYPT_FAILED', '敏感资料无法解密');
  }
}
function maskName(value) {
  const text = String(value || '').trim();
  return text ? `${text[0]}${'*'.repeat(Math.max(1, text.length - 1))}` : '';
}
function maskPhone(value) {
  const text = String(value || '').replace(/\s/g, '');
  return text.length >= 7 ? `${text.slice(0, 3)}****${text.slice(-4)}` : '';
}
function cleanText(value, max, required = false) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ProfileError('VALIDATION_FAILED', '资料字段类型错误');
  const text = value.trim();
  if ((required && !text) || text.length > max)
    throw new ProfileError('VALIDATION_FAILED', '资料字段格式错误');
  return text;
}
function mediaSecret(value) {
  const secret = String(value || '').trim();
  if (secret.length < 32) throw new ProfileError('MEDIA_SECRET_INVALID', '媒体路径服务未配置');
  return secret;
}
function mediaOwnerPrefix(openid, secretValue) {
  if (typeof openid !== 'string' || !openid)
    throw new ProfileError('UNAUTHENTICATED', '无法取得微信身份');
  const alias = crypto
    .createHmac('sha256', mediaSecret(secretValue))
    .update(openid)
    .digest('hex')
    .slice(0, 32);
  return `profiles/${alias}/`;
}
function mediaDocumentId(fileId) {
  if (typeof fileId !== 'string' || !fileId)
    throw new ProfileError('VALIDATION_FAILED', '媒体文件 ID 无效');
  return crypto.createHash('sha256').update(fileId).digest('hex');
}
function avatarUrlFingerprint(value) {
  if (typeof value !== 'string' || !value)
    throw new ProfileError('STRAVA_AVATAR_URL_INVALID', 'Strava 头像地址无效');
  return crypto.createHash('sha256').update(value).digest('hex');
}
function issueMediaUploadPath(
  openid,
  secretValue,
  randomUUID = crypto.randomUUID,
  extension = 'jpg',
) {
  const filename = randomUUID();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(filename))
    throw new ProfileError('MEDIA_PATH_INVALID', '媒体路径生成失败');
  if (!['jpg', 'png', 'webp'].includes(extension))
    throw new ProfileError('MEDIA_TYPE_INVALID', '媒体类型无效');
  return { cloud_path: `${mediaOwnerPrefix(openid, secretValue)}${filename}.${extension}` };
}
function mediaPath(fileId) {
  if (typeof fileId !== 'string' || !fileId.startsWith('cloud://') || fileId.length > 512)
    return '';
  const slash = fileId.indexOf('/', 'cloud://'.length);
  return slash >= 0 ? fileId.slice(slash + 1) : '';
}
function isOwnerMedia(fileId, openid, secretValue) {
  const path = mediaPath(fileId);
  const prefix = mediaOwnerPrefix(openid, secretValue);
  const filename = path.slice(prefix.length);
  return (
    path.startsWith(prefix) &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:jpg|png|webp)$/i.test(
      filename,
    )
  );
}
function mediaRegistration(
  fileId,
  category,
  origin,
  openid,
  secretValue,
  now = new Date(),
  existing = undefined,
) {
  if (!['ride', 'bike', 'other'].includes(category))
    throw new ProfileError('VALIDATION_FAILED', '媒体类别无效');
  if (!AVATAR_SOURCES.includes(origin))
    throw new ProfileError('MEDIA_ORIGIN_INVALID', '媒体来源无效');
  if (!isOwnerMedia(fileId, openid, secretValue))
    throw new ProfileError('MEDIA_NOT_OWNED', '媒体文件不属于当前用户');
  const expected = {
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    owner_openid: openid,
    category,
    origin,
  };
  if (existing) {
    const legacyCustomOrigin =
      !Object.prototype.hasOwnProperty.call(existing, 'origin') && origin === 'custom';
    if (
      existing._id !== expected._id ||
      existing.file_id !== fileId ||
      existing.owner_openid !== openid ||
      existing.category !== category ||
      (existing.origin !== origin && !legacyCustomOrigin) ||
      !['unreferenced', 'active'].includes(existing.status)
    )
      throw new ProfileError('MEDIA_REGISTRATION_CONFLICT', '媒体登记冲突');
    return legacyCustomOrigin ? { ...existing, origin: 'custom' } : existing;
  }
  const createdAt = new Date(now);
  return {
    ...expected,
    status: 'unreferenced',
    created_at: createdAt,
    cleanup_after: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
  };
}
function clientAvatarSource(value) {
  if (!CLIENT_AVATAR_SOURCES.includes(value))
    throw new ProfileError('AVATAR_SOURCE_INVALID', '头像来源无效');
  return value;
}
function clientMediaOrigin(value) {
  const origin = value === undefined ? 'custom' : value;
  if (!CLIENT_AVATAR_SOURCES.includes(origin))
    throw new ProfileError('MEDIA_ORIGIN_INVALID', '媒体来源无效');
  return origin;
}
function validateAvatarSelection(source, fileId, openid, secretValue, record) {
  if (!AVATAR_SOURCES.includes(source))
    throw new ProfileError('AVATAR_SOURCE_INVALID', '头像来源无效');
  if (!record) throw new ProfileError('MEDIA_NOT_FOUND', '媒体登记不存在');
  if (
    !isOwnerMedia(fileId, openid, secretValue) ||
    record._id !== mediaDocumentId(fileId) ||
    record.file_id !== fileId ||
    record.owner_openid !== openid
  )
    throw new ProfileError('MEDIA_NOT_OWNED', '媒体文件不属于当前用户');
  if (!['unreferenced', 'active'].includes(record.status))
    throw new ProfileError('MEDIA_STATUS_INVALID', '媒体状态不可用');
  const legacyCustomOrigin =
    !Object.prototype.hasOwnProperty.call(record, 'origin') && source === 'custom';
  if (record.origin !== source && !legacyCustomOrigin)
    throw new ProfileError('MEDIA_ORIGIN_MISMATCH', '头像来源与媒体登记不一致');
  return legacyCustomOrigin ? { ...record, origin: 'custom' } : record;
}
function missingMediaSignal(value) {
  return /not[ _-]?found|not exist|does not exist|file not exist|404/i.test(String(value || ''));
}
async function inspectMediaObject(fileId, getTempFileURL) {
  let response;
  try {
    response = await getTempFileURL({ fileList: [fileId] });
  } catch (error) {
    if (missingMediaSignal(error?.code) || missingMediaSignal(error?.errMsg)) return 'missing';
    throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
  }
  const found = (Array.isArray(response && response.fileList) ? response.fileList : []).find(
    (item) => item && item.fileID === fileId,
  );
  if (!found) throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
  if (Number(found.status) !== 0) {
    if (missingMediaSignal(found.errMsg) || missingMediaSignal(found.code)) return 'missing';
    throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
  }
  try {
    if (new URL(found.tempFileURL).protocol === 'https:') return 'exists';
  } catch {
    // Normalize malformed platform responses below.
  }
  throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
}
async function verifyMediaObject(fileId, getTempFileURL) {
  if ((await inspectMediaObject(fileId, getTempFileURL)) === 'exists') return true;
  throw new ProfileError('MEDIA_OBJECT_NOT_FOUND', '媒体文件不存在');
}
function registeredMedia(record, item, openid, statuses = ['active']) {
  return Boolean(
    record &&
    item &&
    record._id === mediaDocumentId(item.file_id) &&
    record.file_id === item.file_id &&
    record.owner_openid === openid &&
    record.category === item.category &&
    statuses.includes(record.status),
  );
}
function validateMediaUpdate(current, update, openid, secretValue, mediaRecords = []) {
  const existing = current && typeof current === 'object' ? current : {};
  const normalizedExisting = normalizeAvatarProfile(existing);
  const data = update && typeof update === 'object' ? update : {};
  if (
    Object.prototype.hasOwnProperty.call(data, 'avatar_file_id') ||
    Object.prototype.hasOwnProperty.call(data, 'avatar_source')
  )
    throw new ProfileError('FORBIDDEN_FIELD', '头像必须通过专用操作更新');
  const records = new Map(mediaRecords.map((record) => [record && record.file_id, record]));
  const activate = new Set();
  const currentIds = new Set([
    existing.avatar_file_id,
    ...(Array.isArray(existing.photos) ? existing.photos.map((item) => item && item.file_id) : []),
  ]);
  const accept = (item, legacy) => {
    const record = records.get(item.file_id);
    if (
      isOwnerMedia(item.file_id, openid, secretValue) &&
      registeredMedia(record, item, openid, ['unreferenced', 'active'])
    ) {
      if (record.status === 'unreferenced') activate.add(record._id);
      return;
    }
    if (legacy) return;
    throw new ProfileError('MEDIA_NOT_OWNED', '媒体文件不属于当前用户');
  };
  if (Object.prototype.hasOwnProperty.call(data, 'photos')) {
    const legacy = new Set(
      (Array.isArray(existing.photos) ? existing.photos : []).map(
        (item) => `${item && item.file_id}\u0000${item && item.category}`,
      ),
    );
    for (const item of data.photos) {
      accept(
        item,
        legacy.has(`${item.file_id}\u0000${item.category}`) && !records.has(item.file_id),
      );
    }
  }
  const nextIds = new Set([
    normalizedExisting.avatar_file_id,
    ...(Object.prototype.hasOwnProperty.call(data, 'photos')
      ? data.photos.map((item) => item.file_id)
      : Array.isArray(existing.photos)
        ? existing.photos.map((item) => item && item.file_id)
        : []),
  ]);
  const demote = mediaRecords
    .filter(
      (record) =>
        record &&
        record.status === 'active' &&
        record.owner_openid === openid &&
        record._id === mediaDocumentId(record.file_id) &&
        isOwnerMedia(record.file_id, openid, secretValue) &&
        currentIds.has(record.file_id) &&
        !nextIds.has(record.file_id),
    )
    .map((record) => record._id);
  return { data, activate_ids: [...activate], demote_ids: demote };
}
function ownerMedia(profile, openid, secretValue, mediaRecords = []) {
  const value = normalizeAvatarProfile(profile && typeof profile === 'object' ? profile : {});
  const records = new Map(mediaRecords.map((record) => [record && record.file_id, record]));
  const photos = Array.isArray(value.photos)
    ? value.photos
        .filter(
          (item) =>
            item &&
            ['ride', 'bike', 'other'].includes(item.category) &&
            isOwnerMedia(item.file_id, openid, secretValue) &&
            registeredMedia(records.get(item.file_id), item, openid),
        )
        .map((item) => ({
          file_id: item.file_id,
          category: item.category,
          source: 'user_photo',
        }))
    : [];
  const ordered = [
    ...photos.filter((item) => item.category === 'ride' || item.category === 'bike'),
    ...photos.filter((item) => item.category === 'other'),
  ];
  const avatarRecord = records.get(value.avatar_file_id);
  const avatarOrigin =
    avatarRecord && Object.prototype.hasOwnProperty.call(avatarRecord, 'origin')
      ? avatarRecord.origin
      : 'custom';
  if (
    avatarOrigin === value.avatar_source &&
    isOwnerMedia(value.avatar_file_id, openid, secretValue) &&
    registeredMedia(
      avatarRecord,
      { file_id: value.avatar_file_id, category: avatarRecord && avatarRecord.category },
      openid,
    )
  ) {
    ordered.push({ file_id: value.avatar_file_id, category: 'other', source: 'avatar' });
  }
  const seen = new Set();
  return ordered.filter((item) => {
    if (seen.has(item.file_id) || seen.size >= 3) return false;
    seen.add(item.file_id);
    return true;
  });
}
function ownerAvatarMedia(profile, openid, secretValue, mediaRecords = []) {
  const value = normalizeAvatarProfile(profile && typeof profile === 'object' ? profile : {});
  if (!value.avatar_file_id || !value.avatar_source) return undefined;
  const record = mediaRecords.find((item) => item && item.file_id === value.avatar_file_id);
  const origin =
    record && Object.prototype.hasOwnProperty.call(record, 'origin') ? record.origin : 'custom';
  if (
    origin !== value.avatar_source ||
    !isOwnerMedia(value.avatar_file_id, openid, secretValue) ||
    !registeredMedia(
      record,
      { file_id: value.avatar_file_id, category: record && record.category },
      openid,
    )
  )
    return undefined;
  return { file_id: value.avatar_file_id, category: 'other', source: 'avatar' };
}
const sensitiveStatus = (doc) => ({
  real_name: !!doc.real_name_cipher,
  phone: !!doc.phone_cipher,
  phone_verified: doc.phone_verified === true,
  phone_source: ['wechat', 'manual'].includes(doc.phone_source)
    ? doc.phone_source
    : doc.phone_cipher
      ? 'legacy'
      : '',
  emergency_phone: !!doc.emergency_phone_cipher,
});
function normalizeAvatarProfile(doc = {}) {
  const normalized = { ...doc };
  const rawAvatarFileId =
    typeof doc.avatar_file_id === 'string' && doc.avatar_file_id.trim() ? doc.avatar_file_id : '';
  const hasAvatarSource = Object.prototype.hasOwnProperty.call(doc, 'avatar_source');
  const validAvatarSource = !hasAvatarSource || AVATAR_SOURCES.includes(doc.avatar_source);
  if (!rawAvatarFileId || !mediaPath(rawAvatarFileId) || !validAvatarSource) {
    delete normalized.avatar_file_id;
    delete normalized.avatar_source;
    return normalized;
  }
  normalized.avatar_file_id = rawAvatarFileId;
  normalized.avatar_source = hasAvatarSource ? doc.avatar_source : 'custom';
  return normalized;
}
function response(doc = {}) {
  const status = sensitiveStatus(doc);
  const emergencyReady =
    typeof doc.emergency_name === 'string' && !!doc.emergency_name.trim() && status.emergency_phone;
  const nicknameReady = typeof doc.nickname === 'string' && !!doc.nickname.trim();
  const checks = [nicknameReady, status.real_name, status.phone, emergencyReady];
  const avatar = normalizeAvatarProfile(doc);
  const avatarFileId = avatar.avatar_file_id || '';
  const avatarSource = avatar.avatar_source;
  return {
    nickname: typeof doc.nickname === 'string' ? doc.nickname : '',
    title: typeof doc.title === 'string' ? doc.title : '',
    avatar_file_id: avatarFileId,
    ...(avatarSource ? { avatar_source: avatarSource } : {}),
    has_completed_guidance: doc.has_completed_guidance === true,
    avatar_revision:
      Number.isSafeInteger(doc.avatar_revision) && doc.avatar_revision >= 0
        ? doc.avatar_revision
        : 0,
    photos: Array.isArray(doc.photos) ? doc.photos : [],
    gender: typeof doc.gender === 'string' ? doc.gender : '',
    emergency_name: typeof doc.emergency_name === 'string' ? doc.emergency_name : '',
    real_name_masked: typeof doc.real_name_masked === 'string' ? doc.real_name_masked : '',
    phone_masked: typeof doc.phone_masked === 'string' ? doc.phone_masked : '',
    emergency_phone_masked:
      typeof doc.emergency_phone_masked === 'string' ? doc.emergency_phone_masked : '',
    sensitive_status: status,
    completeness: Math.round((checks.filter(Boolean).length / checks.length) * 100),
  };
}
function buildUpdate(event, keyValue, current = {}) {
  keyFrom(keyValue);
  for (const forbidden of [
    'openid',
    'title',
    'phone_cipher',
    'phone_source',
    'phone_verified',
    'real_name_cipher',
    'emergency_phone_cipher',
    // 存量证件密文保持只读兼容：不解密、不回传，也不要求资料更新时主动删除。
    'id_type',
    'id_number',
    'id_number_cipher',
    'id_number_masked',
  ])
    if (Object.prototype.hasOwnProperty.call(event, forbidden))
      throw new ProfileError('FORBIDDEN_FIELD', '包含禁止字段');
  const hasAvatarFileId = Object.prototype.hasOwnProperty.call(event, 'avatar_file_id');
  const hasAvatarSource = Object.prototype.hasOwnProperty.call(event, 'avatar_source');
  const currentAvatar = normalizeAvatarProfile(current);
  const legacyEmptyAvatar =
    hasAvatarFileId &&
    hasAvatarSource &&
    event.avatar_file_id === '' &&
    event.avatar_source === 'wechat' &&
    !currentAvatar.avatar_file_id &&
    !currentAvatar.avatar_source;
  if (!legacyEmptyAvatar && hasAvatarSource) {
    if (!currentAvatar.avatar_source || event.avatar_source !== currentAvatar.avatar_source)
      throw new ProfileError('FORBIDDEN_FIELD', '头像必须通过专用操作更新');
  }
  if (!legacyEmptyAvatar && hasAvatarFileId) {
    if (!currentAvatar.avatar_file_id || event.avatar_file_id !== currentAvatar.avatar_file_id)
      throw new ProfileError('FORBIDDEN_FIELD', '头像必须通过专用操作更新');
  }
  const data = {};
  for (const [input, output, max] of [
    ['nickname', 'nickname', 40],
    ['gender', 'gender', 20],
    ['emergency_name', 'emergency_name', 40],
  ]) {
    const value = cleanText(event[input], max);
    if (value !== undefined) data[output] = value;
  }
  if (typeof event.has_completed_guidance === 'boolean') {
    data.has_completed_guidance = event.has_completed_guidance;
  }
  if (event.photos !== undefined) {
    if (
      !Array.isArray(event.photos) ||
      event.photos.length > 30 ||
      event.photos.some(
        (item) =>
          !item ||
          typeof item.file_id !== 'string' ||
          !['ride', 'bike', 'other'].includes(item.category),
      )
    )
      throw new ProfileError('VALIDATION_FAILED', '照片资料格式错误');
    data.photos = event.photos.map((item) => ({ file_id: item.file_id, category: item.category }));
  }
  for (const [input, cipherField, maskedField, masker, max] of [
    ['real_name', 'real_name_cipher', 'real_name_masked', maskName, 80],
    ['emergency_phone', 'emergency_phone_cipher', 'emergency_phone_masked', maskPhone, 30],
  ]) {
    const value = cleanText(event[input], max, true);
    if (value !== undefined) {
      data[cipherField] = encrypt(value, keyValue);
      data[maskedField] = masker(value);
    }
  }
  const phone = cleanText(event.phone, 30, true);
  if (phone !== undefined) Object.assign(data, phoneUpdate(phone, keyValue, 'manual'));
  return data;
}
function phoneUpdate(phone, keyValue, source = 'wechat') {
  const value = cleanText(phone, 30, true);
  if (!/^\+?[0-9]{7,20}$/.test(value)) throw new ProfileError('PHONE_INVALID', '手机号格式错误');
  if (!['wechat', 'manual'].includes(source))
    throw new ProfileError('PHONE_SOURCE_INVALID', '手机号来源无效');
  return {
    phone_cipher: encrypt(value, keyValue),
    phone_masked: maskPhone(value),
    phone_source: source,
    phone_verified: source === 'wechat',
  };
}
function writableDocument(value) {
  const { _id, ...document } = value;
  return document;
}
function toError(error) {
  return {
    ok: false,
    error: {
      code: error instanceof ProfileError ? error.code : 'INTERNAL_ERROR',
      message: error instanceof ProfileError ? error.message : '服务暂时不可用',
      ...(error instanceof ProfileError
        ? {}
        : { cause_code: String(error?.errCode || error?.code || error?.name || 'unknown') }),
    },
  };
}
module.exports = {
  ProfileError,
  keyFrom,
  encrypt,
  decrypt,
  maskName,
  maskPhone,
  response,
  buildUpdate,
  phoneUpdate,
  issueMediaUploadPath,
  mediaOwnerPrefix,
  mediaDocumentId,
  avatarUrlFingerprint,
  mediaRegistration,
  clientAvatarSource,
  clientMediaOrigin,
  validateAvatarSelection,
  inspectMediaObject,
  verifyMediaObject,
  isOwnerMedia,
  mediaPath,
  registeredMedia,
  validateMediaUpdate,
  ownerMedia,
  ownerAvatarMedia,
  normalizeAvatarProfile,
  writableDocument,
  toError,
};
