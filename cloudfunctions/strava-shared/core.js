'use strict';
const crypto = require('node:crypto');
const net = require('node:net');
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SYNC_LEASE_MS = 2 * 60 * 1000;
const CREDENTIAL_REFRESH_LEASE_MS = 60 * 1000;
const CREDENTIAL_REFRESH_WAIT_MS = 100;
const CREDENTIAL_REFRESH_MAX_WAIT_MS = 2 * 1000;
const CREDENTIAL_REFRESH_MAX_ATTEMPTS = 20;
const ALLOWED_AVATAR_HOSTS = new Set([
  'dgalywyr863hv.cloudfront.net',
  'dgtzuqphqg23d.cloudfront.net',
  'd3nn82uaxijpm6.cloudfront.net',
]);
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
  url.searchParams.set('approval_prompt', 'force');
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
function trustedAvatarUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return '';
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      net.isIP(hostname) ||
      !ALLOWED_AVATAR_HOSTS.has(hostname)
    )
      return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
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
    .map(trustedAvatarUrl)
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
function recoveryFor(code) {
  if (['STRAVA_SCOPE_REQUIRED'].includes(code))
    return {
      message: 'Strava 授权范围不足，请重新授权',
      retryable: false,
      recovery_action: 'reauthorize',
    };
  if (['STRAVA_TOKEN_INVALID', 'OAUTH_TOKEN_INVALID'].includes(code))
    return {
      message: 'Strava 凭证已失效，请先断开后重新连接',
      retryable: false,
      recovery_action: 'disconnect',
    };
  if (['STRAVA_CONFIG_INVALID', 'STRAVA_KEY_INVALID'].includes(code))
    return {
      message: 'Strava 服务配置异常，请联系支持',
      retryable: false,
      recovery_action: 'contact-support',
    };
  if (['OAUTH_ACCESS_DENIED', 'OAUTH_PROVIDER_ERROR'].includes(code))
    return {
      message: '你已拒绝 Strava 授权，可重新发起授权',
      retryable: false,
      recovery_action: 'reauthorize',
    };
  return {
    message: 'Strava 服务暂时不可用，请稍后重试',
    retryable: true,
    recovery_action: 'retry',
  };
}
function deriveReadiness(
  { credential, snapshot, hasActiveOAuthState, authorizationErrorCode },
  now = new Date(),
) {
  const avatarAvailable = Boolean(trustedAvatarUrl(credential?.athlete_avatar_url));
  if (!credential) {
    const authorizationError = authorizationErrorCode
      ? { code: authorizationErrorCode, ...recoveryFor(authorizationErrorCode) }
      : null;
    return {
      state: authorizationError ? 'failed' : hasActiveOAuthState ? 'authorizing' : 'disconnected',
      can_register: false,
      avatar_available: false,
      athlete_name: null,
      snapshot: null,
      error: authorizationError,
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
    const code = credential.sync_error_code || 'STRAVA_API_FAILED';
    return {
      state: 'failed',
      can_register: false,
      avatar_available: avatarAvailable,
      athlete_name: credential.athlete_name || null,
      snapshot: null,
      error: { code, ...recoveryFor(code) },
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
function lifetimeStatistics(stats) {
  const totals = stats && stats.all_ride_totals;
  if (!totals || typeof totals !== 'object')
    throw new StravaError('STRAVA_API_INVALID', 'Strava 累计骑行统计响应无效');
  const count = Number(totals.count);
  const distance = Number(totals.distance);
  const movingTime = Number(totals.moving_time);
  const elevation = Number(totals.elevation_gain);
  if (
    !Number.isInteger(count) ||
    !Number.isFinite(distance) ||
    !Number.isFinite(movingTime) ||
    !Number.isFinite(elevation) ||
    count < 0 ||
    distance < 0 ||
    movingTime < 0 ||
    elevation < 0
  )
    throw new StravaError('STRAVA_API_INVALID', 'Strava 累计骑行统计响应无效');
  return {
    lifetime_rides: Math.trunc(count),
    lifetime_distance_km: Number((distance / 1000).toFixed(1)),
    lifetime_moving_hours: Number((movingTime / 3600).toFixed(1)),
    lifetime_elevation_m: Number(elevation.toFixed(0)),
  };
}
async function optionalLifetimeStatistics(api, accessToken, athleteId) {
  try {
    return {
      ...lifetimeStatistics(await api.athleteStats(accessToken, athleteId)),
      lifetime_stats_status: 'ready',
    };
  } catch {
    // 累计统计只丰富名片，不得因独立接口失败阻断报名所需的 90 天快照。
    return {
      lifetime_rides: null,
      lifetime_distance_km: null,
      lifetime_moving_hours: null,
      lifetime_elevation_m: null,
      lifetime_stats_status: 'failed',
    };
  }
}
function validAthleteCreatedAt(value, now) {
  const date = validDate(value);
  if (!date) return null;
  if (date.getTime() > now.getTime()) return null;
  return date.toISOString();
}
async function optionalAthleteProfile(api, accessToken, now) {
  try {
    const athlete = await api.athlete(accessToken);
    const createdAt = validAthleteCreatedAt(athlete && athlete.created_at, now);
    return createdAt ? { athlete_created_at: createdAt } : {};
  } catch {
    // 注册时间只丰富年限文案，不得因接口失败阻断 90 天同步。
    return {};
  }
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
async function callbackFlow({ code, state, error, env, store, api, now = new Date() }) {
  const stateDoc = await consumeState(store, state, now);
  if (stateDoc.latest_attempt === false)
    throw new StravaError('OAUTH_ATTEMPT_SUPERSEDED', 'OAuth 授权已被更新的尝试替代');
  if (typeof error === 'string' && error) {
    const code = error === 'access_denied' ? 'OAUTH_ACCESS_DENIED' : 'OAUTH_PROVIDER_ERROR';
    await store.rejectAuthorization(stateDoc, code, now);
    throw new StravaError(code, recoveryFor(code).message);
  }
  if (typeof code !== 'string' || !code)
    throw new StravaError('OAUTH_CODE_MISSING', '缺少 OAuth code');
  const cfg = config(env);
  const token = await api.exchange({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: 'authorization_code',
  });
  const credential = tokenDocument(stateDoc.openid, token, cfg.key, now);
  const saved = await store.saveCredential(credential, stateDoc, now);
  if (saved === false) throw new StravaError('OAUTH_ATTEMPT_SUPERSEDED', 'OAuth 授权已失效');
  return { connected: true, athlete_name: credential.athlete_name };
}
function sameCipherEnvelope(left, right) {
  return Boolean(
    left &&
    right &&
    left.alg === right.alg &&
    left.iv === right.iv &&
    left.tag === right.tag &&
    left.ciphertext === right.ciphertext,
  );
}
function sameCredentialVersion(left, right) {
  if (!left || !right) return false;
  const leftExpiresAt = new Date(left.token_expires_at).getTime();
  const rightExpiresAt = new Date(right.token_expires_at).getTime();
  return Boolean(
    sameCipherEnvelope(left.access_token_cipher, right.access_token_cipher) &&
    sameCipherEnvelope(left.refresh_token_cipher, right.refresh_token_cipher) &&
    Number.isFinite(leftExpiresAt) &&
    leftExpiresAt === rightExpiresAt &&
    left.athlete_id === right.athlete_id,
  );
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
          scope:
            typeof refreshed.scope === 'string'
              ? refreshed.scope
              : Array.isArray(credential.scopes)
                ? credential.scopes.join(',')
                : '',
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
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function credentialNeedsRefresh(credential, now) {
  return new Date(credential.token_expires_at).getTime() <= now.getTime() + 5 * 60 * 1000;
}
async function resolveUsableCredential({
  openid,
  credential,
  cfg,
  api,
  store,
  now = new Date(),
  randomUUID = crypto.randomUUID,
  sleep = wait,
  clock = () => new Date(),
  monotonicNow = Date.now,
  maxWaitMs = CREDENTIAL_REFRESH_MAX_WAIT_MS,
  maxAttempts = CREDENTIAL_REFRESH_MAX_ATTEMPTS,
  leaseTtlMs = CREDENTIAL_REFRESH_LEASE_MS,
  waitIntervalMs = CREDENTIAL_REFRESH_WAIT_MS,
}) {
  if (!credential) throw new StravaError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
  if (!credentialNeedsRefresh(credential, now))
    return { accessToken: decrypt(credential.access_token_cipher, cfg.key), document: credential };
  if (
    !store ||
    typeof store.getCredential !== 'function' ||
    typeof store.acquireCredentialRefreshLease !== 'function' ||
    typeof store.saveRefreshedCredential !== 'function' ||
    typeof store.releaseCredentialRefreshLease !== 'function'
  )
    throw new StravaError('STRAVA_REFRESH_UNAVAILABLE', 'Strava 凭证暂时无法刷新');

  let candidate = credential;
  const waitDeadline = monotonicNow() + maxWaitMs;
  const settleCurrentCredential = async () => {
    const current = await store.getCredential(openid);
    if (!current) throw new StravaError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
    if (!credentialNeedsRefresh(current, clock()))
      return {
        accessToken: decrypt(current.access_token_cipher, cfg.key),
        document: current,
      };
    throw new StravaError('STRAVA_REFRESH_BUSY', 'Strava 凭证正在更新，请稍后重试');
  };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!candidate) throw new StravaError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
    const attemptNow = attempt === 0 ? now : clock();
    if (!credentialNeedsRefresh(candidate, attemptNow))
      return {
        accessToken: decrypt(candidate.access_token_cipher, cfg.key),
        document: candidate,
      };
    if (attempt > 0 && monotonicNow() >= waitDeadline)
      throw new StravaError('STRAVA_REFRESH_BUSY', 'Strava 凭证正在更新，请稍后重试');

    const leaseId = randomUUID();
    const claim = await store.acquireCredentialRefreshLease(openid, {
      leaseId,
      now: attemptNow,
      staleBefore: new Date(attemptNow.getTime() - leaseTtlMs),
      expected: candidate,
    });
    if (!claim.acquired) {
      if (!claim.credential) throw new StravaError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
      candidate = claim.credential;
      if (!credentialNeedsRefresh(candidate, attemptNow))
        return {
          accessToken: decrypt(candidate.access_token_cipher, cfg.key),
          document: candidate,
        };
      const remainingWait = waitDeadline - monotonicNow();
      if (remainingWait <= 0)
        throw new StravaError('STRAVA_REFRESH_BUSY', 'Strava 凭证正在更新，请稍后重试');
      await sleep(Math.min(waitIntervalMs, remainingWait));
      continue;
    }
    if (monotonicNow() >= waitDeadline) {
      await store.releaseCredentialRefreshLease(openid, {
        leaseId,
        expected: claim.credential,
        finishedAt: clock(),
      });
      return settleCurrentCredential();
    }

    try {
      const usable = await usableCredential({
        openid,
        credential: claim.credential,
        cfg,
        api,
        now: attemptNow,
      });
      const saved = await store.saveRefreshedCredential(
        openid,
        claim.credential,
        usable.document,
        attemptNow,
        leaseId,
      );
      if (saved?.saved) {
        return {
          accessToken: decrypt(saved.credential.access_token_cipher, cfg.key),
          document: saved.credential,
        };
      }
      if (!saved?.credential) throw new StravaError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
      candidate = saved.credential;
    } catch (error) {
      let released = false;
      try {
        released = await store.releaseCredentialRefreshLease(openid, {
          leaseId,
          expected: claim.credential,
          finishedAt: attemptNow,
        });
      } catch {
        throw error;
      }
      if (released) throw error;
      candidate = await store.getCredential(openid);
      if (!candidate) throw new StravaError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
    }
  }
  if (!credentialNeedsRefresh(candidate, clock()))
    return {
      accessToken: decrypt(candidate.access_token_cipher, cfg.key),
      document: candidate,
    };
  return settleCurrentCredential();
}
async function buildSyncResult({
  openid,
  env,
  credential,
  previousSnapshot,
  api,
  store,
  now = new Date(),
  maxPages = 5,
  randomUUID,
}) {
  const cfg = config(env);
  if (!credential) throw new StravaError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
  const refreshed = await resolveUsableCredential({
    openid,
    credential,
    cfg,
    api,
    store,
    now,
    randomUUID,
  });
  const coverageTo = now;
  const coverageFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const [window, stats, athleteProfile] = await Promise.all([
    fetchActivityWindow(api, refreshed.accessToken, {
      after: Math.floor(coverageFrom.getTime() / 1000),
      before: Math.ceil(coverageTo.getTime() / 1000),
      maxPages,
    }),
    optionalLifetimeStatistics(api, refreshed.accessToken, refreshed.document.athlete_id),
    optionalAthleteProfile(api, refreshed.accessToken, now),
  ]);
  const previousCreatedAt =
    previousSnapshot && previousSnapshot.athlete_id === refreshed.document.athlete_id
      ? validAthleteCreatedAt(previousSnapshot.athlete_created_at, now)
      : null;
  const athleteCreatedAt = athleteProfile.athlete_created_at || previousCreatedAt;
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
    ...stats,
    ...(athleteCreatedAt ? { athlete_created_at: athleteCreatedAt } : {}),
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
    readiness.state === 'authorizing' ||
    (readiness.state === 'failed' && !bundle.credential)
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
      previousSnapshot: claim.snapshot,
      api,
      store,
      now,
      randomUUID,
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
  CREDENTIAL_REFRESH_LEASE_MS,
  CREDENTIAL_REFRESH_MAX_WAIT_MS,
  StravaError,
  keyFrom,
  config,
  encrypt,
  decrypt,
  createState,
  hashState,
  authorizationUrl,
  consumeState,
  trustedAvatarUrl,
  tokenDocument,
  validDate,
  isSnapshotFresh,
  isCredentialUsable,
  isSnapshotForCredential,
  deriveReadiness,
  recoveryFor,
  statistics,
  lifetimeStatistics,
  optionalLifetimeStatistics,
  fetchActivityWindow,
  fetchActivities,
  callbackFlow,
  usableCredential,
  resolveUsableCredential,
  sameCredentialVersion,
  buildSyncResult,
  syncAudit,
  ensureReadyFlow,
  syncFlow,
  disconnectFlow,
  publicStatus,
  writableDocument,
  toError,
};
