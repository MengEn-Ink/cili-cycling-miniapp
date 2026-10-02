'use strict';
const { StravaError } = require('./core');
const API_ROOT = 'https://www.strava.com/api/v3';
const MAX_GPX_BYTES = 4 * 1024 * 1024;
function statusError(status) {
  if (status === 429)
    return new StravaError('STRAVA_RATE_LIMITED', 'Strava 请求频率已达上限，请稍后重试');
  if (status === 401 || status === 403)
    return new StravaError('STRAVA_SCOPE_REQUIRED', 'Strava 授权不足，请重新授权 read 权限');
  return new StravaError('STRAVA_API_FAILED', `Strava API 返回 ${status}`);
}
async function request(url, options = {}, config = {}) {
  const { retries = 2, timeoutMs = 8000, fetchImpl = globalThis.fetch, consume } = config;
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: controller.signal,
        headers: { accept: 'application/json', ...(options.headers || {}) },
      });
      if (response.ok) return consume ? await consume(response) : response;
      const error = statusError(response.status);
      if (response.status < 500 || response.status === 429) throw error;
      last = error;
    } catch (error) {
      last = error;
      if (error instanceof StravaError) throw error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  if (last instanceof StravaError) throw last;
  throw new StravaError('STRAVA_API_FAILED', 'Strava API 暂时不可用');
}
async function requestJson(url, options = {}, retries = 2, timeoutMs = 8000, fetchImpl) {
  return request(url, options, {
    retries,
    timeoutMs,
    fetchImpl,
    consume: async (response) => {
      try {
        return await response.json();
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new StravaError('STRAVA_API_INVALID', 'Strava API 响应无效');
      }
    },
  });
}
async function requestGpx(url, token, options = {}) {
  return request(
    url,
    {
      headers: {
        accept: 'application/gpx+xml, application/xml, text/xml',
        authorization: `Bearer ${token}`,
      },
    },
    {
      retries: 1,
      timeoutMs: options.timeoutMs || 8000,
      fetchImpl: options.fetchImpl,
      consume: async (response) => {
        const declared = Number(response.headers?.get?.('content-length'));
        if (Number.isFinite(declared) && declared > MAX_GPX_BYTES)
          throw new StravaError('GPX_TOO_LARGE', 'Strava 路线文件超过 4MB 限制');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > MAX_GPX_BYTES)
          throw new StravaError('GPX_TOO_LARGE', 'Strava 路线文件超过 4MB 限制');
        return bytes;
      },
    },
  );
}
function form(data) {
  return new URLSearchParams(Object.entries(data).map(([key, value]) => [key, String(value)]));
}
function createStravaApi(fetchImpl = globalThis.fetch) {
  const json = (url, options) => requestJson(url, options, 2, 8000, fetchImpl);
  return {
    exchange: (data) =>
      json('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form(data),
      }),
    refresh: (data) =>
      json('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form(data),
      }),
    activities: (token, query) => {
      const url = new URL(`${API_ROOT}/athlete/activities`);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
      return json(url, { headers: { authorization: `Bearer ${token}` } });
    },
    athleteStats: (token, athleteId) =>
      json(`${API_ROOT}/athletes/${athleteId}/stats`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    routeGpx: (token, id) =>
      requestGpx(`${API_ROOT}/routes/${id}/export_gpx`, token, { fetchImpl }),
    exploreSegments: (token, bounds) => {
      const url = new URL(`${API_ROOT}/segments/explore`);
      url.searchParams.set(
        'bounds',
        [bounds.south, bounds.west, bounds.north, bounds.east].join(','),
      );
      url.searchParams.set('activity_type', 'riding');
      url.searchParams.set('min_cat', '1');
      url.searchParams.set('max_cat', '5');
      return json(url, { headers: { authorization: `Bearer ${token}` } });
    },
    segment: (token, id) =>
      json(`${API_ROOT}/segments/${id}`, { headers: { authorization: `Bearer ${token}` } }),
  };
}
module.exports = {
  MAX_GPX_BYTES,
  request,
  requestJson,
  requestGpx,
  createStravaApi,
  stravaApi: createStravaApi(),
};
