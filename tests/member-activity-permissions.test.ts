// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  listAdminActivities: vi.fn(),
  listAdminActivitiesPage: vi.fn(),
  cloneActivity: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  role: 'member',
  authStatus: 'authenticated',
  ensureIdentity: vi.fn(),
}));
vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

describe('成员活动页面权限', () => {
  let page: any;
  beforeEach(async () => {
    vi.resetModules();
    appStore.role = 'member';
    appStore.authStatus = 'authenticated';
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    rideService.listAdminActivities.mockReset().mockResolvedValue([]);
    rideService.listAdminActivitiesPage.mockReset().mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    rideService.cloneActivity.mockReset();
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
    expect(appStore.ensureIdentity).toHaveBeenCalledWith(wx.cloud);
    expect(page.data).toMatchObject({ allowed: true, isAdmin: false });
    expect(rideService.listAdminActivitiesPage).toHaveBeenCalledOnce();
    page.create();
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/admin/activity-edit/index' });
    page.reviews();
    expect(wx.navigateTo).toHaveBeenCalledOnce();
  });

  it('只给服务端返回的历史活动展示模板操作，不扩张成员审批权限', async () => {
    rideService.listAdminActivitiesPage.mockResolvedValue({
      items: [
        { id: 'own-finished', title: '历史活动', status: 'finished' },
        { id: 'own-draft', title: '草稿', status: 'draft' },
        { id: 'own-published', title: '进行中', status: 'published' },
      ],
      nextCursor: null,
    });

    await page.onShow();

    expect(page.data.items.map((item: any) => [item.id, item.canClone])).toEqual([
      ['own-finished', true],
      ['own-draft', false],
      ['own-published', false],
    ]);
    expect(readFileSync('miniprogram/pages/admin/activity-list/index.wxml', 'utf8')).toMatch(
      /wx:if="{{item\.canClone}}"[^>]*catchtap="startClone"/,
    );
    page.reviews();
    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  it('克隆前要求新时间，双击只提交一次且成功进入返回草稿', async () => {
    rideService.listAdminActivitiesPage.mockResolvedValue({
      items: [{ id: 'own-finished', title: '历史活动', status: 'finished' }],
      nextCursor: null,
    });
    let resolveClone!: (value: unknown) => void;
    rideService.cloneActivity.mockReturnValue(
      new Promise((resolve) => {
        resolveClone = resolve;
      }),
    );
    await page.onShow();
    page.startClone({ currentTarget: { dataset: { id: 'own-finished' } } });

    await page.confirmClone();
    expect(rideService.cloneActivity).not.toHaveBeenCalled();
    expect(page.data.error).toContain('时间');

    page.data.cloneForm = {
      deadline: '2026-10-20T00:00:00.000Z',
      startAt: '2026-10-21T00:00:00.000Z',
      endAt: '2026-10-21T08:00:00.000Z',
    };
    const first = page.confirmClone();
    const second = page.confirmClone();
    expect(rideService.cloneActivity).toHaveBeenCalledOnce();
    resolveClone({ id: 'activity_clone_new' });
    await Promise.all([first, second]);
    expect(wx.navigateTo).toHaveBeenCalledWith({
      url: '/pages/admin/activity-edit/index?id=activity_clone_new&fromTemplate=1',
    });
  });

  it('克隆失败后重试复用同一个 requestId', async () => {
    rideService.listAdminActivitiesPage.mockResolvedValue({
      items: [{ id: 'own-finished', title: '历史活动', status: 'finished' }],
      nextCursor: null,
    });
    rideService.cloneActivity
      .mockRejectedValueOnce(new Error('网络失败'))
      .mockResolvedValueOnce({ id: 'activity_clone_retry' });
    await page.onShow();
    page.startClone({ currentTarget: { dataset: { id: 'own-finished' } } });
    page.data.cloneForm = {
      deadline: '2026-10-20T00:00:00.000Z',
      startAt: '2026-10-21T00:00:00.000Z',
      endAt: '2026-10-21T08:00:00.000Z',
    };

    await page.confirmClone();
    await page.confirmClone();

    expect(rideService.cloneActivity).toHaveBeenCalledTimes(2);
    expect(rideService.cloneActivity.mock.calls[1][0].requestId).toBe(
      rideService.cloneActivity.mock.calls[0][0].requestId,
    );
  });
});
