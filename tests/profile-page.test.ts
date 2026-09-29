// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
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
  refreshIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

const profile = (nickname: string, avatarSource: 'wechat' | 'strava' = 'wechat') => ({
  nickname,
  title: '',
  realName: '',
  phone: '',
  gender: '',
  emergencyName: '',
  emergencyPhone: '',
  photos: [],
  avatarSource,
  completeness: 60,
});

const personalCard = {
  state: 'ready',
  generatedAt: '2026-09-29T04:10:00.000Z',
  profile: { displayName: '山野骑手', title: '周末爬坡手' },
  stravaAvatarUrl: 'https://temporary.example/strava-avatar.jpg',
  backgrounds: [
    { url: 'https://temporary.example/rider-bg.jpg', source: 'user_photo', category: 'ride' },
    { url: 'https://temporary.example/avatar.jpg', source: 'avatar', category: 'other' },
  ],
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
    rideService.getPersonalCapabilityCard.mockReset().mockResolvedValue(personalCard);
    appStore.role = 'member';
    appStore.isSuper = false;
    appStore.authStatus = 'idle';
    appStore.authError = '';
    appStore.refreshIdentity.mockReset().mockImplementation(() => {
      appStore.authStatus = 'loading';
      appStore.authError = '';
      return Promise.resolve().then(() => {
        appStore.authStatus = 'authenticated';
        return {
          status: 'authenticated',
          identity: { openid: 'member-openid', role: appStore.role, isSuper: appStore.isSuper },
        };
      });
    });
    vi.stubGlobal('wx', { cloud: {}, navigateTo: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/profile/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('身份与资料请求并行启动，管理员入口等待本次身份确认', async () => {
    const identity = deferred<unknown>();
    const profileLoad = deferred<ReturnType<typeof profile>>();
    appStore.role = 'admin';
    appStore.isSuper = true;
    appStore.authStatus = 'authenticated';
    appStore.refreshIdentity.mockImplementationOnce(() => {
      appStore.authStatus = 'loading';
      return identity.promise.then((result) => {
        appStore.authStatus = 'authenticated';
        return result;
      });
    });
    rideService.getProfile.mockReturnValueOnce(profileLoad.promise);

    const loading = page.onShow();

    expect(appStore.refreshIdentity).toHaveBeenCalledOnce();
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

  it('个人中心复用骑行名片背景与已选择头像', async () => {
    await page.onShow();

    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledOnce();
    expect(page.data).toMatchObject({
      profileHeroBackground: 'https://temporary.example/rider-bg.jpg',
      hasProfileHeroBackground: true,
      profileAvatarUrl: 'https://temporary.example/avatar.jpg',
      hasProfileAvatar: true,
      profileInitial: '山',
      profileCardStatus: '已连接',
    });
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    expect(template).toContain('class="hero-bg"');
    expect(template).toContain(
      '名片背景 · STRAVA {{profileCardStatus}} · {{profileAvatarSourceLabel}}',
    );
    expect(template).toContain('binderror="heroBackgroundError"');
    expect(template).toContain('binderror="avatarError"');
  });

  it('用户选择 Strava 头像时优先展示 Strava，失效后回退默认头像', async () => {
    rideService.getProfile.mockResolvedValueOnce(profile('山野骑手', 'strava'));

    await page.onShow();

    expect(page.data.profileAvatarUrl).toBe('https://temporary.example/strava-avatar.jpg');
    expect(page.data.profileAvatarSourceLabel).toBe('Strava 头像');

    page.avatarError();

    expect(page.data).toMatchObject({
      profileAvatarUrl: '',
      hasProfileAvatar: false,
      profileAvatarSourceLabel: '默认头像',
    });
  });

  it('骑行名片背景加载失败时收起背景避免破图', async () => {
    await page.onShow();

    page.heroBackgroundError();

    expect(page.data).toMatchObject({
      profileHeroBackground: '',
      hasProfileHeroBackground: false,
    });
  });

  it('名片响应先于资料返回时不会被资料回写清空背景', async () => {
    const profileLoad = deferred<ReturnType<typeof profile>>();
    rideService.getProfile.mockReturnValueOnce(profileLoad.promise);

    const loading = page.onShow();
    await vi.waitFor(() => expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(page.data.profileHeroBackground).toBe('https://temporary.example/rider-bg.jpg');

    profileLoad.resolve(profile('后来资料'));
    await loading;

    expect(page.data.profile.nickname).toBe('后来资料');
    expect(page.data.profileHeroBackground).toBe('https://temporary.example/rider-bg.jpg');
    expect(page.data.profileInitial).toBe('后');
  });

  it('骑行名片暂时失败时不阻断个人资料展示', async () => {
    rideService.getPersonalCapabilityCard.mockRejectedValueOnce(new Error('card unavailable'));

    await page.onShow();

    expect(page.data.profile.nickname).toBe('山野骑手');
    expect(page.data.error).toBe('');
    expect(page.data.hasProfileHeroBackground).toBe(false);
    expect(page.data.profileInitial).toBe('山');
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
    appStore.refreshIdentity.mockImplementationOnce(() => {
      appStore.authStatus = 'loading';
      return Promise.reject(new Error('身份服务离线'));
    });

    await page.onShow();

    expect(page.data.profile.nickname).toBe('山野骑手');
    expect(page.data.error).toBe('');
    expect(page.data.authError).toBe('身份服务离线');
    expect(page.data.isAdmin).toBe(false);
  });
});
