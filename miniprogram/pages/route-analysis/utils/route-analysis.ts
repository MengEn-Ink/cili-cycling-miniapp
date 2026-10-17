import type { Activity, RouteCoordinate, RouteElevationPoint } from '../../../models/index';
import { deriveRouteSegments, formatRouteDuration } from './route-analysis-segments';
import type { KeyPointType, RouteAnalysis, RouteKeyPoint } from './route-analysis-types';
export type {
  KeyPointType,
  RouteAnalysis,
  RouteKeyPoint,
  RouteSegment,
  SegmentType,
} from './route-analysis-types';

type Route = Activity['route'];
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validCoordinate = (latitude: unknown, longitude: unknown) =>
  finite(latitude) && finite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

function cleanProfile(route: Route, distanceKm: number): RouteElevationPoint[] {
  const byDistance = new Map<number, number>();
  for (const point of route.elevationProfile || []) {
    if (!finite(point?.distanceKm) || !finite(point?.elevationM) || point.distanceKm < 0) continue;
    const distance = distanceKm > 0 ? clamp(point.distanceKm, 0, distanceKm) : point.distanceKm;
    byDistance.set(round(distance, 4), point.elevationM);
  }
  const profile = [...byDistance.entries()]
    .map(([distanceKm, elevationM]) => ({ distanceKm, elevationM }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const alignExtreme = (value: unknown, findIndex: (point: RouteElevationPoint) => boolean) => {
    if (!finite(value) || !profile.length) return;
    const index = profile.findIndex(findIndex);
    if (index >= 0) profile[index] = { ...profile[index], elevationM: value };
  };
  if (finite(route.elevationMaxM)) {
    const current = Math.max(...profile.map((point) => point.elevationM));
    if (route.elevationMaxM > current)
      alignExtreme(route.elevationMaxM, (point) => point.elevationM === current);
  }
  if (finite(route.elevationMinM)) {
    const current = Math.min(...profile.map((point) => point.elevationM));
    if (route.elevationMinM < current)
      alignExtreme(route.elevationMinM, (point) => point.elevationM === current);
  }
  return profile;
}

const MAX_MAP_OUTLINE_POINTS = 420;

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

export function sampleRouteOutline(points: RouteCoordinate[], limit = MAX_MAP_OUTLINE_POINTS) {
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
    segments.sort((a, b) => b.deviation - a.deviation);
    const segment = segments.shift();
    if (!segment || segment.index < 0 || segment.deviation <= 0) break;
    retained.add(segment.index);
    const left = { start: segment.start, end: segment.index, index: -1, deviation: -1 };
    const right = { start: segment.index, end: segment.end, index: -1, deviation: -1 };
    measure(left);
    measure(right);
    segments.push(left, right);
  }
  return [...retained].sort((a, b) => a - b).map((index) => points[index]);
}

function cleanOutline(route: Route): RouteCoordinate[] {
  const valid = (route.routeOutline || []).filter((point) =>
    validCoordinate(point?.latitude, point?.longitude),
  );
  return sampleRouteOutline(valid);
}

function coordinateAt(
  outline: RouteCoordinate[],
  km: number,
  distanceKm: number,
): { lat: number | null; lng: number | null } {
  if (!outline.length || distanceKm <= 0) return { lat: null, lng: null };
  const index = Math.round(clamp(km / distanceKm, 0, 1) * (outline.length - 1));
  return { lat: outline[index].latitude, lng: outline[index].longitude };
}

function elevationAt(profile: RouteElevationPoint[], km: number): number | null {
  if (!profile.length) return null;
  return profile.reduce((best, point) =>
    Math.abs(point.distanceKm - km) < Math.abs(best.distanceKm - km) ? point : best,
  ).elevationM;
}

function gradeAt(profile: RouteElevationPoint[], km: number): number | null {
  if (profile.length < 2) return null;
  const nearestIndex = profile.reduce(
    (best, point, index) =>
      Math.abs(point.distanceKm - km) < Math.abs(profile[best].distanceKm - km) ? index : best,
    0,
  );
  const start = profile[Math.max(0, nearestIndex - 1)];
  const end = profile[Math.min(profile.length - 1, nearestIndex + 1)];
  const distanceM = (end.distanceKm - start.distanceKm) * 1000;
  if (distanceM <= 0) return null;
  return round(clamp(((end.elevationM - start.elevationM) / distanceM) * 100, -40, 40));
}

function trendWindow(profile: RouteElevationPoint[], direction: 1 | -1) {
  let best: { startKm: number; endKm: number; amount: number } | null = null;
  let current: { startKm: number; endKm: number; amount: number } | null = null;
  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1];
    const point = profile[index];
    if (point.distanceKm <= previous.distanceKm) continue;
    const change = (point.elevationM - previous.elevationM) * direction;
    if (change > 1) {
      current ||= { startKm: previous.distanceKm, endKm: point.distanceKm, amount: 0 };
      current.endKm = point.distanceKm;
      current.amount += change;
      if (!best || current.amount > best.amount) best = { ...current };
    } else if (change < -3) current = null;
  }
  return best;
}

