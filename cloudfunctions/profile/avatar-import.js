'use strict';

const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const {
  ProfileError,
  compatibleRandomUUID,
  avatarUrlFingerprint,
  isOwnerMedia,
  issueMediaUploadPath,
  mediaPath,
} = require('./core');

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 3000;
const TOTAL_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 2;
const MAX_NETWORK_ATTEMPTS = 2;
// 可安全重试的底层瞬时网络错误码；业务/安全错误与其它未知码不在此列，直接终止。
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
]);
const IMPORT_LEASE_MS = 10 * 60 * 1000;
const ALLOWED_AVATAR_HOSTS = new Set([
  'dgalywyr863hv.cloudfront.net',
  'dgtzuqphqg23d.cloudfront.net',
  'd3nn82uaxijpm6.cloudfront.net',
]);

function avatarError(code, message) {
  return new ProfileError(code, message);
}

function assertImportRequest(event) {
  if (Object.keys(event || {}).some((field) => field !== 'action'))
    throw avatarError('FORBIDDEN_FIELD', '客户端不能指定 Strava 头像参数');
}

function validateAvatarUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2048)
    throw avatarError('STRAVA_AVATAR_URL_INVALID', 'Strava 头像地址无效');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw avatarError('STRAVA_AVATAR_URL_INVALID', 'Strava 头像地址无效');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    net.isIP(hostname) ||
    !ALLOWED_AVATAR_HOSTS.has(hostname)
  )
    throw avatarError('STRAVA_AVATAR_URL_INVALID', 'Strava 头像地址无效');
  url.hash = '';
  return url;
}

function isPublicAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 192 && b === 88 && parts[2] === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && parts[2] === 100) ||
      (a === 203 && b === 0 && parts[2] === 113) ||
      a >= 224
    );
  }
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) return isPublicAddress(normalized.slice(7));
  const sides = normalized.split('::');
  if (sides.length > 2) return false;
  const head = sides[0] ? sides[0].split(':') : [];
  const tail = sides[1] ? sides[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if ((sides.length === 1 && missing !== 0) || missing < 0) return false;
  const parts = [...head, ...Array(missing).fill('0'), ...tail];
  if (parts.length !== 8 || parts.some((part) => !/^[a-f0-9]{1,4}$/.test(part))) return false;
  const numeric = parts.reduce((value, part) => (value << 16n) | BigInt(`0x${part}`), 0n);
  const inSubnet = (prefix, bits) => numeric >> BigInt(128 - bits) === prefix >> BigInt(128 - bits);
  const valueOf = (parts) =>
    parts.reduce((value, part) => (value << 16n) | BigInt(part), 0n) <<
    BigInt(16 * (8 - parts.length));
  return (
    inSubnet(valueOf([0x2000]), 3) &&
    !inSubnet(valueOf([0x2001, 0x0000]), 23) &&
    !inSubnet(valueOf([0x2001, 0x0db8]), 32) &&
    !inSubnet(valueOf([0x2002]), 16) &&
    !inSubnet(valueOf([0x3fff, 0x0000]), 20)
  );
}

async function resolvePublicAddresses(hostname, lookup = dns.lookup) {
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw avatarError('STRAVA_AVATAR_DNS_FAILED', '无法解析 Strava 头像地址');
  }
  if (!Array.isArray(addresses) || !addresses.length)
    throw avatarError('STRAVA_AVATAR_DNS_FAILED', '无法解析 Strava 头像地址');
  if (
    addresses.some(
      (item) =>
        !item ||
        typeof item.address !== 'string' ||
        ![4, 6].includes(item.family) ||
        !isPublicAddress(item.address),
    )
  )
    throw avatarError('STRAVA_AVATAR_ADDRESS_BLOCKED', 'Strava 头像地址不可访问');
  return addresses;
}

