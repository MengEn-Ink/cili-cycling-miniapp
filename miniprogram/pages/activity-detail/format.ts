import {
  formatActivityDate,
  formatActivityTime,
  formatChinaDateTimeSeconds,
} from '../../utils/date-time';

export { formatActivityDate, formatActivityTime, formatChinaDateTimeSeconds };

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
}

export function validElevationProfile(
  value: unknown,
  distanceKm = 0,
  minimum?: number,
  maximum?: number,
): ElevationPoint[] {
  if (!Array.isArray(value)) return [];
  const byDistance = new Map<number, number>();
  for (const point of value) {
    if (
      !point ||
      typeof point !== 'object' ||
      typeof (point as ElevationPoint).distanceKm !== 'number' ||
      !Number.isFinite((point as ElevationPoint).distanceKm) ||
      (point as ElevationPoint).distanceKm < 0 ||
      typeof (point as ElevationPoint).elevationM !== 'number' ||
      !Number.isFinite((point as ElevationPoint).elevationM)
    )
      continue;
    const rawDistance = (point as ElevationPoint).distanceKm;
    const distance = distanceKm > 0 ? Math.min(distanceKm, rawDistance) : rawDistance;
    byDistance.set(Number(distance.toFixed(4)), (point as ElevationPoint).elevationM);
  }
  const profile = [...byDistance.entries()]
    .map(([distanceKm, elevationM]) => ({ distanceKm, elevationM }))
    .sort((left, right) => left.distanceKm - right.distanceKm);
  if (profile.length && Number.isFinite(maximum)) {
    const peak = Math.max(...profile.map((point) => point.elevationM));
    if (maximum! > peak) profile.find((point) => point.elevationM === peak)!.elevationM = maximum!;
  }
  if (profile.length && Number.isFinite(minimum)) {
    const low = Math.min(...profile.map((point) => point.elevationM));
    if (minimum! < low) profile.find((point) => point.elevationM === low)!.elevationM = minimum!;
  }
  return profile;
}

export function activityElevationProfile(route: any): ElevationPoint[] {
  return validElevationProfile(
    route?.elevationProfile,
    Number.isFinite(route?.distanceKm) && route.distanceKm > 0 ? route.distanceKm : 0,
    route?.elevationMinM,
    route?.elevationMaxM,
  );
}

export function drawElevationProfile(
  context: any,
  width: number,
  height: number,
  value: unknown,
  pixelRatio = 1,
  reveal = 1,
): boolean {
  const points = validElevationProfile(value);
  if (!context || points.length < 2 || width <= 0 || height <= 0) return false;
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  context.setTransform?.(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const padding = { left: 42, right: 12, top: 18, bottom: 28 };
  const chartWidth = Math.max(1, width - padding.left - padding.right);
  const chartHeight = Math.max(1, height - padding.top - padding.bottom);
  const minDistance = points[0].distanceKm;
  const maxDistance = points[points.length - 1].distanceKm;
  if (maxDistance <= minDistance) return false;
  const elevations = points.map((point) => point.elevationM);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const elevationRange = Math.max(1, maxElevation - minElevation);
  const progress = Math.max(0, Math.min(1, Number.isFinite(reveal) ? reveal : 1));
  const visiblePoints = points.slice(0, Math.max(2, Math.ceil((points.length - 1) * progress) + 1));
  const coordinate = (point: ElevationPoint) => ({
    x: padding.left + ((point.distanceKm - minDistance) / (maxDistance - minDistance)) * chartWidth,
    y: padding.top + ((maxElevation - point.elevationM) / elevationRange) * chartHeight,
  });

  context.strokeStyle = 'rgba(33,31,28,.14)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding.left, padding.top);
  context.lineTo(padding.left, padding.top + chartHeight);
  context.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  context.stroke();

  const gradient = context.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
  gradient.addColorStop(0, 'rgba(192,50,31,.48)');
  gradient.addColorStop(1, 'rgba(192,50,31,.03)');
  context.beginPath();
  visiblePoints.forEach((point, index) => {
    const { x, y } = coordinate(point);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  const last = coordinate(visiblePoints[visiblePoints.length - 1]);
  const first = coordinate(visiblePoints[0]);
  context.lineTo(last.x, padding.top + chartHeight);
  context.lineTo(first.x, padding.top + chartHeight);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  visiblePoints.forEach((point, index) => {
    const { x, y } = coordinate(point);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = '#c0321f';
  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.stroke();

  context.fillStyle = '#6f675d';
  context.font = '10px sans-serif';
  context.textAlign = 'right';
  context.fillText(`${Math.round(maxElevation)}m`, padding.left - 6, padding.top + 3);
  context.fillText(`${Math.round(minElevation)}m`, padding.left - 6, padding.top + chartHeight);
  context.textAlign = 'left';
  context.fillText(`${minDistance.toFixed(1)}km`, padding.left, height - 7);
  context.textAlign = 'right';
  context.fillText(`${maxDistance.toFixed(1)}km`, width - padding.right, height - 7);

  const markers =
    progress < 1
      ? [visiblePoints[visiblePoints.length - 1]]
      : [points[elevations.indexOf(maxElevation)], points[elevations.indexOf(minElevation)]];
  context.fillStyle = '#e13b2b';
  markers.forEach((point) => {
    const { x, y } = coordinate(point);
    context.beginPath();
    context.arc(x, y, 3, 0, Math.PI * 2);
    context.fill();
  });
  return true;
}

export function runCanvasReveal(
  canvas: any,
  draw: (progress: number) => void,
  complete: () => void,
  duration = 650,
): () => void {
  const request = canvas?.requestAnimationFrame;
  const cancel = canvas?.cancelAnimationFrame;
  if (typeof request !== 'function' || typeof cancel !== 'function') {
    draw(1);
    complete();
    return () => {};
  }
  let frame: number | undefined;
  let stopped = false;
  let startedAt: number | undefined;
  const step = (timestamp: number) => {
    if (stopped) return;
    const now = Number.isFinite(timestamp) ? timestamp : Date.now();
    startedAt ??= now;
    const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
    draw(progress);
    if (progress >= 1) {
      frame = undefined;
      complete();
    } else frame = request.call(canvas, step);
  };
  frame = request.call(canvas, step);
  return () => {
    stopped = true;
    if (frame !== undefined) cancel.call(canvas, frame);
    frame = undefined;
  };
}