function makePoint(
  id: string,
  type: KeyPointType,
  name: string,
  km: number,
  profile: RouteElevationPoint[],
  outline: RouteCoordinate[],
  distanceKm: number,
  source: RouteKeyPoint['source'],
  note: string,
  explicit?: { lat: number; lng: number },
): RouteKeyPoint {
  const coordinate = explicit || coordinateAt(outline, km, distanceKm);
  return {
    id,
    type,
    name,
    km: round(km),
    elevation: elevationAt(profile, km),
    gradePercent: gradeAt(profile, km),
    lat: finite(coordinate.lat) ? coordinate.lat : null,
    lng: finite(coordinate.lng) ? coordinate.lng : null,
    source,
    confidence: explicit ? '高' : profile.length && outline.length ? '中' : '低',
    note,
  };
}

function deriveKeyPoints(
  route: Route,
  distanceKm: number,
  profile: RouteElevationPoint[],
  outline: RouteCoordinate[],
): RouteKeyPoint[] {
  const startLocation = route.startLocation;
  const endLocation = route.endLocation;
  const points = [
    makePoint(
      'start',
      'start',
      startLocation?.name || route.start || '路线起点',
      0,
      profile,
      outline,
      distanceKm,
      '活动路线',
      '活动路线记录的起点',
      validCoordinate(startLocation?.latitude, startLocation?.longitude)
        ? { lat: startLocation!.latitude, lng: startLocation!.longitude }
        : undefined,
    ),
  ];
  if (profile.length) {
    const highest = profile.reduce((best, point) =>
      point.elevationM > best.elevationM ? point : best,
    );
    points.push(
      makePoint(
        'highest',
        'highest',
        '路线最高点',
        highest.distanceKm,
        profile,
        outline,
        distanceKm,
        '海拔剖面规则',
        '路线海拔最高位置',
      ),
    );
    const climb = trendWindow(profile, 1);
    if (climb && climb.amount >= 20)
      points.push(
        makePoint(
          'climb',
          'climb',
          `主爬坡起点 · km ${round(climb.startKm)}`,
          climb.startKm,
          profile,
          outline,
          distanceKm,
          '海拔剖面规则',
          '主爬坡由连续爬升变化识别，建议提前调整档位与节奏',
        ),
      );
    const descent = trendWindow(profile, -1);
    if (descent && descent.amount >= 20)
      points.push(
        makePoint(
          'descent',
          'descent',
          `长下坡入口 · km ${round(descent.startKm)}`,
          descent.startKm,
          profile,
          outline,
          distanceKm,
          '海拔剖面规则',
          '长下坡由连续下降变化识别，入坡前检查制动并控制车距',
        ),
      );
  }
  const restCount = distanceKm >= 90 ? 3 : distanceKm >= 50 ? 2 : distanceKm >= 20 ? 1 : 0;
  const ratios =
    restCount === 0
      ? []
      : restCount === 1
        ? [0.55]
        : restCount === 2
          ? [0.4, 0.7]
          : [0.3, 0.55, 0.78];
  ratios.forEach((ratio, index) => {
    const km = distanceKm * ratio;
    points.push(
      makePoint(
        `rest-${index + 1}`,
        'rest',
        `建议休息点 · km ${round(km)}`,
        km,
        profile,
        outline,
        distanceKm,
        '距离规则',
        '按路线长度设置的节奏检查位置，可结合实际体感决定是否停留',
      ),
    );
  });
  points.push(
    makePoint(
      'end',
      'end',
      endLocation?.name || route.end || '路线终点',
      distanceKm,
      profile,
      outline,
      distanceKm,
      '活动路线',
      '活动路线记录的终点',
      validCoordinate(endLocation?.latitude, endLocation?.longitude)
        ? { lat: endLocation!.latitude, lng: endLocation!.longitude }
        : undefined,
    ),
  );
  return points;
}

