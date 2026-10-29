// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_RELEASE_VERSION } from '../miniprogram/config/release';

const mocks = vi.hoisted(() => ({
  readiness: vi.fn(),
  startStravaAuth: vi.fn(),
  getTemplates: vi.fn(),
  requestSubscription: vi.fn(),
  clearRepository: vi.fn(),
  clearProfile: vi.fn(),
  clearTempUrls: vi.fn(),
}));
vi.mock('../miniprogram/repositories/index', () => ({
  repository: {
    getStravaRouteReadiness: mocks.readiness,
    startStravaRouteAuthorization: mocks.startStravaAuth,
    getReviewNotificationTemplateIds: mocks.getTemplates,
    requestReviewNotificationSubscription: mocks.requestSubscription,
  },
  repositoryCache: { clear: mocks.clearRepository },
}));
vi.mock('../miniprogram/utils/profile-page-cache', () => ({
  clearProfilePageCache: mocks.clearProfile,
}));
vi.mock('../miniprogram/utils/temp-file-url', () => ({
  clearSharedTempFileUrlCache: mocks.clearTempUrls,
}));
const appStoreMock: {
  authStatus: 'authenticated' | 'unavailable' | 'error' | 'idle' | 'loading';
  role: 'admin' | 'member';
} = { authStatus: 'authenticated', role: 'member' };
vi.mock('../miniprogram/store/app-store', () => ({
  appStore: appStoreMock,
}));

