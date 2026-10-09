import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendUniqueActivities,
  createTimelineViewState,
  invalidateTimelineView,
} from '../miniprogram/pages/activities/timeline-state';

const rideService = vi.hoisted(() => ({ listActivityPage: vi.fn() }));
vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

const activity = (id: string) => ({
  id,
  title: id,
  date: '2026-10-18T00:00:00.000Z',
  startAt: '2026-10-18T00:00:00.000Z',
  endAt: '2026-10-18T08:00:00.000Z',
  status: 'published',
  capacity: 20,
  occupiedCount: 2,
});
const pageResult = (ids: string[], nextCursor: string | null = null) => ({
  items: ids.map(activity),
  nextCursor,
  asOf: '2026-10-10T00:00:00.000Z',
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
async function loadPage(): Promise<any> {
  let page: any;
  vi.stubGlobal('Page', (definition: any) => {
    page = definition;
    page.data = { ...definition.data };
    page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
  });
  await import('../miniprogram/pages/activities/index');
  return page;
}

describe('activity timeline state helpers', () => {
  it('失效时保留缓存并释放全部 volatile flag', () => {
    const state = {
      ...createTimelineViewState(),
      items: [activity('cached')],
      nextCursor: 'cursor-1',
      loading: true,
      refreshing: true,
      loadingMore: true,
      loaded: true,
      revision: 4,
    };
    expect(invalidateTimelineView(state)).toMatchObject({
      items: state.items,
      nextCursor: 'cursor-1',
      loading: false,
      refreshing: false,
      loadingMore: false,
      loaded: true,
      revision: 5,
    });
  });

  it('追加分页结果时按 ID 去重且保留稳定顺序', () => {
    expect(
      appendUniqueActivities([activity('a'), activity('b')], [activity('b'), activity('c')]),
    ).toEqual([activity('a'), activity('b'), activity('c')]);
  });
});

describe('activities page timeline controller', () => {
  beforeEach(() => {
    vi.resetModules();
    rideService.listActivityPage.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('默认加载 future，切换 history 使用隔离状态与动态文案', async () => {
    const page = await loadPage();
    rideService.listActivityPage
      .mockResolvedValueOnce(pageResult(['future'], 'future-cursor'))
      .mockResolvedValueOnce(pageResult([]));

    await page.load();
    expect(rideService.listActivityPage).toHaveBeenNthCalledWith(1, 'future');
    expect(page.data).toMatchObject({
      activeView: 'future',
      sectionEyebrow: 'UPCOMING RIDES',
      sectionTitle: '下一场',
      emptyCopy: '新的骑行活动正在筹备中',
      nextCursor: 'future-cursor',
    });

    page.switchView({ currentTarget: { dataset: { view: 'history' } } });
    await vi.waitFor(() => expect(rideService.listActivityPage).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(page.data.loading).toBe(false));
    expect(page.data).toMatchObject({
      activeView: 'history',
      sectionEyebrow: 'RIDE ARCHIVE',
      sectionTitle: '最近结束',
      followingTitle: '更早活动',
      emptyTitle: '暂无历史活动',
      emptyCopy: '完成的骑行活动会出现在这里',
    });
  });

  it('加载更多按 cursor 单飞、按 ID 去重并更新 cursor', async () => {
    const page = await loadPage();
    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['a', 'b'], 'cursor-1'));
    await page.load();
    const pending = deferred<ReturnType<typeof pageResult>>();
    rideService.listActivityPage.mockReturnValueOnce(pending.promise);

    const first = page.loadMore();
    const second = page.loadMore();
    expect(rideService.listActivityPage).toHaveBeenLastCalledWith('future', 'cursor-1');
    expect(rideService.listActivityPage).toHaveBeenCalledTimes(2);
    pending.resolve(pageResult(['b', 'c'], 'cursor-2'));
    await Promise.all([first, second]);

    expect(page.data.items.map((item: any) => item.id)).toEqual(['a', 'b', 'c']);
    expect(page.data).toMatchObject({ nextCursor: 'cursor-2', loadingMore: false });
  });

  it('加载更多失败保留 cursor 和旧列表供同 cursor 重试', async () => {
    const page = await loadPage();
    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['a'], 'cursor-1'));
    await page.load();
    rideService.listActivityPage.mockRejectedValueOnce(new Error('加载更多失败'));

    await page.loadMore();

    expect(page.data).toMatchObject({
      nextCursor: 'cursor-1',
      loadingMore: false,
      refreshError: '加载更多失败',
    });
    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['b']));
    await page.loadMore();
    expect(rideService.listActivityPage).toHaveBeenLastCalledWith('future', 'cursor-1');
  });

  it('首屏在途切走再切回会释放 loading 并重新请求', async () => {
    const page = await loadPage();
    const oldFuture = deferred<ReturnType<typeof pageResult>>();
    const history = deferred<ReturnType<typeof pageResult>>();
    const newFuture = deferred<ReturnType<typeof pageResult>>();
    rideService.listActivityPage
      .mockReturnValueOnce(oldFuture.promise)
      .mockReturnValueOnce(history.promise)
      .mockReturnValueOnce(newFuture.promise);

    const oldLoad = page.load();
    page.switchView({ currentTarget: { dataset: { view: 'history' } } });
    page.switchView({ currentTarget: { dataset: { view: 'future' } } });
    expect(rideService.listActivityPage).toHaveBeenCalledTimes(3);
    expect(page.data).toMatchObject({ activeView: 'future', loading: true });

    oldFuture.resolve(pageResult(['stale']));
    await oldLoad;
    expect(page.data.items).toEqual([]);
    expect(page.data.loading).toBe(true);
    newFuture.resolve(pageResult(['fresh']));
    await vi.waitFor(() => expect(page.data.loading).toBe(false));
    expect(page.data.items.map((item: any) => item.id)).toEqual(['fresh']);
    history.resolve(pageResult(['history-stale']));
  });

  it('loadMore 在途切走再切回会释放单飞并允许同 cursor 重试', async () => {
    const page = await loadPage();
    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['a'], 'cursor-1'));
    await page.load();
    const oldMore = deferred<ReturnType<typeof pageResult>>();
    rideService.listActivityPage.mockReturnValueOnce(oldMore.promise);
    const oldLoadMore = page.loadMore();

    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['history']));
    page.switchView({ currentTarget: { dataset: { view: 'history' } } });
    await vi.waitFor(() => expect(page.data.activeView).toBe('history'));
    const refreshedFuture = deferred<ReturnType<typeof pageResult>>();
    rideService.listActivityPage.mockReturnValueOnce(refreshedFuture.promise);
    page.switchView({ currentTarget: { dataset: { view: 'future' } } });
    refreshedFuture.resolve(pageResult(['a'], 'cursor-1'));
    await vi.waitFor(() => expect(page.data.loadingMore).toBe(false));

    const retry = deferred<ReturnType<typeof pageResult>>();
    rideService.listActivityPage.mockReturnValueOnce(retry.promise);
    const retryLoad = page.loadMore();
    expect(rideService.listActivityPage).toHaveBeenLastCalledWith('future', 'cursor-1');
    oldMore.resolve(pageResult(['stale-more']));
    await oldLoadMore;
    expect(page.data.items.map((item: any) => item.id)).toEqual(['a']);
    retry.resolve(pageResult(['b']));
    await retryLoad;
    expect(page.data.items.map((item: any) => item.id)).toEqual(['a', 'b']);
  });

  it.each(['onHide', 'onUnload'] as const)('%s 失效全部视图且旧完成零写入', async (lifecycle) => {
    const page = await loadPage();
    const pending = deferred<ReturnType<typeof pageResult>>();
    rideService.listActivityPage.mockReturnValueOnce(pending.promise);
    const request = page.load();
    page[lifecycle]();
    page.setData.mockClear();
    pending.resolve(pageResult(['late']));
    await request;
    expect(page.setData).not.toHaveBeenCalled();
  });
});
