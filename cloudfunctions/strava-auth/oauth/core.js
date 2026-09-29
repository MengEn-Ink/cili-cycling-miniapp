'use strict';
const crypto = require('node:crypto');
class StravaError extends Error {
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
    throw new StravaError('STRAVA_KEY_INVALID', 'Strava 加密服务未配置');
  return key;
}
function config(env) {
  keyFrom(env.STRAVA_TOKEN_ENCRYPTION_KEY);
  if (
    !/^\d+$/.test(env.STRAVA_CLIENT_ID || '') ||
    !env.STRAVA_CLIENT_SECRET ||
    !/^https:\/\//.test(env.STRAVA_CALLBACK_URL || '')
  )
    throw new StravaError('STRAVA_CONFIG_INVALID', 'Strava 服务配置不完整');
  return {
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET,
    callbackUrl: env.STRAVA_CALLBACK_URL,
    key: env.STRAVA_TOKEN_ENCRYPTION_KEY,
  };
}
function encrypt(value, keyValue) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(keyValue), iv);
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
  try {
    if (!value || value.alg !== 'A256GCM') throw Error();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      keyFrom(keyValue),
      Buffer.from(value.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof StravaError) throw error;
    throw new StravaError('STRAVA_TOKEN_INVALID', 'Strava 凭证无法解密');
  }
}
function createState(now = Date.now(), random = crypto.randomBytes) {
  const raw = random(32).toString('base64url');
  return {
    raw,
    hash: crypto.createHash('sha256').update(raw).digest('hex'),
    expiresAt: new Date(now + 10 * 60 * 1000),
  };
}
function hashState(raw) {
  if (typeof raw !== 'string' || raw.length < 40)
    throw new StravaError('OAUTH_STATE_INVALID', 'OAuth state 无效');
  return crypto.createHash('sha256').update(raw).digest('hex');
}
function authorizationUrl(clientId, callbackUrl, state) {
  const url = new URL('https://www.strava.com/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('approval_prompt', 'auto');
  url.searchParams.set('scope', 'read,activity:read_all,profile:read_all');
  url.searchParams.set('state', state);
  return url.toString();
}
async function consumeState(store, raw, now = new Date()) {
  const value = await store.consumeState(hashState(raw));
  if (!value || value.consumed_at)
    throw new StravaError('OAUTH_STATE_INVALID', 'OAuth state 无效或已使用');
  const expires = new Date(value.expires_at);
  if (!Number.isFinite(expires.getTime()) || expires <= now)
    throw new StravaError('OAUTH_STATE_EXPIRED', 'OAuth state 已过期');
  if (typeof value.openid !== 'string' || !value.openid)
    throw new StravaError('OAUTH_STATE_INVALID', 'OAuth state 无效');
  return value;
}
function tokenDocument(openid, token, keyValue, now) {
  if (
    !token ||
    typeof token.access_token !== 'string' ||
    typeof token.refresh_token !== 'string' ||
    !Number.isFinite(token.expires_at) ||
    !token.athlete ||
    (!Number.isFinite(token.athlete.id) && typeof token.athlete.id !== 'string')
  )
    throw new StravaError('OAUTH_TOKEN_INVALID', 'Strava 换取凭证失败');
  return {
    _id: openid,
    openid,
    athlete_id: String(token.athlete.id),
    athlete_name: [token.athlete.firstname, token.athlete.lastname].filter(Boolean).join(' '),
    access_token_cipher: encrypt(token.access_token, keyValue),
    refresh_token_cipher: encrypt(token.refresh_token, keyValue),
    token_expires_at: new Date(token.expires_at * 1000),
    scopes: typeof token.scope === 'string' ? token.scope.split(',') : [],
    connected_at: now,
    updated_at: now,
  };
}
function ride(activity) {
  return (
    activity &&
    ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide'].includes(
      activity.sport_type || activity.type,
    ) &&
    activity.trainer !== true &&
    activity.commute !== true
  );
}
function statistics(activities, now = new Date()) {
  const rides = activities.filter(ride);
  const distance = rides.reduce((sum, item) => sum + (Number(item.distance) || 0), 0);
  const moving = rides.reduce((sum, item) => sum + (Number(item.moving_time) || 0), 0);
  const elevation = rides.reduce((sum, item) => sum + (Number(item.total_elevation_gain) || 0), 0);
  const latest = rides
    .map((item) => new Date(item.start_date))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    total_km: Number((distance / 1000).toFixed(2)),
    activities_90d: rides.length,
    longest_km: Number(
      (Math.max(0, ...rides.map((item) => Number(item.distance) || 0)) / 1000).toFixed(2),
    ),
    total_elevation_m: Number(elevation.toFixed(1)),
    weighted_avg_speed_kmh: moving ? Number(((distance / moving) * 3.6).toFixed(2)) : 0,
    latest_activity_at: latest ? latest.toISOString() : '',
    synced_at: now,
  };
}
async function fetchActivities(api, accessToken, after, maxPages = 5) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await api.activities(accessToken, { after, page, per_page: 200 });
    if (!Array.isArray(batch)) throw new StravaError('STRAVA_API_INVALID', 'Strava 活动响应无效');
    all.push(...batch);
    if (batch.length < 200) return all;
  }
  return all;
}
async function callbackFlow({ code, state, env, store, api, now = new Date() }) {
  const cfg = config(env);
  if (typeof code !== 'string' || !code)
    throw new StravaError('OAUTH_CODE_MISSING', '缺少 OAuth code');
  const stateDoc = await consumeState(store, state, now);
  const token = await api.exchange({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: 'authorization_code',
  });
  const credential = tokenDocument(stateDoc.openid, token, cfg.key, now);
  await store.saveCredential(credential);
  return { connected: true, athlete_name: credential.athlete_name };
}
async function syncFlow({ openid, env, credential, api, store, now = new Date(), maxPages = 5 }) {
  const cfg = config(env);
  if (!credential) throw new StravaError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
  let access = decrypt(credential.access_token_cipher, cfg.key);
  let current = credential;
  if (new Date(credential.token_expires_at).getTime() <= now.getTime() + 5 * 60 * 1000) {
    const refreshed = await api.refresh({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: decrypt(credential.refresh_token_cipher, cfg.key),
    });
    current = {
      ...credential,
      ...tokenDocument(
        openid,
        {
          ...refreshed,
          athlete: { id: credential.athlete_id, firstname: credential.athlete_name },
        },
        cfg.key,
        now,
      ),
      connected_at: credential.connected_at,
    };
    access = refreshed.access_token;
    await store.saveCredential(current);
  }
  const activities = await fetchActivities(
    api,
    access,
    Math.floor((now.getTime() - 90 * 24 * 60 * 60 * 1000) / 1000),
    maxPages,
  );
  const snapshot = { _id: openid, openid, ...statistics(activities, now) };
  await store.saveSnapshot(snapshot);
  return { connected: true, athlete_name: current.athlete_name, snapshot };
}
async function disconnectFlow({ openid, store, now = new Date() }) {
  await store.disconnect(openid, {
    actor_openid: openid,
    action: 'strava.disconnect',
    target_id: openid,
    created_at: now,
    detail: {},
  });
  return { connected: false };
}
function publicStatus(credential, snapshot) {
  return credential
    ? { connected: true, athlete_name: credential.athlete_name, ...(snapshot ? { snapshot } : {}) }
    : { connected: false };
}
function writableDocument(value) {
  const { _id, ...document } = value;
  return document;
}
function toError(error) {
  return {
    ok: false,
    error: {
      code: error instanceof StravaError ? error.code : 'INTERNAL_ERROR',
      message: error instanceof StravaError ? error.message : '服务暂时不可用',
    },
  };
}
module.exports = {
  StravaError,
  keyFrom,
  config,
  encrypt,
  decrypt,
  createState,
  hashState,
  authorizationUrl,
  consumeState,
  tokenDocument,
  statistics,
  fetchActivities,
  callbackFlow,
  syncFlow,
  disconnectFlow,
  publicStatus,
  writableDocument,
  toError,
};
