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

  beforeEach(async () => {
    vi.resetModules();
    mocks.getStravaReadiness.mockReset().mockResolvedValue(readyState);
    vi.stubGlobal('wx', {
      navigateTo: vi.fn(),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/settings/index');
  });

  it('进入页面时加载版本日志和 Strava 授权状态', async () => {
    page.onShow();
    await vi.waitFor(() => expect(page.data.stravaLoading).toBe(false));

    expect(page.data).toMatchObject({
      stravaReadiness: readyState,
      stravaStatusText: '已连接，可重新授权或解绑',
    });
    expect(page.data.releaseNotes).toHaveLength(5);
    expect(page.data.releaseNotes[0]).toMatchObject({
      version: '2026.10.10.18',
      latest: true,
      title: '明亮界面可读性与日志收敛',
    });
    expect(page.data.releaseNotes.slice(1).every((note: { latest: boolean }) => !note.latest)).toBe(
      true,
    );
    const versions = page.data.releaseNotes.map((note: { version: string }) => note.version);
    expect(versions).toEqual([
      '2026.10.10.18',
      '2026.10.10.17',
      '2026.10.10.16',
      '2026.10.10.15',
      '2026.10.10.14',
    ]);
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
});
