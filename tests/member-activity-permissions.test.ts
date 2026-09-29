import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({ listAdminActivities: vi.fn() }));
const appStore = vi.hoisted(() => ({
  role: 'member',
  authStatus: 'authenticated',
  refreshIdentity: vi.fn(),
}));
vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

describe('成员活动页面权限', () => {
  let page: any;
  beforeEach(async () => {
    vi.resetModules();
    appStore.role = 'member';
    appStore.authStatus = 'authenticated';
    appStore.refreshIdentity.mockReset().mockResolvedValue(undefined);
    rideService.listAdminActivities.mockReset().mockResolvedValue([]);
    vi.stubGlobal('wx', { cloud: {}, navigateTo: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    });
    await import('../miniprogram/pages/admin/activity-list/index');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('已认证普通成员可进入我的活动并创建草稿，但无审批入口权限', async () => {
    await page.onShow();
    expect(page.data).toMatchObject({ allowed: true, isAdmin: false });
    expect(rideService.listAdminActivities).toHaveBeenCalledOnce();
    page.create();
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/admin/activity-edit/index' });
    page.reviews();
    expect(wx.navigateTo).toHaveBeenCalledOnce();
  });
});
