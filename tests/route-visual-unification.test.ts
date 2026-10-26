// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Activity } from '../miniprogram/models/index';
import { drawElevationProfile } from '../miniprogram/pages/activity-detail/format';
import { drawRouteAnalysisElevation } from '../miniprogram/pages/route-analysis/utils/route-analysis-chart';
import { deriveRouteAnalysis } from '../miniprogram/pages/route-analysis/utils/route-analysis';
import { routeAnalysisForMap } from '../miniprogram/pages/route-analysis/utils/gcj02';
import {
  cleanElevationProfile,
  prepareRouteVisualModel,
  ROUTE_VISUAL_STYLE,
  wgs84ToGcj02,
} from '../miniprogram/utils/route-visual';

const read = (path: string) => readFileSync(path, 'utf8');

function chartContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: '',
    lineJoin: '',
    lineCap: '',
  };
}

describe('活动详情与完整分析共享视觉内核', () => {
  const route = {
    start: '',
    end: '',
    distanceKm: 20,
    elevationM: 100,
    level: '',
    gpxFileId: 'cloud://env/activity-routes/owner/route.gpx',
    gpxSha256: 'a'.repeat(64),
    elevationMinM: 10,
    elevationMaxM: 80,
    elevationProfile: [
      { distanceKm: 20, elevationM: 20 },
      { distanceKm: 0, elevationM: 10 },
      { distanceKm: 10, elevationM: 80 },
      { distanceKm: 10, elevationM: 60 },
    ],
    routeOutline: Array.from({ length: 600 }, (_, index) => ({
      latitude: 30 + Math.sin(index / 20) / 100,
      longitude: 120 + index / 100000,
    })),
  } as Activity['route'];

  it('详情移除重复绘制，完整分析继续独占共享路线 primitive 和常量', () => {
    const detail = read('miniprogram/pages/activity-detail/index.ts');
    const detailTemplate = read('miniprogram/pages/activity-detail/index.wxml');
    const outline = read('miniprogram/utils/route-outline.ts');
    const analysis = read('miniprogram/pages/route-analysis/index.ts');
    const analysisChart = read('miniprogram/pages/route-analysis/utils/route-analysis-chart.ts');
    expect(detail).not.toContain('prepareRouteVisualModel');
    expect(detail).not.toContain('drawElevationProfile');
    expect(detailTemplate).not.toContain('<canvas');
    expect(analysis).toContain('ROUTE_VISUAL_STYLE.routeColor');
    expect(analysisChart).toContain('drawRouteElevation(');
    expect(outline).toContain('ROUTE_VISUAL_STYLE.routeColor');
    expect(outline).not.toContain("strokeStyle = '#211f1c'");
    expect(outline).not.toContain('fillText(routeName');
    expect(ROUTE_VISUAL_STYLE.elevationPadding).toEqual({
      left: 22,
      right: 12,
      top: 16,
      bottom: 28,
    });
  });

  it('同一 GPX 输入产生相同采样、GCJ02 显示副本、海拔清洗和极值', () => {
    const detailOutline = prepareRouteVisualModel(route.routeOutline, [], true).outline;
    const analysis = deriveRouteAnalysis(route);
    const mapAnalysis = routeAnalysisForMap(analysis, true);
    expect(detailOutline).toEqual(mapAnalysis.outline);
    expect(detailOutline.length).toBeLessThanOrEqual(ROUTE_VISUAL_STYLE.maxOutlinePoints);
    expect(cleanElevationProfile(route.elevationProfile, 20, 10, 80)).toEqual(analysis.profile);
    expect(Math.max(...analysis.profile.map((point) => point.elevationM))).toBe(80);
    expect(Math.min(...analysis.profile.map((point) => point.elevationM))).toBe(10);
  });

  it('详情终态与完整页无选中态产生相同海拔路径、标记和文字', () => {
    const profile = cleanElevationProfile(route.elevationProfile, 20, 10, 80);
    const detailContext = chartContext();
    const analysisContext = chartContext();
    expect(drawElevationProfile(detailContext, 320, 160, profile, 2, 1)).toBe(true);
    expect(drawRouteAnalysisElevation(analysisContext, 320, 160, profile, [], {}, 2)).toBe(true);
    for (const method of ['moveTo', 'lineTo', 'arc', 'fillText'] as const)
      expect(analysisContext[method].mock.calls).toEqual(detailContext[method].mock.calls);
    expect(analysisContext.strokeStyle).toBe(detailContext.strokeStyle);
    expect(analysisContext.font).toBe(detailContext.font);
  });

  it('完整分析在共享曲线之上恢复全部非空 keyPoints 圆点', () => {
    const profile = cleanElevationProfile(route.elevationProfile, 20, 10, 80);
    const keyPoints = deriveRouteAnalysis(route).keyPoints.filter(
      (point) => point.elevation !== null && point.km >= 0 && point.km <= 20,
    );
    const baseContext = chartContext();
    const analysisContext = chartContext();
    drawRouteAnalysisElevation(baseContext, 320, 160, profile, [], {}, 2);
    drawRouteAnalysisElevation(analysisContext, 320, 160, profile, keyPoints, {}, 2);
    expect(keyPoints.length).toBeGreaterThan(0);
    expect(analysisContext.arc).toHaveBeenCalledTimes(
      baseContext.arc.mock.calls.length + keyPoints.length,
    );
  });

  it('共享 prepare 过滤坏坐标，并让重复点或简化后退化的轮廓降级为空', () => {
    expect(
      prepareRouteVisualModel(
        [
          { latitude: Number.NaN, longitude: 120 },
          { latitude: 30, longitude: 120 },
          { latitude: 30, longitude: 120 },
        ],
        [],
        false,
      ).outline,
    ).toEqual([]);
    expect(
      prepareRouteVisualModel(
        Array.from({ length: 600 }, () => ({ latitude: 30, longitude: 120 })),
        [],
        false,
      ).outline,
    ).toEqual([]);
  });

  it('共享可视模型让 GPX marker 与 polyline 同源转换，并保留微信选点起终点', () => {
    const start = { latitude: 30, longitude: 120 };
    const end = { latitude: 30.2, longitude: 120.2 };
    const middle = { latitude: 30.1, longitude: 120.1 };
    const visual = prepareRouteVisualModel(
      [start, middle, end],
      [
        { id: 'start', lat: start.latitude, lng: start.longitude },
        { id: 'highest', lat: middle.latitude, lng: middle.longitude },
        { id: 'end', lat: end.latitude, lng: end.longitude },
      ],
      true,
      ['start', 'end'],
    );
    const convertedMiddle = wgs84ToGcj02(middle.latitude, middle.longitude);
    expect(visual.outline[1]).toEqual(convertedMiddle);
    expect(visual.keyPoints[1]).toMatchObject({
      lat: convertedMiddle.latitude,
      lng: convertedMiddle.longitude,
    });
    expect(visual.keyPoints[0]).toMatchObject({ lat: start.latitude, lng: start.longitude });
    expect(visual.keyPoints[2]).toMatchObject({ lat: end.latitude, lng: end.longitude });
  });

  it('详情不再选择本地轮廓或服务端预览图，路线展示统一进入完整分析', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    expect(template).not.toContain('hasRouteOutline');
    expect(template).not.toContain('item.route.generatedPreviewUrl');
    expect(template).toContain('bindtap="openRouteAnalysis"');
    expect(read('miniprogram/utils/route-outline.ts')).not.toContain('fillText(routeName');
  });
});
