'use strict';
const crypto = require('node:crypto');
const https = require('node:https');
const AVATAR_SOURCES = ['wechat', 'strava', 'custom'];
const CLIENT_AVATAR_SOURCES = ['wechat', 'custom'];
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const CLIENT_UPLOAD_INTENT_MS = 30 * 60 * 1000;
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
function compatibleRandomUUID() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function issueMediaUploadPath(
  openid,
  secretValue,
  randomUUID = compatibleRandomUUID,
  extension = 'jpg',
) {
  const filename = randomUUID();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(filename))
    throw new ProfileError('MEDIA_PATH_INVALID', '媒体路径生成失败');
  if (!['jpg', 'png', 'webp'].includes(extension))
    throw new ProfileError('MEDIA_TYPE_INVALID', '媒体类型无效');
  return { cloud_path: `${mediaOwnerPrefix(openid, secretValue)}${filename}.${extension}` };
}
function clientUploadIntentId(cloudPath) {
  if (typeof cloudPath !== 'string' || !cloudPath)
    throw new ProfileError('MEDIA_PATH_INVALID', '媒体路径无效');
  return `client-upload-${crypto.createHash('sha256').update(cloudPath).digest('hex')}`;
}
function clientUploadIntent(openid, cloudPath, secretValue, now = new Date()) {
  if (!isOwnerMedia(`cloud://intent/${cloudPath}`, openid, secretValue))
    throw new ProfileError('MEDIA_NOT_OWNED', '媒体文件不属于当前用户');
  const createdAt = new Date(now);
  if (!Number.isFinite(createdAt.getTime()))
    throw new ProfileError('MEDIA_PATH_INVALID', '媒体路径无效');
  return {
    _id: clientUploadIntentId(cloudPath),
    kind: 'client_upload',
    owner_openid: openid,
    cloud_path: cloudPath,
    status: 'prepared',
    created_at: createdAt,
    cleanup_after: new Date(createdAt.getTime() + CLIENT_UPLOAD_INTENT_MS),
  };
}
function canonicalMediaPath(openid, sourceFileId, sha256, extension, secretValue) {
  if (!isOwnerMedia(sourceFileId, openid, secretValue))
    throw new ProfileError('MEDIA_NOT_OWNED', '媒体文件不属于当前用户');
  if (!/^[a-f0-9]{64}$/.test(sha256) || !['jpg', 'png', 'webp'].includes(extension))
    throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '媒体版本无效');
  const ownerAlias = mediaOwnerPrefix(openid, secretValue).split('/')[1];
  const sourceDigest = mediaDocumentId(sourceFileId);
  return `profile-canonical/${ownerAlias}/${sourceDigest}/${sha256}.${extension}`;
}
function isOwnerCanonicalMedia(fileId, openid, secretValue) {
  const path = mediaPath(fileId);
  const ownerAlias = mediaOwnerPrefix(openid, secretValue).split('/')[1];
  return new RegExp(
    `^profile-canonical/${ownerAlias}/[a-f0-9]{64}/[a-f0-9]{64}\\.(?:jpg|png|webp)$`,
    'i',
  ).test(path);
}
function canonicalUploadIntentId(canonicalPath) {
  if (typeof canonicalPath !== 'string' || !canonicalPath)
    throw new ProfileError('MEDIA_PATH_INVALID', '媒体路径无效');
  return `canonical-upload-${crypto.createHash('sha256').update(canonicalPath).digest('hex')}`;
}
function canonicalMediaBinding(openid, sourceFileId, canonicalFileId, verified, secretValue) {
  const mimeExtensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = mimeExtensions[verified?.mime];
  if (
    !isOwnerMedia(sourceFileId, openid, secretValue) ||
    !extension ||
    verified?.extension !== extension ||
    !/^[a-f0-9]{64}$/.test(verified?.sha256 || '') ||
    !Number.isSafeInteger(verified?.size) ||
    verified.size <= 0 ||
    verified.size > MAX_PROFILE_IMAGE_BYTES
  )
    throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '媒体版本无效');
  const expectedPath = canonicalMediaPath(
    openid,
    sourceFileId,
    verified.sha256,
    extension,
    secretValue,
  );
  if (
    !isOwnerCanonicalMedia(canonicalFileId, openid, secretValue) ||
    mediaPath(canonicalFileId) !== expectedPath
  )
    throw new ProfileError('MEDIA_CANONICAL_MISMATCH', '媒体规范副本无效');
  return {
    source_file_id: sourceFileId,
    canonical_file_id: canonicalFileId,
    sha256: verified.sha256,
    size: verified.size,
    mime: verified.mime,
  };
}
function canonicalUploadIntent(openid, sourceFileId, verified, secretValue, now = new Date()) {
  const cloudPath = canonicalMediaPath(
    openid,
    sourceFileId,
    verified?.sha256,
    verified?.extension,
    secretValue,
  );
  if (
    !Number.isSafeInteger(verified?.size) ||
    verified.size <= 0 ||
    verified.size > MAX_PROFILE_IMAGE_BYTES ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(verified?.mime)
  )
    throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '媒体版本无效');
  const createdAt = new Date(now);
  return {
    _id: canonicalUploadIntentId(cloudPath),
    kind: 'canonical_upload',
    owner_openid: openid,
    source_file_id: sourceFileId,
    cloud_path: cloudPath,
    sha256: verified.sha256,
    size: verified.size,
    mime: verified.mime,
    status: 'prepared',
    created_at: createdAt,
    cleanup_after: new Date(createdAt.getTime() + CLIENT_UPLOAD_INTENT_MS),
  };
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
  canonical = undefined,
) {
  if (!['ride', 'bike', 'other'].includes(category))
    throw new ProfileError('VALIDATION_FAILED', '媒体类别无效');
  if (!AVATAR_SOURCES.includes(origin))
    throw new ProfileError('MEDIA_ORIGIN_INVALID', '媒体来源无效');
  if (!isOwnerMedia(fileId, openid, secretValue))
    throw new ProfileError('MEDIA_NOT_OWNED', '媒体文件不属于当前用户');
  const binding = canonical
    ? canonicalMediaBinding(
        openid,
        fileId,
        canonical.canonical_file_id,
        {
          sha256: canonical.sha256,
          size: canonical.size,
          mime: canonical.mime,
          extension: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[
            canonical.mime
          ],
        },
        secretValue,
      )
    : {};
  const expected = {
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    owner_openid: openid,
    category,
    origin,
    ...binding,
  };
  if (existing) {
    const legacyCustomOrigin =
      !Object.prototype.hasOwnProperty.call(existing, 'origin') && origin === 'custom';
    const canonicalFields = ['source_file_id', 'canonical_file_id', 'sha256', 'size', 'mime'];
    const hasAnyCanonical = canonicalFields.some((field) =>
      Object.prototype.hasOwnProperty.call(existing, field),
    );
    if (
      existing._id !== expected._id ||
      existing.file_id !== fileId ||
      existing.owner_openid !== openid ||
      existing.category !== category ||
      (existing.origin !== origin && !legacyCustomOrigin) ||
      (canonical &&
        hasAnyCanonical &&
        canonicalFields.some((field) => existing[field] !== expected[field])) ||
      !['unreferenced', 'active'].includes(existing.status)
    )
      throw new ProfileError('MEDIA_REGISTRATION_CONFLICT', '媒体登记冲突');
    return {
      ...existing,
      ...(legacyCustomOrigin ? { origin: 'custom' } : {}),
      ...(!hasAnyCanonical && canonical ? binding : {}),
    };
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
async function resolveMediaObject(fileId, getTempFileURL) {
  let response;
  try {
    response = await getTempFileURL({ fileList: [fileId] });
  } catch (error) {
    if (missingMediaSignal(error?.code) || missingMediaSignal(error?.errMsg))
      return { state: 'missing' };
    throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
  }
  const found = (Array.isArray(response && response.fileList) ? response.fileList : []).find(
    (item) => item && item.fileID === fileId,
  );
  if (!found) throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
  if (Number(found.status) !== 0) {
    if (missingMediaSignal(found.errMsg) || missingMediaSignal(found.code))
      return { state: 'missing' };
    throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
  }
  try {
    const url = new URL(found.tempFileURL);
    if (url.protocol === 'https:' && !url.username && !url.password)
      return { state: 'exists', tempFileURL: url.toString() };
  } catch {
    // Normalize malformed platform responses below.
  }
  throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
}
async function inspectMediaObject(fileId, getTempFileURL) {
  return (await resolveMediaObject(fileId, getTempFileURL)).state;
}
async function verifyMediaObject(fileId, getTempFileURL) {
  const resolved = await resolveMediaObject(fileId, getTempFileURL);
  if (resolved.state === 'exists') return resolved.tempFileURL;
  throw new ProfileError('MEDIA_OBJECT_NOT_FOUND', '媒体文件不存在');
}

const MEDIA_VERIFY_ATTEMPTS = 4;
const MEDIA_VERIFY_DELAY_MS = 100;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
// 云存储对象在上传完成后可能短暂不可见：仅对“对象不存在 / 暂不可确认”做有界重试，
// 总等待约 600ms；其余错误（如鉴权失败）不属传播延迟，必须立即抛出（fail closed）。
async function verifyUploadedMedia(fileId, getTempFileURL, wait = sleep) {
  let lastError;
  for (let attempt = 0; attempt < MEDIA_VERIFY_ATTEMPTS; attempt += 1) {
    try {
      return await verifyMediaObject(fileId, getTempFileURL);
    } catch (error) {
      lastError = error;
      if (!['MEDIA_OBJECT_NOT_FOUND', 'MEDIA_OBJECT_VERIFY_FAILED'].includes(error?.code))
        throw error;
      if (attempt + 1 < MEDIA_VERIFY_ATTEMPTS) await wait(MEDIA_VERIFY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError;
}
function hasImageMagic(content) {
  return (
    (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) ||
    (content.length >= 8 &&
      content.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
    (content.length >= 12 &&
      content.subarray(0, 4).toString('ascii') === 'RIFF' &&
      content.subarray(8, 12).toString('ascii') === 'WEBP')
  );
}
const MEDIA_OBJECT_VERIFY_TIMEOUT_MS = 5000;
const IMAGE_MAGIC_BYTES = 12;
function contentLength(headers) {
  const raw = headers?.['content-length'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return undefined;
  const size = Number(value);
  return Number.isSafeInteger(size) && size >= 0 ? size : undefined;
}
function boundedMediaRequest(url, method, options = {}) {
  const requestFactory = options.requestFactory || https.request;
  const maxBytes = options.maxBytes ?? MAX_PROFILE_IMAGE_BYTES;
  const timeoutMs = options.timeoutMs ?? MEDIA_OBJECT_VERIFY_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    let response;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      const error = new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
      finish(error);
      request?.destroy(error);
      response?.destroy?.(error);
    }, timeoutMs);
    try {
      request = requestFactory(
        url,
        { method, headers: { accept: 'image/jpeg,image/png,image/webp' } },
        (incoming) => {
          response = incoming;
          request.setTimeout?.(0);
          const statusCode = Number(incoming.statusCode || 0);
          const declared = contentLength(incoming.headers);
          if (statusCode !== 200) {
            finish(new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件'));
            incoming.destroy?.();
            return;
          }
          if (declared !== undefined && declared > maxBytes) {
            const error = new ProfileError('MEDIA_OBJECT_TOO_LARGE', '图片不能超过 5MB');
            finish(error);
            incoming.destroy?.();
            return;
          }
          let size = 0;
          let prefix = Buffer.alloc(0);
          const chunks = [];
          incoming.on('data', (chunk) => {
            if (settled) return;
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > maxBytes) {
              const error = new ProfileError('MEDIA_OBJECT_TOO_LARGE', '图片不能超过 5MB');
              finish(error);
              incoming.destroy?.();
              return;
            }
            if (prefix.length < IMAGE_MAGIC_BYTES) {
              prefix = Buffer.concat([
                prefix,
                buffer.subarray(0, IMAGE_MAGIC_BYTES - prefix.length),
              ]);
            }
            if (method === 'GET') chunks.push(buffer);
          });
          incoming.on('end', () =>
            finish(null, {
              statusCode,
              headers: incoming.headers || {},
              size,
              prefix,
              bytes: method === 'GET' ? Buffer.concat(chunks, size) : undefined,
            }),
          );
          incoming.on('error', (error) => finish(error));
        },
      );
      request.setTimeout?.(timeoutMs, () => {
        const error = new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
        finish(error);
        request.destroy?.(error);
      });
      request.on('error', (error) => finish(error));
      request.end();
    } catch (error) {
      finish(error);
    }
  });
}
async function verifyUploadedImageObject(tempFileURL, options = {}) {
  let url;
  try {
    url = new URL(tempFileURL);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('untrusted temporary url');
  } catch {
    throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
  }
  const maxBytes = options.maxBytes ?? MAX_PROFILE_IMAGE_BYTES;
  const totalTimeoutMs = options.totalTimeoutMs ?? MEDIA_OBJECT_VERIFY_TIMEOUT_MS;
  const now = options.now || Date.now;
  const startedAt = now();
  try {
    const head = await boundedMediaRequest(url, 'HEAD', {
      requestFactory: options.requestFactory,
      maxBytes,
      timeoutMs: totalTimeoutMs,
    });
    const declared = contentLength(head.headers);
    if (declared === undefined)
      throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
    if (declared > maxBytes) throw new ProfileError('MEDIA_OBJECT_TOO_LARGE', '图片不能超过 5MB');
    const remainingMs = totalTimeoutMs - (now() - startedAt);
    if (remainingMs <= 0)
      throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
    const body = await boundedMediaRequest(url, 'GET', {
      requestFactory: options.requestFactory,
      maxBytes,
      timeoutMs: remainingMs,
    });
    const type =
      body.prefix.length >= 3 &&
      body.prefix[0] === 0xff &&
      body.prefix[1] === 0xd8 &&
      body.prefix[2] === 0xff
        ? { mime: 'image/jpeg', extension: 'jpg' }
        : body.prefix.length >= 8 &&
            body.prefix.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
          ? { mime: 'image/png', extension: 'png' }
          : body.prefix.length >= 12 &&
              body.prefix.subarray(0, 4).toString('ascii') === 'RIFF' &&
              body.prefix.subarray(8, 12).toString('ascii') === 'WEBP'
            ? { mime: 'image/webp', extension: 'webp' }
            : undefined;
    if (!type || !hasImageMagic(body.prefix))
      throw new ProfileError('MEDIA_OBJECT_TYPE_INVALID', '图片格式无效');
    return {
      bytes: body.bytes,
      sha256: crypto.createHash('sha256').update(body.bytes).digest('hex'),
      size: body.size,
      ...type,
    };
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    throw new ProfileError('MEDIA_OBJECT_VERIFY_FAILED', '暂时无法确认媒体文件');
  }
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
function canonicalFileForRecord(record, sourceFileId, openid, secretValue) {
  try {
    return canonicalMediaBinding(
      openid,
      sourceFileId,
      record?.canonical_file_id,
      {
        sha256: record?.sha256,
        size: record?.size,
        mime: record?.mime,
        extension: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[record?.mime],
      },
      secretValue,
    ).canonical_file_id;
  } catch {
    return '';
  }
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
  const currentBackground = effectiveBackgroundPhoto(existing);
  const currentIds = new Set([
    existing.avatar_file_id,
    currentBackground && currentBackground.file_id,
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
  if (
    Object.prototype.hasOwnProperty.call(data, 'background_photo') &&
    data.background_photo !== null
  ) {
    const legacy = new Set(
      [
        currentBackground,
        ...(Array.isArray(existing.photos) ? existing.photos : []),
      ].map((item) => `${item && item.file_id}\u0000${item && item.category}`),
    );
    accept(
      data.background_photo,
      legacy.has(`${data.background_photo.file_id}\u0000${data.background_photo.category}`) &&
        !records.has(data.background_photo.file_id),
    );
  }
  const nextBackground = Object.prototype.hasOwnProperty.call(data, 'background_photo')
    ? data.background_photo
    : Object.prototype.hasOwnProperty.call(data, 'photos')
      ? data.photos[0] || null
      : currentBackground;
  const nextIds = new Set([
    normalizedExisting.avatar_file_id,
    nextBackground && nextBackground.file_id,
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
  const background = effectiveBackgroundPhoto(profile);
  if (!background) return [];
  const records = new Map(mediaRecords.map((record) => [record && record.file_id, record]));
  const record = records.get(background.file_id);
  const storageFileId = canonicalFileForRecord(
    record,
    background.file_id,
    openid,
    secretValue,
  );
  if (
    !isOwnerMedia(background.file_id, openid, secretValue) ||
    !registeredMedia(record, background, openid) ||
    !storageFileId
  )
    return [];
  return [
    {
      file_id: background.file_id,
      storage_file_id: storageFileId,
      category: background.category,
      source: 'user_photo',
    },
  ];
}
function ownerAvatarMedia(profile, openid, secretValue, mediaRecords = []) {
  const value = normalizeAvatarProfile(profile && typeof profile === 'object' ? profile : {});
  if (!value.avatar_file_id || !value.avatar_source) return undefined;
  const record = mediaRecords.find((item) => item && item.file_id === value.avatar_file_id);
  const origin =
    record && Object.prototype.hasOwnProperty.call(record, 'origin') ? record.origin : 'custom';
  const canonicalFileId = canonicalFileForRecord(record, value.avatar_file_id, openid, secretValue);
  if (
    origin !== value.avatar_source ||
    !isOwnerMedia(value.avatar_file_id, openid, secretValue) ||
    !canonicalFileId ||
    !registeredMedia(
      record,
      { file_id: value.avatar_file_id, category: record && record.category },
      openid,
    )
  )
    return undefined;
  return {
    file_id: value.avatar_file_id,
    storage_file_id: canonicalFileId,
    category: 'other',
    source: 'avatar',
  };
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
function validPhoto(value) {
  return Boolean(
    value &&
      typeof value.file_id === 'string' &&
      value.file_id &&
      ['ride', 'bike', 'other'].includes(value.category),
  );
}
function effectiveBackgroundPhoto(profile) {
  const value = profile && typeof profile === 'object' ? profile : {};
  if (Object.prototype.hasOwnProperty.call(value, 'background_photo')) {
    return validPhoto(value.background_photo)
      ? {
          file_id: value.background_photo.file_id,
          category: value.background_photo.category,
        }
      : null;
  }
  const legacy = Array.isArray(value.photos) ? value.photos.find(validPhoto) : undefined;
  return legacy ? { file_id: legacy.file_id, category: legacy.category } : null;
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
    avatar_visibility: doc.avatar_visibility === 'public' ? 'public' : 'private',
    avatar_visibility_revision:
      Number.isSafeInteger(doc.avatar_visibility_revision) && doc.avatar_visibility_revision >= 0
        ? doc.avatar_visibility_revision
        : null,
    ...(Object.prototype.hasOwnProperty.call(doc, 'background_photo')
      ? { background_photo: effectiveBackgroundPhoto(doc) }
      : {}),
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
    'avatar_visibility_revision',
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
  if (event.avatar_visibility !== undefined) {
    if (!['public', 'private'].includes(event.avatar_visibility))
      throw new ProfileError('VALIDATION_FAILED', '头像公开设置无效');
    if (event.avatar_visibility === 'public') {
      if (
        !currentAvatar.avatar_file_id ||
        !currentAvatar.avatar_source ||
        !Number.isSafeInteger(current.avatar_revision) ||
        current.avatar_revision < 1
      )
        throw new ProfileError('AVATAR_REQUIRED', '请先设置头像再开启公开展示');
      data.avatar_visibility = 'public';
      data.avatar_visibility_revision = current.avatar_revision;
    } else {
      data.avatar_visibility = 'private';
      data.avatar_visibility_revision = null;
    }
  }
  const hasBackground = Object.prototype.hasOwnProperty.call(event, 'background_photo');
  const hasLegacyPhotos = Object.prototype.hasOwnProperty.call(event, 'photos');
  if (hasBackground && hasLegacyPhotos)
    throw new ProfileError('VALIDATION_FAILED', '背景图片协议不可混用');
  if (hasBackground) {
    if (event.background_photo !== null && !validPhoto(event.background_photo))
      throw new ProfileError('VALIDATION_FAILED', '背景图片格式错误');
    data.background_photo =
      event.background_photo === null
        ? null
        : {
            file_id: event.background_photo.file_id,
            category: event.background_photo.category,
          };
  } else if (hasLegacyPhotos) {
    if (
      !Array.isArray(event.photos) ||
      event.photos.length > 1 ||
      event.photos.some((item) => !validPhoto(item))
    )
      throw new ProfileError('VALIDATION_FAILED', '照片资料格式错误');
    data.background_photo = event.photos.length
      ? { file_id: event.photos[0].file_id, category: event.photos[0].category }
      : null;
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
  compatibleRandomUUID,
  issueMediaUploadPath,
  clientUploadIntentId,
  clientUploadIntent,
  canonicalMediaPath,
  isOwnerCanonicalMedia,
  canonicalUploadIntentId,
  canonicalMediaBinding,
  canonicalUploadIntent,
  mediaOwnerPrefix,
  mediaDocumentId,
  avatarUrlFingerprint,
  mediaRegistration,
  clientAvatarSource,
  clientMediaOrigin,
  validateAvatarSelection,
  inspectMediaObject,
  verifyMediaObject,
  verifyUploadedMedia,
  verifyUploadedImageObject,
  MAX_PROFILE_IMAGE_BYTES,
  CLIENT_UPLOAD_INTENT_MS,
  MEDIA_OBJECT_VERIFY_TIMEOUT_MS,
  MEDIA_VERIFY_ATTEMPTS,
  MEDIA_VERIFY_DELAY_MS,
  isOwnerMedia,
  mediaPath,
  registeredMedia,
  canonicalFileForRecord,
  validateMediaUpdate,
  validPhoto,
  effectiveBackgroundPhoto,
  ownerMedia,
  ownerAvatarMedia,
  normalizeAvatarProfile,
  writableDocument,
  toError,
};
