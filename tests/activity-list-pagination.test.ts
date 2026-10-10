// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  listAdminActivities: vi.fn(),
  listAdminActivitiesPage: vi.fn(),
  saveActivity: vi.fn(),
  cloneActivity: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  authStatus: 'authenticated',
  role: 'member',
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));
vi.mock('../miniprogram/services/theme-service', () => ({ syncPageTheme: vi.fn() }));

function item(id: string, status: 'draft' | 'published' | 'finished' = 'draft') {
  return { id, title: id, status, version: 1 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function loadPage() {
  let page: any;
  vi.stubGlobal('wx', {
    cloud: {},
    navigateTo: vi.fn(),
    showToast: vi.fn(),
    showModal: vi.fn(({ success }) => success({ confirm: true, cancel: false })),
    stopPullDownRefresh: vi.fn(),
  });
  vi.stubGlobal('Page', (definition: any) => {
    page = definition;
    page.data = { ...definition.data };
    page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
  });
  await import('../miniprogram/pages/admin/activity-list/index');
  return page;
}

describe('活动管理页分页状态机', () => {
  beforeEach(() => {
    vi.resetModules();
    rideService.listAdminActivities.mockReset().mockResolvedValue([]);
    rideService.listAdminActivitiesPage.mockReset();
    rideService.saveActivity.mockReset();
    rideService.cloneActivity.mockReset();
    appStore.authStatus = 'authenticated';
    appStore.role = 'member';
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('onShow 使用分页协议加载首屏并保存下一页 cursor', async () => {
    rideService.listAdminActivitiesPage.mockResolvedValue({
      items: [item('first', 'published')],
      nextCursor: 'cursor-1',
    });
    const page = await loadPage();

    await page.onShow();

    expect(rideService.listAdminActivitiesPage).toHaveBeenCalledWith({ pageSize: 50 });
    expect(page.data.items).toEqual([
      expect.objectContaining({ id: 'first', statusLabel: '已上线' }),
    ]);
    expect(page.data.nextCursor).toBe('cursor-1');
    expect(page.data.hasMore).toBe(true);
  });

  it('加载更多使用原 cursor，按 id 去重并按服务端顺序追加', async () => {
    rideService.listAdminActivitiesPage
      .mockResolvedValueOnce({
        items: [item('first'), item('shared')],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        items: [item('shared'), item('last', 'finished')],
        nextCursor: null,
      });
    const page = await loadPage();
    await page.onShow();

    await page.loadMore();

    expect(rideService.listAdminActivitiesPage).toHaveBeenNthCalledWith(2, {
      pageSize: 50,
      cursor: 'cursor-1',
    });
    expect(page.data.items.map((value: { id: string }) => value.id)).toEqual([
      'first',
      'shared',
      'last',
    ]);
    expect(page.data.nextCursor).toBeNull();
    expect(page.data.hasMore).toBe(false);
  });

  it('加载更多失败保留 cursor 和已有列表，下一次可用同 cursor 重试', async () => {
    rideService.listAdminActivitiesPage
      .mockResolvedValueOnce({ items: [item('first')], nextCursor: 'cursor-retry' })
      .mockRejectedValueOnce(new Error('临时失败'))
      .mockResolvedValueOnce({ items: [item('second')], nextCursor: null });
    const page = await loadPage();
    await page.onShow();

    await page.loadMore();

    expect(page.data.items.map((value: { id: string }) => value.id)).toEqual(['first']);
    expect(page.data.nextCursor).toBe('cursor-retry');
    expect(page.data.hasMore).toBe(true);
    expect(page.data.loadingMore).toBe(false);
    expect(page.data.error).toBe('临时失败');

    await page.loadMore();

    expect(rideService.listAdminActivitiesPage).toHaveBeenNthCalledWith(3, {
      pageSize: 50,
      cursor: 'cursor-retry',
    });
    expect(page.data.items.map((value: { id: string }) => value.id)).toEqual(['first', 'second']);
  });

  it('较旧的首屏响应晚到时由 refresh revision 丢弃', async () => {
    const stale = deferred<{ items: ReturnType<typeof item>[]; nextCursor: string | null }>();
    const fresh = deferred<{ items: ReturnType<typeof item>[]; nextCursor: string | null }>();
    rideService.listAdminActivitiesPage
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise);
    const page = await loadPage();

    const staleRefresh = page.onShow();
    await vi.waitFor(() => expect(rideService.listAdminActivitiesPage).toHaveBeenCalledTimes(1));
    const freshRefresh = page.onShow();
    await vi.waitFor(() => expect(rideService.listAdminActivitiesPage).toHaveBeenCalledTimes(2));

    fresh.resolve({ items: [item('fresh')], nextCursor: 'fresh-cursor' });
    await freshRefresh;
    stale.resolve({ items: [item('stale')], nextCursor: 'stale-cursor' });
    await staleRefresh;

    expect(page.data.items.map((value: { id: string }) => value.id)).toEqual(['fresh']);
    expect(page.data.nextCursor).toBe('fresh-cursor');
  });

  it('loadMore 在途时刷新，旧更多响应晚到不得追加或覆盖新首屏', async () => {
    const oldMore = deferred<{ items: ReturnType<typeof item>[]; nextCursor: string | null }>();
    rideService.listAdminActivitiesPage
      .mockResolvedValueOnce({ items: [item('old-first')], nextCursor: 'old-cursor' })
      .mockReturnValueOnce(oldMore.promise)
      .mockResolvedValueOnce({ items: [item('fresh-first')], nextCursor: 'fresh-cursor' });
    const page = await loadPage();
    await page.onShow();

    const loadingMore = page.loadMore();
    await Promise.resolve();
    const refreshing = page.onShow();
    await refreshing;
    oldMore.resolve({ items: [item('old-more')], nextCursor: 'old-next' });
    await loadingMore;

    expect(page.data.items.map((value: { id: string }) => value.id)).toEqual(['fresh-first']);
    expect(page.data.nextCursor).toBe('fresh-cursor');
  });

  it('loadMore 在途时身份刷新失败仍收敛 loadingMore', async () => {
    const oldMore = deferred<{ items: ReturnType<typeof item>[]; nextCursor: string | null }>();
    rideService.listAdminActivitiesPage
      .mockResolvedValueOnce({ items: [item('first')], nextCursor: 'old-cursor' })
      .mockReturnValueOnce(oldMore.promise)
      .mockResolvedValueOnce({ items: [item('retry')], nextCursor: null });
    const page = await loadPage();
    await page.onShow();

    const loadingMore = page.loadMore();
    await vi.waitFor(() => expect(page.data.loadingMore).toBe(true));
    appStore.ensureIdentity.mockRejectedValueOnce(new Error('身份检查失败'));

    await page.onShow().catch(() => undefined);
    oldMore.resolve({ items: [item('stale-more')], nextCursor: null });
    await loadingMore;
    const loadingMoreAfterIdentityFailure = page.data.loadingMore;

    await page.loadMore();

    expect({
      loadingMoreAfterIdentityFailure,
      retryCalls: rideService.listAdminActivitiesPage.mock.calls.length,
      itemIds: page.data.items.map((value: { id: string }) => value.id),
      pendingPromise: page._loadMorePromise,
    }).toEqual({
      loadingMoreAfterIdentityFailure: false,
      retryCalls: 3,
      itemIds: ['first', 'retry'],
      pendingPromise: undefined,
    });
  });

  it('loadMore 成功不得覆盖较新的业务操作错误', async () => {
    const more = deferred<{ items: ReturnType<typeof item>[]; nextCursor: string | null }>();
    rideService.listAdminActivitiesPage
      .mockResolvedValueOnce({ items: [item('first', 'published')], nextCursor: 'cursor-more' })
      .mockReturnValueOnce(more.promise);
    rideService.saveActivity.mockRejectedValueOnce(new Error('业务保存失败'));
    const page = await loadPage();
    await page.onShow();

    const loadingMore = page.loadMore();
    await vi.waitFor(() => expect(page.data.loadingMore).toBe(true));
    await page.toggleOnline({ currentTarget: { dataset: { id: 'first' } } });
    expect(page.data.error).toBe('业务保存失败');

    more.resolve({ items: [item('second')], nextCursor: null });
    await loadingMore;

    expect(page.data.error).toBe('业务保存失败');
  });

  it('快速筛选会隔离旧首屏和旧加载更多响应', async () => {
    const oldMore = deferred<{ items: ReturnType<typeof item>[]; nextCursor: string | null }>();
    const filtered = deferred<{ items: ReturnType<typeof item>[]; nextCursor: string | null }>();
    rideService.listAdminActivitiesPage
      .mockResolvedValueOnce({ items: [item('all-first')], nextCursor: 'all-cursor' })
      .mockReturnValueOnce(oldMore.promise)
      .mockReturnValueOnce(filtered.promise);
    const page = await loadPage();
    await page.onShow();

    const loadingMore = page.loadMore();
    const filtering = page.selectStatusFilter({
      currentTarget: { dataset: { status: 'published' } },
    });
    await vi.waitFor(() => expect(rideService.listAdminActivitiesPage).toHaveBeenCalledTimes(3));
    expect(rideService.listAdminActivitiesPage).toHaveBeenNthCalledWith(3, {
      pageSize: 50,
      statusFilter: 'published',
    });

    filtered.resolve({ items: [item('published-only', 'published')], nextCursor: null });
    await filtering;
    oldMore.resolve({ items: [item('stale-more')], nextCursor: null });
    await loadingMore;

    expect(page.data.statusFilter).toBe('published');
    expect(page.data.items.map((value: { id: string }) => value.id)).toEqual(['published-only']);
    expect(page.data.loadingMore).toBe(false);
  });

  it('同一 cursor 的并发 loadMore 只发出一次请求', async () => {
    const more = deferred<{ items: ReturnType<typeof item>[]; nextCursor: string | null }>();
    rideService.listAdminActivitiesPage
      .mockResolvedValueOnce({ items: [item('first')], nextCursor: 'cursor-once' })
      .mockReturnValueOnce(more.promise);
    const page = await loadPage();
    await page.onShow();

    const first = page.loadMore();
    const duplicate = page.loadMore();
    await Promise.resolve();

    expect(rideService.listAdminActivitiesPage).toHaveBeenCalledTimes(2);
    more.resolve({ items: [item('second')], nextCursor: null });
    await Promise.all([first, duplicate]);
    expect(page.data.items.map((value: { id: string }) => value.id)).toEqual(['first', 'second']);
  });

  it('模板提供显式加载更多入口并反映加载状态', () => {
    const template = readFileSync('miniprogram/pages/admin/activity-list/index.wxml', 'utf8');

    expect(template).toContain('bindtap="loadMore"');
    expect(template).toContain('loading="{{loadingMore}}"');
    expect(template).toContain('wx:if="{{hasMore}}"');
  });
});
