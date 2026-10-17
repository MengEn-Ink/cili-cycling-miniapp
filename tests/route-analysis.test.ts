import { describe, expect, it } from 'vitest';
import type { Activity } from '../miniprogram/models/index';
import { hasAnalyzableRoute } from '../miniprogram/utils/route-outline';
import {
  deriveRouteAnalysis,
  sampleRouteOutline,
} from '../miniprogram/pages/route-analysis/utils/route-analysis';

function route(overrides: Partial<Activity['route']> = {}): Activity['route'] {
  return {
    start: '江边广场',
    end: '森林公园',
    startLocation: {
      name: '江边广场',
      address: '集合点',
      latitude: 30,
      longitude: 120,
    },
    endLocation: {
      name: '森林公园',
      address: '终点',
      latitude: 30.2,
      longitude: 120.2,
    },
    distanceKm: 100,
    elevationM: 1200,
    elevationLossM: 1100,
    elevationMinM: 10,
    elevationMaxM: 410,
    estimatedMovingTimeSeconds: 18_300,
    level: '挑战',
    elevationProfile: [
      { distanceKm: 0, elevationM: 20 },
      { distanceKm: 20, elevationM: 60 },
      { distanceKm: 40, elevationM: 260 },
      { distanceKm: 50, elevationM: 410 },
      { distanceKm: 70, elevationM: 180 },
      { distanceKm: 100, elevationM: 30 },
    ],
    routeOutline: [
      { latitude: 30, longitude: 120 },
      { latitude: 30.1, longitude: 120.1 },
      { latitude: 30.2, longitude: 120.2 },
    ],
    ...overrides,
  };
}

