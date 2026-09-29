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
    await page.onShow();

    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledTimes(1);
    expect(page.data.card).toMatchObject({ displayName: '山野骑手', statusLabel: '已连接' });
  });

  it('从资料编辑返回时 onShow 重新读取单响应', async () => {
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce(card).mockResolvedValueOnce({
      ...card,
      backgrounds: [
        {
          url: 'https://temporary.example/new-photo.jpg',
          source: 'user_photo',
          category: 'ride',
        },
      ],
    });

    await page.onShow();
    await page.onShow();

    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledTimes(2);
    expect(page.data.card.backgrounds[0].url).toBe('https://temporary.example/new-photo.jpg');
  });

  it('较慢的旧请求不能覆盖较新的 onShow 响应', async () => {
    let resolveOld!: (value: typeof card) => void;
    let resolveNew!: (value: typeof card) => void;
    rideService.getPersonalCapabilityCard
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve;
          }),
      );

    const oldLoad = page.onShow();
    const newLoad = page.onShow();
    resolveNew({ ...card, profile: { ...card.profile, displayName: '新名片' } });
    await newLoad;
    resolveOld({ ...card, profile: { ...card.profile, displayName: '旧名片' } });
    await oldLoad;

    expect(page.data.card.displayName).toBe('新名片');
  });

  it.each(['disconnected', 'failed'])('%s 状态跳转 Strava 修复', async (state) => {
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce({ ...card, state });
    await page.onShow();
    page.repairStrava();

    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/strava/index' });
  });

  it('缺少背景图时跳转资料编辑', async () => {
    await page.onShow();
    page.completeProfile();

    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/profile-edit/index' });
  });

  it('页面不注册任何分享处理器', () => {
    expect(page.onShareAppMessage).toBeUndefined();
    expect(page.onShareTimeline).toBeUndefined();
  });

  it('单张加载失败时只移除对应背景并重算轮播状态', async () => {
    const backgrounds = ['first', 'failed'].map((name) => ({
      url: `https://temporary.example/${name}.jpg`,
      source: 'user_photo',
      category: 'ride',
    }));
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce({ ...card, backgrounds });
    await page.onShow();

    page.backgroundError({ currentTarget: { dataset: { index: 1, url: backgrounds[1].url } } });

    expect(page.data.card.backgrounds.map((item: any) => item.url)).toEqual([backgrounds[0].url]);
    expect(page.data.card).toMatchObject({ hasBackgrounds: true, hasMultipleBackgrounds: false });
  });

  it('所有背景加载失败后切换 alpine fallback', async () => {
    const background = {
      url: 'https://temporary.example/only.jpg',
      source: 'user_photo',
      category: 'ride',
    };
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce({
      ...card,
      backgrounds: [background],
    });
    await page.onShow();

    page.backgroundError({ currentTarget: { dataset: { index: 0, url: background.url } } });

    expect(page.data.card).toMatchObject({
      backgrounds: [],
      hasBackgrounds: false,
      hasMultipleBackgrounds: false,
      needsProfilePhoto: true,
    });
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
    expect(template).toContain('binderror="backgroundError"');
    expect(template).toContain('data-url="{{item.url}}"');
    expect(template).toContain('data-index="{{index}}"');
    const backgroundImage = template.match(/<image[\s\S]*?\/>/)?.[0] || '';
    expect(backgroundImage).toContain('aria-hidden="true"');
    expect(template).toContain('wx:if="{{card.needsProfilePhoto}}"');
  });

  it('长姓名限制为可读的两行且保持 3:4 安全区', () => {
    const styles = read('miniprogram/pages/capability-card/index.wxss');
    const riderName = styles.match(/\.rider-name\s*\{([^}]*)\}/)?.[1] || '';

    expect(styles).toMatch(/\.rider-card\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*4/s);
    expect(riderName).toContain('-webkit-line-clamp: 2');
    expect(riderName).toMatch(/line-height:\s*1\.[01]/);
    expect(riderName).toContain('text-overflow: ellipsis');
    expect(riderName).not.toContain('white-space: nowrap');
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
