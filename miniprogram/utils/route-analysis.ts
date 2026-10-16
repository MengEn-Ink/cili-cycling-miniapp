import type { Activity, RouteCoordinate, RouteElevationPoint } from '../models/index';
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

export function hasAnalyzableRoute(route?: Partial<Route> | null): boolean {
  if (!route) return false;
  const profileDistances = new Set(
    (route.elevationProfile || [])
      .filter(
        (point) => finite(point?.distanceKm) && finite(point?.elevationM) && point.distanceKm >= 0,
      )
      .map((point) => round(point.distanceKm, 4)),
  );
  const validOutlineCount = (route.routeOutline || []).filter((point) =>
    validCoordinate(point?.latitude, point?.longitude),
  ).length;
  return (
    (finite(route.distanceKm) && route.distanceKm > 0) ||
    (profileDistances.size > 1 && Math.max(...profileDistances) > 0) ||
    validOutlineCount > 1
  );
}

function cleanProfile(route: Route, distanceKm: number): RouteElevationPoint[] {
  const byDistance = new Map<number, number>();
  for (const point of route.elevationProfile || []) {
    if (!finite(point?.distanceKm) || !finite(point?.elevationM) || point.distanceKm < 0) continue;
    const distance = distanceKm > 0 ? clamp(point.distanceKm, 0, distanceKm) : point.distanceKm;
    byDistance.set(round(distance, 4), point.elevationM);
  }
  return [...byDistance.entries()]
    .map(([distanceKm, elevationM]) => ({ distanceKm, elevationM }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function cleanOutline(route: Route): RouteCoordinate[] {
  return (route.routeOutline || []).filter((point) =>
    validCoordinate(point?.latitude, point?.longitude),
  );
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
        '地点名称待接入逆地理编码',
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
          '地点名称待接入逆地理编码',
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
          '地点名称待接入逆地理编码',
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
        '地点名称待接入逆地理编码',
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
  const ascent = finite(route.elevationM) && route.elevationM > 0 ? route.elevationM : 0;
  const segments = deriveRouteSegments(profile, effectiveDistance);
  const strategySummary = [
    effectiveDistance >= 80
      ? '长距离路线：前半程保留体力并按计划补给。'
      : '按路线长度分配体力，起步阶段避免过快。',
    ascent >= 1000
      ? '累计爬升较高：主爬坡前补水，采用轻档稳定踏频。'
      : '爬升压力以分段数据为准，坡前预留恢复时间。',
  ];
  if (segments.some((segment) => segment.type === 'descent'))
    strategySummary.push('存在明显下降分段：控制速度并保持安全车距。');
  const equipment = ['头盔、手套、前后车灯与基础修车工具'];
  if (effectiveDistance >= 40) equipment.push('足量饮水、能量补给与备用电解质');
  if (ascent >= 700) equipment.push('适合爬坡的传动配置与备用内胎');
  if (highest !== null && highest >= 1500)
    equipment.push('高海拔保暖层；具体穿衣需结合出发前真实天气');
  equipment.push('以上仅基于路线长度、爬升和最高点，不含实时天气');
  const quality = ['数据来源：活动 Activity.route；关键点与分段由本地确定性规则派生。'];
  if (profile.length < 2) quality.push('缺少有效海拔剖面：坡度、最高点公里与升降分段将降级。');
  if (outline.length < 2) quality.push('缺少有效路线轮廓：地图与关键点坐标将降级。');
  return {
    overview: {
      distanceKm: round(effectiveDistance),
      ascentM: Math.round(ascent),
      highestM: highest === null ? null : round(highest),
      durationText: formatRouteDuration(route.estimatedMovingTimeSeconds),
    },
    profile,
    outline,
    keyPoints: deriveKeyPoints(route, effectiveDistance, profile, outline),
    segments,
    strategySummary,
    equipment,
    quality,
  };
}
