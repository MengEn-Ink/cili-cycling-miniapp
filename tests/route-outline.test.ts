import { describe, expect, it, vi } from 'vitest';
import { drawRouteOutline, projectRouteOutline } from '../miniprogram/utils/route-outline';

describe('路线轮廓投影', () => {
  it('按经纬度边界等比缩放并完整落在固定内边距中', () => {
    const projected = projectRouteOutline(
      [
        { latitude: 22, longitude: 114 },
        { latitude: 22.2, longitude: 114.1 },
        { latitude: 22.1, longitude: 114.4 },
      ],
      320,
      180,
      24,
    );

    expect(projected).toHaveLength(3);
    for (const point of projected) {
      expect(point.x).toBeGreaterThanOrEqual(24);
      expect(point.x).toBeLessThanOrEqual(296);
      expect(point.y).toBeGreaterThanOrEqual(24);
      expect(point.y).toBeLessThanOrEqual(156);
    }
  });

  it('单一经度或纬度跨度时居中绘制且不产生 NaN', () => {
    const vertical = projectRouteOutline(
      [
        { latitude: 22, longitude: 114 },
        { latitude: 22.2, longitude: 114 },
      ],
      300,
      180,
      20,
    );
    const horizontal = projectRouteOutline(
      [
        { latitude: 22, longitude: 114 },
        { latitude: 22, longitude: 114.2 },
      ],
      300,
      180,
      20,
    );

    expect(vertical.every((point) => point.x === 150 && Number.isFinite(point.y))).toBe(true);
    expect(horizontal.every((point) => point.y === 90 && Number.isFinite(point.x))).toBe(true);
  });

  it('空轮廓和无效画布返回空投影', () => {
    expect(projectRouteOutline([], 320, 180, 24)).toEqual([]);
    expect(projectRouteOutline([{ latitude: 22, longitude: 114 }], 0, 180, 24)).toEqual([]);
  });
});

describe('路线轮廓 Canvas', () => {
  it('绘制固定背景、路线、起终点和品牌标题', () => {
    const context = {
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
      save: vi.fn(),
      restore: vi.fn(),
      lineCap: '',
      lineJoin: '',
      lineWidth: 0,
      strokeStyle: '',
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
    };

    drawRouteOutline(
      context,
      320,
      180,
      [
        { latitude: 22, longitude: 114 },
        { latitude: 22.2, longitude: 114.2 },
      ],
      2,
      '周末环湖',
    );

    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 320, 180);
    expect(context.moveTo).toHaveBeenCalledOnce();
    expect(context.lineTo).toHaveBeenCalledOnce();
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.lineWidth).toBe(6);
    expect(context.strokeStyle).toBe('#d93636');
    expect(context.arc).toHaveBeenCalledTimes(2);
    expect(context.arc).toHaveBeenNthCalledWith(
      1,
      expect.any(Number),
      expect.any(Number),
      8,
      0,
      Math.PI * 2,
    );
    expect(context.fillText).not.toHaveBeenCalled();
  });
});
