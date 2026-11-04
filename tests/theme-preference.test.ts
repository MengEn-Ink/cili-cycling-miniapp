import { afterEach, describe, expect, it, vi } from 'vitest';

const makeWx = (stored: unknown = '') => ({
  getStorageSync: vi.fn(() => stored),
  setStorageSync: vi.fn(),
  setNavigationBarColor: vi.fn((o: any) => o.success?.()),
  setTabBarStyle: vi.fn((o: any) => o.success?.()),
  setTabBarItem: vi.fn((o: any) => o.success?.()),
  setBackgroundColor: vi.fn((o: any) => o.success?.()),
});
async function load(stored: unknown = '') {
  vi.resetModules();
  const wxApi = makeWx(stored);
  vi.stubGlobal('wx', wxApi);
  return { wxApi, service: await import('../miniprogram/services/theme-service') };
}

describe('全局浅暗主题偏好与页面邻接', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('持久化浅色并同步所有栈页，返回页恢复原生导航', async () => {
    const { wxApi, service } = await load();
    const configs: any[] = [];
    vi.stubGlobal('Page', (config: any) => configs.push(config));
    const show = vi.fn();
    service.themedPage({ data: { business: 7 }, onShow: show });
    const page = {
      data: { ...configs[0].data },
      setData(p: any) {
        Object.assign(this.data, p);
      },
    };
    configs[0].onLoad.call(page, { id: 'real' });
    configs[0].onShow.call(page);
    service.setAppearance('light');
    expect(page.data.business).toBe(7);
    expect(page.data.appearanceMode).toBe('light');
    expect(page.data.appearanceStyle).toContain('--color-bg:#f7f6f2');
    expect(wxApi.setStorageSync).toHaveBeenCalledWith('cili-appearance', 'light');
    expect(wxApi.setNavigationBarColor).toHaveBeenLastCalledWith(
      expect.objectContaining({ frontColor: '#000000', backgroundColor: '#f7f6f2' }),
    );
    expect(wxApi.setTabBarItem).toHaveBeenCalledWith(
      expect.objectContaining({ iconPath: 'assets/tabbar/activities.png' }),
    );
    const before = wxApi.setNavigationBarColor.mock.calls.length;
    configs[0].onShow.call(page);
    expect(show).toHaveBeenCalledTimes(2);
    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(before + 1);
    configs[0].onUnload.call(page);
    service.setAppearance('dark');
    expect(page.data.appearanceMode).toBe('light');
  });
  it('重复 onLoad 只保留一个订阅，卸载后切主题不再 setData', async () => {
    const { service } = await load();
    let config: any;
    vi.stubGlobal('Page', (options: any) => {
      config = options;
    });
    const businessLoad = vi.fn(() => 'loaded');
    const businessUnload = vi.fn(() => 'unloaded');
    service.themedPage({ data: {}, onLoad: businessLoad, onUnload: businessUnload });
    const page = { setData: vi.fn() };
    expect(config.onLoad.call(page, { id: 'credential' })).toBe('loaded');
    expect(config.onLoad.call(page, { id: 'credential' })).toBe('loaded');
    expect(businessLoad).toHaveBeenCalledTimes(2);
    page.setData.mockClear();
    service.setAppearance('light');
    expect(page.setData).toHaveBeenCalledTimes(1);
    expect(config.onUnload.call(page)).toBe('unloaded');
    config.onUnload.call(page);
    expect(businessUnload).toHaveBeenCalledTimes(2);
    page.setData.mockClear();
    service.setAppearance('dark');
    expect(page.setData).not.toHaveBeenCalled();
  });
  it('新会话读取持久化值，损坏值安全降级为暗色', async () => {
    expect((await load('light')).service.getAppearance()).toBe('light');
    expect((await load({ mode: 'light' })).service.getAppearance()).toBe('dark');
  });
  it('存储读取失败仍可进入，保存失败不假报持久化成功', async () => {
    const { wxApi, service } = await load();
    wxApi.getStorageSync.mockImplementation(() => {
      throw new Error('read');
    });
    expect(service.getAppearance()).toBe('dark');
    wxApi.setStorageSync.mockImplementation(() => {
      throw new Error('full');
    });
    expect(service.setAppearance('light')).toBe(false);
    expect(service.getAppearance()).toBe('dark');
    expect(service.setAppearance('invalid' as any)).toBe(false);
  });
  it('生命周期保留业务 this、入参、返回值；主题更新不覆盖业务字段', async () => {
    const { service } = await load('light');
    let config: any;
    vi.stubGlobal('Page', (options: any) => {
      config = options;
    });
    const onLoad = vi.fn(function (this: any, params: any) {
      return { owner: this, params };
    });
    const onUnload = vi.fn(() => 'unloaded');
    service.themedPage({ data: { approval: 'pending' }, onLoad, onUnload });
    const page = {
      data: { ...config.data },
      setData(patch: any) {
        Object.assign(this.data, patch);
      },
    };
    const params = { id: 'server-activity' };
    expect(config.onLoad.call(page, params)).toEqual({ owner: page, params });
    service.setAppearance('dark');
    expect(page.data.approval).toBe('pending');
    expect(config.onUnload.call(page)).toBe('unloaded');
    expect(onLoad).toHaveBeenCalledOnce();
    expect(onUnload).toHaveBeenCalledOnce();
  });
  it('多栈页同步；卸载一页不影响其他页，重复平台回调只结算一次', async () => {
    const { service, wxApi } = await load();
    const configs: any[] = [];
    vi.stubGlobal('Page', (config: any) => configs.push(config));
    service.themedPage({ data: { id: 'activity' } });
    service.themedPage({ data: { id: 'settings' } });
    const pages = configs.map((config) => ({
      data: { ...config.data },
      setData(patch: any) {
        Object.assign(this.data, patch);
      },
    }));
    configs.forEach((config, index) => config.onLoad.call(pages[index]));
    wxApi.setNavigationBarColor.mockImplementation((options: any) => {
      options.success();
      options.fail();
    });
    service.setAppearance('light');
    expect(pages.map((page) => page.data.appearanceMode)).toEqual(['light', 'light']);
    configs[0].onUnload.call(pages[0]);
    service.setAppearance('dark');
    expect(pages.map((page) => page.data.appearanceMode)).toEqual(['light', 'dark']);
    expect(pages.map((page) => page.data.id)).toEqual(['activity', 'settings']);
  });
  it('快速切换最终为最新主题，不被旧批次迟到回调标记完成', async () => {
    const { wxApi, service } = await load();
    const callbacks: any[] = [];
    wxApi.setNavigationBarColor.mockImplementation((o: any) => callbacks.push(o));
    service.applyAppAppearance();
    service.setAppearance('light');
    service.setAppearance('dark');
    callbacks[0].success();
    expect(service.getAppearance()).toBe('dark');
    expect(callbacks[callbacks.length - 1].backgroundColor).toBe('#0b0a0c');
  });
});
