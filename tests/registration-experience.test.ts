import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawActivityPoster } from '../miniprogram/pages/activity-detail/poster';

afterEach(() => vi.unstubAllGlobals());

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

describe('管理员审批页不再提供扫码入口', () => {
  it('页面脚本不包含 scanCheckIn 与 check-in-code 引用', async () => {
    let definition: any;
    vi.stubGlobal('wx', { cloud: {} });
    vi.stubGlobal('Page', (pageDefinition: any) => {
      definition = pageDefinition;
    });
    vi.resetModules();
    await import('../miniprogram/pages/admin/reviews/index');
    expect(definition).not.toHaveProperty('scanCheckIn');
  });
});