function withinDeadline(promise, milliseconds) {
  if (milliseconds <= 0)
    return Promise.reject(avatarError('STRAVA_AVATAR_TOTAL_TIMEOUT', 'Strava 头像下载超时'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(avatarError('STRAVA_AVATAR_TOTAL_TIMEOUT', 'Strava 头像下载超时')),
      milliseconds,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function boundedRequest(url, addresses, options = {}) {
  const requestFactory = options.requestFactory || https.request;
  const maxBytes = options.maxBytes ?? MAX_AVATAR_BYTES;
  const connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      if (error) reject(error);
      else resolve(value);
    };
    const totalTimer = setTimeout(() => {
      const error = avatarError('STRAVA_AVATAR_TOTAL_TIMEOUT', 'Strava 头像下载超时');
      finish(error);
      request?.destroy(error);
    }, totalTimeoutMs);
    try {
      request = requestFactory(
        url,
        {
          method: 'GET',
          headers: { accept: 'image/jpeg,image/png,image/webp' },
          servername: url.hostname,
          lookup: (_hostname, _lookupOptions, callback) => {
            const selected = addresses[0];
            callback(null, selected.address, selected.family);
          },
        },
        (response) => {
          request.setTimeout(0);
          const declared = Number(response.headers?.['content-length']);
          if (Number.isFinite(declared) && declared > maxBytes) {
            const error = avatarError('STRAVA_AVATAR_TOO_LARGE', 'Strava 头像文件过大');
            finish(error);
            response.destroy?.(error);
            return;
          }
          const chunks = [];
          let size = 0;
          response.on('data', (chunk) => {
            if (settled) return;
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > maxBytes) {
              const error = avatarError('STRAVA_AVATAR_TOO_LARGE', 'Strava 头像文件过大');
              finish(error);
              response.destroy?.(error);
              return;
            }
            chunks.push(buffer);
          });
          response.on('end', () => {
            finish(null, {
              statusCode: Number(response.statusCode || 0),
              headers: response.headers || {},
              body: Buffer.concat(chunks),
            });
          });
          response.on('error', (error) =>
            finish(
              error instanceof ProfileError
                ? error
                : avatarError('STRAVA_AVATAR_DOWNLOAD_FAILED', 'Strava 头像下载失败'),
            ),
          );
        },
      );
      request.setTimeout(connectTimeoutMs, () => {
        const error = avatarError('STRAVA_AVATAR_CONNECT_TIMEOUT', 'Strava 头像连接超时');
        finish(error);
        request.destroy(error);
      });
      request.on('error', (error) =>
        finish(
          error instanceof ProfileError
            ? error
            : avatarError('STRAVA_AVATAR_DOWNLOAD_FAILED', 'Strava 头像下载失败'),
        ),
      );
      request.end();
    } catch {
      finish(avatarError('STRAVA_AVATAR_DOWNLOAD_FAILED', 'Strava 头像下载失败'));
    }
  });
}

