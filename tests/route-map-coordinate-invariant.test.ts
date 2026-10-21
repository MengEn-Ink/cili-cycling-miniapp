// @ts-expect-error Vitest 提供仓库测试使用的 Node 运行时。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { routeAnalysisForMap, wgs84ToGcj02 } from '../miniprogram/pages/route-analysis/utils/gcj02';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * 仓库级上线门禁：地图渲染坐标统一为 GCJ-02。
 * GPX/WGS84 只能在共享视觉边界转换一次；微信选点本身已是 GCJ-02，严禁再次转换。
 */
describe('地图坐标系不变量上线门禁', () => {
  it('GPX 轨迹只转换一次，微信起点保持原值，polyline/marker/include-points 同属 GCJ-02', () => {
    const wgsStart = { latitude: 39 + 0.908823, longitude: 116 + 0.39747 };
    const wgsEnd = { latitude: 39.91, longitude: 116.4 };
    const wechatStart = { latitude: 39.915, longitude: 116.404 };
    const analysis = {
      overview: { distanceKm: 1, ascentM: null, highestM: null, durationText: '' },
      profile: [],
      outline: [wgsStart, wgsEnd],
      keyPoints: [
        {
          id: 'start',
          type: 'start' as const,
          name: '微信选点',
          km: 0,
          elevation: null,
          gradePercent: null,
          lat: wechatStart.latitude,
          lng: wechatStart.longitude,
          source: '活动路线' as const,
          confidence: '高' as const,
          note: '',
        },
      ],
      segments: [],
      strategySummary: [],
      risks: [],
      equipment: [],
    };

    const displayed = routeAnalysisForMap(analysis, true, ['start']);
    const once = wgs84ToGcj02(wgsStart.latitude, wgsStart.longitude);
    const twice = wgs84ToGcj02(once.latitude, once.longitude);
    expect(displayed.outline[0]).toEqual(once);
    expect(displayed.outline[0]).not.toEqual(twice);
    expect(displayed.keyPoints[0]).toMatchObject({
      lat: wechatStart.latitude,
      lng: wechatStart.longitude,
    });
  });

  it('地图链路禁止人工固定偏移、页面二次转换和原始坐标文本回归', () => {
    const visual = read('miniprogram/utils/route-visual.ts');
    const adapter = read('miniprogram/pages/route-analysis/utils/gcj02.ts');
    const page = read('miniprogram/pages/route-analysis/index.ts');
    const template = read('miniprogram/pages/route-analysis/index.wxml');
    const pipeline = `${adapter}\n${page}`;

    // 禁止用“经验值”手工挪动经纬度；所有纠偏必须经过唯一共享转换函数。
    expect(pipeline).not.toMatch(/(?:lat(?:itude)?|lng|longitude)\s*[+-]\s*0\.0+\d+/i);
    expect(page).not.toContain('wgs84ToGcj02');
    expect(adapter.match(/prepareRouteVisualModel\(/g)).toHaveLength(1);
    expect(visual.match(/function wgs84ToGcj02\(/g)).toHaveLength(1);

    // 普通用户界面永不渲染经纬度文本，坐标仅供地图组件和 wx.openLocation 使用。
    expect(`${page}\n${template}`).not.toMatch(/coordinateText|coordinate-value|复制坐标|>坐标</);
  });
});
