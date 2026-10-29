import type { RouteCoordinate, RouteElevationPoint } from '../models/index';
import { THEME_COLORS } from '../config/theme';

export const ROUTE_VISUAL_STYLE = {
  routeColor: THEME_COLORS.action,
  accentColor: THEME_COLORS.brand,
  canvasBackground: THEME_COLORS.surface,
  overlayColor: THEME_COLORS.raised,
  selectedColor: THEME_COLORS.ink,
  mutedColor: THEME_COLORS.muted,
  routeWidth: 6,
  routePadding: 16,
  maxOutlinePoints: 420,
  elevationPadding: { left: 22, right: 12, top: 16, bottom: 28 },
  elevationFont: '11px sans-serif',
  elevationLineWidth: 2,
} as const;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function validRouteCoordinate(point: unknown): point is RouteCoordinate {
  const value = point as RouteCoordinate;
  return (
    Boolean(value) &&
    finite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    finite(value.longitude) &&
    Math.abs(value.longitude) <= 180
  );
}

function pointSegmentDeviation(
  point: RouteCoordinate,
  start: RouteCoordinate,
  end: RouteCoordinate,
): number {
  const latitudeScale = Math.cos((((start.latitude + end.latitude) / 2) * Math.PI) / 180);
  const x = (point.longitude - start.longitude) * latitudeScale;
  const y = point.latitude - start.latitude;
  const endX = (end.longitude - start.longitude) * latitudeScale;
  const endY = end.latitude - start.latitude;
  const lengthSquared = endX * endX + endY * endY;
  if (lengthSquared === 0) return x * x + y * y;
  const ratio = clamp((x * endX + y * endY) / lengthSquared, 0, 1);
  const offsetX = x - ratio * endX;
  const offsetY = y - ratio * endY;
  return offsetX * offsetX + offsetY * offsetY;
}

function turnStrength(points: RouteCoordinate[], index: number): number {
  const previous = points[index - 1];
  const point = points[index];
  const next = points[index + 1];
  if (!previous || !next) return 0;
  const latitudeScale = Math.cos((point.latitude * Math.PI) / 180);
  const incomingX = (point.longitude - previous.longitude) * latitudeScale;
  const incomingY = point.latitude - previous.latitude;
  const outgoingX = (next.longitude - point.longitude) * latitudeScale;
  const outgoingY = next.latitude - point.latitude;
  const incomingLength = Math.hypot(incomingX, incomingY);
  const outgoingLength = Math.hypot(outgoingX, outgoingY);
  if (!incomingLength || !outgoingLength) return 0;
  const cosine = clamp(
    (incomingX * outgoingX + incomingY * outgoingY) / (incomingLength * outgoingLength),
    -1,
    1,
  );
  return 1 - cosine;
}

export function sampleRouteOutline(
  points: RouteCoordinate[],
  limit: number = ROUTE_VISUAL_STYLE.maxOutlinePoints,
): RouteCoordinate[] {
  if (points.length <= limit) return points;
  if (limit <= 1) return [points[0]];
  const retained = new Set([0, points.length - 1]);
  const segments = [{ start: 0, end: points.length - 1, index: -1, deviation: -1 }];
  const measure = (segment: (typeof segments)[number]) => {
    segment.index = -1;
    segment.deviation = -1;
    for (let index = segment.start + 1; index < segment.end; index += 1) {
      const deviation =
        pointSegmentDeviation(points[index], points[segment.start], points[segment.end]) +
        turnStrength(points, index) * 1e-10;
      if (deviation > segment.deviation) {
        segment.index = index;
        segment.deviation = deviation;
      }
    }
  };
  measure(segments[0]);
  while (retained.size < limit) {
    segments.sort((left, right) => right.deviation - left.deviation);
    const segment = segments.shift();
    if (!segment || segment.index < 0 || segment.deviation <= 0) break;
    retained.add(segment.index);
    const left = { start: segment.start, end: segment.index, index: -1, deviation: -1 };
    const right = { start: segment.index, end: segment.end, index: -1, deviation: -1 };
    measure(left);
    measure(right);
    segments.push(left, right);
  }
  return [...retained].sort((left, right) => left - right).map((index) => points[index]);
}

