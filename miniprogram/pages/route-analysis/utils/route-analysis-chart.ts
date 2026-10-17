import type { RouteElevationPoint } from '../../../models/index';
import { drawRouteElevation, ROUTE_VISUAL_STYLE } from '../../../utils/route-visual';
import type { RouteKeyPoint, RouteSegment } from './route-analysis';

export interface ElevationChartSelection {
  point?: RouteKeyPoint | null;
  segment?: RouteSegment | null;
}

export function drawRouteAnalysisElevation(
  context: any,
  width: number,
  height: number,
  profile: RouteElevationPoint[],
  keyPoints: RouteKeyPoint[],
  selection: ElevationChartSelection = {},
  pixelRatio = 1,
): boolean {
  const drawn = drawRouteElevation(context, width, height, profile, pixelRatio, {
    segment: selection.segment,
    selected: selection.point
      ? { km: selection.point.km, elevation: selection.point.elevation }
      : null,
  });
  if (!drawn) return false;

  const startKm = profile[0].distanceKm;
  const endKm = profile[profile.length - 1].distanceKm;
  const elevations = profile.map((point) => point.elevationM);
  const minimum = Math.min(...elevations);
  const maximum = Math.max(...elevations);
  const { left, right, top, bottom } = ROUTE_VISUAL_STYLE.elevationPadding;
  const chartWidth = Math.max(1, width - left - right);
  const chartHeight = Math.max(1, height - top - bottom);
  const elevationRange = Math.max(1, maximum - minimum);
  const x = (km: number) => left + ((km - startKm) / (endKm - startKm)) * chartWidth;
  const y = (elevation: number) => top + ((maximum - elevation) / elevationRange) * chartHeight;

  // 完整分析页保留全部策略关键点；活动详情只使用共享曲线，不承担此 overlay。
  for (const point of keyPoints) {
    if (point.elevation === null || point.km < startKm || point.km > endKm) continue;
    const selected = point.id === selection.point?.id;
    context.beginPath();
    context.arc(x(point.km), y(point.elevation), selected ? 5 : 3, 0, Math.PI * 2);
    context.fillStyle = selected ? '#211f1c' : '#e13b2b';
    context.fill();
  }
  return true;
}
