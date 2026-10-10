import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStravaReadiness: vi.fn(),
}));

vi.mock('../miniprogram/repositories/index', () => ({
  repository: { getStravaReadiness: mocks.getStravaReadiness },
}));

const readyState = {
  state: 'ready',
  canRegister: true,
  avatarAvailable: true,
  athleteName: '曹蒙恩',
  snapshot: null,
  error: null,
};

describe('设置页', () => {
  let page: any;
  let storage: Record<string, unknown>;

  beforeEach(async () => {
    vi.resetModules();
    mocks.getStravaReadiness.mockReset().mockResolvedValue(readyState);
    storage = { 'display-theme': 'dark' };
    vi.stubGlobal('wx', {
      getStorageSync: vi.fn((key: string) => storage[key]),
      setStorageSync: vi.fn((key: string, value: unknown) => {
        storage[key] = value;
      }),
      setNavigationBarColor: vi.fn(),
      setTabBarStyle: vi.fn(),
      setBackgroundColor: vi.fn(),
      showToast: vi.fn(),
      navigateTo: vi.fn(),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/settings/index');
  });

  it('进入页面时同步主题、版本日志和 Strava 授权状态', async () => {
    page.onShow();
    await vi.waitFor(() => expect(page.data.stravaLoading).toBe(false));

    expect(page.data).toMatchObject({
      theme: 'dark',
      themeClass: 'theme-dark',
      stravaReadiness: readyState,
      stravaStatusText: '已连接，可重新授权或解绑',
    });
    expect(page.data.releaseNotes).toHaveLength(24);
    expect(page.data.releaseNotes[0]).toMatchObject({
      version: '2026.10.10.8',
      latest: true,
      title: '我的行程支持分页加载',
    });
    expect(page.data.releaseNotes.slice(1).every((note: { latest: boolean }) => !note.latest)).toBe(
      true,
    );
    expect(wx.setNavigationBarColor).toHaveBeenCalled();
    expect(wx.setTabBarStyle).toHaveBeenCalled();
  });

  it('状态读取失败时结束加载且保留重试入口', async () => {
    mocks.getStravaReadiness.mockRejectedValueOnce(new Error('网络暂不可用'));

    await page.loadStravaStatus();

    expect(page.data).toMatchObject({
      stravaLoading: false,
      stravaLoadError: '网络暂不可用',
      stravaReadiness: null,
      stravaStatusText: '暂时无法读取授权状态',
    });
    mocks.getStravaReadiness.mockResolvedValueOnce(readyState);
    await page.loadStravaStatus();
    expect(page.data.stravaReadiness).toEqual(readyState);
  });

  it('复用 Strava 页面处理重新授权、修复和解绑', () => {
    page.openStrava({ currentTarget: { dataset: { action: 'reauthorize' } } });
    expect(wx.navigateTo).toHaveBeenLastCalledWith({ url: '/pages/strava/index?reauthorize=1' });

    page.openStrava({ currentTarget: { dataset: {} } });
    expect(wx.navigateTo).toHaveBeenLastCalledWith({ url: '/pages/strava/index' });
  });

  it('切换浅色主题后立即持久化并反馈结果', () => {
    page.switchTheme({ currentTarget: { dataset: { theme: 'light' } } });

    expect(storage['display-theme']).toBe('light');
    expect(page.data).toMatchObject({ theme: 'light', themeClass: 'theme-light' });
    expect(wx.showToast).toHaveBeenCalledWith({ title: '已切换浅色模式', icon: 'none' });
  });

  it('可从浅色主题切回默认深色主题', () => {
    page.switchTheme({ currentTarget: { dataset: { theme: 'light' } } });
    page.switchTheme({ currentTarget: { dataset: { theme: 'dark' } } });

    expect(storage['display-theme']).toBe('dark');
    expect(page.data).toMatchObject({ theme: 'dark', themeClass: 'theme-dark' });
    expect(wx.showToast).toHaveBeenLastCalledWith({ title: '已切换深色模式', icon: 'none' });
  });
});