export function cleanRouteOutline(value: unknown): RouteCoordinate[] {
  return sampleRouteOutline(Array.isArray(value) ? value.filter(validRouteCoordinate) : []);
}

const PI = Math.PI;
const AXIS = 6378245;
const ECCENTRICITY = 0.006693421622965943;

export function isOutsideChina(latitude: number, longitude: number): boolean {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function latitudeOffset(x: number, y: number) {
  return (
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x)) +
    ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3 +
    ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3 +
    ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3
  );
}

function longitudeOffset(x: number, y: number) {
  return (
    300 +
    x +
    2 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x)) +
    ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3 +
    ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3 +
    ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3
  );
}

export function wgs84ToGcj02(latitude: number, longitude: number): RouteCoordinate {
  if (!finite(latitude) || !finite(longitude) || isOutsideChina(latitude, longitude))
    return { latitude, longitude };
  let deltaLatitude = latitudeOffset(longitude - 105, latitude - 35);
  let deltaLongitude = longitudeOffset(longitude - 105, latitude - 35);
  const radians = (latitude / 180) * PI;
  let magic = Math.sin(radians);
  magic = 1 - ECCENTRICITY * magic * magic;
  const root = Math.sqrt(magic);
  deltaLatitude = (deltaLatitude * 180) / (((AXIS * (1 - ECCENTRICITY)) / (magic * root)) * PI);
  deltaLongitude = (deltaLongitude * 180) / ((AXIS / root) * Math.cos(radians) * PI);
  return { latitude: latitude + deltaLatitude, longitude: longitude + deltaLongitude };
}

function hasRouteSpan(points: RouteCoordinate[]): boolean {
  const first = points[0];
  return Boolean(
    first &&
    points.some(
      (point) => point.latitude !== first.latitude || point.longitude !== first.longitude,
    ),
  );
}

export function prepareRouteVisualModel<
  T extends { id: string; lat: number | null; lng: number | null },
>(
  value: unknown,
  keyPoints: readonly T[] = [],
  outlineIsWgs84 = false,
  gcj02KeyPointIds: readonly string[] = [],
) {
  const cleaned = cleanRouteOutline(value);
  // 坐标系不变量：后端 GPX 轮廓恒为 WGS84，只允许在此显示边界转换一次；
  // 微信 chooseLocation 选点恒为 GCJ-02，命中 gcj02KeyPointIds 时必须原样透传。
  const convertedOutline = outlineIsWgs84
    ? cleaned.map((point) => wgs84ToGcj02(point.latitude, point.longitude))
    : cleaned;
  const outline = hasRouteSpan(convertedOutline) ? convertedOutline : [];
  const preservedGcj02Points = new Set(gcj02KeyPointIds);
  const displayedKeyPoints = keyPoints.map((point) => {
    if (
      !outlineIsWgs84 ||
      preservedGcj02Points.has(point.id) ||
      !finite(point.lat) ||
      !finite(point.lng)
    )
      return point;
    const converted = wgs84ToGcj02(point.lat, point.lng);
    return { ...point, lat: converted.latitude, lng: converted.longitude };
  });
  return { outline, keyPoints: displayedKeyPoints };
}

export function cleanElevationProfile(
  value: unknown,
  distanceKm = 0,
  minimum?: number,
  maximum?: number,
): RouteElevationPoint[] {
  if (!Array.isArray(value)) return [];
  const byDistance = new Map<number, number>();
  for (const raw of value) {
    const point = raw as RouteElevationPoint;
    if (!point || !finite(point.distanceKm) || point.distanceKm < 0 || !finite(point.elevationM))
      continue;
    const distance = distanceKm > 0 ? clamp(point.distanceKm, 0, distanceKm) : point.distanceKm;
    byDistance.set(Number(distance.toFixed(4)), point.elevationM);
  }
  const profile = [...byDistance.entries()]
    .map(([profileDistanceKm, elevationM]) => ({ distanceKm: profileDistanceKm, elevationM }))
    .sort((left, right) => left.distanceKm - right.distanceKm);
  if (profile.length && finite(maximum)) {
    const peak = Math.max(...profile.map((point) => point.elevationM));
    if (maximum > peak) profile.find((point) => point.elevationM === peak)!.elevationM = maximum;
  }
  if (profile.length && finite(minimum)) {
    const low = Math.min(...profile.map((point) => point.elevationM));
    if (minimum < low) profile.find((point) => point.elevationM === low)!.elevationM = minimum;
  }
  return profile;
}

