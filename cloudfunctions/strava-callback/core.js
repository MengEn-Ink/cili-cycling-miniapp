'use strict';

const crypto = require('node:crypto');
const MAX_GPX_BYTES = 4 * 1024 * 1024;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

class StravaError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function encryptionKey(value) {
  const text = String(value || '').trim();
  const key = Buffer.from(text, 'base64');
  if (/\s/.test(text) || key.length !== 32 || key.toString('base64') !== text)
    throw new StravaError('STRAVA_CONFIG_INVALID', 'Strava 服务配置不完整');
  return key;
}

function config(env) {
  if (!/^\d+$/.test(env.STRAVA_CLIENT_ID || '') || !env.STRAVA_CLIENT_SECRET)
    throw new StravaError('STRAVA_CONFIG_INVALID', 'Strava 服务配置不完整');
  let callback;
  try {
    callback = new URL(env.STRAVA_CALLBACK_URL);
  } catch {
    throw new StravaError('STRAVA_CONFIG_INVALID', 'Strava 服务配置不完整');
  }
  if (callback.protocol !== 'https:' || callback.username || callback.password)
    throw new StravaError('STRAVA_CONFIG_INVALID', 'Strava 服务配置不完整');
  encryptionKey(env.STRAVA_TOKEN_ENCRYPTION_KEY);
  return {
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET,
    callbackUrl: callback.toString(),
    encryptionKey: env.STRAVA_TOKEN_ENCRYPTION_KEY.trim(),
  };
}

