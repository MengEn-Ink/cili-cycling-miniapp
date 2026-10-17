import type { RouteAnalysis } from './route-analysis-types';

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

export function wgs84ToGcj02(latitude: number, longitude: number) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    isOutsideChina(latitude, longitude)
  )
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

/** 只在明确来自 GPX（WGS84）时生成地图展示副本，分析和下载源数据不变。 */
export function routeAnalysisForMap(
  analysis: RouteAnalysis,
  fromGpx: boolean,
  preserveKeyPointIds: readonly string[] = [],
): RouteAnalysis {
  if (!fromGpx) return analysis;
  const preserved = new Set(preserveKeyPointIds);
  return {
    ...analysis,
    outline: analysis.outline.map((point) => wgs84ToGcj02(point.latitude, point.longitude)),
    keyPoints: analysis.keyPoints.map((point) => {
      // startLocation / endLocation 来自微信选点时已经是 GCJ-02，不能随 GPX 轮廓二次转换。
      if (preserved.has(point.id) || point.lat === null || point.lng === null) return point;
      const converted = wgs84ToGcj02(point.lat, point.lng);
      return { ...point, lat: converted.latitude, lng: converted.longitude };
    }),
  };
}
