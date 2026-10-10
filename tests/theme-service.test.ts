import { afterEach, describe, expect, it, vi } from 'vitest';

type PlatformOptions = {
  success?: () => void;
  fail?: () => void;
  iconPath?: string;
  [key: string]: unknown;
};

function wxMock() {
  const succeed = vi.fn((options?: PlatformOptions) => options?.success?.());
  return {
    setNavigationBarColor: succeed,
    setTabBarStyle: vi.fn((options?: PlatformOptions) => options?.success?.()),
    setTabBarItem: vi.fn((options?: PlatformOptions) => options?.success?.()),
    setBackgroundColor: vi.fn((options?: PlatformOptions) => options?.success?.()),
  };
}

async function loadAppearanceService(wxApi: Record<string, unknown>) {
  vi.resetModules();
  vi.stubGlobal('wx', wxApi);
  return import('../miniprogram/services/theme-service');
}

describe('固定明亮系统外观服务', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('同步白色导航、白色 TabBar、浅色图标和白色滚动边界', async () => {
    const wxApi = wxMock();
    const service = await loadAppearanceService(wxApi);

    service.applyAppAppearance();

    expect(wxApi.setNavigationBarColor).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: '#ffffff', frontColor: '#000000' }),
    );
    expect(wxApi.setTabBarStyle).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: '#ffffff',
        borderStyle: 'white',
        color: '#5b6258',
        selectedColor: '#10120f',
      }),
    );
    expect(wxApi.setTabBarItem.mock.calls.map(([item]) => item?.iconPath)).toEqual([
      'assets/tabbar/activities-light.png',
      'assets/tabbar/registrations-light.png',
      'assets/tabbar/profile-light.png',
    ]);
    expect(wxApi.setBackgroundColor).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: '#ffffff',
        backgroundColorTop: '#ffffff',
        backgroundColorBottom: '#ffffff',
      }),
    );
  });

  it('外观全部成功后重复同步不再刷新原生组件', async () => {
    const wxApi = wxMock();
    const service = await loadAppearanceService(wxApi);

    service.applyAppAppearance();
    service.applyAppAppearance();

    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(1);
    expect(wxApi.setTabBarStyle).toHaveBeenCalledTimes(1);
    expect(wxApi.setTabBarItem).toHaveBeenCalledTimes(3);
    expect(wxApi.setBackgroundColor).toHaveBeenCalledTimes(1);
  });

  it('任一原生调用失败后允许下一次应用重试', async () => {
    const wxApi = wxMock();
    wxApi.setNavigationBarColor
      .mockImplementationOnce((options?: PlatformOptions) => options?.fail?.())
      .mockImplementation((options?: PlatformOptions) => options?.success?.());
    const service = await loadAppearanceService(wxApi);

    service.applyAppAppearance();
    service.applyAppAppearance();

    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(2);
    expect(wxApi.setTabBarStyle).toHaveBeenCalledTimes(2);
    expect(wxApi.setTabBarItem).toHaveBeenCalledTimes(6);
    expect(wxApi.setBackgroundColor).toHaveBeenCalledTimes(2);
  });

  it('失败批次完成前再次同步会在批次结束后重试', async () => {
    const callbacks: PlatformOptions[] = [];
    const defer = vi.fn((options?: PlatformOptions) => {
      if (options) callbacks.push(options);
    });
    const wxApi = wxMock();
    wxApi.setNavigationBarColor.mockImplementation(defer);
    wxApi.setTabBarStyle.mockImplementation(defer);
    wxApi.setTabBarItem.mockImplementation(defer);
    wxApi.setBackgroundColor.mockImplementation(defer);
    const service = await loadAppearanceService(wxApi);

    service.applyAppAppearance();
    const firstBatch = callbacks.splice(0, 6);
    firstBatch[0].fail?.();
    service.applyAppAppearance();
    firstBatch.slice(1).forEach((options) => options.success?.());

    expect(wxApi.setNavigationBarColor).toHaveBeenCalledTimes(2);
    expect(wxApi.setTabBarStyle).toHaveBeenCalledTimes(2);
    expect(wxApi.setTabBarItem).toHaveBeenCalledTimes(6);
    expect(wxApi.setBackgroundColor).toHaveBeenCalledTimes(2);
  });

  it('原生 API 缺失或抛错时不阻断应用启动', async () => {
    const service = await loadAppearanceService({
      setNavigationBarColor: () => {
        throw new Error('unsupported');
      },
    });

    expect(() => service.applyAppAppearance()).not.toThrow();
    expect(() => service.applyAppAppearance()).not.toThrow();
  });
});
