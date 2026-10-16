import type { RouteCoordinate } from '../models';

export interface ProjectedRoutePoint {
  x: number;
  y: number;
}

export interface RouteOutlineContext {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  save(): void;
  restore(): void;
  lineCap: string;
  lineJoin: string;
  lineWidth: number;
  strokeStyle: string;
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
}

export function projectRouteOutline(
  points: RouteCoordinate[],
  width: number,
  height: number,
  padding: number,
): ProjectedRoutePoint[] {
  if (
    !Array.isArray(points) ||
    points.length === 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(padding) ||
    width <= padding * 2 ||
    height <= padding * 2
  )
    return [];
  const usable = points.filter(
    (point) =>
      Number.isFinite(point.latitude) &&
      point.latitude >= -90 &&
      point.latitude <= 90 &&
      Number.isFinite(point.longitude) &&
      point.longitude >= -180 &&
      point.longitude <= 180,
  );
  if (!usable.length) return [];
  const latitudes = usable.map((point) => point.latitude);
  const longitudes = usable.map((point) => point.longitude);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const latitudeSpan = north - south;
  const longitudeSpan = east - west;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const horizontalScale = longitudeSpan > 0 ? availableWidth / longitudeSpan : Infinity;
  const verticalScale = latitudeSpan > 0 ? availableHeight / latitudeSpan : Infinity;
  const scale =
    horizontalScale === Infinity && verticalScale === Infinity
      ? 0
      : Math.min(horizontalScale, verticalScale);
  const contentWidth = longitudeSpan * scale;
  const contentHeight = latitudeSpan * scale;
  const left = (width - contentWidth) / 2;
  const top = (height - contentHeight) / 2;
  return usable.map((point) => ({
    x: scale ? left + (point.longitude - west) * scale : width / 2,
    y: scale ? top + (north - point.latitude) * scale : height / 2,
  }));
}

export function drawRouteOutline(
  context: RouteOutlineContext,
  width: number,
  height: number,
  points: RouteCoordinate[],
  pixelRatio = 1,
  routeName = '路线详情',
): void {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  context.save();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#211f1c';
  context.font = '700 14px sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillText(routeName || '路线详情', 24, 24);

  const projected = projectRouteOutline(points, width, height, 16);
  if (projected.length >= 2) {
    context.beginPath();
    context.moveTo(projected[0].x, projected[0].y);
    for (const point of projected.slice(1)) context.lineTo(point.x, point.y);
    context.lineWidth = 6;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#211f1c';
    context.stroke();

    const endpoints = [projected[0], projected[projected.length - 1]];
    endpoints.forEach((point, index) => {
      context.beginPath();
      context.fillStyle = index === 0 ? '#e13b2b' : '#211f1c';
      context.arc(point.x, point.y, 8, 0, Math.PI * 2);
      context.fill();
    });
  }
  context.restore();
}
