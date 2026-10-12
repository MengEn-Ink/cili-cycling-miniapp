// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  listAdminActivities: vi.fn(),
  listAdminActivitiesPage: vi.fn(),
  saveActivity: vi.fn(),
  cloneActivity: vi.fn(),
  deleteActivity: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  authStatus: 'authenticated',
  role: 'member',
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

describe('活动列表上线与删除端到端操作', () => {
  let page: any;
  const draft = { id: 'draft-1', title: '草稿活动', status: 'draft', version: 2 };
  const published = { id: 'published-1', title: '线上活动', status: 'published', version: 3 };

  beforeEach(async () => {
    vi.resetModules();
    rideService.listAdminActivities.mockReset();
    rideService.listAdminActivitiesPage
      .mockReset()
      .mockResolvedValue({ items: [draft, published], nextCursor: null });
    rideService.saveActivity.mockReset().mockImplementation(async (value) => value);
    rideService.deleteActivity.mockReset().mockResolvedValue({ deleted: true });
    appStore.authStatus = 'authenticated';
    appStore.role = 'member';
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('wx', {
      cloud: {},
      navigateTo: vi.fn(),
      showToast: vi.fn(),
      showModal: vi.fn(({ success }) =>
        success({ confirm: true, cancel: false, content: '路线临时封闭' }),
      ),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/admin/activity-list/index');
    await page.onShow();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('展示中文状态和对应的上线、下架操作', () => {
    expect(page.data.items).toEqual([
      expect.objectContaining({ id: 'draft-1', statusLabel: '已下架', toggleLabel: '上线' }),
      expect.objectContaining({ id: 'published-1', statusLabel: '已上线', toggleLabel: '下架' }),
    ]);
    const template = readFileSync('miniprogram/pages/admin/activity-list/index.wxml', 'utf8');
    expect(template).toContain('catchtap="toggleOnline"');
    expect(template).toContain('{{item.statusLabel}}');
  });

  it('从页面真实按钮绑定触发上线与删除完整操作', async () => {
    const template = readFileSync('miniprogram/pages/admin/activity-list/index.wxml', 'utf8');
    const toggleHandler = template.match(
      /wx:if="{{item\.canToggleOnline}}"[\s\S]*?catchtap="([^"]+)"/,
    )?.[1];
    const deleteHandler = template.match(
      /wx:if="{{item\.status === 'draft'}}" catchtap="([^"]+)"/,
    )?.[1];

    expect(toggleHandler).toBe('toggleOnline');
    expect(deleteHandler).toBe('confirmDelete');

    await page[toggleHandler!]({ currentTarget: { dataset: { id: 'draft-1' } } });
    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'draft-1', status: 'published' }),
      'draft-1',
      2,
    );
    expect(wx.showToast).toHaveBeenCalledWith({ title: '已上线', icon: 'success' });

    await page[deleteHandler!]({ currentTarget: { dataset: { id: 'draft-1' } } });
    expect(rideService.deleteActivity).toHaveBeenCalledWith('draft-1', '路线临时封闭');
    expect(wx.showToast).toHaveBeenCalledWith({ title: '已删除', icon: 'success' });
    expect(page.data.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'draft-1' })]),
    );
  });

  it('确认后下架活动并刷新列表', async () => {
    await page.toggleOnline({ currentTarget: { dataset: { id: 'published-1' } } });

    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'published-1', status: 'draft' }),
      'published-1',
      3,
      undefined,
      '路线临时封闭',
    );
    expect(wx.showToast).toHaveBeenCalledWith({ title: '已下架', icon: 'success' });
    expect(rideService.listAdminActivitiesPage).toHaveBeenCalledTimes(2);
  });
});