function encrypt(value, keyValue, randomBytes = crypto.randomBytes) {
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(keyValue), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return {
    v: 1,
    alg: 'A256GCM',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decrypt(envelope, keyValue) {
  try {
    if (!envelope || envelope.v !== 1 || envelope.alg !== 'A256GCM') throw new Error('envelope');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(keyValue),
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof StravaError) throw error;
    throw new StravaError('STRAVA_TOKEN_INVALID', 'Strava 授权已失效，请重新连接');
  }
}

function createState(now = Date.now(), randomBytes = crypto.randomBytes) {
  const raw = randomBytes(32).toString('base64url');
  return {
    raw,
    hash: crypto.createHash('sha256').update(raw).digest('hex'),
    expiresAt: new Date(now + OAUTH_STATE_TTL_MS),
  };
}

function hashState(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{40,128}$/.test(raw))
    throw new StravaError('OAUTH_STATE_INVALID', '授权状态无效或已使用');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function authorizationUrl(configuration, state) {
  const url = new URL('https://www.strava.com/oauth/authorize');
  url.searchParams.set('client_id', configuration.clientId);
  url.searchParams.set('redirect_uri', configuration.callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('approval_prompt', 'force');
  url.searchParams.set('scope', 'read');
  url.searchParams.set('state', state);
  return url.toString();
}

function parseRouteUrl(value) {
  if (typeof value !== 'string' || value.length > 256)
    throw new StravaError('STRAVA_ROUTE_URL_INVALID', '请粘贴标准 Strava 路线链接');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new StravaError('STRAVA_ROUTE_URL_INVALID', '请粘贴标准 Strava 路线链接');
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    !['strava.com', 'www.strava.com'].includes(host) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw new StravaError('STRAVA_ROUTE_URL_INVALID', '请粘贴标准 Strava 路线链接');
  const match = /^\/(?:[a-z]{2}(?:-[A-Z]{2})\/)?routes\/([1-9]\d{0,29})\/?$/.exec(url.pathname);
  if (!match) throw new StravaError('STRAVA_ROUTE_URL_INVALID', '请粘贴标准 Strava 路线链接');
  return { routeId: match[1], url: `https://www.strava.com/routes/${match[1]}` };
}

function tokenDocument(openid, token, keyValue, now = new Date()) {
  if (
    !token ||
    typeof token.access_token !== 'string' ||
    !token.access_token ||
    typeof token.refresh_token !== 'string' ||
    !token.refresh_token ||
    !Number.isFinite(token.expires_at) ||
    !token.athlete ||
    (!Number.isFinite(token.athlete.id) && typeof token.athlete.id !== 'string')
  )
    throw new StravaError('OAUTH_TOKEN_INVALID', 'Strava 换取凭证失败');
  return {
    _id: openid,
    owner_openid: openid,
    athlete_id: String(token.athlete.id),
    athlete_name: [token.athlete.firstname, token.athlete.lastname].filter(Boolean).join(' '),
    access_token_cipher: encrypt(token.access_token, keyValue),
    refresh_token_cipher: encrypt(token.refresh_token, keyValue),
    token_expires_at: new Date(token.expires_at * 1000),
    connected_at: now,
    updated_at: now,
  };
}

async function tokenRequest(fetchImpl, body) {
  let response;
  try {
    response = await fetchImpl('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
  } catch {
    throw new StravaError('STRAVA_UNAVAILABLE', 'Strava 暂时不可用，请稍后重试');
  }
  if (!response.ok) {
    if ([400, 401].includes(response.status))
      throw new StravaError('STRAVA_TOKEN_INVALID', 'Strava 授权已失效，请重新连接');
    throw new StravaError('STRAVA_UNAVAILABLE', 'Strava 暂时不可用，请稍后重试');
  }
  try {
    return await response.json();
  } catch {
    throw new StravaError('STRAVA_API_INVALID', 'Strava 返回了无效数据');
  }
}

async function callbackFlow({ query, env, store, fetchImpl = fetch, now = new Date() }) {
  const configuration = config(env);
  const state = await store.consumeState(hashState(query?.state), now);
  if (!state || state.consumed_at)
    throw new StravaError('OAUTH_STATE_INVALID', '授权状态无效或已使用');
  const expiresAt = new Date(state.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime())
    throw new StravaError('OAUTH_STATE_EXPIRED', '授权状态已过期');
  if (query.error) throw new StravaError('OAUTH_ACCESS_DENIED', '你已取消 Strava 授权');
  if (typeof query.code !== 'string' || !query.code || typeof state.owner_openid !== 'string')
    throw new StravaError('OAUTH_CALLBACK_INVALID', 'Strava 授权回调无效');
  const token = await tokenRequest(fetchImpl, {
    client_id: configuration.clientId,
    client_secret: configuration.clientSecret,
    code: query.code,
    grant_type: 'authorization_code',
  });
  await store.saveCredential(
    state.owner_openid,
    tokenDocument(state.owner_openid, token, configuration.encryptionKey, now),
  );
  return { connected: true };
}

async function accessToken({ credential, env, store, fetchImpl = fetch, now = new Date() }) {
  const configuration = config(env);
  if (!credential || !credential.access_token_cipher || !credential.refresh_token_cipher)
    throw new StravaError('STRAVA_AUTH_REQUIRED', '请先连接 Strava');
  const expiresAt = new Date(credential.token_expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt > now.getTime() + TOKEN_REFRESH_SKEW_MS)
    return decrypt(credential.access_token_cipher, configuration.encryptionKey);
  const refreshed = await tokenRequest(fetchImpl, {
    client_id: configuration.clientId,
    client_secret: configuration.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: decrypt(credential.refresh_token_cipher, configuration.encryptionKey),
  });
  const next = tokenDocument(
    credential.owner_openid,
    { ...refreshed, athlete: { id: credential.athlete_id } },
    configuration.encryptionKey,
    now,
  );
  next.athlete_name = credential.athlete_name || '';
  next.connected_at = credential.connected_at || now;
  await store.saveCredential(credential.owner_openid, next);
  return decrypt(next.access_token_cipher, configuration.encryptionKey);
}

async function boundedBody(response) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > MAX_GPX_BYTES)
    throw new StravaError('GPX_TOO_LARGE', '路线文件超过 4 MB，请改用手动上传 GPX');
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_GPX_BYTES) {
        await reader.cancel();
        throw new StravaError('GPX_TOO_LARGE', '路线文件超过 4 MB，请改用手动上传 GPX');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_GPX_BYTES)
    throw new StravaError('GPX_TOO_LARGE', '路线文件超过 4 MB，请改用手动上传 GPX');
  return bytes;
}

