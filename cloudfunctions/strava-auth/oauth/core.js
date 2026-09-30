'use strict';
const crypto = require('node:crypto');
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SYNC_LEASE_MS = 2 * 60 * 1000;
class StravaError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function keyFrom(value) {
  // 配置平台可能在 Secret 首尾附带换行；只容忍首尾空白，内部空白仍按非法配置拒绝。
  const normalized = String(value || '').trim();
  let key;
  try {
    key = Buffer.from(normalized, 'base64');
  } catch {
    key = Buffer.alloc(0);
  }
  if (
    /\s/.test(normalized) ||
    key.length !== 32 ||
    key.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')
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
    key: String(env.STRAVA_TOKEN_ENCRYPTION_KEY || '').trim(),
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
  const athleteAvatarUrl = [token.athlete.profile, token.athlete.profile_medium]
    .filter((value) => typeof value === 'string' && value.length <= 2048)
    .map((value) => {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) return '';
        url.hash = '';
        return url.toString();
      } catch {
        return '';
      }
    })
    .find(Boolean);
  return {
    _id: openid,
    openid,
    athlete_id: String(token.athlete.id),
    athlete_name: [token.athlete.firstname, token.athlete.lastname].filter(Boolean).join(' '),
    ...(athleteAvatarUrl ? { athlete_avatar_url: athleteAvatarUrl } : {}),
    access_token_cipher: encrypt(token.access_token, keyValue),
    refresh_token_cipher: encrypt(token.refresh_token, keyValue),
    token_expires_at: new Date(token.expires_at * 1000),
    scopes: typeof token.scope === 'string' ? token.scope.split(',') : [],
    sync_status: 'pending',
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
function validDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
function isSnapshotFresh(snapshot, now = new Date()) {
  const synced = validDate(snapshot && snapshot.synced_at);
  return Boolean(synced && now.getTime() - synced.getTime() < SNAPSHOT_MAX_AGE_MS);
}
function isCredentialUsable(credential) {
  const validEnvelope = (value) =>
    Boolean(
      value &&
      value.alg === 'A256GCM' &&
      typeof value.iv === 'string' &&
      value.iv.length > 0 &&
      typeof value.tag === 'string' &&
      value.tag.length > 0 &&
      typeof value.ciphertext === 'string' &&
      value.ciphertext.length > 0,
    );
  return Boolean(
    credential &&
    validEnvelope(credential.access_token_cipher) &&
    validEnvelope(credential.refresh_token_cipher),
  );
}
function isSnapshotForCredential(credential, snapshot) {
  return Boolean(
    credential &&
    typeof credential.athlete_id === 'string' &&
    credential.athlete_id &&
    snapshot &&
    snapshot.athlete_id === credential.athlete_id,
  );
}
function publicSnapshot(snapshot) {
  const dateValue = (value) => {
    const date = validDate(value);
    return date ? date.toISOString() : value;
  };
  const result = { ...snapshot, synced_at: dateValue(snapshot.synced_at) };
  for (const field of ['latest_activity_at', 'coverage_from', 'coverage_to']) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, field)) continue;
    result[field] = snapshot[field] == null ? null : dateValue(snapshot[field]);
  }
  return result;
}
function deriveReadiness({ credential, snapshot, hasActiveOAuthState }, now = new Date()) {
  const avatarAvailable = Boolean(
    credential &&
    typeof credential.athlete_avatar_url === 'string' &&
    credential.athlete_avatar_url.trim(),
  );
  if (!credential) {
    return {
      state: hasActiveOAuthState ? 'authorizing' : 'disconnected',
      can_register: false,
      avatar_available: false,
      athlete_name: null,
      snapshot: null,
      error: null,
    };
  }
  if (
    isCredentialUsable(credential) &&
    isSnapshotForCredential(credential, snapshot) &&
    isSnapshotFresh(snapshot, now)
  ) {
    return {
      state: 'ready',
      can_register: true,
      avatar_available: avatarAvailable,
      athlete_name: credential.athlete_name || null,
      snapshot: publicSnapshot(snapshot),
      error: null,
    };
  }
  if (credential.sync_status === 'failed') {
    return {
      state: 'failed',
      can_register: false,
      avatar_available: avatarAvailable,
      athlete_name: credential.athlete_name || null,
      snapshot: null,
      error: {
        code: credential.sync_error_code || 'STRAVA_API_FAILED',
        message: 'Strava 数据准备失败，请重试',
        retryable: true,
      },
    };
  }
  return {
    state: 'syncing',
    can_register: false,
    avatar_available: avatarAvailable,
    athlete_name: credential.athlete_name || null,
    snapshot: null,
    error: null,
  };
}
function maxOf(values, selector, lowest = -Infinity) {
  return values.reduce((max, item) => Math.max(max, selector(item)), lowest);
}
function statistics(activities, { now = new Date(), coverageFrom, coverageTo, coverageComplete }) {
  const rides = activities.filter(ride);
  const distances = rides.map((item) => Number(item.distance));
  const movingTimes = rides.map((item) => Number(item.moving_time));
  const elevations = rides.map((item) => Number(item.total_elevation_gain));
  const dates = rides.map((item) => validDate(item.start_date));
  const distanceKnown = distances.every(Number.isFinite);
  const movingKnown = movingTimes.every((value) => Number.isFinite(value) && value >= 0);
  const elevationKnown = elevations.every(Number.isFinite);
  const datesKnown = dates.every(Boolean);
  const distance = distanceKnown ? distances.reduce((sum, value) => sum + value, 0) : null;
  const moving = movingKnown ? movingTimes.reduce((sum, value) => sum + value, 0) : null;
  const known = coverageComplete === true;
  return {
    total_km: known && distance !== null ? Number((distance / 1000).toFixed(2)) : null,
    activities_90d: known ? rides.length : null,
    longest_km:
      known && distanceKnown
        ? Number((maxOf(distances, (value) => value, 0) / 1000).toFixed(2))
        : null,
    total_elevation_m:
      known && elevationKnown
        ? Number(elevations.reduce((sum, value) => sum + value, 0).toFixed(1))
        : null,
    weighted_avg_speed_kmh:
      !known || distance === null || moving === null
        ? null
        : rides.length === 0
          ? 0
          : moving > 0
            ? Number(((distance / moving) * 3.6).toFixed(2))
            : null,
    latest_activity_at:
      known && datesKnown && dates.length
        ? new Date(maxOf(dates, (date) => date.getTime())).toISOString()
        : null,
    synced_at: now,
    coverage_from: coverageFrom,
    coverage_to: coverageTo,
    coverage_complete: known,
  };
}
async function fetchActivityWindow(api, accessToken, { after, before, maxPages = 5 }) {
  const activities = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await api.activities(accessToken, { after, before, page, per_page: 200 });
    if (!Array.isArray(batch)) throw new StravaError('STRAVA_API_INVALID', 'Strava 活动响应无效');
    activities.push(...batch);
    if (batch.length < 200) return { activities, coverageComplete: true };
  }
  return { activities, coverageComplete: false };
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
  await store.saveCredential(credential, now);
  return { connected: true, athlete_name: credential.athlete_name };
}
async function usableCredential({ openid, credential, cfg, api, now = new Date() }) {
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
  }
  return { accessToken: access, document: current };
}
async function buildSyncResult({ openid, env, credential, api, now = new Date(), maxPages = 5 }) {
  const cfg = config(env);
  if (!credential) throw new StravaError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
  const refreshed = await usableCredential({ openid, credential, cfg, api, now });
  const coverageTo = now;
  const coverageFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const window = await fetchActivityWindow(api, refreshed.accessToken, {
    after: Math.floor(coverageFrom.getTime() / 1000),
    before: Math.ceil(coverageTo.getTime() / 1000),
    maxPages,
  });
  const snapshot = {
    _id: openid,
    openid,
    athlete_id: refreshed.document.athlete_id,
    ...statistics(window.activities, {
      now,
      coverageFrom,
      coverageTo,
      coverageComplete: window.coverageComplete,
    }),
  };
  return { credential: refreshed.document, snapshot };
}
function syncAudit(openid, action, now, detail = {}) {
  return {
    actor_openid: openid,
    action,
    target_id: openid,
    created_at: now,
    detail,
  };
}
async function ensureReadyFlow({
  openid,
  env,
  store,
  api,
  now = new Date(),
  randomUUID = crypto.randomUUID,
}) {
  let bundle = await store.readReadiness(openid, now);
  let readiness = deriveReadiness(bundle, now);
  if (
    readiness.state === 'ready' ||
    readiness.state === 'disconnected' ||
    readiness.state === 'authorizing'
  )
    return readiness;

  const leaseId = randomUUID();
  const claim = await store.acquireSyncLease(openid, {
    leaseId,
    now,
    staleBefore: new Date(now.getTime() - SYNC_LEASE_MS),
    audit: syncAudit(openid, 'strava.sync.started', now),
  });
  if (!claim.acquired) return deriveReadiness({ ...claim, hasActiveOAuthState: false }, now);

  try {
    const built = await buildSyncResult({
      openid,
      env,
      credential: claim.credential,
      api,
      now,
    });
    await store.completeSync(openid, {
      leaseId,
      ...built,
      finishedAt: now,
      audit: syncAudit(openid, 'strava.sync.succeeded', now, {
        coverage_complete: built.snapshot.coverage_complete,
      }),
    });
  } catch (error) {
    const code = error instanceof StravaError ? error.code : 'STRAVA_API_FAILED';
    await store.failSync(openid, {
      leaseId,
      errorCode: code,
      finishedAt: now,
      audit: syncAudit(openid, 'strava.sync.failed', now, { error_code: code }),
    });
  }
  bundle = await store.readReadiness(openid, now);
  return deriveReadiness(bundle, now);
}
const syncFlow = ensureReadyFlow;
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
  SNAPSHOT_MAX_AGE_MS,
  SYNC_LEASE_MS,
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
  validDate,
  isSnapshotFresh,
  isCredentialUsable,
  isSnapshotForCredential,
  deriveReadiness,
  statistics,
  fetchActivityWindow,
  fetchActivities,
  callbackFlow,
  usableCredential,
  buildSyncResult,
  syncAudit,
  ensureReadyFlow,
  syncFlow,
  disconnectFlow,
  publicStatus,
  writableDocument,
  toError,
};
