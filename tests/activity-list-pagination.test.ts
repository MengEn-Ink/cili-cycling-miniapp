// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  listAdminActivities: vi.fn(),
  listAdminActivitiesPage: vi.fn(),
  saveActivity: vi.fn(),
  deleteActivity: vi.fn(),
  cloneActivity: vi.fn(),
  reviewActivity: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  authStatus: 'authenticated',
  role: 'member',
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

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
    showModal: vi.fn(({ success }) =>
      success({ confirm: true, cancel: false, content: '路线临时封闭' }),
    ),
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
    rideService.deleteActivity.mockReset();
    rideService.cloneActivity.mockReset();
    rideService.reviewActivity.mockReset();
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

  it('身份初始化失败进入可见错误态，重试后成功加载列表', async () => {
    appStore.ensureIdentity
      .mockRejectedValueOnce(new Error('identity detail'))
      .mockResolvedValueOnce(undefined);
    rideService.listAdminActivitiesPage.mockResolvedValue({
      items: [item('retry-success')],
      nextCursor: null,
    });
    const page = await loadPage();

    await page.onShow();

    expect(page.data).toEqual(
      expect.objectContaining({
        loading: false,
        allowed: false,
        loadError: '身份初始化失败，请检查网络后重试',
      }),
    );
    expect(rideService.listAdminActivitiesPage).not.toHaveBeenCalled();

    await page.retryLoad();

    expect(page.data.loadError).toBe('');
    expect(page.data.allowed).toBe(true);
    expect(page.data.items.map((value: { id: string }) => value.id)).toEqual(['retry-success']);
  });

  it('列表服务失败时结束加载并展示带重试入口的错误态', async () => {
    rideService.listAdminActivitiesPage.mockRejectedValueOnce(new Error('列表服务暂不可用'));
    const page = await loadPage();

    await page.onShow();

    expect(page.data).toEqual(
      expect.objectContaining({
        loading: false,
        allowed: true,
        loadError: '列表服务暂不可用',
      }),
    );
    const template = readFileSync('miniprogram/pages/admin/activity-list/index.wxml', 'utf8');
    expect(template).toContain('wx:elif="{{loadError}}"');
    expect(template).toContain('bindtap="retryLoad"');
    expect(template).toContain('{{loadError}}');
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

  it('下架通过 editable 弹窗强制采集理由；删除仅允许草稿并透传理由', async () => {
    rideService.listAdminActivitiesPage.mockResolvedValue({
      items: [item('published', 'published'), item('draft-one', 'draft')],
      nextCursor: null,
    });
    rideService.saveActivity.mockResolvedValue(item('published', 'draft'));
    rideService.deleteActivity.mockResolvedValue(undefined);
    const page = await loadPage();
    await page.onShow();

    await page.toggleOnline({ currentTarget: { dataset: { id: 'published' } } });
    expect(wx.showModal).toHaveBeenCalledWith(expect.objectContaining({ editable: true }));
    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
      'published',
      1,
      undefined,
      '路线临时封闭',
    );

    // 已上线活动不能直接删除：客户端拦截并提示，不调用云端。
    await page.confirmDelete({ currentTarget: { dataset: { id: 'published' } } });
    expect(wx.showToast).toHaveBeenCalledWith({ title: '仅草稿活动可删除', icon: 'none' });
    expect(rideService.deleteActivity).not.toHaveBeenCalled();

    // 草稿活动可删除并透传弹窗采集的理由。
    await page.confirmDelete({ currentTarget: { dataset: { id: 'draft-one' } } });
    expect(rideService.deleteActivity).toHaveBeenCalledWith('draft-one', '路线临时封闭');
  });

  it('审批模糊失败与重复点击复用同一 requestId，并按活动互斥', async () => {
    const first = deferred<void>();
    rideService.reviewActivity
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(undefined);
    const page = await loadPage();
    page.data.items = [
      { id: 'pending-1', status: 'pending_review', reviewVersion: 7, canReview: true },
    ];
    const event = { currentTarget: { dataset: { id: 'pending-1', decision: 'approve' } } };

    const click1 = page.reviewActivity(event);
    const click2 = page.reviewActivity({
      currentTarget: { dataset: { id: 'pending-1', decision: 'reject' } },
    });
    expect(click2).toBe(click1);
    expect(rideService.reviewActivity).toHaveBeenCalledTimes(1);
    const requestId = rideService.reviewActivity.mock.calls[0][3];
    first.reject(Object.assign(new Error('响应丢失'), { code: 'CALL_FAILED' }));
    await click1;

    await page.reviewActivity(event);
    expect(rideService.reviewActivity).toHaveBeenCalledTimes(2);
    expect(rideService.reviewActivity.mock.calls[1][3]).toBe(requestId);
  });

  it('审批成功或版本冲突后清理意图，新轮次与不同决定使用新 requestId', async () => {
    rideService.reviewActivity
      .mockRejectedValueOnce(Object.assign(new Error('版本冲突'), { code: 'REVIEW_CONFLICT' }))
      .mockResolvedValue(undefined);
    const page = await loadPage();
    page.onShow = vi.fn().mockResolvedValue(undefined);
    page.data.items = [
      { id: 'pending-2', status: 'pending_review', reviewVersion: 3, canReview: true },
    ];
    const approve = { currentTarget: { dataset: { id: 'pending-2', decision: 'approve' } } };

    await page.reviewActivity(approve);
    const conflictedId = rideService.reviewActivity.mock.calls[0][3];
    await page.reviewActivity(approve);
    const retriedId = rideService.reviewActivity.mock.calls[1][3];
    expect(retriedId).not.toBe(conflictedId);

    page.data.items[0].reviewVersion = 4;
    await page.reviewActivity({
      currentTarget: { dataset: { id: 'pending-2', decision: 'reject' } },
    });
    expect(rideService.reviewActivity.mock.calls[2][3]).not.toBe(retriedId);
    expect(rideService.reviewActivity.mock.calls[2][4]).toBe('路线临时封闭');
  });

  it('模板提供显式加载更多入口并反映加载状态', () => {
    const template = readFileSync('miniprogram/pages/admin/activity-list/index.wxml', 'utf8');

    expect(template).toContain('bindtap="loadMore"');
    expect(template).toContain('loading="{{loadingMore}}"');
    expect(template).toContain('wx:if="{{hasMore}}"');
  });
});