function mapDownloadError(status) {
  if (status === 401)
    return new StravaError('STRAVA_AUTH_REQUIRED', 'Strava 授权已失效，请重新连接');
  if (status === 403) return new StravaError('STRAVA_ROUTE_FORBIDDEN', '当前账号无权下载这条路线');
  if (status === 404) return new StravaError('STRAVA_ROUTE_NOT_FOUND', '未找到这条 Strava 路线');
  if (status === 429)
    return new StravaError('STRAVA_RATE_LIMITED', 'Strava 请求过于频繁，请稍后重试');
  return new StravaError('STRAVA_UNAVAILABLE', 'Strava 暂时不可用，请稍后重试');
}

function routePreviewId(openid, digest, requestId) {
  return crypto.createHash('sha256').update(`${openid}\0${digest}\0${requestId}`).digest('hex');
}

function previewResponse(preview) {
  return {
    preview_id: preview._id,
    gpx_file_id: preview.source_file_id,
    gpx_sha256: preview.gpx_sha256,
    ...preview.summary,
    expires_at: preview.expires_at,
  };
}

async function importRoute({ request, env, store, fetchImpl = fetch, parseGpx, now = new Date() }) {
  const route = parseRouteUrl(request?.routeUrl);
  if (typeof request?.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(request.requestId))
    throw new StravaError('VALIDATION_FAILED', '路线导入请求无效');
  const credential = await store.getCredential(request.openid);
  if (!credential || credential.owner_openid !== request.openid)
    throw new StravaError('STRAVA_AUTH_REQUIRED', '请先连接 Strava');
  const token = await accessToken({ credential, env, store, fetchImpl, now });
  let response;
  try {
    response = await fetchImpl(`https://www.strava.com/api/v3/routes/${route.routeId}/export_gpx`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/gpx+xml,application/xml' },
    });
  } catch {
    throw new StravaError('STRAVA_UNAVAILABLE', 'Strava 暂时不可用，请稍后重试');
  }
  if (!response.ok) throw mapDownloadError(response.status);
  const bytes = await boundedBody(response);
  const fileName = `strava-route-${route.routeId}.gpx`;
  const summary = parseGpx(bytes, { fileName });
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const id = routePreviewId(request.openid, digest, request.requestId);
  const existing = await store.getPreview(id);
  if (existing) {
    if (existing.owner_openid !== request.openid)
      throw new StravaError('FORBIDDEN', '路线预览不可用');
    return {
      ...previewResponse(existing),
      external_route_id: route.routeId,
      external_route_url: route.url,
    };
  }
  const cloudPath = `activity-routes/${request.openid}/${digest}.gpx`;
  const upload = await store.uploadFile({ cloudPath, fileContent: bytes });
  if (!upload?.fileID)
    throw new StravaError('GPX_STORE_FAILED', '路线保存失败，请改用手动上传 GPX');
  const preview = {
    _id: id,
    owner_openid: request.openid,
    request_id: request.requestId,
    gpx_sha256: digest,
    source_file_id: upload.fileID,
    file_name: fileName,
    generated_file_id: '',
    summary,
    created_at: now,
    expires_at: new Date(now.getTime() + PREVIEW_TTL_MS),
    consumed_at: null,
    attached_activity_id: '',
  };
  await store.putPreview(id, preview);
  return {
    ...previewResponse(preview),
    external_route_id: route.routeId,
    external_route_url: route.url,
  };
}

module.exports = {
  MAX_GPX_BYTES,
  OAUTH_STATE_TTL_MS,
  PREVIEW_TTL_MS,
  StravaError,
  config,
  encrypt,
  decrypt,
  createState,
  hashState,
  authorizationUrl,
  parseRouteUrl,
  tokenDocument,
  callbackFlow,
  accessToken,
  boundedBody,
  mapDownloadError,
  routePreviewId,
  importRoute,
};