describe('路线分析派生', () => {
  it('从完整真实路线生成总览、关键点、分段、策略与装备', () => {
    const analysis = deriveRouteAnalysis(route());
    expect(analysis.overview).toEqual({
      distanceKm: 100,
      ascentM: 1200,
      highestM: 410,
      durationText: '5 小时 5 分',
    });
    expect(analysis.keyPoints[0]).toMatchObject({
      type: 'start',
      name: '江边广场',
      lat: 30,
      lng: 120,
      source: '活动路线',
      confidence: '高',
    });
    expect(analysis.keyPoints[analysis.keyPoints.length - 1]).toMatchObject({
      type: 'end',
      name: '森林公园',
      lat: 30.2,
      lng: 120.2,
    });
    expect(analysis.keyPoints.some((point) => point.type === 'climb')).toBe(true);
    expect(analysis.keyPoints.some((point) => point.type === 'descent')).toBe(true);
    expect(analysis.segments.length).toBeLessThanOrEqual(6);
    expect(analysis.strategySummary.join('')).toContain('累计爬升较高');
    expect(analysis.risks.join('')).toContain('控制速度');
    expect(analysis.equipment.join('')).toContain('检查刹车');
  });

  it('最高点按公里比例映射轮廓且不伪造地点名称', () => {
    const highest = deriveRouteAnalysis(route()).keyPoints.find(
      (point) => point.type === 'highest',
    );
    expect(highest).toMatchObject({
      name: '路线最高点',
      km: 50,
      elevation: 410,
      lat: 30.1,
      lng: 120.1,
      note: '路线海拔最高位置',
      gradePercent: -0.3,
    });
  });

  it('缺失或非法累计爬升保持为空，显式 0 仍作为真实值保留', () => {
    expect(
      deriveRouteAnalysis(route({ elevationM: undefined as unknown as number })).overview.ascentM,
    ).toBeNull();
    expect(deriveRouteAnalysis(route({ elevationM: Number.NaN })).overview.ascentM).toBeNull();
    expect(deriveRouteAnalysis(route({ elevationM: -10 })).overview.ascentM).toBeNull();
    expect(deriveRouteAnalysis(route({ elevationM: 0 })).overview.ascentM).toBe(0);
  });

  it('缺少路线轮廓时保留公里与海拔但不伪造坐标', () => {
    const analysis = deriveRouteAnalysis(route({ routeOutline: undefined }));
    expect(analysis.keyPoints.find((point) => point.type === 'highest')).toMatchObject({
      lat: null,
      lng: null,
    });
    expect(analysis.outline).toHaveLength(0);
  });

  it('缺少海拔剖面时仅生成可解释距离分段和指标级最高值', () => {
    const analysis = deriveRouteAnalysis(route({ elevationProfile: undefined }));
    expect(analysis.keyPoints.some((point) => point.type === 'highest')).toBe(false);
    expect(analysis.overview.highestM).toBe(410);
    expect(analysis.segments).toHaveLength(3);
    expect(analysis.segments.every((segment) => segment.gradePercent === null)).toBe(true);
    expect(analysis.profile).toHaveLength(0);
  });

  it('短路线不强制休息点并只输出有限分段', () => {
    const analysis = deriveRouteAnalysis(
      route({
        distanceKm: 5,
        elevationM: 20,
        elevationProfile: undefined,
        routeOutline: undefined,
      }),
    );
    expect(analysis.keyPoints.filter((point) => point.type === 'rest')).toHaveLength(0);
    expect(analysis.segments).toHaveLength(1);
    expect(analysis.segments[0]).toMatchObject({ startKm: 0, endKm: 5 });
  });

  it('过滤非法点并稳定合并重复距离', () => {
    const analysis = deriveRouteAnalysis(
      route({
        distanceKm: 20,
        elevationProfile: [
          { distanceKm: 0, elevationM: 10 },
          { distanceKm: 5, elevationM: 30 },
          { distanceKm: 5, elevationM: 40 },
          { distanceKm: Number.NaN, elevationM: 80 },
          { distanceKm: 20, elevationM: Number.POSITIVE_INFINITY },
          { distanceKm: 20, elevationM: 20 },
        ],
        routeOutline: [
          { latitude: 31, longitude: 121 },
          { latitude: Number.NaN, longitude: 121 },
          { latitude: 95, longitude: 121 },
          { latitude: 31.2, longitude: 121.2 },
        ],
      }),
    );
    expect(analysis.profile).toEqual([
      { distanceKm: 0, elevationM: 10 },
      { distanceKm: 5, elevationM: 40 },
      { distanceKm: 20, elevationM: 20 },
    ]);
    expect(analysis.outline).toHaveLength(2);
    expect(analysis.segments.every((segment) => Number.isFinite(segment.gradePercent))).toBe(true);
  });

  it('极短距离海拔噪点的展示坡度限制在合理范围', () => {
    const analysis = deriveRouteAnalysis(
      route({
        distanceKm: 0.0001,
        elevationProfile: [
          { distanceKm: 0, elevationM: 0 },
          { distanceKm: 0.0001, elevationM: 10 },
        ],
      }),
    );
    expect(analysis.segments[0].gradePercent).toBe(40);
  });

  it.each([
    [19.9, 0],
    [20, 1],
    [50, 2],
    [90, 3],
  ])('按路线长度 %.1f km 生成 %i 个建议休息点', (distanceKm, count) => {
    const analysis = deriveRouteAnalysis(route({ distanceKm }));
    expect(analysis.keyPoints.filter((point) => point.type === 'rest')).toHaveLength(count);
  });

  it('只在具有真实距离、有效剖面或有效轮廓时开放分析入口', () => {
    expect(hasAnalyzableRoute(route())).toBe(true);
    expect(
      hasAnalyzableRoute(route({ distanceKm: 0, elevationProfile: [], routeOutline: [] })),
    ).toBe(false);
    expect(
      hasAnalyzableRoute(
        route({
          distanceKm: 0,
          elevationProfile: [
            { distanceKm: Number.NaN, elevationM: 10 },
            { distanceKm: 0, elevationM: Number.POSITIVE_INFINITY },
          ],
          routeOutline: [
            { latitude: 999, longitude: 120 },
            { latitude: 30, longitude: Number.NaN },
          ],
        }),
      ),
    ).toBe(false);
    expect(hasAnalyzableRoute(null)).toBe(false);
  });

  it('大量路线点按几何偏差简化并保留首尾、急弯和折返点', () => {
    const straight = Array.from({ length: 5000 }, (_, index) => ({
      latitude: 30 + index / 100000,
      longitude: 120 + index / 100000,
    }));
    const straightSampled = sampleRouteOutline(straight, 420);
    expect(straightSampled.length).toBeLessThanOrEqual(420);
    expect(straightSampled[0]).toEqual(straight[0]);
    expect(straightSampled[straightSampled.length - 1]).toEqual(straight[straight.length - 1]);

    const hairpin = [
      ...Array.from({ length: 500 }, (_, index) => ({
        latitude: 30,
        longitude: 120 + index / 10000,
      })),
      { latitude: 30.01, longitude: 120.05 },
      ...Array.from({ length: 500 }, (_, index) => ({
        latitude: 30.01,
        longitude: 120.05 - index / 10000,
      })),
    ];
    const hairpinSampled = sampleRouteOutline(hairpin, 24);
    expect(hairpinSampled.length).toBeLessThanOrEqual(24);
    expect(hairpinSampled).toContainEqual(hairpin[500]);
    expect(hairpinSampled[0]).toEqual(hairpin[0]);
    expect(hairpinSampled[hairpinSampled.length - 1]).toEqual(hairpin[hairpin.length - 1]);

    const foldback = [
      ...Array.from({ length: 500 }, (_, index) => ({
        latitude: 31,
        longitude: 121 + index / 10000,
      })),
      { latitude: 31, longitude: 121.05 },
      ...Array.from({ length: 500 }, (_, index) => ({
        latitude: 31,
        longitude: 121.05 - (index + 1) / 10000,
      })),
    ];
    expect(sampleRouteOutline(foldback, 12)).toContainEqual(foldback[500]);
    expect(
      deriveRouteAnalysis(route({ routeOutline: hairpin })).outline.length,
    ).toBeLessThanOrEqual(420);
  });

  it('越界起终点坐标不会进入地图关键点', () => {
    const analysis = deriveRouteAnalysis(
      route({
        routeOutline: undefined,
        startLocation: { name: '错误起点', address: '', latitude: 999, longitude: 120 },
        endLocation: { name: '错误终点', address: '', latitude: 30, longitude: -999 },
      }),
    );
    expect(analysis.keyPoints.find((point) => point.id === 'start')).toMatchObject({
      lat: null,
      lng: null,
    });
    expect(analysis.keyPoints.find((point) => point.id === 'end')).toMatchObject({
      lat: null,
      lng: null,
    });
  });
});
