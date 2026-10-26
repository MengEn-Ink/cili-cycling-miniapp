import type { RouteAnalysis } from './route-analysis-types';
import { isOutsideChina, prepareRouteVisualModel, wgs84ToGcj02 } from '../../../utils/route-visual';

export { isOutsideChina, wgs84ToGcj02 };

/**
 * 地图显示契约：GPX/WGS84 轮廓只在共享视觉边界转一次；微信选点 ID 已是 GCJ-02，原样透传。
 * 返回的 outline 与 keyPoints 可直接用于 polyline、markers 和 include-points，页面层禁止再次纠偏。
 */
export function routeAnalysisForMap(
  analysis: RouteAnalysis,
  outlineIsGpxWgs84: boolean,
  wechatGcj02KeyPointIds: readonly string[] = [],
): RouteAnalysis {
  const visual = prepareRouteVisualModel(
    analysis.outline,
    analysis.keyPoints,
    outlineIsGpxWgs84,
    wechatGcj02KeyPointIds,
  );
  return { ...analysis, outline: visual.outline, keyPoints: visual.keyPoints };
}
