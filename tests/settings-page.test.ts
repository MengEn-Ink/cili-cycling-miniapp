import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('设置页', () => {
  let page: any;
  let storage: Record<string, unknown>;

  beforeEach(async () => {
    vi.resetModules();
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
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/settings/index');
  });

  it('进入页面时同步当前主题并展示版本日志', () => {
    page.onShow();

    expect(page.data).toMatchObject({ theme: 'dark', themeClass: 'theme-dark' });
    expect(page.data.releaseNotes).toHaveLength(5);
    expect(page.data.releaseNotes[0]).toMatchObject({
      version: '2026.10.02.2',
      latest: true,
      title: '主题切换与视觉可读性优化',
    });
    expect(page.data.releaseNotes.slice(1).every((note: { latest: boolean }) => !note.latest)).toBe(
      true,
    );
    expect(wx.setNavigationBarColor).toHaveBeenCalled();
    expect(wx.setTabBarStyle).toHaveBeenCalled();
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