function imageType(headers, body) {
  const raw = headers?.['content-type'];
  const contentType = String(Array.isArray(raw) ? raw[0] : raw || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const detected =
    body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
      ? { contentType: 'image/jpeg', extension: 'jpg' }
      : body.length >= 8 && body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        ? { contentType: 'image/png', extension: 'png' }
        : body.length >= 12 &&
            body.subarray(0, 4).toString('ascii') === 'RIFF' &&
            body.subarray(8, 12).toString('ascii') === 'WEBP'
          ? { contentType: 'image/webp', extension: 'webp' }
          : undefined;
  if (!detected || detected.contentType !== contentType)
    throw avatarError('STRAVA_AVATAR_TYPE_INVALID', 'Strava 头像类型无效');
  return detected;
}

async function downloadAvatar(value, dependencies = {}) {
  const lookup = dependencies.lookup || dns.lookup;
  const now = dependencies.now || Date.now;
  const totalTimeoutMs = dependencies.totalTimeoutMs ?? TOTAL_TIMEOUT_MS;
  const request =
    dependencies.request || ((input) => boundedRequest(input.url, input.addresses, input));
  let current = validateAvatarUrl(value);
  const startedAt = now();
  for (let redirects = 0; ; redirects += 1) {
    if (now() - startedAt >= totalTimeoutMs)
      throw avatarError('STRAVA_AVATAR_TOTAL_TIMEOUT', 'Strava 头像下载超时');
    let remainingMs = totalTimeoutMs - (now() - startedAt);
    const addresses = await withinDeadline(
      resolvePublicAddresses(current.hostname, lookup),
      remainingMs,
    );
    remainingMs = totalTimeoutMs - (now() - startedAt);
    if (remainingMs <= 0) throw avatarError('STRAVA_AVATAR_TOTAL_TIMEOUT', 'Strava 头像下载超时');
    let response;
    // 底层瞬时网络错误（如连接重置，无显式错误码）可在总超时内复用“已验证的同一地址”重试一次，
    // 不重新做 DNS，避免重试间隙被 DNS 重绑定；安全/业务错误带显式 code，直接终止不重试。
    for (let networkAttempt = 0; networkAttempt < MAX_NETWORK_ATTEMPTS; networkAttempt += 1) {
      try {
        response = await request({
          url: current,
          addresses,
          maxBytes: MAX_AVATAR_BYTES,
          connectTimeoutMs: Math.min(CONNECT_TIMEOUT_MS, remainingMs),
          totalTimeoutMs: remainingMs,
        });
        break;
      } catch (error) {
        // 业务/安全错误（ProfileError）始终直接终止，不做网络重试。
        if (error instanceof ProfileError) throw error;
        const isTransient = !error?.code || RETRYABLE_NETWORK_CODES.has(error.code);
        const canRetry =
          isTransient &&
          networkAttempt + 1 < MAX_NETWORK_ATTEMPTS &&
          now() - startedAt < totalTimeoutMs;
        if (!canRetry) {
          // 保留显式错误码便于上层归因；无码的普通网络错误归一为下载失败。
          if (error?.code) throw error;
          throw avatarError('STRAVA_AVATAR_DOWNLOAD_FAILED', 'Strava 头像下载失败');
        }
      }
    }
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      if (redirects >= MAX_REDIRECTS)
        throw avatarError('STRAVA_AVATAR_REDIRECT_LIMIT', 'Strava 头像重定向过多');
      const location = response.headers?.location;
      if (typeof location !== 'string' || !location)
        throw avatarError('STRAVA_AVATAR_REDIRECT_BLOCKED', 'Strava 头像重定向无效');
      let redirected;
      try {
        redirected = validateAvatarUrl(new URL(location, current).toString());
      } catch {
        throw avatarError('STRAVA_AVATAR_REDIRECT_BLOCKED', 'Strava 头像重定向无效');
      }
      // Every redirect target is independently validated against the explicit CDN allowlist.
      current = redirected;
      continue;
    }
    if (response.statusCode !== 200)
      throw avatarError('STRAVA_AVATAR_DOWNLOAD_FAILED', 'Strava 头像下载失败');
    const body = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body || []);
    if (body.length > MAX_AVATAR_BYTES)
      throw avatarError('STRAVA_AVATAR_TOO_LARGE', 'Strava 头像文件过大');
    const type = imageType(response.headers, body);
    return { bytes: body, ...type };
  }
}

function stableErrorCode(error) {
  return typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
    ? error.code
    : 'STRAVA_AVATAR_IMPORT_FAILED';
}

async function compensateImport({
  openid,
  fence,
  fileId,
  error,
  now,
  deleteFile,
  store,
  completionAttempted,
}) {
  let durable = false;
  let completed = false;
  let persistenceError;
  try {
    const outcome = await store.failAvatarImport(
      openid,
      fence,
      fileId,
      stableErrorCode(error),
      now,
    );
    completed = outcome?.completed === true;
    durable = completed || outcome?.orphaned === true || outcome?.aborted === true;
  } catch (failure) {
    persistenceError = failure;
  }
  if (completed) return;
  if (completionAttempted) {
    if (persistenceError) throw avatarError('STRAVA_AVATAR_STATE_UNKNOWN', 'Strava 头像状态待确认');
    return;
  }
  if (!fileId || !deleteFile) {
    if (persistenceError)
      throw avatarError('STRAVA_AVATAR_COMPENSATION_FAILED', 'Strava 头像补偿失败');
    return;
  }
  let deleted = false;
  try {
    const result = await deleteFile({ fileList: [fileId] });
    deleted = Boolean(
      result?.fileList?.some((item) => item?.fileID === fileId && Number(item.status) === 0),
    );
  } catch {
    deleted = false;
  }
  if (!deleted) {
    if (durable) throw avatarError('STRAVA_AVATAR_CLEANUP_PENDING', 'Strava 头像已进入后台清理');
    throw avatarError('STRAVA_AVATAR_COMPENSATION_FAILED', 'Strava 头像补偿失败');
  }
}

