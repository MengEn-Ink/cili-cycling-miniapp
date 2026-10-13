'use strict';
const crypto = require('node:crypto');
const { StravaError, config, resolveUsableCredential } = require('./core');
const MAX_GPX_BYTES = 4 * 1024 * 1024;
const MAX_PUBLIC_ROUTE_HTML_BYTES = 1024 * 1024;
const PUBLIC_ROUTE_TIMEOUT_MS = 8000;
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
  const xmlPrefix = '(?:[A-Za-z_][\\w.-]*:)?';
  const pattern = new RegExp(
    `<${xmlPrefix}trkpt\\b([^>]*)>([\\s\\S]*?)<\\/${xmlPrefix}trkpt\\s*>`,
    'gi',
  );
  const attribute = (attributes, name) =>
    new RegExp(`(?:^|\\s)${xmlPrefix}${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attributes)?.[1];
  const elevation = (contents) =>
    new RegExp(`<${xmlPrefix}ele\\b[^>]*>\\s*([^<]+?)\\s*<\\/${xmlPrefix}ele\\s*>`, 'i').exec(
      contents,
    )?.[1];
  let match;
  while ((match = pattern.exec(xml))) {
    if (points.length >= 200000) throw new StravaError('GPX_INVALID', 'Strava 路线轨迹点过多');
    const lat = Number(attribute(match[1], 'lat'));
    const lon = Number(attribute(match[1], 'lon'));
    const ele = Number(elevation(match[2]));
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
function publicRouteError(status) {
  if (status === 429)
    return new StravaError('STRAVA_RATE_LIMITED', 'Strava 请求频率已达上限，请稍后重试');
  return new StravaError(
    'PUBLIC_ROUTE_UNAVAILABLE',
    '暂时无法读取该公开路线，请确认路线公开后重试或手动填写',
  );
}
function invalidPublicRoute() {
  return new StravaError('PUBLIC_ROUTE_INVALID', '未能识别该 Strava 公开路线，请手动填写');
}
function publicRouteImage(pageProps, html) {
  const candidate = typeof pageProps?.ogImage?.url === 'string' ? pageProps.ogImage.url : '';
  const meta =
    /<meta\b[^>]*\bproperty=["']og:image["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/i.exec(
      html,
    )?.[1] ||
    /<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bproperty=["']og:image["'][^>]*>/i.exec(
      html,
    )?.[1] ||
    '';
  try {
    const image = new URL(candidate || meta);
    return image.protocol === 'https:' ? image.toString() : undefined;
  } catch {
    return undefined;
  }
}
function decodeHtmlText(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d{1,7});/g, (_match, code) => String.fromCodePoint(Number(code)))
    .trim();
}
function publicRouteName(pageProps, html) {
  if (typeof pageProps?.routeName === 'string' && pageProps.routeName.trim())
    return pageProps.routeName.trim();
  const heading =
    /<h1\b[^>]*\bclass=["'][^"']*EntityCallToAction[^"']*["'][^>]*>([\s\S]*?)<\/h1\s*>/i.exec(
      html,
    )?.[1];
  if (!heading) return '';
  const text = decodeHtmlText(heading);
  const quoted = /[“"](.{1,120})[”"]/.exec(text);
  return quoted?.[1]?.trim() || '';
}
function parsePublicRouteHtml(html, expectedRouteId) {
  const match = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(html);
  if (!match) throw invalidPublicRoute();
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw invalidPublicRoute();
  }
  const pageProps = data?.pageProps;
  const routeId = String(pageProps?.routeId || data?.query?.id || '');
  const routeName = publicRouteName(pageProps, html);
  if (
    data?.page !== '/routes/[id]' ||
    routeId !== expectedRouteId ||
    !routeName ||
    routeName.length > 120
  )
    throw invalidPublicRoute();
  const result = {
    strava_route_id: expectedRouteId,
    strava_route_url: `https://www.strava.com/routes/${expectedRouteId}`,
    route_name: routeName,
  };
  const image = publicRouteImage(pageProps, html);
  return image ? { ...result, preview_image_url: image } : result;
}
function parseRouteStat(statsHtml, label) {
  const pattern = new RegExp(
    `<div\\b[^>]*class=["'][^"']*stat-label[^"']*["'][^>]*>\\s*${label}\\s*<\\/div>\\s*<div\\b[^>]*class=["'][^"']*stat-value[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`,
    'i',
  );
  return decodeHtmlText(pattern.exec(statsHtml)?.[1] || '');
}
function parseRouteMeasure(value, units) {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*(km|mi|m|ft)$/i.exec(value.replace(/,/g, '').trim());
  if (!match || !units.includes(match[2].toLowerCase())) throw invalidPublicRoute();
  return { value: Number(match[1]), unit: match[2].toLowerCase() };
}
function parseEmbedRouteIdentity(html, expectedRouteId) {
  const match =
    /<a\b([^>]*)>(?:(?!<\/a>)[\s\S])*?<h1\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>(?:(?!<\/a>)[\s\S])*?<\/a>/i.exec(
      html,
    );
  const href = /\bhref=["']([^"']+)["']/i.exec(match?.[1] || '')?.[1];
  const title = decodeHtmlText(match?.[2] || '');
  try {
    const link = new URL(decodeHtmlText(href || ''));
    const fallback = new URL(link.searchParams.get('$fallback_url') || '');
    if (
      fallback.protocol !== 'https:' ||
      fallback.hostname !== 'strava.com' ||
      fallback.port ||
      fallback.pathname !== `/routes/${expectedRouteId}` ||
      !title ||
      title.length > 120
    )
      throw new Error();
  } catch {
    throw invalidPublicRoute();
  }
  return title;
}
function parsePublicRouteEmbedHtml(html, expectedRouteId, expectedTitle, maxPoints = 80) {
  const embedTitle = parseEmbedRouteIdentity(html, expectedRouteId);
  if (embedTitle !== expectedTitle) throw invalidPublicRoute();
  const statsHtml =
    /<div\b[^>]*class=["'][^"']*\bstats\b[^"']*["'][^>]*>([\s\S]*?)<script\b/i.exec(html)?.[1] ||
    html;
  const type = parseRouteStat(statsHtml, 'Type');
  const distance = parseRouteMeasure(parseRouteStat(statsHtml, 'Distance'), ['km', 'mi']);
  const elevation = parseRouteMeasure(parseRouteStat(statsHtml, 'Elev Gain'), ['m', 'ft']);
  if (!type || type.length > 40) throw invalidPublicRoute();
  const distanceKm = distance.value * (distance.unit === 'mi' ? 1.609344 : 1);
  const elevationM = elevation.value * (elevation.unit === 'ft' ? 0.3048 : 1);
  if (!(distanceKm > 0 && distanceKm <= 2000 && elevationM >= 0 && elevationM <= 30000))
    throw invalidPublicRoute();
  const script =
    /<script\b[^>]*\bid=["']__ROUTE_DATA__["'][^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(
      html,
    );
  let data;
  try {
    data = JSON.parse(script?.[1] || '');
  } catch {
    throw invalidPublicRoute();
  }
  const coordinates = data?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 200000)
    throw invalidPublicRoute();
  const points = coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length !== 3) throw invalidPublicRoute();
    const [lon, lat, ele] = coordinate;
    if (
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180 ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(ele) ||
      ele < -1000 ||
      ele > 10000
    )
      throw invalidPublicRoute();
    return { lon, lat, ele, distance: 0 };
  });
  let geometryDistance = 0;
  let south = points[0].lat;
  let north = south;
  let west = points[0].lon;
  let east = west;
  for (let index = 1; index < points.length; index += 1) {
    geometryDistance += haversineMeters(points[index - 1], points[index]);
    points[index].distance = geometryDistance;
    south = Math.min(south, points[index].lat);
    north = Math.max(north, points[index].lat);
    west = Math.min(west, points[index].lon);
    east = Math.max(east, points[index].lon);
  }
  if (!(geometryDistance > 0)) throw invalidPublicRoute();
  const count = Math.min(points.length, maxPoints);
  const indexes = Array.from({ length: count }, (_, index) =>
    Math.round((index * (points.length - 1)) / (count - 1)),
  );
  return {
    distance_km: Number(distanceKm.toFixed(2)),
    elevation_m: Number(elevationM.toFixed(1)),
    elevation_profile: indexes.map((index) => ({
      distance_km: Number(((points[index].distance / geometryDistance) * distanceKm).toFixed(3)),
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
function estimatePublicRouteMovingTime(distanceKm, elevationM) {
  const seconds = Math.round((distanceKm / 22 + elevationM / 600) * 60 * 60);
  return Math.min(7 * 24 * 60 * 60, Math.max(60, seconds));
}
async function readPublicRouteHtml(response) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let html = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PUBLIC_ROUTE_HTML_BYTES) {
        await reader.cancel();
        throw new StravaError('PUBLIC_ROUTE_TOO_LARGE', 'Strava 公开路线页面过大，请手动填写');
      }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  }
  const html = await response.text();
  if (Buffer.byteLength(html) > MAX_PUBLIC_ROUTE_HTML_BYTES)
    throw new StravaError('PUBLIC_ROUTE_TOO_LARGE', 'Strava 公开路线页面过大，请手动填写');
  return html;
}
async function fetchPublicRouteHtml(fetchImpl, url, signal) {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'manual',
    signal,
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (compatible; CiliRoutePreview/1.0)',
    },
  });
  if (!response?.ok) throw publicRouteError(Number(response?.status));
  const declaredHeader = response.headers?.get?.('content-length');
  const declared =
    declaredHeader === null || declaredHeader === undefined ? NaN : Number(declaredHeader);
  if (Number.isFinite(declared) && declared > MAX_PUBLIC_ROUTE_HTML_BYTES)
    throw new StravaError('PUBLIC_ROUTE_TOO_LARGE', 'Strava 公开路线页面过大，请手动填写');
  if (response.redirected === true || (response.url && response.url !== url))
    throw publicRouteError(Number(response.status));
  return readPublicRouteHtml(response);
}
async function publicRoutePreviewFlow({
  openid,
  routeUrl,
  store,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  timeoutMs = PUBLIC_ROUTE_TIMEOUT_MS,
}) {
  const routeId = extractRouteId(routeUrl);
  if (typeof fetchImpl !== 'function')
    throw new StravaError('PUBLIC_ROUTE_UNAVAILABLE', '公开路线解析服务暂时不可用');
  const canonicalUrl = `https://www.strava.com/routes/${routeId}`;
  const embedUrl = `https://strava-embeds.com/route/${routeId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const [canonicalHtml, embedHtml] = await Promise.all([
      fetchPublicRouteHtml(fetchImpl, canonicalUrl, controller.signal),
      fetchPublicRouteHtml(fetchImpl, embedUrl, controller.signal),
    ]);
    const identity = parsePublicRouteHtml(canonicalHtml, routeId);
    const details = parsePublicRouteEmbedHtml(embedHtml, routeId, identity.route_name);
    const preview = {
      ...identity,
      ...details,
      estimated_moving_time_seconds: estimatePublicRouteMovingTime(
        details.distance_km,
        details.elevation_m,
      ),
      popular_climbs: [],
      strava_gpx_available: false,
    };
    if (store?.saveRoutePreview) await store.saveRoutePreview(openid, preview, now);
    return preview;
  } catch (error) {
    if (error instanceof StravaError) throw error;
    throw new StravaError('PUBLIC_ROUTE_UNAVAILABLE', '公开路线解析服务暂时不可用，请手动填写');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
async function routePreviewFlow({ openid, routeUrl, env, store, api, now = new Date() }) {
  const routeId = extractRouteId(routeUrl);
  const token = await access({ openid, env, store, api, now });
  const [route, gpx] = await Promise.all([api.route(token, routeId), api.routeGpx(token, routeId)]);
  const parsed = parseGpx(gpx);
  const estimatedMovingTime = Number(route?.estimated_moving_time);
  const preview = {
    strava_route_id: routeId,
    strava_route_url: `https://www.strava.com/routes/${routeId}`,
    ...parsed,
    estimated_moving_time_seconds:
      Number.isFinite(estimatedMovingTime) && estimatedMovingTime > 0
        ? Math.round(estimatedMovingTime)
        : 0,
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
  MAX_PUBLIC_ROUTE_HTML_BYTES,
  extractRouteId,
  haversineMeters,
  parseGpx,
  popularClimbs,
  requireRead,
  previewId,
  parsePublicRouteHtml,
  publicRoutePreviewFlow,
  routePreviewFlow,
  routeGpxFlow,
};
