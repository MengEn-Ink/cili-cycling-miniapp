'use strict';
const crypto = require('node:crypto');
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
function response(doc = {}) {
  const status = sensitiveStatus(doc);
  const emergencyReady =
    typeof doc.emergency_name === 'string' && !!doc.emergency_name.trim() && status.emergency_phone;
  const nicknameReady = typeof doc.nickname === 'string' && !!doc.nickname.trim();
  const checks = [nicknameReady, status.real_name, status.phone, emergencyReady];
  return {
    nickname: typeof doc.nickname === 'string' ? doc.nickname : '',
    title: typeof doc.title === 'string' ? doc.title : '',
    avatar_file_id: typeof doc.avatar_file_id === 'string' ? doc.avatar_file_id : '',
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
function buildUpdate(event, keyValue) {
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
  const data = {};
  for (const [input, output, max] of [
    ['nickname', 'nickname', 40],
    ['gender', 'gender', 20],
    ['emergency_name', 'emergency_name', 40],
    ['avatar_file_id', 'avatar_file_id', 512],
  ]) {
    const value = cleanText(event[input], max);
    if (value !== undefined) data[output] = value;
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
const PRIORITY_PHOTO_CATEGORIES = new Set([
  'ride',
  'bike',
  'riding',
  'cycling',
  'training',
  'workout',
  '骑行',
  '骑行照',
  '训练',
  '训练照',
]);
function safeFileId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length <= 512 ? text : '';
}
function selectCapabilityPhotos(profile = {}) {
  const seen = new Set();
  const uploaded = Array.isArray(profile.photos)
    ? profile.photos
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({
          file_id: safeFileId(item.file_id),
          category: typeof item.category === 'string' ? item.category : '',
          source: 'upload',
          priority: PRIORITY_PHOTO_CATEGORIES.has(String(item.category || '').toLowerCase())
            ? 0
            : 1,
          index,
        }))
        .filter((item) => item.file_id)
        .sort((a, b) => a.priority - b.priority || a.index - b.index)
    : [];
  const candidates = [
    ...uploaded,
    {
      file_id: safeFileId(profile.avatar_file_id),
      category: 'avatar',
      source: 'avatar',
      priority: 2,
    },
  ];
  return candidates
    .filter((item) => item.file_id && !seen.has(item.file_id) && seen.add(item.file_id))
    .slice(0, 3)
    .map(({ file_id, category, source }) => ({ file_id, category, source }));
}
function safeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function safeMetric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function capabilityCard(profile = {}, credential, snapshot, hasActiveOAuthState = false) {
  let state = 'disconnected';
  let error = null;
  if (!credential) state = hasActiveOAuthState ? 'authorizing' : 'disconnected';
  else if (credential.sync_status === 'failed') {
    state = 'failed';
    error = { message: 'Strava 数据准备失败，请重试', retryable: true };
  } else if (credential.sync_status === 'ready' && snapshot) state = 'ready';
  else state = 'syncing';
  const metrics = snapshot
    ? {
        total_km: safeMetric(snapshot.total_km),
        rides: safeMetric(snapshot.activities_90d),
        longest_km: safeMetric(snapshot.longest_km),
        elevation_m: safeMetric(snapshot.total_elevation_m),
        speed_kmh: safeMetric(snapshot.weighted_avg_speed_kmh),
        latest_activity_at: safeDate(snapshot.latest_activity_at),
        synced_at: safeDate(snapshot.synced_at),
      }
    : null;
  return {
    nickname: typeof profile.nickname === 'string' ? profile.nickname : '',
    avatar_file_id: safeFileId(profile.avatar_file_id),
    photos: selectCapabilityPhotos(profile),
    period: { days: 90, label: '90天汇总' },
    metrics,
    readiness: { state, error },
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
  selectCapabilityPhotos,
  capabilityCard,
  writableDocument,
  toError,
};
