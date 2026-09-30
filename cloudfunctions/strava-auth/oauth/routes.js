'use strict';
const crypto = require('node:crypto');
const { StravaError, config, resolveUsableCredential } = require('./core');
const MAX_GPX_BYTES = 4 * 1024 * 1024;
function extractRouteId(value) {
  if (typeof value !== 'string' || value.length > 256 || value !== value.trim())
    throw new StravaError('ROUTE_URL_INVALID', '请输入有效的 Strava 路线 URL');
  try {
    const url = new URL(value);
    const match = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?routes\/([1-9]\d{0,19})\/?$/i.exec(url.pathname);
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'www.strava.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !match
    )
      throw new Error();
    return match[1];
  } catch {
    throw new StravaError('ROUTE_URL_INVALID', '请输入有效的 Strava 路线 URL');
  }
}
function haversineMeters(a, b) {
  const rad = (v) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const value =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
function parseGpx(input, maxPoints = 80) {
  const xml = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');
  if (!xml || Buffer.byteLength(xml) > MAX_GPX_BYTES)
    throw new StravaError('GPX_TOO_LARGE', 'Strava 路线文件超过 4MB 限制');
  if (!Number.isInteger(maxPoints) || maxPoints < 2 || maxPoints > 80)
    throw new StravaError('GPX_INVALID', '海拔采样参数无效');
  const points = [];
  const pattern = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt\s*>/gi;
  let match;
  while ((match = pattern.exec(xml))) {
    if (points.length >= 200000) throw new StravaError('GPX_INVALID', 'Strava 路线轨迹点过多');
    const lat = Number(/\blat\s*=\s*["']([^"']+)["']/i.exec(match[1])?.[1]);
    const lon = Number(/\blon\s*=\s*["']([^"']+)["']/i.exec(match[1])?.[1]);
    const ele = Number(/<ele\b[^>]*>\s*([^<]+)\s*<\/ele\s*>/i.exec(match[2])?.[1]);
    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180 ||
      !Number.isFinite(ele) ||
      ele < -1000 ||
      ele > 10000
    )
      throw new StravaError('GPX_INVALID', 'Strava 路线轨迹点无效');
    points.push({ lat, lon, ele, distance: 0 });
  }
  if (points.length < 2) throw new StravaError('GPX_INVALID', 'Strava 路线缺少有效轨迹点');
  let distance = 0;
  let gain = 0;
  let south = points[0].lat,
    north = south,
    west = points[0].lon,
    east = west;
  for (let index = 1; index < points.length; index += 1) {
    distance += haversineMeters(points[index - 1], points[index]);
    gain += Math.max(0, points[index].ele - points[index - 1].ele);
    points[index].distance = distance;
    south = Math.min(south, points[index].lat);
    north = Math.max(north, points[index].lat);
    west = Math.min(west, points[index].lon);
    east = Math.max(east, points[index].lon);
  }
  const count = Math.min(points.length, maxPoints);
  const indexes = Array.from({ length: count }, (_, index) =>
    Math.round((index * (points.length - 1)) / (count - 1)),
  );
  return {
    distance_km: Number((distance / 1000).toFixed(2)),
    elevation_m: Number(gain.toFixed(1)),
    elevation_profile: indexes.map((index) => ({
      distance_km: Number((points[index].distance / 1000).toFixed(3)),
      elevation_m: Number(points[index].ele.toFixed(1)),
    })),
    route_bounds: {
      south: Number(south.toFixed(6)),
      west: Number(west.toFixed(6)),
      north: Number(north.toFixed(6)),
      east: Number(east.toFixed(6)),
    },
  };
}
const count = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 1000000000 ? value : undefined;
function cleanSegment(value, metric) {
  const id = String(value?.id || '');
  if (!/^\d{1,20}$/.test(id) || typeof value.name !== 'string' || !value.name.trim())
    return undefined;
  const number = (key, min, max) =>
    Number.isFinite(Number(value[key])) && Number(value[key]) >= min && Number(value[key]) <= max
      ? Number(value[key])
      : 0;
  const popularity = count(value[metric]) || 0;
  return {
    id,
    name: value.name.trim().slice(0, 120),
    distance_km: Number((number('distance', 0, 1000000) / 1000).toFixed(2)),
    elevation_gain_m: Number(number('total_elevation_gain', 0, 100000).toFixed(1)),
    average_grade: Number(number('average_grade', -100, 100).toFixed(1)),
    max_grade: Number(number('maximum_grade', -100, 100).toFixed(1)),
    climb_category: Math.trunc(number('climb_category', 0, 5)),
    popularity,
    popularity_label:
      metric === 'star_count'
        ? `${popularity} 收藏`
        : metric === 'athlete_count'
          ? `${popularity} 位骑手`
          : `${popularity} 次挑战`,
  };
}
async function popularClimbs(api, token, bounds) {
  try {
    const explored = await api.exploreSegments(token, bounds);
    const candidates = Array.isArray(explored?.segments) ? explored.segments.slice(0, 5) : [];
    const details = await Promise.all(candidates.map((item) => api.segment(token, item.id)));
    const metric = details.every((item) => count(item?.star_count) !== undefined)
      ? 'star_count'
      : details.some((item) => count(item?.athlete_count) !== undefined)
        ? 'athlete_count'
        : 'effort_count';
    return details
      .map((item) => cleanSegment(item, metric))
      .filter(Boolean)
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 3);
  } catch {
    return [];
  }
}
function requireRead(credential) {
  if (!Array.isArray(credential?.scopes) || !credential.scopes.includes('read'))
    throw new StravaError('STRAVA_SCOPE_REQUIRED', 'Strava 授权不足，请重新授权 read 权限');
}
async function access({ openid, env, store, api, now }) {
  const credential = await store.getCredential(openid);
  requireRead(credential);
  const usable = await resolveUsableCredential({
    openid,
    credential,
    cfg: config(env),
    api,
    store,
    now,
  });
  return usable.accessToken;
}
async function routePreviewFlow({ openid, routeUrl, env, store, api, now = new Date() }) {
  const routeId = extractRouteId(routeUrl);
  const token = await access({ openid, env, store, api, now });
  const parsed = parseGpx(await api.routeGpx(token, routeId));
  const preview = {
    strava_route_id: routeId,
    strava_route_url: `https://www.strava.com/routes/${routeId}`,
    ...parsed,
    popular_climbs: await popularClimbs(api, token, parsed.route_bounds),
  };
  await store.saveRoutePreview(openid, preview, now);
  return preview;
}
function previewId(openid, routeId) {
  return crypto.createHash('sha256').update(`${openid}\0${routeId}`).digest('hex');
}
async function routeGpxFlow({ openid, activityId, routeId, env, store, api, now = new Date() }) {
  if (typeof activityId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(activityId))
    throw new StravaError('ACTIVITY_ID_INVALID', '活动 ID 格式错误');
  if (routeId !== undefined && (typeof routeId !== 'string' || !/^\d{1,20}$/.test(routeId)))
    throw new StravaError('ROUTE_ID_INVALID', '路线 ID 格式错误');
  const activity = await store.getActivity(activityId);
  if (!activity || activity.is_deleted === true)
    throw new StravaError('ACTIVITY_NOT_FOUND', '活动不存在');
  if (!['published', 'finished'].includes(activity.status))
    throw new StravaError('ROUTE_NOT_AVAILABLE', '仅已发布或已结束活动可导出路线');
  const storedRouteId = String(activity.route?.strava_route_id || '');
  if (!/^\d{1,20}$/.test(storedRouteId) || (routeId !== undefined && storedRouteId !== routeId))
    throw new StravaError('FORBIDDEN_ROUTE', '路线与活动不匹配');
  const routeOwnerOpenid = activity.strava_route_owner_openid;
  if (typeof routeOwnerOpenid !== 'string' || !routeOwnerOpenid)
    throw new StravaError('ROUTE_NOT_AVAILABLE', '路线需由管理员重新同步后才能导出');
  // 下载者只需具备小程序身份；私有路线必须使用活动保存时绑定的路线创建者凭证读取。
  const token = await access({ openid: routeOwnerOpenid, env, store, api, now });
  const gpx = await api.routeGpx(token, storedRouteId);
  const safeActivity = activityId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  return {
    base64: gpx.toString('base64'),
    filename: `${safeActivity}-strava-route-${storedRouteId}.gpx`,
    content_type: 'application/gpx+xml',
  };
}
module.exports = {
  MAX_GPX_BYTES,
  extractRouteId,
  haversineMeters,
  parseGpx,
  popularClimbs,
  requireRead,
  previewId,
  routePreviewFlow,
  routeGpxFlow,
};
