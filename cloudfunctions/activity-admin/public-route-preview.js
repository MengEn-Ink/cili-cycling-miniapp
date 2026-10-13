'use strict';

const crypto = require('node:crypto');
const { assertTrustedOpenid, fail, isEnabledAdmin } = require('./domain');

const MAX_PUBLIC_ROUTE_HTML_BYTES = 1024 * 1024;
const PUBLIC_ROUTE_TIMEOUT_MS = 8000;
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;
const REQUEST_FIELDS = new Set(['openid', 'routeUrl']);

function extractRouteId(value) {
  if (typeof value !== 'string' || value.length > 256 || value !== value.trim())
    fail('ROUTE_URL_INVALID', '请输入有效的 Strava 公开路线链接');
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
    fail('ROUTE_URL_INVALID', '请输入有效的 Strava 公开路线链接');
  }
}

function previewId(openid, routeId) {
  return crypto.createHash('sha256').update(`${openid}\0public-strava\0${routeId}`).digest('hex');
}

function invalidPublicRoute() {
  fail('PUBLIC_ROUTE_INVALID', '未能识别该 Strava 公开路线，请确认路线已公开');
}

function unavailable(status) {
  if (status === 429) fail('STRAVA_RATE_LIMITED', 'Strava 请求频率已达上限，请稍后重试');
  fail('PUBLIC_ROUTE_UNAVAILABLE', '暂时无法读取该公开路线，请确认路线公开后重试');
}

function decodeHtmlText(value) {
  return String(value || '')
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
  const text = decodeHtmlText(heading);
  return /[“"](.{1,120})[”"]/.exec(text)?.[1]?.trim() || '';
}

