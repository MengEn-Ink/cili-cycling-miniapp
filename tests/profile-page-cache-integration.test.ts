import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getPersonalCapabilityCard: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  openid: 'member-openid' as string | null,
  role: 'member',
  isSuper: false,
  authStatus: 'authenticated',
  authError: '',
  identityHint: null,
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

const cachedProfile = {
  nickname: '缓存骑手',
  hasCompletedGuidance: true,
  completeness: 88,
};
const fullProfile = {
  avatarRevision: 1,
  nickname: '最新骑手',
  title: '',
  realName: '',
  phone: '',
  gender: '',
  emergencyName: '',
  emergencyPhone: '',
  photos: [],
  hasCompletedGuidance: true,
  completeness: 90,
};
const card = {
  state: 'ready',
  generatedAt: '2026-09-30T12:00:00.000Z',
  profile: {
    displayName: '缓存骑手',
    title: '周末骑手',
    avatarUrl: 'https://image.example/avatar.jpg',
  },
  backgrounds: [
    {
      url: 'https://image.example/background.jpg',
      source: 'user_photo',
      category: 'ride',
    },
  ],
  summary: {
    totalKm90d: 500,
    rides90d: 20,
    longestKm: 100,
    elevationM90d: 5000,
    weightedAvgSpeedKmh: 25,
  },
  coverage: null,
  syncedAt: '2026-09-30T11:00:00.000Z',
};

async function mountPage(
  cachedAt = Date.now(),
  ownerOpenid = 'member-openid',
  cachedCard: typeof card = card,
  includeCache = true,
) {
  let page: any;
  const cache = {
    version: 1,
    ownerOpenid,
    cachedAt,
    profile: cachedProfile,
    card: cachedCard,
    images: {
      'https://image.example/avatar.jpg': 'saved://avatar.jpg',
      'https://image.example/background.jpg': 'saved://background.jpg',
    },
  };
  vi.stubGlobal('wx', {
    cloud: {},
    getStorageSync: vi.fn(() => (includeCache ? cache : undefined)),
    setStorageSync: vi.fn(),
    removeStorageSync: vi.fn(),
    removeSavedFile: vi.fn(),
    getImageInfo: vi.fn(({ src, success }) => success({ path: `tmp://${src}` })),
    saveFile: vi.fn(({ tempFilePath, success }) =>
      success({ savedFilePath: `saved://${tempFilePath}` }),
    ),
    stopPullDownRefresh: vi.fn(),
    previewImage: vi.fn(),
  });
  vi.stubGlobal('Page', (definition: any) => {
    page = definition;
    page.data = { ...definition.data };
    page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
  });
  await import('../miniprogram/pages/profile/index');
  return page;
}