export interface ElevationChartOverlay {
  reveal?: number;
  segment?: { startKm: number; endKm: number } | null;
  selected?: { km: number; elevation: number | null } | null;
}

export function drawRouteElevation(
  context: any,
  width: number,
  height: number,
  value: unknown,
  pixelRatio = 1,
  overlay: ElevationChartOverlay = {},
): boolean {
  const profile = cleanElevationProfile(value);
  if (!context || width <= 0 || height <= 0 || profile.length < 2) return false;
  const startKm = profile[0].distanceKm;
  const endKm = profile[profile.length - 1].distanceKm;
  const elevations = profile.map((point) => point.elevationM);
  const minimum = Math.min(...elevations);
  const maximum = Math.max(...elevations);
  if (endKm <= startKm || !finite(minimum) || !finite(maximum)) return false;
  const ratio = finite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  context.setTransform?.(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const { left, right, top, bottom } = ROUTE_VISUAL_STYLE.elevationPadding;
  const chartWidth = Math.max(1, width - left - right);
  const chartHeight = Math.max(1, height - top - bottom);
  const range = Math.max(1, maximum - minimum);
  const x = (km: number) => left + ((km - startKm) / (endKm - startKm)) * chartWidth;
  const y = (elevation: number) => top + ((maximum - elevation) / range) * chartHeight;

  if (overlay.segment) {
    context.fillStyle = ROUTE_VISUAL_STYLE.overlayColor;
    context.fillRect(
      x(overlay.segment.startKm),
      top,
      Math.max(2, x(overlay.segment.endKm) - x(overlay.segment.startKm)),
      chartHeight,
    );
  }

  const progress = clamp(finite(overlay.reveal) ? overlay.reveal : 1, 0, 1);
  const visible = profile.slice(0, Math.max(2, Math.ceil((profile.length - 1) * progress) + 1));
  context.beginPath();
  visible.forEach((point, index) => {
    if (index === 0) context.moveTo(x(point.distanceKm), y(point.elevationM));
    else context.lineTo(x(point.distanceKm), y(point.elevationM));
  });
  context.lineWidth = ROUTE_VISUAL_STYLE.elevationLineWidth;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = ROUTE_VISUAL_STYLE.routeColor;
  context.stroke();

  const anchors =
    progress < 1
      ? [visible[visible.length - 1]]
      : [
          profile[0],
          profile[elevations.indexOf(maximum)],
          profile[elevations.indexOf(minimum)],
          profile[profile.length - 1],
        ];
  const uniqueAnchors = anchors.filter(
    (point, index, values) =>
      values.findIndex((item) => item.distanceKm === point.distanceKm) === index,
  );
  context.fillStyle = ROUTE_VISUAL_STYLE.accentColor;
  uniqueAnchors.forEach((point) => {
    context.beginPath();
    context.arc(x(point.distanceKm), y(point.elevationM), 3, 0, Math.PI * 2);
    context.fill();
  });

  if (overlay.selected?.elevation !== null && overlay.selected?.elevation !== undefined) {
    const cursorX = x(overlay.selected.km);
    context.beginPath();
    context.moveTo(cursorX, top);
    context.lineTo(cursorX, top + chartHeight);
    context.setLineDash?.([4, 4]);
    context.strokeStyle = ROUTE_VISUAL_STYLE.selectedColor;
    context.lineWidth = 1;
    context.stroke();
    context.setLineDash?.([]);
  }

  context.fillStyle = ROUTE_VISUAL_STYLE.mutedColor;
  context.font = ROUTE_VISUAL_STYLE.elevationFont;
  context.textAlign = 'left';
  context.fillText(`${Math.round(maximum)}m`, left, 12);
  context.fillText(`${startKm.toFixed(1)} km`, left, height - 8);
  context.textAlign = 'right';
  context.fillText(`${Math.round(minimum)}m`, width - right, 12);
  context.fillText(`${endKm.toFixed(1)} km`, width - right, height - 8);
  return true;
}
