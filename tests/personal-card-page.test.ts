// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getPersonalCapabilityCard: vi.fn(),
  syncStrava: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

const card = {
  state: 'ready',
  generatedAt: '2026-09-29T04:10:00.000Z',
  profile: { displayName: '山野骑手', gender: '男' },
  backgrounds: [],
  summary: {
    lifetimeRides: 486,
    lifetimeDistanceKm: 18240.7,
    lifetimeMovingHours: 734.5,
    lifetimeElevationM: 215400,
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
  stravaProfileUrl: 'https://www.strava.com/athletes/42',
};

describe('个人骑行名片页面行为', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getPersonalCapabilityCard.mockReset().mockResolvedValue(card);
    rideService.syncStrava.mockReset().mockResolvedValue({ state: 'ready', error: null });
    vi.stubGlobal('wx', {
      navigateTo: vi.fn(),
      showModal: vi.fn(),
      showToast: vi.fn(),
      setClipboardData: vi.fn(({ success }) => success?.()),
    });
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

  it('支持主动同步 Strava 并刷新名片', async () => {
    await page.onShow();
    await page.refreshStrava();

    expect(rideService.syncStrava).toHaveBeenCalledTimes(1);
    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledTimes(2);
    expect(wx.showToast).toHaveBeenCalledWith({ title: 'Strava 数据已更新', icon: 'success' });
    expect(page.data.syncing).toBe(false);
  });

  it('同步业务失败时展示后端原因而不是成功提示', async () => {
    rideService.syncStrava.mockResolvedValueOnce({
      state: 'failed',
      error: { code: 'STRAVA_SYNC_FAILED', message: 'Strava 授权已失效' },
    });
    await page.onShow();

    await page.refreshStrava();

    expect(wx.showToast).toHaveBeenCalledWith({ title: 'Strava 授权已失效', icon: 'none' });
    expect(wx.showToast).not.toHaveBeenCalledWith({
      title: 'Strava 数据已更新',
      icon: 'success',
    });
    expect(page.data.syncing).toBe(false);
  });

  it('同步租约被占用时提示稍后刷新', async () => {
    rideService.syncStrava.mockResolvedValueOnce({ state: 'syncing', error: null });
    await page.onShow();

    await page.refreshStrava();

    expect(wx.showToast).toHaveBeenCalledWith({
      title: 'Strava 数据正在同步，请稍后刷新',
      icon: 'none',
    });
  });

  it('同步成功但名片刷新失败时不误报全部成功', async () => {
    rideService.getPersonalCapabilityCard
      .mockResolvedValueOnce(card)
      .mockRejectedValueOnce(new Error('读取失败'));
    await page.onShow();

    await page.refreshStrava();

    expect(wx.showToast).toHaveBeenCalledWith({
      title: '数据已同步，但骑行名片刷新失败',
      icon: 'none',
    });
    expect(page.data.error).toBe('读取失败');
  });

  it('Strava 主页入口复制 HTTPS 链接并说明打开方式', async () => {
    await page.onShow();

    page.openStravaProfile();

    expect(wx.setClipboardData).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'https://www.strava.com/athletes/42' }),
    );
    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Strava 主页链接已复制', showCancel: false }),
    );
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

  it('保留私有名片页面能力，但个人中心不再提供重复入口', () => {
    const app = JSON.parse(read('miniprogram/app.json') || '{}');
    const profileTs = read('miniprogram/pages/profile/index.ts');
    const profileWxml = read('miniprogram/pages/profile/index.wxml');

    expect(app.pages).toContain('pages/capability-card/index');
    expect(profileTs).not.toContain("'/pages/capability-card/index'");
    expect(profileWxml).not.toContain('我的骑行名片');
    expect(profileWxml).toContain('class="hero-capability-card"');
    expect(profileWxml).not.toContain('cardExpanded');
    expect(profileWxml).toContain('class="profile-refresh-feedback');
  });

  it('使用原生多图 swiper、隐私说明、累计与近 90 天指标', () => {
    const template = read('miniprogram/pages/capability-card/index.wxml');

    expect(template).toContain('<swiper');
    expect(template).toContain('autoplay="{{card.hasMultipleBackgrounds}}"');
    expect(template).toContain('仅自己可见 · 不会用于活动报名审核');
    expect(template).toContain('class="brand-signature"');
    expect(template).toContain('CILI</view>');
    expect(template).toContain('STRAVA {{card.statusLabel}}');
    expect(template).toContain('wx:for="{{card.lifetimeMetrics}}"');
    expect(template).toContain('wx:for="{{card.recentMetrics}}"');
    expect(template).toContain('STRAVA 累计骑行');
    expect(template).toContain('近 90 天真实骑行数据');
    expect(template).toContain('bindtap="openStravaProfile"');
    expect(template).toContain('bindtap="refreshStrava"');
    expect(template).toContain('覆盖范围');
    expect(template).toContain('{{card.coverageText}}');
    expect(template).toContain('最近同步');
    expect(template).toContain('{{card.syncedAtText}}');
    expect(template).toContain('binderror="backgroundError"');
    expect(template).toContain('data-url="{{item.url}}"');
    expect(template).toContain('data-index="{{index}}"');
    const backgroundImage = template.match(/<image[\s\S]*?\/>/)?.[0] || '';
    expect(backgroundImage).toContain('aria-hidden="true"');
    expect(template).toContain('wx:if="{{card.needsProfilePhoto}}"');
  });

  it('长姓名可截断且性别标签与双层指标保持紧凑网格', () => {
    const styles = read('miniprogram/pages/capability-card/index.wxss');
    const riderName = styles.match(/\.rider-name\s*\{([^}]*)\}/)?.[1] || '';
    const genderPill = styles.match(/\.gender-pill\s*\{([^}]*)\}/)?.[1] || '';
    const metricValue = styles.match(/\.metric-value\s*\{([^}]*)\}/)?.[1] || '';

    expect(styles).toMatch(/\.rider-card\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*4/s);
    expect(styles).toContain('.metric-item:nth-child(n + 4)');
    expect(styles).toMatch(/\.metric-item\s*\{[^}]*box-sizing:\s*border-box/s);
    expect(riderName).toContain('-webkit-line-clamp: 2');
    expect(riderName).toMatch(/line-height:\s*1\.[01]/);
    expect(riderName).toContain('text-overflow: ellipsis');
    expect(riderName).not.toContain('white-space: nowrap');
    expect(genderPill).toContain('letter-spacing');
    expect(metricValue).toContain('text-overflow: ellipsis');
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