export function deriveRouteAnalysis(route: Route): RouteAnalysis {
  const distanceKm = finite(route.distanceKm) && route.distanceKm > 0 ? route.distanceKm : 0;
  const profile = cleanProfile(route, distanceKm);
  const effectiveDistance = distanceKm || profile[profile.length - 1]?.distanceKm || 0;
  const outline = cleanOutline(route);
  const highest = finite(route.elevationMaxM)
    ? route.elevationMaxM
    : profile.length
      ? Math.max(...profile.map((point) => point.elevationM))
      : null;
  const ascent = finite(route.elevationM) && route.elevationM >= 0 ? route.elevationM : null;
  const segments = deriveRouteSegments(profile, effectiveDistance);
  const strategySummary = [
    effectiveDistance >= 80
      ? '长距离路线：前半程保留体力并按计划补给。'
      : '按路线长度分配体力，起步阶段避免过快。',
    ascent !== null && ascent >= 1000
      ? '累计爬升较高：主爬坡前补水，采用轻档稳定踏频。'
      : '爬升压力以分段数据为准，坡前预留恢复时间。',
  ];
  if (segments.some((segment) => segment.type === 'descent'))
    strategySummary.push('存在明显下降分段：控制速度并保持安全车距。');
  const equipment = ['头盔、手套、前后车灯与基础修车工具'];
  if (effectiveDistance >= 40) equipment.push('足量饮水、能量补给与备用电解质');
  if (ascent !== null && ascent >= 700) equipment.push('适合爬坡的传动配置与备用内胎');
  if (segments.some((segment) => segment.type === 'descent'))
    equipment.push('下坡前检查刹车、胎压与尾灯电量');
  const risks: string[] = [];
  const hardestClimb = segments
    .filter((segment) => segment.type === 'climb')
    .sort((a, b) => (b.gradePercent || 0) - (a.gradePercent || 0))[0];
  if (hardestClimb)
    risks.push(
      `${hardestClimb.name} ${hardestClimb.startKm.toFixed(1)}–${hardestClimb.endKm.toFixed(1)} km：${hardestClimb.strategy}`,
    );
  const longestDescent = segments
    .filter((segment) => segment.type === 'descent')
    .sort((a, b) => b.endKm - b.startKm - (a.endKm - a.startKm))[0];
  if (longestDescent)
    risks.push(
      `${longestDescent.name} ${longestDescent.startKm.toFixed(1)}–${longestDescent.endKm.toFixed(1)} km：${longestDescent.strategy}`,
    );
  return {
    overview: {
      distanceKm: round(effectiveDistance),
      ascentM: ascent === null ? null : Math.round(ascent),
      highestM: highest === null ? null : round(highest),
      durationText: formatRouteDuration(route.estimatedMovingTimeSeconds),
    },
    profile,
    outline,
    keyPoints: deriveKeyPoints(route, effectiveDistance, profile, outline),
    segments,
    strategySummary,
    risks,
    equipment,
  };
}
