import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawActivityPoster } from '../miniprogram/pages/activity-detail/poster';
import {
  buildCheckInCode,
  drawCode128,
  parseCheckInScan,
} from '../miniprogram/utils/check-in-code';

afterEach(() => vi.unstubAllGlobals());

describe('现场核销凭证', () => {
  it('解析条码协议、cili scheme 与小程序 review-detail path，拒绝普通文本', () => {
    expect(parseCheckInScan('CILI-CHECKIN:reg_abc-123')).toBe('reg_abc-123');
    expect(parseCheckInScan('cili://checkin/reg_abc-123')).toBe('reg_abc-123');
    expect(parseCheckInScan('pages/admin/review-detail/index?from=scan&id=reg_abc-123')).toBe(
      'reg_abc-123',
    );
    expect(parseCheckInScan('reg_abc-123')).toBeNull();
    expect(parseCheckInScan('pages/admin/review-detail/index?id=..%2Fsecret')).toBeNull();
    expect(parseCheckInScan(null)).toBeNull();
    expect(() => buildCheckInCode('../bad')).toThrow('报名 ID 格式无效');
  });

  it('Code128 画布生成真实黑白条码，非法输入不绘制', () => {
    const context: any = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
    expect(drawCode128(context, 300, 80, buildCheckInCode('reg_abc'))).toBe(true);
    expect(context.fillRect.mock.calls.length).toBeGreaterThan(10);
    expect(drawCode128(context, 0, 80, 'abc')).toBe(false);
    expect(drawCode128(context, 300, 80, '\n')).toBe(false);
  });
});

describe('活动海报', () => {
  const activity: any = {
    title: '环湖骑行',
    startAt: '2026-10-11 08:00',
    route: { start: '湖滨广场', end: '山顶', distanceKm: 80, elevationM: 900 },
  };

  it('包含活动名、时间、地点、路线摘要和小程序进入提示', () => {
    const texts: string[] = [];
    const context: any = {
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      fillText: vi.fn((text: string) => texts.push(text)),
      measureText: (text: string) => ({ width: text.length * 12 }),
    };
    expect(drawActivityPoster(context, 375, 600, activity)).toBe(true);
    expect(texts.join('|')).toContain('环湖骑行');
    expect(texts.join('|')).toContain('时间');
    expect(texts.join('|')).toContain('湖滨广场');
    expect(texts.join('|')).toContain('路线摘要');
    expect(texts.join('|')).toContain('微信搜索「此里」小程序进入活动');
  });

  it('画布或尺寸无效时失败且可由页面按钮重试', () => {
    expect(drawActivityPoster(null, 375, 600, activity)).toBe(false);
    expect(drawActivityPoster({}, 0, 600, activity)).toBe(false);
  });
});

describe('管理员扫码入口', () => {
  it('有效凭证跳转既有 review-detail，无效结果提示且不跳转', async () => {
    let page: any;
    const navigateTo = vi.fn();
    const showToast = vi.fn();
    vi.stubGlobal('wx', {
      cloud: {},
      navigateTo,
      showToast,
      scanCode: vi.fn(({ success }) => success({ result: 'CILI-CHECKIN:reg_abc' })),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = (patch: object) => Object.assign(page.data, patch);
    });
    vi.resetModules();
    await import('../miniprogram/pages/admin/reviews/index');
    page.scanCheckIn();
    expect(navigateTo).toHaveBeenCalledWith({
      url: '/pages/admin/review-detail/index?id=reg_abc',
    });

    (wx.scanCode as any).mockImplementationOnce(({ success }: any) =>
      success({ result: '普通文本' }),
    );
    page.scanCheckIn();
    expect(showToast).toHaveBeenCalledWith({ title: '不是有效的此里核销凭证', icon: 'none' });
    expect(navigateTo).toHaveBeenCalledTimes(1);
  });
});
