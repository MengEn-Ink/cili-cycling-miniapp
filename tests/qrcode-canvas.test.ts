import { describe, expect, it } from 'vitest';
import { encodeQrCode } from '../miniprogram/utils/qrcode';
import { planQrRender, drawQrCode } from '../miniprogram/utils/qrcode-canvas';

describe('QR 画布渲染计划', () => {
  const code = encodeQrCode('https://www.strava.com/oauth/authorize?x=1', 'M');

  it('整数模块尺寸且含 4 模块安静区', () => {
    const plan = planQrRender(code, 220, 3);
    expect(plan.pixelSize).toBe(660);
    expect(Number.isInteger(plan.modulePixels)).toBe(true);
    const total = code.size + 8; // 4-module quiet zone each side
    // Drawn code + quiet zone must fit inside the canvas.
    expect(plan.modulePixels * total).toBeLessThanOrEqual(plan.pixelSize);
    expect(plan.modulePixels).toBeGreaterThanOrEqual(1);
    expect(plan.offset).toBeGreaterThanOrEqual(plan.modulePixels * 4);
  });

  it('像素比缺省回退为 1', () => {
    const plan = planQrRender(code, 100, 0);
    expect(plan.pixelSize).toBe(100);
  });

  it('drawQrCode 先铺底色再按暗模块绘制', () => {
    const calls: Array<{ fill: string; rect: number[] }> = [];
    let fill = '';
    const ctx = {
      set fillStyle(v: string) {
        fill = v;
      },
      get fillStyle() {
        return fill;
      },
      fillRect(x: number, y: number, w: number, h: number) {
        calls.push({ fill, rect: [x, y, w, h] });
      },
    };
    const plan = planQrRender(code, 120, 2);
    drawQrCode(ctx, code, plan, { dark: '#000', light: '#fff' });
    // First call fills the full light background.
    expect(calls[0].fill).toBe('#fff');
    expect(calls[0].rect).toEqual([0, 0, plan.pixelSize, plan.pixelSize]);
    // Remaining calls are dark modules.
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[1].fill).toBe('#000');
    expect(calls[1].rect[2]).toBe(plan.modulePixels);
  });
});
