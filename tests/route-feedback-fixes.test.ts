import { describe, expect, it, vi } from 'vitest';
import {
  activityElevationProfile,
  runCanvasReveal,
} from '../miniprogram/pages/activity-detail/format';
import { deriveRouteAnalysis } from '../miniprogram/pages/route-analysis/utils/route-analysis';
import { routeAnalysisForMap, wgs84ToGcj02 } from '../miniprogram/pages/route-analysis/utils/gcj02';
import { isSafeGpxFileName, sanitizeGpxFileName } from '../miniprogram/utils/gpx-file';

const BEIJING = { latitude: 39 + 0.908823, longitude: 116 + 0.39747 };
const LONDON = { latitude: 51 + 0.5074, longitude: -(0.1 + 0.0278) };

const route = {
  start: '起点',
  end: '终点',
  distanceKm: 10,
  elevationM: 200,
  elevationMinM: 20,
  elevationMaxM: 765.9,
  level: '进阶',
  elevationProfile: [
    { distanceKm: 0, elevationM: 30 },
    { distanceKm: 5, elevationM: 731 },
    { distanceKm: 5, elevationM: 720 },
    { distanceKm: 20, elevationM: 40 },
  ],
  routeOutline: [
    { latitude: BEIJING.latitude, longitude: BEIJING.longitude },
    { latitude: 39.91, longitude: 116.4 },
  ],
} as any;

describe('路线反馈修复合同', () => {
  it('北京 WGS84 转 GCJ02，境外坐标保持原样', () => {
    const beijing = wgs84ToGcj02(BEIJING.latitude, BEIJING.longitude);
    expect(beijing.latitude).toBeCloseTo(39.910226, 5);
    expect(beijing.longitude).toBeCloseTo(116.403714, 5);
    expect(wgs84ToGcj02(LONDON.latitude, LONDON.longitude)).toEqual(LONDON);
  });

  it('只转换明确 GPX 来源，轮廓与 GPX 派生 marker 坐标使用同一转换函数', () => {
    const analysis = deriveRouteAnalysis(route);
    const plain = routeAnalysisForMap(analysis, false);
    expect(plain.outline[0]).toEqual({
      latitude: BEIJING.latitude,
      longitude: BEIJING.longitude,
    });
    const mapped = routeAnalysisForMap(analysis, true);
    expect(mapped.outline[0]).toEqual(wgs84ToGcj02(BEIJING.latitude, BEIJING.longitude));
    const start = mapped.keyPoints.find((point) => point.id === 'start')!;
    expect({ latitude: start.lat, longitude: start.lng }).toEqual(mapped.outline[0]);
    expect(analysis.outline[0]).toEqual({
      latitude: BEIJING.latitude,
      longitude: BEIJING.longitude,
    });
  });

  it('保留微信选点生成的 GCJ02 起终点，避免随 GPX 轮廓二次偏移', () => {
    const analysis = deriveRouteAnalysis({
      ...route,
      startLocation: { name: '集合点', latitude: 39.915, longitude: 116.404 },
      endLocation: { name: '终点', latitude: 39.92, longitude: 116.41 },
    });
    const mapped = routeAnalysisForMap(analysis, true, ['start', 'end']);
    const start = mapped.keyPoints.find((point) => point.id === 'start')!;
    const end = mapped.keyPoints.find((point) => point.id === 'end')!;
    expect({ latitude: start.lat, longitude: start.lng }).toEqual({
      latitude: 39.915,
      longitude: 116.404,
    });
    expect({ latitude: end.lat, longitude: end.lng }).toEqual({
      latitude: 39.92,
      longitude: 116.41,
    });
    expect(mapped.outline[0]).toEqual(wgs84ToGcj02(BEIJING.latitude, BEIJING.longitude));
  });

  it('详情海拔与完整分析使用相同去重、clamp 和最高最低值', () => {
    const detail = activityElevationProfile(route);
    const analysis = deriveRouteAnalysis(route);
    expect(detail).toEqual(analysis.profile);
    expect(Math.max(...detail.map((point) => point.elevationM))).toBe(765.9);
    expect(Math.min(...detail.map((point) => point.elevationM))).toBe(20);
    expect(detail[detail.length - 1]?.distanceKm).toBe(10);
  });

  it.each(['Sunday.Route.gpx', 'route v2.gpx', '周日 环湖.v2.gpx'])(
    '兼容安全 GPX 文件名 %s',
    (name) => {
      expect(isSafeGpxFileName(name)).toBe(true);
      expect(sanitizeGpxFileName(name, 'route')).toBe(name);
    },
  );

  it('拒绝响应路径穿越并安全清洗落盘名', () => {
    expect(isSafeGpxFileName('../route.gpx')).toBe(false);
    expect(isSafeGpxFileName('..\\route.gpx')).toBe(false);
    expect(sanitizeGpxFileName('../route.gpx', 'fallback')).toBe('route.gpx');
  });

  it('动画 650ms 完成且无常驻帧', () => {
    const callbacks = new Map<number, (time: number) => void>();
    let id = 0;
    const canvas = {
      requestAnimationFrame: vi.fn((callback) => {
        callbacks.set(++id, callback);
        return id;
      }),
      cancelAnimationFrame: vi.fn((frame) => callbacks.delete(frame)),
    };
    const draw = vi.fn();
    const complete = vi.fn();
    runCanvasReveal(canvas, draw, complete, 650);
    callbacks.get(1)?.(100);
    callbacks.get(2)?.(425);
    callbacks.get(3)?.(750);
    expect(draw.mock.calls.map(([progress]) => progress)).toEqual([0, 0.5, 1]);
    expect(complete).toHaveBeenCalledOnce();
    expect(canvas.requestAnimationFrame).toHaveBeenCalledTimes(3);
  });

  it('动画可取消，不支持 RAF 时静态完成', () => {
    const callback = vi.fn();
    const canvas = {
      requestAnimationFrame: vi.fn(() => 7),
      cancelAnimationFrame: vi.fn(),
    };
    const cancel = runCanvasReveal(canvas, vi.fn(), callback);
    cancel();
    expect(canvas.cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(callback).not.toHaveBeenCalled();

    const draw = vi.fn();
    const complete = vi.fn();
    runCanvasReveal({}, draw, complete);
    expect(draw).toHaveBeenCalledWith(1);
    expect(complete).toHaveBeenCalledOnce();
  });
});
