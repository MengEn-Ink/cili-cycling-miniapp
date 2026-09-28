'use strict';
const { StravaError } = require('./core');
async function requestJson(url, options = {}, retries = 2, timeoutMs = 8000) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: { accept: 'application/json', ...(options.headers || {}) },
      });
      if (!response.ok) {
        const error = new StravaError('STRAVA_API_FAILED', `Strava API 返回 ${response.status}`);
        if (response.status < 500 && response.status !== 429) throw error;
        last = error;
      } else return await response.json();
    } catch (error) {
      last = error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  if (last instanceof StravaError) throw last;
  throw new StravaError('STRAVA_API_FAILED', 'Strava API 暂时不可用');
}
function form(data) {
  return new URLSearchParams(Object.entries(data).map(([key, value]) => [key, String(value)]));
}
const stravaApi = {
  exchange: (data) =>
    requestJson('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form(data),
    }),
  refresh: (data) =>
    requestJson('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form(data),
    }),
  activities: (token, query) => {
    const url = new URL('https://www.strava.com/api/v3/athlete/activities');
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    return requestJson(url, { headers: { authorization: `Bearer ${token}` } });
  },
};
module.exports = { requestJson, stravaApi };
