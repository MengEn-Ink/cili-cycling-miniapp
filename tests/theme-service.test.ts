import { afterEach, describe, expect, it, vi } from 'vitest';

type Storage = Record<string, unknown>;

function wxMock(storage: Storage = {}) {
  return {
    getStorageSync: vi.fn((key: string) => storage[key]),
    setStorageSync: vi.fn((key: string, value: unknown) => {
      storage[key] = value;
    }),
    setNavigationBarColor: vi.fn(),
    setTabBarStyle: vi.fn(),
    setBackgroundColor: vi.fn(),
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
