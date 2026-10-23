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
  generatedAt: '2026-09-30T00:00:00.000Z',
  profile: {
    displayName: '山野骑手',
    gender: '男',
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
    vi.stubGlobal('wx', {
      cloud: {},
      navigateTo: vi.fn(),
      previewImage: vi.fn(),
      stopPullDownRefresh: vi.fn(),
      showModal: vi.fn(),
      showToast: vi.fn(),
      setClipboardData: vi.fn(({ success }) => success?.()),
    });
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

  it('骑行名片刷新超时后保留旧内容，且迟到结果不得覆盖', async () => {
    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroBackgrounds).toHaveLength(1));
    const previousCard = page.data.heroCard;
    const pendingCard = deferred<ReturnType<typeof capabilityCard>>();
    rideService.getPersonalCapabilityCard.mockReturnValueOnce(pendingCard.promise);
    vi.useFakeTimers();

    const refresh = page.onShow();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(8_000);

    expect(page.data.heroBackgrounds).toEqual([
      expect.objectContaining({ url: 'https://temporary.example/ride.jpg' }),
    ]);
    expect(page.data.heroCard).toBe(previousCard);
    expect(page.data.refreshMessage).toContain('继续展示');

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

    expect(page.data.heroBackgrounds).toEqual([
      expect.objectContaining({ url: 'https://temporary.example/ride.jpg' }),
    ]);
  });

  it('个人中心只展示微信身份、昵称与照片，命名与性别回退遵守 WXML 契约', async () => {
    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroCard).toBeTruthy());

    expect(page.data.heroCard).toMatchObject({
      gender: '男',
      genderLabel: '男',
      displayName: '山野骑手',
    });
    expect(page.data).not.toHaveProperty('cardExpanded');
  });

  it('profile 请求失败时 hero 仍回退骑行名片 displayName', async () => {
    rideService.getProfile.mockRejectedValueOnce(new Error('资料服务失败'));

    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroCard).toBeTruthy());

    expect(page.data.profile).toBeNull();
    expect(page.data.heroCard.displayName).toBe('山野骑手');
  });

  it('profile 昵称为空时 hero 仍回退骑行名片 displayName', async () => {
    rideService.getProfile.mockResolvedValueOnce(profile(''));

    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroCard).toBeTruthy());

    expect(page.data.profile.nickname).toBe('');
    expect(page.data.heroCard.displayName).toBe('山野骑手');
  });

  it('hero 背景从用户图直接降级到深色非人物兜底，头像保持独立', async () => {
    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroBackgrounds).toHaveLength(1));

    page.heroBackgroundError({
      currentTarget: {
        dataset: { index: 0, url: 'https://temporary.example/ride.jpg' },
      },
    });
    expect(page.data.heroBackgrounds).toEqual([]);
    expect(page.data.heroFallbackImageUrl).toBe('/assets/profile/hero-alpine.svg');
    expect(page.data).not.toHaveProperty('heroBackgroundAvatarUrl');

    page.heroFallbackBackgroundError({
      currentTarget: { dataset: { url: '/assets/profile/hero-alpine.svg' } },
    });
    expect(page.data.heroFallbackImageUrl).toBe('');
  });

  it('hero 图片失效时清除旧缓存并向云函数重新签发地址', async () => {
    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroBackgrounds).toHaveLength(1));
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce(
      capabilityCard({
        backgrounds: [
          {
            url: 'https://temporary.example/ride-fresh.jpg',
            source: 'user_photo',
            category: 'ride',
          },
        ],
      }),
    );

    page.heroBackgroundError({
      currentTarget: {
        dataset: { index: 0, url: 'https://temporary.example/ride.jpg' },
      },
    });

    await vi.waitFor(() => {
      expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledTimes(2);
      expect(page.data.heroBackgrounds[0]?.url).toBe('https://temporary.example/ride-fresh.jpg');
    });
  });

  it('头像加载失败只降级头像，不移除仍可用的 hero 背景', async () => {
    await page.onShow();
    await vi.waitFor(() => expect(page.data.heroAvatarUrl).toBeTruthy());

    page.heroAvatarError({
      currentTarget: { dataset: { url: 'https://temporary.example/avatar.jpg' } },
    });

    expect(page.data.heroAvatarUrl).toBe('');
    expect(page.data.heroBackgrounds).toHaveLength(1);
    expect(page.data).not.toHaveProperty('heroBackgroundAvatarUrl');
  });

  it('个人中心头像点击只预览合法 HTTPS URL，非法或缺失时 fail closed', () => {
    page.data.heroAvatarUrl = 'https://temporary.example/avatar.jpg';
    page.previewAvatar();
    expect(wx.previewImage).toHaveBeenCalledWith({
      current: 'https://temporary.example/avatar.jpg',
      urls: ['https://temporary.example/avatar.jpg'],
    });

    (wx.previewImage as any).mockClear();
    page.data.heroAvatarUrl = '';
    page.previewAvatar();
    expect(wx.previewImage).not.toHaveBeenCalled();

    page.data.heroAvatarUrl = 'cloud://env/profiles/legacy/avatar.jpg';
    page.previewAvatar();
    expect(wx.previewImage).not.toHaveBeenCalled();

    page.data.heroAvatarUrl = 'http://example.com/avatar.jpg';
    page.previewAvatar();
    expect(wx.previewImage).not.toHaveBeenCalled();
  });

  it('不渲染自定义触摸指示器，使用原生下拉刷新完成资料重新加载', async () => {
    await page.onShow();
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    const pageScript = readFileSync('miniprogram/pages/profile/index.ts', 'utf8');
    const config = JSON.parse(readFileSync('miniprogram/pages/profile/index.json', 'utf8'));

    expect(template).not.toContain('bindtouchstart');
    expect(template).not.toContain('bindtouchmove');
    expect(pageScript).not.toContain('refreshTouchStart');
    expect(pageScript).not.toContain('refreshTouchEnd');
    expect(page.refreshTouchStart).toBeUndefined();
    expect(page.refreshTouchEnd).toBeUndefined();
    expect(page.data).not.toHaveProperty('refreshStage');
    expect(config.enablePullDownRefresh).toBe(true);
    expect(page.onPullDownRefresh).toBeTypeOf('function');

    page.previewHeroImage({
      currentTarget: { dataset: { url: 'https://temporary.example/ride.jpg', index: 0 } },
    });
    expect(wx.previewImage).toHaveBeenCalledWith({
      current: 'https://temporary.example/ride.jpg',
      urls: ['https://temporary.example/ride.jpg'],
    });

    expect(template).toContain('mode="aspectFill"');
  });

  it('原生下拉刷新强制重载并在完成后收起系统指示器', async () => {
    await page.onShow();

    await page.onPullDownRefresh();

    expect(wx.stopPullDownRefresh).toHaveBeenCalledOnce();
    expect(page.data.profile.nickname).toBe('山野骑手');
    expect(page.data.refreshing).toBe(false);
    expect(page.data).not.toHaveProperty('refreshStage');
  });

  it('离开并重新进入后旧下拉刷新不得覆盖新生命周期状态', async () => {
    await page.onShow();
    const oldProfile = deferred<ReturnType<typeof profile>>();
    const oldCard = deferred<ReturnType<typeof capabilityCard>>();
    rideService.getProfile
      .mockReturnValueOnce(oldProfile.promise)
      .mockResolvedValueOnce(profile('新页面骑手'));
    rideService.getPersonalCapabilityCard
      .mockReturnValueOnce(oldCard.promise)
      .mockResolvedValueOnce(capabilityCard());

    const staleRefresh = page.onPullDownRefresh();
    await vi.waitFor(() => expect(rideService.getProfile).toHaveBeenCalledTimes(2));
    page.onHide();
    await page.onShow();
    if (page.cardLoadPromise) await page.cardLoadPromise;

    oldProfile.resolve(profile('旧刷新骑手'));
    oldCard.resolve(capabilityCard());
    await staleRefresh;

    expect(page.data.profile.nickname).toBe('新页面骑手');
  });

  it('hero 使用独立错误处理并以包内非人物图兜底', async () => {
    await page.onShow();
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');

    expect(template).toContain('binderror="heroBackgroundError"');
    expect(template).toContain('binderror="heroFallbackBackgroundError"');
    expect(template).toContain('binderror="heroAvatarError"');
    expect(page.data.heroFallbackImageUrl).toBe('/assets/profile/hero-alpine.svg');
  });

  it('活动管理仅对管理员显示且方法层同样校验权限', () => {
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    const pageScript = readFileSync('miniprogram/pages/profile/index.ts', 'utf8');

    expect(template).toMatch(/wx:if="\{\{isAdmin\}\}"/);
    expect(template).toContain('bindtap="activities"');
    expect(template).not.toMatch(/bindtap="admin"\b/);
    expect(pageScript).toMatch(/activities\(\)\s*\{\s*if \(this\.data\.isAdmin\)/);
    page.activities();
    expect(wx.navigateTo).not.toHaveBeenCalled();
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

  it('并发 onShow 复用进行中的资料请求，避免重复请求和竞态覆盖', async () => {
    const pending = deferred<ReturnType<typeof profile>>();
    rideService.getProfile.mockReturnValueOnce(pending.promise);

    const firstLoad = page.onShow();
    await vi.waitFor(() => expect(rideService.getProfile).toHaveBeenCalledTimes(1));
    const secondLoad = page.onShow();
    expect(rideService.getProfile).toHaveBeenCalledTimes(1);

    pending.resolve(profile('复用请求资料'));
    await Promise.all([firstLoad, secondLoad]);

    expect(page.data.profile.nickname).toBe('复用请求资料');
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
    expect(template).toContain('bindtap="retryProfile"');
  });

  it('资料请求成功但没有记录时才进入真正空态', async () => {
    rideService.getProfile.mockResolvedValueOnce(null);

    await page.onShow();

    expect(page.data).toMatchObject({ profile: null, loading: false, error: '' });
  });

  it('已有资料时后台刷新失败只显示顶部非阻断提示', async () => {
    await page.onShow();
    rideService.getProfile.mockRejectedValueOnce(new Error('刷新失败'));

    await page.onPullDownRefresh();

    expect(page.data).toMatchObject({
      profile: expect.objectContaining({ nickname: '山野骑手' }),
      loading: false,
      refreshing: false,
      error: '',
      refreshFailed: true,
    });
    expect(page.data.refreshMessage).toContain('刷新失败');
    expect(page.data.refreshMessage).toContain('继续展示');
  });

  it('唯一俱乐部头像加载失败后回退“俱”字占位', async () => {
    rideService.getProfile.mockResolvedValueOnce({
      ...profile('山野骑手'),
      clubs: [
        {
          clubId: 'club-1',
          name: '辛庄桥小火车',
          avatarUrl: 'https://temporary.example/broken-club.jpg',
          role: 'member',
          roleLabel: '成员',
        },
      ],
    });
    await page.onShow();
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    expect(template).toContain('binderror="clubAvatarError"');
    expect(page.data.clubAvatarFailed).toBe(false);
    page.clubAvatarError();
    expect(page.data.clubAvatarFailed).toBe(true);
    expect(template).toContain('profile.clubs[0].avatarUrl && !clubAvatarFailed');
  });

  it('唯一俱乐部资料刷新后重置头像失败占位', async () => {
    await page.onShow();
    page.clubAvatarError();
    expect(page.data.clubAvatarFailed).toBe(true);
    rideService.getProfile.mockResolvedValueOnce(profile('山野骑手'));
    await page.onPullDownRefresh();
    expect(page.data.clubAvatarFailed).toBe(false);
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
      identityHintText: '上次微信登录 2026-09-30 09:02',
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
      identityHintText: '上次微信登录 2026-09-30 09:02',
      isAdmin: false,
    });
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
      identityHintText: '上次微信登录 2026-09-30 09:02',
      isAdmin: false,
    });
    page.activities();
    page.admin();
    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  it('锁定橙红、炭黑、暖灰、白的高对比视觉语义且不使用荧光黄', () => {
    const styles = readFileSync('miniprogram/pages/profile/index.wxss', 'utf8');

    expect(styles).toContain('var(--color-text)');
    expect(styles).toContain('var(--color-bg)');
    expect(styles).not.toMatch(/#(?:ccff00|d7ff00|eaff00|ffff00)/i);
  });

  it('下方菜单集中提供俱乐部、报名资料、设置三条行，并保留隐私说明文案', () => {
    page.openSettings();

    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/settings/index' });
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    expect(template).toContain('报名资料');
    expect(template).toContain('设置');
    expect(template).toContain('联系电话仅用于活动联络');
    expect(template).toContain('紧急联系人仅在骑行安全需要时使用');
    expect(template).not.toMatch(/报名成功|审核中|已报名|报名状态/);
  });

  it('微信身份未授权时提供“重新登录”引导入口（profile-status--warn）', async () => {
    const template = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');

    expect(template).toContain(
      "wx:elif=\"{{authStatus === 'unavailable' || authStatus === 'error'}}\"",
    );
    expect(template).toContain('重新登录');
    expect(template).toContain('bindtap="retryAuth"');
  });
});
