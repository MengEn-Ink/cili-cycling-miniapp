import type { RouteAnalysis } from './route-analysis-types';
import { isOutsideChina, prepareRouteVisualModel, wgs84ToGcj02 } from '../../../utils/route-visual';

export { isOutsideChina, wgs84ToGcj02 };

/** 由共享视觉模型同时准备 polyline 和 marker，分析和下载源数据不变。 */
export function routeAnalysisForMap(
  analysis: RouteAnalysis,
  fromGpx: boolean,
  preserveKeyPointIds: readonly string[] = [],
): RouteAnalysis {
  const visual = prepareRouteVisualModel(
    analysis.outline,
    analysis.keyPoints,
    fromGpx,
    preserveKeyPointIds,
  );
  return { ...analysis, outline: visual.outline, keyPoints: visual.keyPoints };
}
