import {
  formatActivityDate,
  formatActivityTime,
  formatChinaDateTimeSeconds,
} from '../../utils/date-time';
import {
  cleanElevationProfile,
  drawRouteElevation,
  type ElevationChartOverlay,
} from '../../utils/route-visual';

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
  return cleanElevationProfile(value, distanceKm, minimum, maximum);
}

export function activityElevationProfile(route: any): ElevationPoint[] {
  return cleanElevationProfile(
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
  const overlay: ElevationChartOverlay = { reveal };
  return drawRouteElevation(context, width, height, value, pixelRatio, overlay);
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
