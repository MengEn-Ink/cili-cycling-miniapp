// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  listAdminActivitiesPage: vi.fn(),
  saveActivity: vi.fn(),
  deleteActivity: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  authStatus: 'authenticated',
  role: 'member',
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

const touch = (id: string, clientX: number, clientY = 100) => ({
  changedTouches: [{ clientX, clientY }],
  currentTarget: { dataset: { id } },
});

describe('活动卡片滑动删除', () => {
  let page: any;
  const first = { id: 'act-1', title: '周六骑行', status: 'published', version: 1 };
  const second = { id: 'act-2', title: '周日团练', status: 'draft', version: 2 };

  beforeEach(async () => {
    vi.resetModules();
    rideService.listAdminActivitiesPage
      .mockReset()
      .mockResolvedValue({ items: [first, second], nextCursor: null });
    rideService.deleteActivity.mockReset().mockResolvedValue(undefined);
    appStore.authStatus = 'authenticated';
    appStore.role = 'member';
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('wx', {
      cloud: {},
      navigateTo: vi.fn(),
      showToast: vi.fn(),
      showModal: vi.fn(({ success }) =>
        success({ confirm: true, cancel: false, content: '活动安排调整' }),
      ),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => {
        // 真实 setData 支持点号/方括号路径，测试替身按路径写回嵌套结构。
        for (const [key, value] of Object.entries(patch)) {
          const parts = key
            .replace(/\[(\d+)]/g, '.$1')
            .split('.')
            .filter(Boolean);
          let target: any = page.data;
          for (const part of parts.slice(0, -1)) target = target[part];
          target[parts[parts.length - 1]] = value;
        }
      });
    });
    await import('../miniprogram/pages/admin/activity-list/index');
    await page.onShow();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('WXML 保证操作按钮可点击并在侧滑展开时暴露删除层', () => {
    const template = readFileSync('miniprogram/pages/admin/activity-list/index.wxml', 'utf8');
    const styles = readFileSync('miniprogram/pages/admin/activity-list/index.wxss', 'utf8');
    expect(template).toContain(
      `class="swipe-delete {{item.swipeOpen ? 'swipe-delete-active' : ''}}"`,
    );
    expect(template).toContain('catchtap="confirmDelete"');
    expect(template).toContain('bindtouchstart="onRowTouchStart"');
    expect(template).toContain('bindtouchmove="onRowTouchMove"');
    expect(template).toContain('bindtouchend="onRowTouchEnd"');
    expect(template).not.toMatch(/catchtouch(?:start|move|end|cancel)=/);
    expect(template).toContain('translateX({{item.swipeOffset}}px)');
    expect(template).toContain('class="secondary delete-button"');
    expect(styles).toMatch(/\.swipe-delete-active\s*\{[^}]*z-index:\s*2;/s);
  });

  it('左滑删除按钮仅对草稿活动渲染，驳回活动卡展示驳回原因，克隆错误渲染在弹层内', () => {
    const template = readFileSync('miniprogram/pages/admin/activity-list/index.wxml', 'utf8');
    expect(template).toMatch(
      /<button wx:if="\{\{item\.status === 'draft'\}\}"[^>]*class="secondary delete-button"[^>]*catchtap="confirmDelete"/,
    );
    expect(template).toContain('wx:if="{{item.status === \'rejected\' && item.rejectionReason}}"');
    expect(template).toContain('驳回原因：');
    // cloneError 必须渲染在复制弹层 modal-mask 内部，页面级 error 在弹层外不可见。
    const sheet = template.slice(template.indexOf('modal-mask'));
    expect(sheet).toContain('{{cloneError}}');
  });

  it('普通点击的触摸开始和结束不触发视图重绘，保证按钮 tap 不丢失', () => {
    page.setData.mockClear();
    page.onRowTouchStart(touch('act-1', 300));
    page.onRowTouchEnd();

    expect(page.setData).not.toHaveBeenCalled();
  });

  it('横向滑动跟手位移，越过半幅松手后完全展开', () => {
    page.onRowTouchStart(touch('act-1', 300));
    page.onRowTouchMove(touch('act-1', 240));
    expect(page.data.items[0].swipeOffset).toBe(-60);
    page.onRowTouchEnd();
    expect(page.data.items[0].swipeOffset).toBe(-80);
    expect(page.data.items[0].swipeOpen).toBe(true);
    expect(page.data.items[0].swipeAnim).toBe(true);
  });

  it('小幅滑动未过半幅时松手收回', () => {
    page.onRowTouchStart(touch('act-1', 300));
    page.onRowTouchMove(touch('act-1', 280));
    page.onRowTouchEnd();
    expect(page.data.items[0].swipeOffset).toBe(0);
    expect(page.data.items[0].swipeOpen).toBe(false);
  });

  it('纵向滑动不移动卡片，交还给页面滚动', () => {
    page.onRowTouchStart(touch('act-1', 300, 300));
    page.onRowTouchMove(touch('act-1', 295, 200));
    expect(page.data.items[0].swipeOffset).toBe(0);
  });

  it('开始新手势时收起其他已展开卡片', () => {
    // 先展开第一张
    page.onRowTouchStart(touch('act-1', 300));
    page.onRowTouchMove(touch('act-1', 200));
    page.onRowTouchEnd();
    expect(page.data.items[0].swipeOpen).toBe(true);
    // 第二张卡片只有形成明确横向滑动后才收起其他卡片，普通点击不重绘。
    page.onRowTouchStart(touch('act-2', 300));
    expect(page.data.items[0].swipeOpen).toBe(true);
    page.onRowTouchMove(touch('act-2', 260));
    expect(page.data.items[0].swipeOpen).toBe(false);
    expect(page.data.items[0].swipeOffset).toBe(0);
  });

  it('卡片展开状态下点击正文只收起，不进入编辑页', () => {
    page.onRowTouchStart(touch('act-1', 300));
    page.onRowTouchMove(touch('act-1', 200));
    page.onRowTouchEnd();
    page.edit(touch('act-1', 200));
    expect(page.data.items[0].swipeOpen).toBe(false);
    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  it('卡片收起状态下点击正文进入编辑页', () => {
    page.edit(touch('act-1', 300));
    expect(wx.navigateTo).toHaveBeenCalledWith({
      url: '/pages/admin/activity-edit/index?id=act-1',
    });
  });

  it('非草稿活动点击删除被客户端拦截，不弹窗也不调用云端', async () => {
    await page.confirmDelete(touch('act-1', 200));
    expect(wx.showModal).not.toHaveBeenCalled();
    expect(rideService.deleteActivity).not.toHaveBeenCalled();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '仅草稿活动可删除', icon: 'none' });
  });

  it('确认删除草稿后调用云端契约、移除卡片并提示', async () => {
    await page.confirmDelete(touch('act-2', 200));
    expect(rideService.deleteActivity).toHaveBeenCalledWith('act-2', '活动安排调整');
    expect(page.data.items.map((item: { id: string }) => item.id)).toEqual(['act-1']);
    expect(wx.showToast).toHaveBeenCalledWith({ title: '已删除', icon: 'success' });
  });

  it('弹窗取消时不执行删除', async () => {
    wx.showModal.mockImplementationOnce(({ success }: { success: (r: any) => void }) =>
      success({ confirm: false, cancel: true }),
    );
    await page.confirmDelete(touch('act-2', 200));
    expect(rideService.deleteActivity).not.toHaveBeenCalled();
  });

  it('云端拒绝删除草稿（如有报名）时收起卡片并展示原因', async () => {
    rideService.deleteActivity.mockRejectedValueOnce(new Error('已有成员报名，无法删除'));
    // 展开草稿卡片后触发删除
    page.onRowTouchStart(touch('act-2', 300));
    page.onRowTouchMove(touch('act-2', 200));
    page.onRowTouchEnd();
    await page.confirmDelete(touch('act-2', 200));
    expect(page.data.error).toBe('活动仍有待处理报名，请先到报名审批处理后再删除');
    expect(page.data.items[1].swipeOpen).toBe(false);
    expect(page.data.items[1].swipeOffset).toBe(0);
    expect(page.data.items).toHaveLength(2);
  });
});