function parseCanonicalHtml(html, expectedRouteId) {
  const match = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(html);
  let data;
  try {
    data = JSON.parse(match?.[1] || '');
  } catch {
    invalidPublicRoute();
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
    invalidPublicRoute();
  return routeName;
}

function parseRouteStat(html, label) {
  const pattern = new RegExp(
    `<div\\b[^>]*class=["'][^"']*stat-label[^"']*["'][^>]*>\\s*${label}\\s*<\\/div>\\s*<div\\b[^>]*class=["'][^"']*stat-value[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`,
    'i',
  );
  return decodeHtmlText(pattern.exec(html)?.[1]);
}

function measure(value, units) {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*(km|mi|m|ft)$/i.exec(value.replace(/,/g, '').trim());
  if (!match || !units.includes(match[2].toLowerCase())) invalidPublicRoute();
  return { value: Number(match[1]), unit: match[2].toLowerCase() };
}

function haversineMeters(a, b) {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function sampleIndexes(length, maximum) {
  const count = Math.min(length, maximum);
  return Array.from({ length: count }, (_, index) =>
    Math.round((index * (length - 1)) / (count - 1)),
  );
}

function parseEmbedHtml(html, expectedRouteId, expectedTitle) {
  const anchor =
    /<a\b([^>]*)>(?:(?!<\/a>)[\s\S])*?<h1\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>(?:(?!<\/a>)[\s\S])*?<\/a>/i.exec(
      html,
    );
  try {
    const link = new URL(decodeHtmlText(/\bhref=["']([^"']+)["']/i.exec(anchor?.[1] || '')?.[1]));
    const fallback = new URL(link.searchParams.get('$fallback_url') || '');
    if (
      fallback.protocol !== 'https:' ||
      fallback.hostname !== 'strava.com' ||
      fallback.port ||
      fallback.pathname !== `/routes/${expectedRouteId}` ||
      decodeHtmlText(anchor?.[2]) !== expectedTitle
    )
      throw new Error();
  } catch {
    invalidPublicRoute();
  }
  const stats =
    /<div\b[^>]*class=["'][^"']*\bstats\b[^"']*["'][^>]*>([\s\S]*?)<script\b/i.exec(html)?.[1] ||
    html;
  const distance = measure(parseRouteStat(stats, 'Distance'), ['km', 'mi']);
  const elevation = measure(parseRouteStat(stats, 'Elev Gain'), ['m', 'ft']);
  const distanceKm = distance.value * (distance.unit === 'mi' ? 1.609344 : 1);
  const elevationM = elevation.value * (elevation.unit === 'ft' ? 0.3048 : 1);
  if (!(distanceKm > 0 && distanceKm <= 2000 && elevationM >= 0 && elevationM <= 30000))
    invalidPublicRoute();
  const script =
    /<script\b[^>]*\bid=["']__ROUTE_DATA__["'][^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(
      html,
    );
  let coordinates;
  try {
    coordinates = JSON.parse(script?.[1] || '').coordinates;
  } catch {
    invalidPublicRoute();
  }
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 200000)
    invalidPublicRoute();
  const points = coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length !== 3) invalidPublicRoute();
    const [longitude, latitude, elevationValue] = coordinate;
    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(elevationValue) ||
      elevationValue < -1000 ||
      elevationValue > 10000
    )
      invalidPublicRoute();
    return { longitude, latitude, elevation: elevationValue, distance: 0 };
  });
  let geometryDistance = 0;
  let gain = 0;
  let loss = 0;
  let minimum = points[0].elevation;
  let maximum = minimum;
  let south = points[0].latitude;
  let north = south;
  let west = points[0].longitude;
  let east = west;
  for (let index = 1; index < points.length; index += 1) {
    geometryDistance += haversineMeters(points[index - 1], points[index]);
    points[index].distance = geometryDistance;
    const delta = points[index].elevation - points[index - 1].elevation;
    gain += Math.max(0, delta);
    loss += Math.max(0, -delta);
    minimum = Math.min(minimum, points[index].elevation);
    maximum = Math.max(maximum, points[index].elevation);
    south = Math.min(south, points[index].latitude);
    north = Math.max(north, points[index].latitude);
    west = Math.min(west, points[index].longitude);
    east = Math.max(east, points[index].longitude);
  }
  if (!(geometryDistance > 0)) invalidPublicRoute();
  const profileIndexes = sampleIndexes(points.length, 80);
  const outlineIndexes = sampleIndexes(points.length, 240);
  return {
    distance_km: Number(distanceKm.toFixed(2)),
    elevation_m: Number(elevationM.toFixed(1)),
    elevation_loss_m: Number(loss.toFixed(1)),
    elevation_min_m: Number(minimum.toFixed(1)),
    elevation_max_m: Number(maximum.toFixed(1)),
    estimated_moving_time_seconds: Math.min(
      604800,
      Math.max(60, Math.round((distanceKm / 22 + elevationM / 600) * 3600)),
    ),
    estimation_source: 'cili',
    elevation_profile: profileIndexes.map((index) => ({
      distance_km: Number(((points[index].distance / geometryDistance) * distanceKm).toFixed(3)),
      elevation_m: Number(points[index].elevation.toFixed(1)),
    })),
    route_outline: outlineIndexes.map((index) => ({
      latitude: Number(points[index].latitude.toFixed(6)),
      longitude: Number(points[index].longitude.toFixed(6)),
    })),
    route_bounds: {
      south: Number(south.toFixed(6)),
      west: Number(west.toFixed(6)),
      north: Number(north.toFixed(6)),
      east: Number(east.toFixed(6)),
    },
  };
}

async function readHtml(response) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let html = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PUBLIC_ROUTE_HTML_BYTES) {
        await reader.cancel();
        fail('PUBLIC_ROUTE_TOO_LARGE', 'Strava 公开路线页面过大');
      }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  }
  const html = await response.text();
  if (Buffer.byteLength(html) > MAX_PUBLIC_ROUTE_HTML_BYTES)
    fail('PUBLIC_ROUTE_TOO_LARGE', 'Strava 公开路线页面过大');
  return html;
}

async function fetchHtml(fetchImpl, url, signal) {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'manual',
    signal,
    headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'CiliRoutePreview/1.0' },
  });
  if (!response?.ok) unavailable(Number(response?.status));
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PUBLIC_ROUTE_HTML_BYTES)
    fail('PUBLIC_ROUTE_TOO_LARGE', 'Strava 公开路线页面过大');
  if (response.redirected === true || (response.url && response.url !== url))
    unavailable(Number(response.status));
  return readHtml(response);
}