describe('个人中心缓存优先与主动刷新', () => {
  beforeEach(() => {
    vi.resetModules();
    rideService.getProfile.mockReset().mockResolvedValue(fullProfile);
    rideService.getPersonalCapabilityCard.mockReset().mockResolvedValue({
      ...card,
      profile: { ...card.profile, displayName: '最新骑手' },
    });
    appStore.openid = 'member-openid';
    appStore.authStatus = 'authenticated';
    appStore.authError = '';
    appStore.ensureIdentity.mockReset().mockResolvedValue({
      status: 'authenticated',
      identity: { openid: 'member-openid', role: 'member', isSuper: false },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('六小时内先展示本地数据且不重复请求业务接口', async () => {
    const page = await mountPage();
    const loading = page.onShow();

    expect(page.data.profile.nickname).toBe('缓存骑手');
    expect(page.data.heroAvatarUrl).toBe('saved://avatar.jpg');
    expect(page.data.usingCache).toBe(true);
    await loading;

    expect(rideService.getProfile).not.toHaveBeenCalled();
    expect(rideService.getPersonalCapabilityCard).not.toHaveBeenCalled();
  });

  it('原生下拉强制刷新完整名片并短暂展示更新时间', async () => {
    const page = await mountPage();
    await page.onShow();

    await page.onPullDownRefresh();

    expect(rideService.getProfile).toHaveBeenCalledOnce();
    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledOnce();
    expect(page.data.profile.nickname).toBe('最新骑手');
    expect(page.data).not.toHaveProperty('cardExpanded');
    expect(page.data).toMatchObject({
      refreshStage: 'success',
      refreshTitle: '刷新完成',
      refreshDetail: '刚刚更新',
    });
    expect(page.data.updatedAtText).toBe('刚刚更新');
    expect(wx.stopPullDownRefresh).toHaveBeenCalledOnce();
    page.onHide();
  });

  it('账号切换时不展示上一账号缓存并改为加载当前账号资料', async () => {
    appStore.openid = 'member-b';
    appStore.ensureIdentity.mockResolvedValueOnce({
      status: 'authenticated',
      identity: { openid: 'member-b', role: 'member', isSuper: false },
    });
    const page = await mountPage(Date.now(), 'member-a');

    const loading = page.onShow();
    expect(page.data.profile).toBeNull();
    expect(page.data.heroCard).toBeNull();
    await loading;

    expect(page.data.profile.nickname).toBe('最新骑手');
    expect(wx.removeStorageSync).toHaveBeenCalled();
  });

  it('下拉刷新不会复用仅校验缓存身份的在途请求', async () => {
    let releaseIdentity!: () => void;
    appStore.ensureIdentity.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseIdentity = () =>
          resolve({
            status: 'authenticated',
            identity: { openid: 'member-openid', role: 'member', isSuper: false },
          });
      }),
    );
    const page = await mountPage();

    const showing = page.onShow();
    const refreshing = page.onPullDownRefresh();
    expect(rideService.getProfile).not.toHaveBeenCalled();
    releaseIdentity();
    await Promise.all([showing, refreshing]);

    expect(rideService.getProfile).toHaveBeenCalledOnce();
    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledOnce();
    expect(page.data.profile.nickname).toBe('最新骑手');
  });

  it('页面隐藏后取消尚未启动的排队刷新', async () => {
    let releaseIdentity!: () => void;
    appStore.ensureIdentity.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseIdentity = () =>
          resolve({
            status: 'authenticated',
            identity: { openid: 'member-openid', role: 'member', isSuper: false },
          });
      }),
    );
    const page = await mountPage();

    const showing = page.onShow();
    const refreshing = page.onPullDownRefresh();
    page.onHide();
    releaseIdentity();
    await Promise.all([showing, refreshing]);

    expect(rideService.getProfile).not.toHaveBeenCalled();
    expect(rideService.getPersonalCapabilityCard).not.toHaveBeenCalled();
  });

  it('过渡状态缓存会先展示并立即后台刷新', async () => {
    const page = await mountPage(Date.now(), 'member-openid', { ...card, state: 'syncing' });

    const loading = page.onShow();
    expect(page.data.profile.nickname).toBe('缓存骑手');
    await loading;
    if (page.cardLoadPromise) await page.cardLoadPromise;

    expect(rideService.getProfile).toHaveBeenCalledOnce();
    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledOnce();
  });

  it('首次图片部分失败时不写入六小时新鲜缓存', async () => {
    const page = await mountPage(Date.now(), 'member-openid', card, false);
    vi.mocked(wx.saveFile).mockImplementation(({ tempFilePath, success, fail }: any) => {
      if (String(tempFilePath).includes('background')) fail?.();
      else success?.({ savedFilePath: `saved://${tempFilePath}` });
    });

    await page.onShow();
    if (page.cardLoadPromise) await page.cardLoadPromise;

    expect(wx.setStorageSync).not.toHaveBeenCalled();
    expect(wx.removeSavedFile).toHaveBeenCalled();
  });

  it('页面隐藏后回收本轮新图片且不替换旧缓存', async () => {
    const page = await mountPage();
    await page.onShow();
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce({
      ...card,
      profile: { ...card.profile, avatarUrl: 'https://image.example/new-avatar.jpg' },
      backgrounds: [
        {
          ...card.backgrounds[0],
          url: 'https://image.example/new-background.jpg',
        },
      ],
    });
    const saves: { tempFilePath: string; success: (value: { savedFilePath: string }) => void }[] =
      [];
    vi.mocked(wx.saveFile).mockImplementation(({ tempFilePath, success }: any) => {
      saves.push({ tempFilePath, success });
    });

    const refreshing = page.onPullDownRefresh();
    await vi.waitFor(() => expect(saves).toHaveLength(2));
    page.onHide();
    for (const save of saves) save.success({ savedFilePath: `saved://${save.tempFilePath}` });
    await refreshing;

    expect(wx.setStorageSync).not.toHaveBeenCalled();
    expect(wx.removeSavedFile).toHaveBeenCalledTimes(2);
  });

  it('缓存过期后静默更新，失败仍保留旧内容', async () => {
    const page = await mountPage(Date.now() - 7 * 60 * 60_000);
    rideService.getProfile.mockRejectedValueOnce(new Error('网络不可用'));

    await page.onShow();

    expect(page.data.profile.nickname).toBe('缓存骑手');
    expect(page.data.error).toBe('');
    expect(page.data.refreshMessage).toContain('网络不可用');
    expect(page.data.refreshMessage).toContain('继续展示');
  });
});
