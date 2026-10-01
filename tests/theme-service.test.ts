import { afterEach, describe, expect, it, vi } from 'vitest';

type Storage = Record<string, unknown>;
type PlatformOptions = {
  success?: () => void;
  fail?: () => void;
  iconPath?: string;
  [key: string]: unknown;
};

function wxMock(storage: Storage = {}) {
  const succeed = vi.fn((options?: PlatformOptions) => options?.success?.());
  return {
    getStorageSync: vi.fn((key: string) => storage[key]),
    setStorageSync: vi.fn((key: string, value: unknown) => {
      storage[key] = value;
    }),
    setNavigationBarColor: succeed,
    setTabBarStyle: vi.fn((options?: PlatformOptions) => options?.success?.()),
    setTabBarItem: vi.fn((options?: PlatformOptions) => options?.success?.()),
    setBackgroundColor: vi.fn((options?: PlatformOptions) => options?.success?.()),
  };
}

async function loadThemeService(wxApi: Record<string, unknown>) {
  vi.resetModules();
  vi.stubGlobal('wx', wxApi);
  return import('../miniprogram/services/theme-service');
}

describe('主题服务', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('无存储值时默认深色并生成根节点类名', async () => {
    const service = await loadThemeService(wxMock());

    expect(service.getTheme()).toBe('dark');
    expect(service.themeClass()).toBe('theme-dark');
  });

  it('浅色选择持久化，并在新会话恢复', async () => {
    const storage: Storage = {};
    const firstWx = wxMock(storage);
    const first = await loadThemeService(firstWx);

    expect(first.setTheme('light')).toBe('light');
    expect(storage['display-theme']).toBe('light');

    const second = await loadThemeService(wxMock(storage));
    expect(second.getTheme()).toBe('light');
    expect(second.themeClass()).toBe('theme-light');
  });

  it.each(['legacy-light', '', null, 1])('非法或旧值 %j 回退深色', async (value) => {
    const service = await loadThemeService(wxMock({ 'display-theme': value }));

    expect(service.getTheme()).toBe('dark');
  });

  it('写入存储失败时保留本次会话选择', async () => {
    const wxApi = wxMock();
    wxApi.setStorageSync.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const service = await loadThemeService(wxApi);

    expect(() => service.setTheme('light')).not.toThrow();
    expect(service.getTheme()).toBe('light');
  });

  it('页面返回前台时同步当前主题和系统外观', async () => {
    const wxApi = wxMock();
    const service = await loadThemeService(wxApi);
    const firstPage = { setData: vi.fn() };
    const returningPage = { setData: vi.fn() };

    service.setTheme('light');
    service.syncPageTheme(firstPage);
    service.syncPageTheme(returningPage);

    expect(returningPage.setData).toHaveBeenCalledWith({
      theme: 'light',
      themeClass: 'theme-light',
    });
    expect(wxApi.setNavigationBarColor).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundColor: '#f6f1e8', frontColor: '#000000' }),
    );
    expect(wxApi.setTabBarStyle).toHaveBeenCalled();
    expect(wxApi.setBackgroundColor).toHaveBeenCalled();
  });

  it('相同主题重复返回前台时不重复触发页面和原生外观重绘', async () => {
    const wxApi = wxMock({ 'display-theme': 'dark' });
    const service = await loadThemeService(wxApi);
    const page = {
      data: { theme: 'dark', themeClass: 'theme-dark' },
      setData: vi.fn(),
    };

    service.syncPageTheme(page);
    service.syncPageTheme(page);

    expect(page.setData).not.toHaveBeenCalled();
    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(1);
    expect(wxApi.setTabBarStyle).toHaveBeenCalledTimes(1);
    expect(wxApi.setTabBarItem).toHaveBeenCalledTimes(3);
    expect(wxApi.setBackgroundColor).toHaveBeenCalledTimes(1);
  });

  it('页面主题过期时只更新页面数据，不重复应用已经生效的原生主题', async () => {
    const wxApi = wxMock({ 'display-theme': 'light' });
    const service = await loadThemeService(wxApi);
    const page = {
      data: { theme: 'dark', themeClass: 'theme-dark' },
      setData: vi.fn(),
    };

    service.applyTheme('light');
    service.syncPageTheme(page);

    expect(page.setData).toHaveBeenCalledOnce();
    expect(page.setData).toHaveBeenCalledWith({ theme: 'light', themeClass: 'theme-light' });
    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(1);
    expect(wxApi.setTabBarStyle).toHaveBeenCalledTimes(1);
    expect(wxApi.setTabBarItem).toHaveBeenCalledTimes(3);
    expect(wxApi.setBackgroundColor).toHaveBeenCalledTimes(1);
  });

  it('相同主题仍在应用时不重复发起原生外观更新', async () => {
    const wxApi = wxMock();
    wxApi.setNavigationBarColor.mockImplementation(() => undefined);
    const service = await loadThemeService(wxApi);

    service.applyTheme('dark');
    service.applyTheme('dark');

    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(1);
    expect(wxApi.setTabBarStyle).toHaveBeenCalledTimes(1);
    expect(wxApi.setTabBarItem).toHaveBeenCalledTimes(3);
    expect(wxApi.setBackgroundColor).toHaveBeenCalledTimes(1);
  });

  it('快速切回已生效主题时在异步浅色调用后重新应用深色', async () => {
    const wxApi = wxMock();
    const service = await loadThemeService(wxApi);
    service.applyTheme('dark');

    const callbacks: Array<() => void> = [];
    const deferSuccess = (options?: PlatformOptions) => {
      callbacks.push(() => options?.success?.());
    };
    wxApi.setNavigationBarColor.mockClear().mockImplementation(deferSuccess);
    wxApi.setTabBarStyle.mockClear().mockImplementation(deferSuccess);
    wxApi.setTabBarItem.mockClear().mockImplementation(deferSuccess);
    wxApi.setBackgroundColor.mockClear().mockImplementation(deferSuccess);

    service.applyTheme('light');
    service.applyTheme('dark');

    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(1);
    expect(wxApi.setNavigationBarColor).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundColor: '#f6f1e8' }),
    );

    while (callbacks.length > 0) callbacks.shift()?.();

    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(2);
    expect(wxApi.setNavigationBarColor).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundColor: '#0b0b0c' }),
    );
    expect(wxApi.setTabBarStyle).toHaveBeenCalledTimes(2);
    expect(wxApi.setTabBarItem).toHaveBeenCalledTimes(6);
    expect(wxApi.setTabBarItem.mock.calls.slice(-3).map(([item]) => item?.iconPath)).toEqual([
      'assets/tabbar/activities.png',
      'assets/tabbar/registrations.png',
      'assets/tabbar/profile.png',
    ]);
    expect(wxApi.setBackgroundColor).toHaveBeenCalledTimes(2);
  });

  it('失败批次完成前再次同步相同主题时保留重试', async () => {
    const callbacks: PlatformOptions[] = [];
    const defer = vi.fn((options?: PlatformOptions) => {
      if (options) callbacks.push(options);
    });
    const wxApi = wxMock();
    wxApi.setNavigationBarColor.mockImplementation(defer);
    wxApi.setTabBarStyle.mockImplementation(defer);
    wxApi.setTabBarItem.mockImplementation(defer);
    wxApi.setBackgroundColor.mockImplementation(defer);
    const service = await loadThemeService(wxApi);

    service.applyTheme('dark');
    const firstBatch = callbacks.splice(0, 6);
    firstBatch[0].fail?.();
    service.applyTheme('dark');
    firstBatch.slice(1).forEach((options) => options.success?.());

    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(2);
    expect(wxApi.setTabBarStyle).toHaveBeenCalledTimes(2);
    expect(wxApi.setTabBarItem).toHaveBeenCalledTimes(6);
    expect(wxApi.setBackgroundColor).toHaveBeenCalledTimes(2);
  });

  it('原生主题 API 失败后保留下一次同步重试能力', async () => {
    const wxApi = wxMock();
    wxApi.setNavigationBarColor
      .mockImplementationOnce((options?: PlatformOptions) => options?.fail?.())
      .mockImplementation((options?: PlatformOptions) => options?.success?.());
    const service = await loadThemeService(wxApi);

    service.applyTheme('dark');
    service.applyTheme('dark');

    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(2);
    expect(wxApi.setTabBarStyle).toHaveBeenCalledTimes(2);
    expect(wxApi.setTabBarItem).toHaveBeenCalledTimes(6);
    expect(wxApi.setBackgroundColor).toHaveBeenCalledTimes(2);
  });

  it('主题切换同步三项原生 TabBar 图标', async () => {
    const wxApi = wxMock();
    const service = await loadThemeService(wxApi);

    service.applyTheme('light');
    expect(wxApi.setTabBarItem.mock.calls.map(([item]) => item)).toEqual([
      {
        index: 0,
        iconPath: 'assets/tabbar/activities-light.png',
        selectedIconPath: 'assets/tabbar/activities-active.png',
        success: expect.any(Function),
        fail: expect.any(Function),
      },
      {
        index: 1,
        iconPath: 'assets/tabbar/registrations-light.png',
        selectedIconPath: 'assets/tabbar/registrations-active.png',
        success: expect.any(Function),
        fail: expect.any(Function),
      },
      {
        index: 2,
        iconPath: 'assets/tabbar/profile-light.png',
        selectedIconPath: 'assets/tabbar/profile-active.png',
        success: expect.any(Function),
        fail: expect.any(Function),
      },
    ]);

    wxApi.setTabBarItem.mockClear();
    service.applyTheme('dark');
    expect(wxApi.setTabBarItem.mock.calls.map(([item]) => item?.iconPath)).toEqual([
      'assets/tabbar/activities.png',
      'assets/tabbar/registrations.png',
      'assets/tabbar/profile.png',
    ]);
  });

  it('系统主题 API 缺失、调用抛错或页面已销毁时不影响运行', async () => {
    const service = await loadThemeService({
      getStorageSync: () => 'dark',
      setNavigationBarColor: () => {
        throw new Error('unsupported');
      },
    });

    expect(() => service.applyTheme()).not.toThrow();
    expect(() =>
      service.syncPageTheme({
        setData: () => {
          throw new Error('destroyed');
        },
      }),
    ).not.toThrow();
  });
});
