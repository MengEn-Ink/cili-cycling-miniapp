import { afterEach, describe, expect, it, vi } from 'vitest';

type Storage = Record<string, unknown>;

type PlatformOptions = {
  success?: () => void;
  fail?: () => void;
  iconPath?: string;
  selectedIconPath?: string;
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

  it('无存储值时默认亮色并生成根节点类名', async () => {
    const service = await loadThemeService(wxMock());

    expect(service.getTheme()).toBe('light');
    expect(service.themeClass()).toBe('theme-light');
  });

  it('历史深色存储会被规范化为亮色但不回写', async () => {
    const storage: Storage = { 'display-theme': 'dark' };
    const wxApi = wxMock(storage);
    const service = await loadThemeService(wxApi);

    expect(service.getTheme()).toBe('light');
    expect(wxApi.setStorageSync).not.toHaveBeenCalled();
  });

  it.each(['legacy-light', '', null, 1, 'dark'])('非法或旧值 %j 统一回退为亮色', async (value) => {
    const storage: Storage = { 'display-theme': value };
    const wxApi = wxMock(storage);
    const service = await loadThemeService(wxApi);

    expect(service.getTheme()).toBe('light');
    expect(wxApi.setStorageSync).not.toHaveBeenCalled();
  });

  it('setTheme 接收到深色时也会收口为亮色', async () => {
    const storage: Storage = {};
    const wxApi = wxMock(storage);
    const service = await loadThemeService(wxApi);

    expect(service.setTheme('dark')).toBe('light');
    expect(storage['display-theme']).toBe('light');
  });

  it('写入存储失败时保留本次会话选择（亮色）', async () => {
    const storage: Storage = {};
    const wxApi = wxMock(storage);
    (wxApi.setStorageSync as any).mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const service = await loadThemeService(wxApi);

    expect(() => service.setTheme('light')).not.toThrow();
    expect(service.getTheme()).toBe('light');
  });

  it('页面返回前台时同步当前主题和系统外观', async () => {
    const storage: Storage = { 'display-theme': 'dark' };
    const wxApi = wxMock(storage);
    const service = await loadThemeService(wxApi);

    const firstPage = { setData: vi.fn() };
    const returningPage = { setData: vi.fn() };

    service.syncPageTheme(firstPage);
    service.syncPageTheme(returningPage);

    expect(returningPage.setData).toHaveBeenCalledWith({
      theme: 'light',
      themeClass: 'theme-light',
    });

    expect(wxApi.setNavigationBarColor).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundColor: '#ffffff', frontColor: '#000000' }),
    );
    expect(wxApi.setTabBarStyle).toHaveBeenCalled();
    expect(wxApi.setBackgroundColor).toHaveBeenCalled();
  });

  it('主题同步会使用亮色 TabBar 图标变体', async () => {
    const storage: Storage = { 'display-theme': 'dark' };
    const wxApi = wxMock(storage);
    const service = await loadThemeService(wxApi);

    service.applyTheme('dark');

    const iconPaths = (wxApi.setTabBarItem as any).mock.calls.map(
      (call: any[]) => call[0]?.iconPath,
    );
    const selectedIconPaths = (wxApi.setTabBarItem as any).mock.calls.map(
      (call: any[]) => call[0]?.selectedIconPath,
    );

    expect(iconPaths).toContain('assets/tabbar/activities-light.png');
    expect(iconPaths).toContain('assets/tabbar/registrations-light.png');
    expect(iconPaths).toContain('assets/tabbar/profile-light.png');
    expect(selectedIconPaths).toContain('assets/tabbar/activities-active.png');
    expect(selectedIconPaths).toContain('assets/tabbar/registrations-active.png');
    expect(selectedIconPaths).toContain('assets/tabbar/profile-active.png');
  });

  it('系统主题 API 缺失、调用抛错或页面已销毁时不影响运行', async () => {
    const service = await loadThemeService({
      getStorageSync: () => 'dark',
      setStorageSync: () => {
        throw new Error('storage fail');
      },
    });

    expect(() => service.applyTheme()).not.toThrow();
    expect(() => service.syncPageTheme(undefined as any)).not.toThrow();
  });
});
