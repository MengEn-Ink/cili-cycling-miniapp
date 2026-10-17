import type { RouteElevationPoint } from '../../../models/index';
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
  if (!context || width <= 0 || height <= 0 || profile.length < 2) return false;
  const startKm = profile[0].distanceKm;
  const endKm = profile[profile.length - 1].distanceKm;
  const elevations = profile.map((point) => point.elevationM);
  const minimum = Math.min(...elevations);
  const maximum = Math.max(...elevations);
  if (endKm <= startKm || !Number.isFinite(minimum) || !Number.isFinite(maximum)) return false;

  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  context.setTransform?.(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const left = 22;
  const right = 12;
  const top = 16;
  const bottom = 28;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const elevationRange = Math.max(1, maximum - minimum);
  const x = (km: number) => left + ((km - startKm) / (endKm - startKm)) * chartWidth;
  const y = (elevation: number) => top + (1 - (elevation - minimum) / elevationRange) * chartHeight;

  if (selection.segment) {
    context.fillStyle = '#f3e6d0';
    context.fillRect(
      x(selection.segment.startKm),
      top,
      Math.max(2, x(selection.segment.endKm) - x(selection.segment.startKm)),
      chartHeight,
    );
  }

  context.beginPath();
  profile.forEach((point, index) => {
    if (index === 0) context.moveTo(x(point.distanceKm), y(point.elevationM));
    else context.lineTo(x(point.distanceKm), y(point.elevationM));
  });
  context.lineWidth = 2;
  context.strokeStyle = '#c0321f';
  context.stroke();

  for (const point of keyPoints) {
    if (point.elevation === null || point.km < startKm || point.km > endKm) continue;
    context.beginPath();
    context.arc(
      x(point.km),
      y(point.elevation),
      point.id === selection.point?.id ? 5 : 3,
      0,
      Math.PI * 2,
    );
    context.fillStyle = point.id === selection.point?.id ? '#211f1c' : '#e13b2b';
    context.fill();
  }

  if (selection.point?.elevation !== null && selection.point?.elevation !== undefined) {
    const cursorX = x(selection.point.km);
    context.beginPath();
    context.moveTo(cursorX, top);
    context.lineTo(cursorX, top + chartHeight);
    context.setLineDash?.([4, 4]);
    context.strokeStyle = '#211f1c';
    context.lineWidth = 1;
    context.stroke();
    context.setLineDash?.([]);
  }

  context.fillStyle = '#6f675d';
  context.font = '11px sans-serif';
  context.textAlign = 'left';
  context.fillText(`${Math.round(maximum)}m`, left, 12);
  context.fillText(`0 km`, left, height - 8);
  context.textAlign = 'right';
  context.fillText(`${endKm.toFixed(1)} km`, width - right, height - 8);
  return true;
}