async function importStravaAvatar({
  openid,
  credential,
  mediaSecret,
  download = downloadAvatar,
  uploadFile,
  deleteFile,
  store,
  randomUUID,
  now = new Date(),
}) {
  if (
    !credential ||
    credential._id !== openid ||
    credential.openid !== openid ||
    typeof credential.athlete_id !== 'string' ||
    !credential.athlete_id
  )
    throw avatarError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
  if (typeof credential.athlete_avatar_url !== 'string' || !credential.athlete_avatar_url)
    throw avatarError('STRAVA_AVATAR_UNAVAILABLE', 'Strava 未提供可用头像');
  const makeUuid = randomUUID || compatibleRandomUUID;
  const intentId = `avatar-import-${makeUuid()}`;
  const avatarFingerprint = avatarUrlFingerprint(credential.athlete_avatar_url);
  const intent = {
    _id: intentId,
    owner_openid: openid,
    athlete_id: credential.athlete_id,
    credential_generation: credential.credential_generation,
    avatar_url_fingerprint: avatarFingerprint,
    status: 'leased',
    created_at: now,
    lease_expires_at: new Date(new Date(now).getTime() + IMPORT_LEASE_MS),
    cleanup_after: new Date(new Date(now).getTime() + IMPORT_LEASE_MS),
  };
  let fileId = '';
  let acquired = false;
  let fence;
  let completionAttempted = false;
  try {
    const leasedIntent = await store.prepareAvatarImport(openid, credential, intent, now);
    fence = {
      intent_id: leasedIntent._id,
      credential_generation: leasedIntent.credential_generation,
      athlete_id: leasedIntent.athlete_id,
      avatar_url_fingerprint: leasedIntent.avatar_url_fingerprint,
      lease_expires_at: leasedIntent.lease_expires_at,
    };
    acquired = true;
    const downloaded = await download(credential.athlete_avatar_url);
    const cloudPath = issueMediaUploadPath(
      openid,
      mediaSecret,
      makeUuid,
      downloaded.extension,
    ).cloud_path;
    await store.prepareAvatarUpload(openid, fence, cloudPath, mediaSecret, now);
    const uploaded = await uploadFile({ cloudPath, fileContent: downloaded.bytes });
    const uploadedFileId = uploaded?.fileID;
    if (
      !isOwnerMedia(uploadedFileId, openid, mediaSecret) ||
      mediaPath(uploadedFileId) !== cloudPath
    )
      throw avatarError('MEDIA_NOT_OWNED', '上传头像不属于当前用户');
    fileId = uploadedFileId;
    await store.markAvatarImportUploaded(openid, fence, fileId, mediaSecret, now);
    completionAttempted = true;
    return await store.completeAvatarImport(openid, fence, mediaSecret, now);
  } catch (error) {
    if (acquired)
      await compensateImport({
        openid,
        fence,
        fileId,
        error,
        now,
        deleteFile,
        store,
        completionAttempted,
      });
    throw error;
  }
}

module.exports = {
  MAX_AVATAR_BYTES,
  CONNECT_TIMEOUT_MS,
  TOTAL_TIMEOUT_MS,
  MAX_REDIRECTS,
  MAX_NETWORK_ATTEMPTS,
  RETRYABLE_NETWORK_CODES,
  IMPORT_LEASE_MS,
  ALLOWED_AVATAR_HOSTS,
  validateAvatarUrl,
  isPublicAddress,
  resolvePublicAddresses,
  withinDeadline,
  boundedRequest,
  downloadAvatar,
  assertImportRequest,
  importStravaAvatar,
};
