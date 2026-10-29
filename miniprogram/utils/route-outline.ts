import type { Activity, RouteCoordinate } from '../models';
import { ROUTE_VISUAL_STYLE } from './route-visual';

type Route = Activity['route'];
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function hasAnalyzableRoute(route?: Partial<Route> | null): boolean {
  if (!route) return false;
  const profileDistances = new Set(
    (route.elevationProfile || [])
      .filter(
        (point) => finite(point?.distanceKm) && finite(point?.elevationM) && point.distanceKm >= 0,
      )
      .map((point) => Number(point.distanceKm.toFixed(4))),
  );
  const validOutlineCount = (route.routeOutline || []).filter(
    (point) =>
      finite(point?.latitude) &&
      finite(point?.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180,
  ).length;
  return (
    (finite(route.distanceKm) && route.distanceKm > 0) ||
    (profileDistances.size > 1 && Math.max(...profileDistances) > 0) ||
    validOutlineCount > 1
  );
}

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
  _routeName = '路线详情',
  reveal = 1,
): void {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  context.save();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = ROUTE_VISUAL_STYLE.canvasBackground;
  context.fillRect(0, 0, width, height);

  const projected = projectRouteOutline(points, width, height, ROUTE_VISUAL_STYLE.routePadding);
  const progress = Math.max(0, Math.min(1, Number.isFinite(reveal) ? reveal : 1));
  const visible = projected.slice(0, Math.max(2, Math.ceil((projected.length - 1) * progress) + 1));
  if (visible.length >= 2) {
    context.beginPath();
    context.moveTo(visible[0].x, visible[0].y);
    for (const point of visible.slice(1)) context.lineTo(point.x, point.y);
    context.lineWidth = ROUTE_VISUAL_STYLE.routeWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = ROUTE_VISUAL_STYLE.routeColor;
    context.stroke();

    const endpoints =
      progress < 1 ? [visible[visible.length - 1]] : [visible[0], visible[visible.length - 1]];
    endpoints.forEach((point, index) => {
      context.beginPath();
      context.fillStyle =
        index === 0 ? ROUTE_VISUAL_STYLE.accentColor : ROUTE_VISUAL_STYLE.selectedColor;
      context.arc(point.x, point.y, 8, 0, Math.PI * 2);
      context.fill();
    });
  }
  context.restore();
}
