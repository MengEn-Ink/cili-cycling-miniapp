'use strict';

const { XMLParser, XMLValidator } = require('fast-xml-parser');

const MAX_GPX_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_POINTS = 200000;
const MAX_ELEVATION_POINTS = 120;
const MAX_OUTLINE_POINTS = 240;
const EARTH_RADIUS_METERS = 6371008.8;
const ELEVATION_NOISE_THRESHOLD_METERS = 1.5;

const parser = new XMLParser({
  allowBooleanAttributes: false,
  attributeNamePrefix: '@_',
  htmlEntities: false,
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  removeNSPrefix: true,
  trimValues: true,
});

function gpxError(code, message) {
  return Object.assign(new Error(message), { code });
}

function invalidGpx() {
  throw gpxError('GPX_INVALID', '这个文件不是有效的 GPX，请重新导出后上传');
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function safeRouteName(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim().replace(/\s+/g, ' ');
  return text && text.length <= 120 ? text : '';
}

function fileRouteName(fileName) {
  const leaf =
    typeof fileName === 'string' ? fileName.trim().split(/[\\/]/).filter(Boolean).at(-1) || '' : '';
  return safeRouteName(leaf.replace(/\.gpx$/i, '')) || '路线详情';
}

function metadataRouteName(gpx, fileName) {
  const candidates = [
    gpx?.metadata?.name,
    ...asArray(gpx?.trk).map((track) => track?.name),
    ...asArray(gpx?.rte).map((route) => route?.name),
  ];
  for (const candidate of candidates) {
    const name = safeRouteName(candidate);
    if (name) return name;
  }
  return fileRouteName(fileName);
}

function rawPoint(node, breakBefore) {
  if (!isRecord(node)) invalidGpx();
  const latitude = finiteNumber(node['@_lat']);
  const longitude = finiteNumber(node['@_lon']);
  if (
    latitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude === undefined ||
    longitude < -180 ||
    longitude > 180
  )
    invalidGpx();
  const elevation = node.ele === undefined ? undefined : finiteNumber(node.ele);
  if (node.ele !== undefined && (elevation === undefined || elevation < -1000 || elevation > 10000))
    invalidGpx();
  return { latitude, longitude, elevation, breakBefore };
}

function trackPoints(gpx) {
  const points = [];
  for (const track of asArray(gpx?.trk)) {
    for (const segment of asArray(track?.trkseg)) {
      const nodes = asArray(segment?.trkpt);
      nodes.forEach((node, index) => {
        points.push(rawPoint(node, points.length > 0 && index === 0));
      });
    }
  }
  return points;
}

function routePoints(gpx) {
  const points = [];
  for (const route of asArray(gpx?.rte)) {
    const nodes = asArray(route?.rtept);
    nodes.forEach((node, index) => {
      points.push(rawPoint(node, points.length > 0 && index === 0));
    });
  }
  return points;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMeters(left, right) {
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

function smoothElevations(points) {
  return points.map((point, index) => {
    const start = Math.max(0, index - 1);
    const end = Math.min(points.length, index + 2);
    const window = points.slice(start, end);
    return window.reduce((total, item) => total + item.elevation, 0) / window.length;
  });
}

function elevationTotals(points) {
  const smoothed = smoothElevations(points);
  let gain = 0;
  let loss = 0;
  for (let index = 1; index < smoothed.length; index += 1) {
    const delta = smoothed[index] - smoothed[index - 1];
    if (delta > ELEVATION_NOISE_THRESHOLD_METERS) gain += delta;
    else if (delta < -ELEVATION_NOISE_THRESHOLD_METERS) loss -= delta;
  }
  return { gain, loss };
}

function sampleByDistance(points, maximum) {
  if (points.length <= maximum)
    return points.map((point) => ({
      distanceMeters: point.distanceMeters,
      latitude: point.latitude,
      longitude: point.longitude,
      elevation: point.elevation,
    }));
  const output = [];
  let sourceIndex = 0;
  const totalDistance = points.at(-1).distanceMeters;
  for (let index = 0; index < maximum; index += 1) {
    const target = totalDistance * (index / (maximum - 1));
    while (
      sourceIndex + 1 < points.length &&
      Math.abs(points[sourceIndex + 1].distanceMeters - target) <=
        Math.abs(points[sourceIndex].distanceMeters - target)
    )
      sourceIndex += 1;
    const point = points[sourceIndex];
    output.push({
      distanceMeters: point.distanceMeters,
      latitude: point.latitude,
      longitude: point.longitude,
      elevation: point.elevation,
    });
  }
  output[0] = {
    distanceMeters: points[0].distanceMeters,
    latitude: points[0].latitude,
    longitude: points[0].longitude,
    elevation: points[0].elevation,
  };
  const last = points.at(-1);
  output[output.length - 1] = {
    distanceMeters: last.distanceMeters,
    latitude: last.latitude,
    longitude: last.longitude,
    elevation: last.elevation,
  };
  return output;
}

function estimateRideSeconds(distanceMeters, elevationGainMeters) {
  const flatHours = distanceMeters / 1000 / 22;
  const climbingHours = elevationGainMeters / 600;
  return Math.max(60, Math.round(((flatHours + climbingHours) * 3600) / 60) * 60);
}

function assertXml(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) invalidGpx();
  if (bytes.length > MAX_GPX_BYTES)
    throw gpxError('GPX_TOO_LARGE', '文件超过 4 MB，请选择更小的 GPX');
  const xml = bytes.toString('utf8');
  if (/<\s*!\s*(?:doctype|entity)\b/i.test(xml)) invalidGpx();
  if (XMLValidator.validate(xml) !== true) invalidGpx();
  return xml;
}

function parseGpx(bytes, options = {}) {
  const xml = assertXml(bytes);
  let document;
  try {
    document = parser.parse(xml);
  } catch {
    invalidGpx();
  }
  const gpx = document?.gpx;
  if (!isRecord(gpx)) invalidGpx();
  const tracks = trackPoints(gpx);
  const points = tracks.length >= 2 ? tracks : routePoints(gpx);
  if (points.length < 2) invalidGpx();
  const maxSourcePoints =
    Number.isInteger(options.maxSourcePoints) && options.maxSourcePoints > 0
      ? options.maxSourcePoints
      : MAX_SOURCE_POINTS;
  if (points.length > maxSourcePoints)
    throw gpxError('GPX_TOO_MANY_POINTS', '路线点过多，请先简化路线后再上传');

  let distanceMeters = 0;
  const measured = points.map((point, index) => {
    if (index > 0 && !point.breakBefore)
      distanceMeters += haversineMeters(points[index - 1], point);
    return { ...point, distanceMeters };
  });
  const elevated = measured.filter((point) => point.elevation !== undefined);
  if (elevated.length < 2)
    throw gpxError('GPX_ELEVATION_REQUIRED', 'GPX 中没有海拔信息，暂时无法生成海拔曲线');

  const elevations = elevated.map((point) => point.elevation);
  const totals = elevationTotals(elevated);
  const elevationProfile = sampleByDistance(elevated, MAX_ELEVATION_POINTS).map((point) => ({
    distance_km: round(point.distanceMeters / 1000, 2),
    elevation_m: round(point.elevation, 1),
  }));
  const routeOutline = sampleByDistance(measured, MAX_OUTLINE_POINTS).map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  const latitudes = measured.map((point) => point.latitude);
  const longitudes = measured.map((point) => point.longitude);
  const distanceKm = round(distanceMeters / 1000, 2);
  return {
    route_name: metadataRouteName(gpx, options.fileName),
    distance_km: distanceKm,
    elevation_m: Math.round(totals.gain),
    elevation_loss_m: Math.round(totals.loss),
    elevation_min_m: round(Math.min(...elevations), 1),
    elevation_max_m: round(Math.max(...elevations), 1),
    estimated_moving_time_seconds: estimateRideSeconds(distanceMeters, totals.gain),
    estimation_source: 'cili',
    elevation_profile: elevationProfile,
    route_outline: routeOutline,
    route_bounds: {
      south: Math.min(...latitudes),
      west: Math.min(...longitudes),
      north: Math.max(...latitudes),
      east: Math.max(...longitudes),
    },
  };
}

module.exports = {
  MAX_GPX_BYTES,
  MAX_SOURCE_POINTS,
  MAX_ELEVATION_POINTS,
  MAX_OUTLINE_POINTS,
  parseGpx,
};
