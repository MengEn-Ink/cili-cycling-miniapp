// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getPersonalCapabilityCard: vi.fn(),
}));

const appStore = vi.hoisted(() => ({
  role: 'member',
  isSuper: false,
  authStatus: 'idle',
  authError: '',
  identityHint: null as null | { source: 'wechat_cloud'; verifiedAt: number },
  ensureIdentity: vi.fn(),
  refreshIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

const profile = (nickname: string) => ({
  nickname,
  title: '',
  realName: '',
  phone: '',
  gender: '',
  emergencyName: '',
  emergencyPhone: '',
  photos: [],
  completeness: 60,
});

const capabilityCard = (overrides: Record<string, unknown> = {}) => ({
  state: 'ready',
  generatedAt: '2026-09-30T00:00:00.000Z',
  profile: {
    displayName: '山野骑手',
    title: '周末爬坡手',
    avatarUrl: 'https://temporary.example/avatar.jpg',
  },
  backgrounds: [
    {
      url: 'https://temporary.example/ride.jpg',
      source: 'user_photo',
      category: 'ride',
    },
    {
      url: 'https://temporary.example/avatar-background.jpg',
      source: 'avatar',
      category: 'other',
    },
  ],
  summary: {
    totalKm90d: 812.5,
    rides90d: 28,
    longestKm: 126.3,
    elevationM90d: 9300,
    weightedAvgSpeedKmh: 25.6,
  },
  coverage: {
    from: '2026-07-02T00:00:00.000Z',
    to: '2026-09-30T00:00:00.000Z',
    complete: true,
  },
  syncedAt: '2026-09-30T00:00:00.000Z',
  needsStravaReauth: false,
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('个人中心加载状态', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getProfile.mockReset().mockResolvedValue(profile('山野骑手'));
    rideService.getPersonalCapabilityCard.mockReset().mockResolvedValue(capabilityCard());
    appStore.role = 'member';
    appStore.isSuper = false;
    appStore.authStatus = 'idle';
    appStore.authError = '';
    appStore.identityHint = null;
    const authenticate = () => {
      appStore.authStatus = 'loading';
      appStore.authError = '';
      return Promise.resolve().then(() => {
        appStore.authStatus = 'authenticated';
        return {
          status: 'authenticated',
          identity: { openid: 'member-openid', role: appStore.role, isSuper: appStore.isSuper },
        };
      });
    };
    appStore.ensureIdentity.mockReset().mockImplementation(authenticate);
    appStore.refreshIdentity.mockReset().mockImplementation(authenticate);
    vi.stubGlobal('wx', { cloud: {}, navigateTo: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/profile/index');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('骑行名片永不返回时主资料仍完成加载', async () => {
    const pendingCard = deferred<ReturnType<typeof capabilityCard>>();
    rideService.getPersonalCapabilityCard.mockReturnValueOnce(pendingCard.promise);
    let lifecycleFinished = false;

    const lifecycle = page.onShow().then(() => {
      lifecycleFinished = true;
    });
    await vi.waitFor(() => expect(page.data.loading).toBe(false));
    await Promise.resolve();

    expect(page.data.profile.nickname).toBe('山野骑手');
    expect(lifecycleFinished).toBe(true);

    pendingCard.resolve(capabilityCard());
    await lifecycle;
  });

  it('骑行名片超过短 deadline 后降级且迟到结果不得落地', async () => {
    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroBackgrounds).toHaveLength(1));
    const pendingCard = deferred<ReturnType<typeof capabilityCard>>();
    rideService.getPersonalCapabilityCard.mockReturnValueOnce(pendingCard.promise);
    vi.useFakeTimers();

    const refresh = page.onShow();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_200);

    expect(page.data.heroBackgrounds).toEqual([]);
    expect(page.data.heroCard).toBeNull();
    expect(page.data.heroBackgroundAvatarUrl).toBe('');
    expect(page.data.heroFallbackImageUrl).toBe('/assets/profile/hero-alpine.svg');

    pendingCard.resolve(
      capabilityCard({
        backgrounds: [
          {
            url: 'https://temporary.example/late.jpg',
            source: 'user_photo',
            category: 'ride',
          },
        ],
      }),
    );
    await refresh;
    await Promise.resolve();

    expect(page.data.heroBackgrounds).toEqual([]);
  });

  it('压缩 hero 首屏展示真实名片摘要与资料完整度', async () => {
    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroCard).toBeTruthy());

    expect(page.data.heroCard).toMatchObject({
      title: '周末爬坡手',
      statusLabel: '已连接',
      primaryMetrics: [
        { key: 'totalKm90d', value: '812.5', unit: 'km' },
        { key: 'rides90d', value: '28', unit: '次' },
        { key: 'longestKm', value: '126.3', unit: 'km' },
      ],
    });
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    const styles = readFileSync('miniprogram/pages/profile/index.wxss', 'utf8');
    expect(template).toContain('class="hero-capability-card"');
    expect(template).toContain('近 90 天骑行摘要');
    expect(template).toContain('STRAVA {{heroCard.statusLabel}}');
    expect(template).toContain('{{profile.completeness}}%');
    expect(template).toContain('style="width: {{profile.completeness}}%"');
    expect(styles).toMatch(/\.profile-hero\.has-bg\s*\{[^}]*min-height:\s*438rpx/s);
  });

  it('profile 请求失败时 hero 仍回退骑行名片 displayName', async () => {
    rideService.getProfile.mockRejectedValueOnce(new Error('资料服务失败'));

    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroCard).toBeTruthy());

    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    expect(page.data.profile).toBeNull();
    expect(page.data.heroCard.displayName).toBe('山野骑手');
    expect(template).toContain(
      "profile ? profile.nickname : (heroCard ? heroCard.displayName : '欢迎来到此里')",
    );
    expect(template).toContain('{{heroCard.emptyMetricsText}}');
  });

  it('hero 图片逐级从用户图、头像、包内山景降级到 CSS alpine', async () => {
    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroBackgrounds).toHaveLength(1));

    page.heroBackgroundError({
      currentTarget: {
        dataset: { index: 0, url: 'https://temporary.example/ride.jpg' },
      },
    });
    expect(page.data.heroBackgrounds).toEqual([]);
    expect(page.data.heroBackgroundAvatarUrl).toBe('https://temporary.example/avatar.jpg');

    page.heroAvatarBackgroundError({
      currentTarget: { dataset: { url: 'https://temporary.example/avatar.jpg' } },
    });
    expect(page.data.heroBackgroundAvatarUrl).toBe('');
    expect(page.data.heroFallbackImageUrl).toBe('/assets/profile/hero-alpine.svg');

    page.heroFallbackBackgroundError({
      currentTarget: { dataset: { url: '/assets/profile/hero-alpine.svg' } },
    });
    expect(page.data.heroFallbackImageUrl).toBe('');
  });

  it('头像加载失败只降级头像，不移除仍可用的 hero 背景', async () => {
    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroAvatarUrl).toBeTruthy());

    page.heroAvatarError({
      currentTarget: { dataset: { url: 'https://temporary.example/avatar.jpg' } },
    });

    expect(page.data.heroAvatarUrl).toBe('');
    expect(page.data.heroBackgrounds).toHaveLength(1);
    expect(page.data.heroBackgroundAvatarUrl).toBe('https://temporary.example/avatar.jpg');
  });

  it('hero 多图默认不自动轮播，摘要卡可进入完整骑行名片', () => {
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');

    expect(template).not.toMatch(/<swiper\b[^>]*\bautoplay(?:=|\s|>)/);
    expect(template).toMatch(/class="hero-capability-card"[^>]*bindtap="capabilityCard"/);
    page.capabilityCard();
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/capability-card/index' });
  });

  it('hero 背景隐藏于无障碍树且头像有可读标签', () => {
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    const backgroundImages = template.match(/<image\b[^>]*class="hero-[^"]+"[^>]*\/>/g) || [];
    const avatarImage = template.match(/<image\b[^>]*class="avatar-image"[^>]*\/>/)?.[0] || '';

    expect(backgroundImages.length).toBeGreaterThanOrEqual(3);
    expect(backgroundImages.every((image: string) => image.includes('aria-hidden="true"'))).toBe(
      true,
    );
    expect(avatarImage).toContain('aria-label=');
  });

  it('hero 使用独立错误处理并以包内山景和 CSS alpine 兜底', () => {
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');

    expect(template).not.toMatch(/<state-view\b[^>]*\b(?:type|text)=/);
    expect(template).toContain('binderror="heroBackgroundError"');
    expect(template).toContain('binderror="heroAvatarBackgroundError"');
    expect(template).toContain('binderror="heroFallbackBackgroundError"');
    expect(template).toContain('binderror="heroAvatarError"');
    expect(template).toContain('class="hero-alpine"');
    expect(existsSync('miniprogram/assets/profile/hero-alpine.svg')).toBe(true);
  });

  it('入口仅沿用现有身份与管理员权限条件', () => {
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');

    expect(template).toMatch(/wx:if="{{authStatus === 'authenticated'}}" bindtap="activities"/);
    expect(template).toMatch(/wx:if="{{isAdmin}}" bindtap="admin"/);
    expect(template).not.toMatch(/wx:if="{{isSuper}}" bindtap="admin"/);
  });

  it('身份与资料请求并行启动，管理员入口等待本次身份确认', async () => {
    const identity = deferred<unknown>();
    const profileLoad = deferred<ReturnType<typeof profile>>();
    appStore.role = 'admin';
    appStore.isSuper = true;
    appStore.authStatus = 'authenticated';
    appStore.ensureIdentity.mockImplementationOnce(() => {
      appStore.authStatus = 'loading';
      return identity.promise.then((result) => {
        appStore.authStatus = 'authenticated';
        return result;
      });
    });
    rideService.getProfile.mockReturnValueOnce(profileLoad.promise);

    const loading = page.onShow();

    expect(appStore.ensureIdentity).toHaveBeenCalledOnce();
    expect(appStore.ensureIdentity).toHaveBeenCalledWith(wx.cloud, false);
    expect(appStore.refreshIdentity).not.toHaveBeenCalled();
    expect(rideService.getProfile).toHaveBeenCalledOnce();
    expect(page.data.isAdmin).toBe(false);

    profileLoad.resolve(profile('管理员骑手'));
    identity.resolve({
      status: 'authenticated',
      identity: { openid: 'admin-openid', role: 'admin', isSuper: true },
    });
    await loading;

    expect(page.data.isAdmin).toBe(true);
    expect(page.data.profile.nickname).toBe('管理员骑手');
  });

  it('较慢的旧资料响应不能覆盖较新的 onShow 响应', async () => {
    const oldRequest = deferred<ReturnType<typeof profile>>();
    const newRequest = deferred<ReturnType<typeof profile>>();
    rideService.getProfile
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    const oldLoad = page.onShow();
    await vi.waitFor(() => expect(rideService.getProfile).toHaveBeenCalledTimes(1));
    const newLoad = page.onShow();
    await vi.waitFor(() => expect(rideService.getProfile).toHaveBeenCalledTimes(2));

    newRequest.resolve(profile('新资料'));
    await newLoad;
    oldRequest.resolve(profile('旧资料'));
    await oldLoad;

    expect(page.data.profile.nickname).toBe('新资料');
  });

  it.each(['onHide', 'onUnload'])('%s 使尚未完成的资料请求失效', async (hook) => {
    await page.onShow();
    const pending = deferred<ReturnType<typeof profile>>();
    rideService.getProfile.mockReturnValueOnce(pending.promise);

    const refresh = page.onShow();
    await vi.waitFor(() => expect(rideService.getProfile).toHaveBeenCalledTimes(2));
    page[hook]();
    pending.resolve(profile('迟到资料'));
    await refresh;

    expect(page.data.profile.nickname).toBe('山野骑手');
  });

  it('首次资料失败进入可重试错误态而不是空态', async () => {
    rideService.getProfile.mockRejectedValueOnce(new Error('资料读取失败'));

    await page.onShow();

    expect(page.data).toMatchObject({ profile: null, loading: false, error: '资料读取失败' });
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    expect(template).toContain('class="card profile-error"');
    expect(template).toContain('bindtap="retryProfile"');
    expect(template).toContain(
      'role="alert" aria-live="assertive" aria-atomic="true">{{error}}</view>',
    );
    expect(template).toMatch(
      /class="card profile-error"[^>]*>[\s\S]*?<view aria-hidden="true">[\s\S]*?资料暂时无法加载/,
    );
  });

  it('资料请求成功但没有记录时才进入真正空态', async () => {
    rideService.getProfile.mockResolvedValueOnce(null);

    await page.onShow();

    expect(page.data).toMatchObject({ profile: null, loading: false, error: '' });
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    expect(template).toContain('class="card empty-profile"');
    expect(template).toContain('wx:else');
    expect(template).toContain("{{loading ? '正在读取资料。正在同步最新资料' :");
    expect(template).toContain("!error ? '资料已就绪' : ''");
    expect(template).toMatch(/class="card profile-loading"[^>]*aria-hidden="true"/);
  });

  it('已有资料刷新失败时保留内容并展示非阻塞错误', async () => {
    await page.onShow();
    rideService.getProfile.mockRejectedValueOnce(new Error('刷新失败'));

    await page.onShow();

    expect(page.data).toMatchObject({
      profile: expect.objectContaining({ nickname: '山野骑手' }),
      loading: false,
      refreshing: false,
      error: '刷新失败',
    });
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    const polite =
      template.match(/<view\b(?=[^>]*aria-live="polite")(?=[^>]*role="status")[^>]*>/)?.[0] || '';
    const assertive =
      template.match(/<view\b(?=[^>]*aria-live="assertive")(?=[^>]*role="alert")[^>]*>/)?.[0] || '';
    const visibleError =
      template.match(/<view\b[^>]*class="profile-refresh-error"[^>]*>[\s\S]*?<\/view>/)?.[0] || '';

    expect(polite).toContain('aria-atomic="true"');
    expect(polite).not.toMatch(/wx:(?:if|elif|else)/);
    expect(assertive).toContain('aria-atomic="true"');
    expect(assertive).not.toMatch(/wx:(?:if|elif|else)/);
    expect(template).toContain("refreshing ? '正在更新资料'");
    expect(template).toContain('{{error}}');
    expect(visibleError).toMatch(/<text\b[^>]*aria-hidden="true"[^>]*>{{error}}<\/text>/);
    expect(visibleError).toContain('<button bindtap="retryProfile">重试</button>');
  });

  it('身份请求异常不吞掉成功资料，且身份错误独立展示', async () => {
    appStore.ensureIdentity.mockImplementationOnce(() => {
      appStore.authStatus = 'loading';
      return Promise.reject(new Error('身份服务离线'));
    });

    await page.onShow();

    expect(page.data.profile.nickname).toBe('山野骑手');
    expect(page.data.error).toBe('');
    expect(page.data.authError).toBe('身份服务离线');
    expect(page.data.isAdmin).toBe(false);
  });

  it('用户点击身份重试时强制绕过 TTL', async () => {
    await page.retryAuth();

    expect(appStore.ensureIdentity).toHaveBeenCalledWith(wx.cloud, true);
  });

  it('远端身份待确认或不可用时只展示上次验证提示且不开放任何受限入口', async () => {
    const identity = deferred<unknown>();
    appStore.role = 'admin';
    appStore.isSuper = true;
    appStore.identityHint = {
      source: 'wechat_cloud',
      verifiedAt: Date.UTC(2026, 8, 30, 1, 2, 3),
    };
    appStore.ensureIdentity.mockImplementationOnce(() => {
      appStore.authStatus = 'loading';
      return identity.promise.then((result) => {
        appStore.authStatus = 'unavailable';
        appStore.authError = '当前环境不支持微信云开发';
        return result;
      });
    });

    const loading = page.onShow();

    expect(page.data).toMatchObject({
      authStatus: 'loading',
      identityHintText: '上次已完成微信身份验证 2026-09-30 09:02',
      isAdmin: false,
    });
    page.activities();
    page.admin();
    expect(wx.navigateTo).not.toHaveBeenCalled();

    identity.resolve({
      status: 'unavailable',
      code: 'CLOUD_UNAVAILABLE',
      message: '当前环境不支持微信云开发',
    });
    await loading;

    expect(page.data).toMatchObject({
      authStatus: 'unavailable',
      identityHintText: '上次已完成微信身份验证 2026-09-30 09:02',
      isAdmin: false,
    });
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    expect(template).toContain('wx:if="{{identityHintText}}"');
    expect(template).toContain('{{identityHintText}}');
  });

  it('远端身份错误时仍展示上次验证提示但保持权限关闭', async () => {
    appStore.role = 'admin';
    appStore.isSuper = true;
    appStore.identityHint = {
      source: 'wechat_cloud',
      verifiedAt: Date.UTC(2026, 8, 30, 1, 2, 3),
    };
    appStore.ensureIdentity.mockImplementationOnce(async () => {
      appStore.authStatus = 'loading';
      await Promise.resolve();
      appStore.authStatus = 'error';
      appStore.authError = '身份服务暂时不可用';
      return {
        status: 'error',
        code: 'CALL_FAILED',
        message: '身份服务暂时不可用',
      };
    });

    await page.onShow();

    expect(page.data).toMatchObject({
      authStatus: 'error',
      authError: '身份服务暂时不可用',
      identityHintText: '上次已完成微信身份验证 2026-09-30 09:02',
      isAdmin: false,
    });
    page.activities();
    page.admin();
    expect(wx.navigateTo).not.toHaveBeenCalled();
  });
});