describe('设置页', () => {
  let page: any;
  let wxApi: any;

  beforeEach(async () => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getTemplates.mockResolvedValue([]);
    mocks.readiness.mockResolvedValue({ state: 'disconnected', athleteName: '' });
    appStoreMock.role = 'member';
    appStoreMock.authStatus = 'authenticated';
    wxApi = {
      showToast: vi.fn(),
      showModal: vi.fn(),
      openPrivacyContract: vi.fn(),
      setClipboardData: vi.fn().mockResolvedValue(undefined),
      navigateTo: vi.fn(),
    };
    vi.stubGlobal('wx', wxApi);
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/settings/index');
  });

  it('当前版本为 2026.10.30.1 且 latest 唯一，上一版转为历史项', () => {
    expect(CLIENT_RELEASE_VERSION).toBe('2026.10.30.1');
    expect(page.data.releaseNotes).toHaveLength(45);
    expect(page.data.currentRelease).toBe(page.data.releaseNotes[0]);
    expect(page.data.currentRelease).toMatchObject({
      version: '2026.10.30.1',
      date: '2026-10-30',
      title: '界面对比度与加载反馈优化',
      latest: true,
    });
    expect(page.data.releaseNotes[1]).toMatchObject({
      version: '2026.10.29.6',
      title: '暗场启动保护与慢加载稳定性',
      latest: false,
    });
    expect(page.data.releaseNotes.filter((note: { latest: boolean }) => note.latest)).toHaveLength(
      1,
    );
  });

  it('模板提供通知、隐私与缓存入口，通知不是可永久关闭的 switch', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    expect(template).toContain('bindtap="manageNotifications"');
    expect(template).toContain('bindtap="managePrivacy"');
    expect(template).toContain('bindtap="clearSafeCache"');
    expect(template).toContain('由微信询问本次订阅选择');
    expect(template).not.toContain('<switch');
  });

  it('通知入口复用已有订阅服务并去重、限制模板数量', async () => {
    mocks.getTemplates.mockResolvedValue(['one', 'one', 'two', 'three', 'four']);
    mocks.requestSubscription.mockResolvedValue(undefined);

    await page.manageNotifications();

    expect(mocks.getTemplates).toHaveBeenCalledOnce();
    expect(mocks.requestSubscription).toHaveBeenCalledWith(['one', 'two', 'three']);
    expect(wxApi.showToast).toHaveBeenCalledWith({ title: '已完成本次订阅选择', icon: 'success' });
    expect(page.data.actionPending).toBe(false);
  });

  it('隐私入口优先调用微信官方隐私保护指引能力，并兼容旧基础库', async () => {
    wxApi.openPrivacyContract.mockImplementation(({ success }: any) => success());
    await page.managePrivacy();
    expect(wxApi.openPrivacyContract).toHaveBeenCalledOnce();

    wxApi.openPrivacyContract = undefined;
    await page.managePrivacy();
    expect(wxApi.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '暂时无法打开隐私管理',
        content: expect.stringContaining('升级微信'),
        showCancel: false,
      }),
    );
  });

  it('缓存清理需确认且只清可重建缓存，不清登录身份或关键业务状态', () => {
    let confirm: ((result: { confirm?: boolean }) => void) | undefined;
    wxApi.showModal.mockImplementation((options: any) => {
      confirm = options.success;
    });

    page.clearSafeCache();
    expect(wxApi.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('不会退出登录，也不会删除报名、行程或个人资料'),
      }),
    );
    confirm?.({ confirm: true });

    expect(mocks.clearRepository).toHaveBeenCalledOnce();
    expect(mocks.clearProfile).toHaveBeenCalledOnce();
    expect(mocks.clearTempUrls).toHaveBeenCalledOnce();
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');
    expect(script).not.toMatch(/clearStorage|ride-identity-hint|removeStorageSync/);
  });

  it('设置页只渲染当前版本卡片，不出现历史时间线容器', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    expect(template).toContain('App 更新');
    expect(template).toContain('{{currentRelease.version}}');
    expect(template).toContain('wx:if="{{currentRelease}}"');
    expect(template).not.toContain('wx:for="{{releaseNotes}}"');
    expect(template).not.toContain('release-rail');
    expect(template).not.toContain('release-dot');
  });

  it('面向用户的设置内容不出现内部技术词', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    expect(template).not.toMatch(
      /门禁|接口|令牌|token|OpenID|openid|fileID|FileID|云开发|云存储|云端(?!更新)/,
    );
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');
    const releaseNotesBlock = script.match(/const RELEASE_NOTES[\s\S]*?\]\s*as const;/)?.[0] || '';
    expect(releaseNotesBlock).not.toMatch(
      /门禁|接口|令牌|token|OpenID|openid|fileID|FileID|云开发|云存储|云端(?!更新)/,
    );
  });

  it('不再残留旧 Strava 独立页跳转或旧账号主页能力', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');
    expect(template).not.toContain('第三方授权');
    expect(script).not.toContain('/pages/strava/index');
    // 旧的 getStravaReadiness (无 Route) 名称已退役，仅保留 getStravaRouteReadiness。
    expect(script).not.toMatch(/getStravaReadiness\b/);
    expect(script).toContain('getStravaRouteReadiness');
  });

  it('管理员才渲染同步 Strava 线路信息入口，普通骑友看不到', async () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    expect(template).toContain('同步 Strava 线路信息');
    expect(template).toContain('wx:if="{{isAdmin}}"');
    expect(template).toContain('bindtap="openStravaSync"');

    appStoreMock.role = 'member';
    page.onShow();
    expect(page.data.isAdmin).toBe(false);
    expect(mocks.readiness).not.toHaveBeenCalled();

    appStoreMock.role = 'admin';
    mocks.readiness.mockResolvedValue({ state: 'connected', athleteName: 'Mengen' });
    page.onShow();
    expect(page.data.isAdmin).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.readiness).toHaveBeenCalledOnce();
    expect(page.data.stravaDescription).toContain('已连接 Mengen');
  });

  it('未连接时点击同步 Strava 线路信息会复用现有授权能力并复制链接', async () => {
    appStoreMock.role = 'admin';
    mocks.readiness.mockResolvedValue({ state: 'disconnected', athleteName: '' });
    mocks.startStravaAuth.mockResolvedValue({
      authorizationUrl: 'https://example/authorize',
      expiresAt: '2026-10-21T13:30:00+08:00',
    });

    page.onShow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await page.openStravaSync();

    expect(mocks.startStravaAuth).toHaveBeenCalledOnce();
    expect(wxApi.setClipboardData).toHaveBeenCalledWith({ data: 'https://example/authorize' });
    expect(page.data.stravaState).toBe('pending');
    expect(wxApi.showToast).toHaveBeenCalledWith({ title: '授权链接已复制', icon: 'success' });

    page.onUnload();
  });

  it('面向用户的 Strava 入口文案避免 GPX / OAuth / token 技术词', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');
    const stravaBlock =
      template.match(/strava-section-label[\s\S]*?strava-list[\s\S]*?<\/view>/)?.[0] || '';
    expect(stravaBlock).not.toMatch(/GPX|OAuth|token|令牌/i);
    // STRAVA_COPY 面向用户的字符串也不应出现技术词
    const stravaCopy = script.match(/const STRAVA_COPY[\s\S]*?};/)?.[0] || '';
    expect(stravaCopy).not.toMatch(/GPX|OAuth|token|令牌/i);
  });

  it('小程序清单隐藏 OAuth 页面并只声明实际使用的位置能力', () => {
    const config = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
    expect(config.pages).not.toContain('pages/strava/index');
    expect(config.requiredPrivateInfos).toEqual(['chooseLocation']);
    expect(config.permission).toBeUndefined();
  });
});
