// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  listRegistrations: vi.fn(),
  deleteRegistration: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

const cancelled = {
  id: 'reg-cancelled',
  status: 'cancelled',
  updatedAt: '2026-10-11T12:00:00.000Z',
  activity: { id: 'activity-1', title: '周末骑行', date: '2026-10-12T00:00:00.000Z' },
};
const approved = {
  id: 'reg-approved',
  status: 'approved',
  updatedAt: '2026-10-11T12:00:00.000Z',
  activity: { id: 'activity-2', title: '晨骑训练', date: '2026-10-13T00:00:00.000Z' },
};

const event = (id: string) => ({ currentTarget: { dataset: { id } } });

describe('我的行程取消记录删除', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.listRegistrations.mockReset().mockResolvedValue([cancelled, approved]);
    rideService.deleteRegistration.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('wx', {
      navigateTo: vi.fn(),
      showToast: vi.fn(),
      showModal: vi.fn(({ success }) => success({ confirm: true, cancel: false })),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/registrations/index');
    await page.load();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('仅为已取消行程展示删除入口并绑定触摸手势', () => {
    const template = readFileSync('miniprogram/pages/registrations/index.wxml', 'utf8');
    expect(template).toContain('wx:if="{{item.status === \'cancelled\'}}"');
    expect(template).toContain('catchtap="confirmDelete"');
    expect(template).toContain('bindtouchstart="onRowTouchStart"');
    expect(template).toContain('bindtouchmove="onRowTouchMove"');
    expect(template).toContain('bindtouchend="onRowTouchEnd"');
    expect(template).toContain('bindtouchcancel="onRowTouchCancel"');
    expect(template).toContain('translateX({{item.swipeX}}px)');
    expect(template).toContain('删除记录');
  });

  it('确认后调用删除契约并立即移除卡片与更新统计', async () => {
    await page.confirmDelete(event('reg-cancelled'));
    expect(rideService.deleteRegistration).toHaveBeenCalledWith('reg-cancelled');
    expect(page.data.items.map((item: { id: string }) => item.id)).toEqual(['reg-approved']);
    expect(page.data.statusCounts).toEqual({ review: 0, ready: 1, expired: 0 });
  });

  it('触摸取消会关闭当前侧滑，非取消行程不会继续驱动旧卡片', () => {
    page.onRowTouchStart({
      currentTarget: { dataset: { id: 'reg-cancelled' } },
      touches: [{ clientX: 100, clientY: 10 }],
    });
    page.onRowTouchMove({ touches: [{ clientX: 50, clientY: 10 }] });
    expect(page.data.items[0].swipeX).toBe(-50);

    page.onRowTouchCancel();
    expect(page.data.items[0].swipeX).toBe(0);
    page.onRowTouchStart({
      currentTarget: { dataset: { id: 'reg-approved' } },
      touches: [{ clientX: 100, clientY: 10 }],
    });
    page.onRowTouchMove({ touches: [{ clientX: 20, clientY: 10 }] });
    expect(page.data.items[0].swipeX).toBe(0);
  });

  it('非取消状态不会触发删除', async () => {
    await page.confirmDelete(event('reg-approved'));
    expect(rideService.deleteRegistration).not.toHaveBeenCalled();
  });
});