async function previewPublicRoute(deps, request, now = new Date()) {
  if (!request || typeof request !== 'object' || Array.isArray(request))
    fail('VALIDATION_FAILED', '公开路线参数无效');
  const forbidden = Object.keys(request).find((key) => !REQUEST_FIELDS.has(key));
  if (forbidden) fail('FORBIDDEN_FIELD', '公开路线请求包含未允许字段', { field: forbidden });
  assertTrustedOpenid(request.openid);
  const admin = await deps.getAdmin(request.openid);
  if (!isEnabledAdmin(admin, request.openid))
    fail('ADMIN_REQUIRED', '仅活动管理员可以解析公开路线');
  const routeId = extractRouteId(request.routeUrl);
  const id = previewId(request.openid, routeId);
  const existing = await deps.getPreview(id);
  if (
    existing &&
    existing.kind === 'public_strava' &&
    existing.owner_openid === request.openid &&
    new Date(existing.expires_at).getTime() > now.getTime()
  )
    return { preview_id: id, ...existing.summary, expires_at: existing.expires_at };
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function')
    fail('PUBLIC_ROUTE_UNAVAILABLE', '公开路线解析服务暂时不可用');
  const canonicalUrl = `https://www.strava.com/routes/${routeId}`;
  const embedUrl = `https://strava-embeds.com/route/${routeId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs || PUBLIC_ROUTE_TIMEOUT_MS);
  try {
    const [canonicalHtml, embedHtml] = await Promise.all([
      fetchHtml(fetchImpl, canonicalUrl, controller.signal),
      fetchHtml(fetchImpl, embedUrl, controller.signal),
    ]);
    const routeName = parseCanonicalHtml(canonicalHtml, routeId);
    const details = parseEmbedHtml(embedHtml, routeId, routeName);
    const summary = {
      external_provider: 'strava',
      external_route_id: routeId,
      external_route_url: canonicalUrl,
      strava_route_id: routeId,
      strava_route_url: canonicalUrl,
      route_name: routeName,
      strava_gpx_available: false,
      popular_climbs: [],
      ...details,
    };
    const preview = {
      _id: id,
      kind: 'public_strava',
      owner_openid: request.openid,
      summary,
      created_at: now,
      expires_at: new Date(now.getTime() + PREVIEW_TTL_MS),
      consumed_at: null,
      attached_activity_id: '',
    };
    await deps.putPreview(id, preview);
    return { preview_id: id, ...summary, expires_at: preview.expires_at };
  } catch (error) {
    if (error?.code) throw error;
    fail('PUBLIC_ROUTE_UNAVAILABLE', '公开路线解析服务暂时不可用，请稍后重试');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function assertUsablePublicRoutePreview(preview, { openid, previewId, routeId, activityId, now }) {
  if (
    !preview ||
    preview.kind !== 'public_strava' ||
    preview._id !== previewId ||
    preview.owner_openid !== openid ||
    preview.summary?.external_route_id !== routeId
  )
    fail('PUBLIC_ROUTE_PREVIEW_REQUIRED', '请重新解析 Strava 公开路线');
  if (preview.consumed_at && preview.attached_activity_id === activityId) return preview;
  if (new Date(preview.expires_at).getTime() <= now.getTime())
    fail('ROUTE_PREVIEW_EXPIRED', '路线预览已过期，请重新解析');
  if (preview.consumed_at) fail('ROUTE_PREVIEW_CONSUMED', '这份路线预览已用于其他活动，请重新解析');
  return preview;
}

module.exports = {
  MAX_PUBLIC_ROUTE_HTML_BYTES,
  PUBLIC_ROUTE_TIMEOUT_MS,
  extractRouteId,
  previewId,
  parseCanonicalHtml,
  parseEmbedHtml,
  previewPublicRoute,
  assertUsablePublicRoutePreview,
};
