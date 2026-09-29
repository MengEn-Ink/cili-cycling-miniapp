// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getPersonalCapabilityCard: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

const card = {
  state: 'ready',
  generatedAt: '2026-09-29T04:10:00.000Z',
  profile: { displayName: '山野骑手', title: '周末爬坡手' },
  backgrounds: [],
  summary: {
    totalKm90d: 812.5,
    rides90d: 28,
    longestKm: 126.3,
    elevationM90d: 9300,
    weightedAvgSpeedKmh: 25.6,
  },
  coverage: {
    from: '2026-07-01T04:00:00.000Z',
    to: '2026-09-29T04:00:00.000Z',
    complete: true,
  },
  syncedAt: '2026-09-29T04:05:00.000Z',
};

describe('个人骑行名片页面行为', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getPersonalCapabilityCard.mockReset().mockResolvedValue(card);
    vi.stubGlobal('wx', { navigateTo: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/capability-card/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('页面加载只读取一次个人名片单响应', async () => {
    await page.onLoad();

    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledTimes(1);
    expect(page.data.card).toMatchObject({ displayName: '山野骑手', statusLabel: '已连接' });
  });

  it.each(['disconnected', 'failed'])('%s 状态跳转 Strava 修复', async (state) => {
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce({ ...card, state });
    await page.onLoad();
    page.repairStrava();

    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/strava/index' });
  });

  it('缺少背景图时跳转资料编辑', async () => {
    await page.onLoad();
    page.completeProfile();

    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/profile-edit/index' });
  });

  it('页面不注册任何分享处理器', () => {
    expect(page.onShareAppMessage).toBeUndefined();
    expect(page.onShareTimeline).toBeUndefined();
  });
});

describe('个人骑行名片静态页面契约', () => {
  const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

  it('注册私有页面并从个人中心提供入口', () => {
    const app = JSON.parse(read('miniprogram/app.json') || '{}');
    const profileTs = read('miniprogram/pages/profile/index.ts');
    const profileWxml = read('miniprogram/pages/profile/index.wxml');

    expect(app.pages).toContain('pages/capability-card/index');
    expect(profileTs).toContain("'/pages/capability-card/index'");
    expect(profileWxml).toContain('我的骑行名片');
  });

  it('使用原生多图 swiper、隐私标签和动态指标列表', () => {
    const template = read('miniprogram/pages/capability-card/index.wxml');

    expect(template).toContain('<swiper');
    expect(template).toContain('autoplay="{{card.hasMultipleBackgrounds}}"');
    expect(template).toContain('仅自己可见');
    expect(template).toContain('brand-signature">此里');
    expect(template).toContain('STRAVA {{card.statusLabel}}');
    expect(template).toContain('wx:for="{{card.primaryMetrics}}"');
    expect(template).toContain('wx:for="{{card.secondaryMetrics}}"');
    expect(template.indexOf('core-summary')).toBeLessThan(template.indexOf('metric-sheet'));
  });

  it('不包含分享入口、公开路由或敏感身份字段', () => {
    const source = [
      read('miniprogram/pages/capability-card/index.ts'),
      read('miniprogram/pages/capability-card/index.wxml'),
      read('miniprogram/app.json'),
    ].join('\n');

    expect(source).not.toMatch(/onShareAppMessage|onShareTimeline|open-type=["']share/);
    expect(source).not.toMatch(
      /STRAVA VERIFIED|身份证|手机号|实名|9年|粉丝|Fitness|Fatigue|Form|功率|赛段|public-capability-card|capability-card\/public/,
    );
  });
});
