import { formatActivityDate, formatChinaDateTimeSeconds } from '../../utils/date-time';

export { formatActivityDate, formatChinaDateTimeSeconds };

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
}

export function validElevationProfile(value: unknown): ElevationPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (point): point is ElevationPoint =>
        !!point &&
        typeof point === 'object' &&
        typeof (point as ElevationPoint).distanceKm === 'number' &&
        Number.isFinite((point as ElevationPoint).distanceKm) &&
        (point as ElevationPoint).distanceKm >= 0 &&
        typeof (point as ElevationPoint).elevationM === 'number' &&
        Number.isFinite((point as ElevationPoint).elevationM),
    )
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

export function drawElevationProfile(
  context: any,
  width: number,
  height: number,
  value: unknown,
  pixelRatio = 1,
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
  const coordinate = (point: ElevationPoint) => ({
    x: padding.left + ((point.distanceKm - minDistance) / (maxDistance - minDistance)) * chartWidth,
    y: padding.top + ((maxElevation - point.elevationM) / elevationRange) * chartHeight,
  });

  context.strokeStyle = 'rgba(255,255,255,.15)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding.left, padding.top);
  context.lineTo(padding.left, padding.top + chartHeight);
  context.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  context.stroke();

  const gradient = context.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
  gradient.addColorStop(0, 'rgba(255,87,34,.48)');
  gradient.addColorStop(1, 'rgba(255,87,34,.03)');
  context.beginPath();
  points.forEach((point, index) => {
    const { x, y } = coordinate(point);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  const last = coordinate(points[points.length - 1]);
  const first = coordinate(points[0]);
  context.lineTo(last.x, padding.top + chartHeight);
  context.lineTo(first.x, padding.top + chartHeight);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  points.forEach((point, index) => {
    const { x, y } = coordinate(point);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = '#ff5722';
  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.stroke();

  context.fillStyle = '#8e8e93';
  context.font = '10px sans-serif';
  context.textAlign = 'right';
  context.fillText(`${Math.round(maxElevation)}m`, padding.left - 6, padding.top + 3);
  context.fillText(`${Math.round(minElevation)}m`, padding.left - 6, padding.top + chartHeight);
  context.textAlign = 'left';
  context.fillText(`${minDistance.toFixed(1)}km`, padding.left, height - 7);
  context.textAlign = 'right';
  context.fillText(`${maxDistance.toFixed(1)}km`, width - padding.right, height - 7);

  const extrema = [
    points[elevations.indexOf(maxElevation)],
    points[elevations.indexOf(minElevation)],
  ];
  context.fillStyle = '#ffb199';
  extrema.forEach((point) => {
    const { x, y } = coordinate(point);
    context.beginPath();
    context.arc(x, y, 3, 0, Math.PI * 2);
    context.fill();
  });
  return true;
}
