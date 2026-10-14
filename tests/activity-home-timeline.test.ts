import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { read } from './theme-contract-helpers';
import type { Activity } from '../miniprogram/models';
import {
  appendUniqueActivities,
  buildCarouselDayChips,
  createTimelineViewState,
  invalidateTimelineView,
} from '../miniprogram/pages/activities/timeline-state';

const rideService = vi.hoisted(() => ({ listActivityPage: vi.fn() }));
const repositoryCache = vi.hoisted(() => ({ peekActivityPage: vi.fn() }));
vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/repositories', () => ({ repositoryCache }));

const activity = (id: string): Activity => ({
  id,
  version: 1,
  title: id,
  date: '2026-10-18T00:00:00.000Z',
  startAt: '2026-10-18T00:00:00.000Z',
  endAt: '2026-10-18T08:00:00.000Z',
  deadline: '2026-10-17T08:00:00.000Z',
  status: 'published',
  capacity: 20,
  occupiedCount: 2,
  description: '',
  route: { start: '', end: '', distanceKm: 0, elevationM: 0, level: '' },
  schedule: [],
  notices: [],
  equipment: [],
  fee: '',
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
  it('多活动按自然日生成快捷选择，并定位到该日第一张卡片', () => {
    const nextDay = {
      ...activity('b'),
      date: '2026-10-19T00:00:00.000Z',
      startAt: '2026-10-19T00:00:00.000Z',
    };
    expect(
      buildCarouselDayChips(
        [activity('a'), activity('same-day'), nextDay],
        '2026-10-17T00:00:00.000Z',
      ),
    ).toEqual([
      { key: '2026-10-18', label: '明天', index: 0 },
      { key: '2026-10-19', label: '后天', index: 2 },
    ]);
  });
});

describe('activity timeline template contract', () => {
  it('提供双视图选择、完整日期入口和可控活动卡片轮播', () => {
    const template = read('miniprogram/pages/activities/index.wxml');
    const styles = read('miniprogram/pages/activities/index.wxss');
    expect(template).toContain('class="timeline-tabs"');
    expect(template).toContain('data-view="future"');
    expect(template.match(/>即将开始<\/button>/g)).toHaveLength(1);
    expect(template).toContain('data-view="history"');
    expect(template).toContain('aria-selected="{{activeView === \'future\'}}"');
    expect(template).toContain('class="day-chip-bar"');
    expect(template).toContain('{{item.relativeLabel}}');
    expect(template).toContain('{{item.dateLabel}}');
    expect(template).toContain('class="day-chip-fade"');
    expect(template).toContain('data-index="{{item.index}}"');
    expect(template).toContain('bindtap="selectDay"');
    expect(template).not.toContain('<view class="section-title">{{sectionTitle}}</view>');
    expect(template).toContain('class="activity-carousel"');
    expect(template).toContain('current="{{currentCardIndex}}"');
    expect(template).toContain('bindchange="cardChange"');
    expect(template).toContain("next-margin=\"{{items.length > 1 ? '32rpx' : '0rpx'}}\"");
    expect(template).toContain('role="tabpanel"');
    expect(template).toContain('wx:for="{{items}}"');
    expect(template).toContain('bind:open="open"');
    expect(styles).toContain('height: 900rpx');
  });

  it('展示列表数量、日期入口并保留加载失败重试', () => {
    const template = read('miniprogram/pages/activities/index.wxml');
    expect(template).toContain('共 {{items.length}} 场');
    expect(template).toContain('{{item.relativeLabel}}');
    expect(template).toContain('{{item.dateLabel}}');
    expect(template).toContain('aria-pressed="{{selectedDayKey === item.key}}"');
    expect(template).toContain(
      'wx:if="{{nextCursor && items.length && (items.length === 1 || refreshError)}}"',
    );
    expect(template).toContain('加载更多活动');
    expect(template).toContain('重试加载更多');
  });
});

describe('activities page timeline controller', () => {
  beforeEach(() => {
    vi.resetModules();
    rideService.listActivityPage.mockReset();
    repositoryCache.peekActivityPage.mockReset().mockReturnValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('磁盘缓存有效时 onShow 同步保留内容且不闪回 loading 空态', async () => {
    repositoryCache.peekActivityPage.mockReturnValue(pageResult(['disk-cached'], 'cursor-1'));
    rideService.listActivityPage.mockResolvedValue(pageResult(['disk-cached'], 'cursor-1'));
    const page = await loadPage();

    page.onShow();

    expect(page.data.items.map((item: any) => item.id)).toEqual(['disk-cached']);
    expect(page.data.loading).toBe(false);
    await vi.waitFor(() => expect(page.data.refreshing).toBe(false));
  });

  it('默认加载 future，切换 history 使用隔离状态与动态文案', async () => {
    const page = await loadPage();
    rideService.listActivityPage
      .mockResolvedValueOnce(pageResult(['future'], 'future-cursor'))
      .mockResolvedValueOnce(pageResult([]));

    await page.load();
    expect(rideService.listActivityPage).toHaveBeenNthCalledWith(1, 'future');
    expect(page.data).toMatchObject({
      activeView: 'future',
      emptyCopy: '新的骑行活动正在筹备中',
      nextCursor: 'future-cursor',
    });
    expect(page.data.items[0].displayDate).toBe('10月18日 周日 08:00');

    page.switchView({ currentTarget: { dataset: { view: 'history' } } });
    await vi.waitFor(() => expect(rideService.listActivityPage).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(page.data.loading).toBe(false));
    expect(page.data).toMatchObject({
      activeView: 'history',
      emptyTitle: '暂无历史活动',
      emptyCopy: '完成的骑行活动会出现在这里',
    });
  });

  it('加载活动后直接提供卡片轮播数据并重置无效索引', async () => {
    const page = await loadPage();
    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['d1', 'd2'], null));
    page.data.currentCardIndex = 9;

    await page.load();

    expect(page.data.items.map((item: any) => item.id)).toEqual(['d1', 'd2']);
    expect(page.data.currentCardIndex).toBe(0);
  });

  it('切换时间视图时回到第一张卡片', async () => {
    const page = await loadPage();
    rideService.listActivityPage
      .mockResolvedValueOnce(pageResult(['future'], null))
      .mockResolvedValueOnce(pageResult(['h1', 'h2'], null));
    await page.load();
    page.data.currentCardIndex = 1;

    page.switchView({ currentTarget: { dataset: { view: 'history' } } });
    await vi.waitFor(() => expect(page.data.loading).toBe(false));

    expect(page.data.activeView).toBe('history');
    expect(page.data.currentCardIndex).toBe(0);
    expect(page.data.items.map((item: any) => item.id)).toEqual(['h1', 'h2']);
  });

  it('点击日期快捷入口直接切换到当天第一张卡片', async () => {
    const page = await loadPage();
    page.data.items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    page.data.dayChips = [
      { key: '2026-10-18', label: '明天', index: 0 },
      { key: '2026-10-19', label: '后天', index: 2 },
    ];

    page.selectDay({ currentTarget: { dataset: { index: 2 } } });

    expect(page.data.currentCardIndex).toBe(2);
    expect(page.data.selectedDayKey).toBe('2026-10-19');
  });

  it('滑到最后一张时自动加载下一页，普通滑动只更新索引', async () => {
    const page = await loadPage();
    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['a', 'b'], 'cursor-1'));
    await page.load();
    const loadMore = vi.spyOn(page, 'loadMore').mockResolvedValue(undefined);

    page.cardChange({ detail: { current: 0 } });
    expect(page.data.currentCardIndex).toBe(0);
    expect(loadMore).not.toHaveBeenCalled();

    page.cardChange({ detail: { current: 1 } });
    expect(page.data.currentCardIndex).toBe(1);
    expect(loadMore).toHaveBeenCalledOnce();
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

  it('同视图 loadMore 后 refresh 会失效旧 owner 且旧 finally 不删除新分页', async () => {
    const page = await loadPage();
    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['cached'], 'cursor-old'));
    await page.load();

    const oldMore = deferred<ReturnType<typeof pageResult>>();
    const refresh = deferred<ReturnType<typeof pageResult>>();
    const newMore = deferred<ReturnType<typeof pageResult>>();
    rideService.listActivityPage
      .mockReturnValueOnce(oldMore.promise)
      .mockReturnValueOnce(refresh.promise)
      .mockReturnValueOnce(newMore.promise);

    const oldRequest = page.loadMore();
    const refreshRequest = page.load();
    expect(page.data.loadingMore).toBe(false);

    refresh.resolve(pageResult(['fresh'], 'cursor-new'));
    await refreshRequest;
    const newRequest = page.loadMore();
    expect(rideService.listActivityPage).toHaveBeenCalledTimes(4);
    expect(rideService.listActivityPage).toHaveBeenLastCalledWith('future', 'cursor-new');
    const currentHandle = page.loadMoreHandles.future;
    expect(currentHandle).toBeDefined();

    oldMore.resolve(pageResult(['stale-more'], 'cursor-stale'));
    await oldRequest;
    expect(page.loadMoreHandles.future).toBe(currentHandle);
    expect(page.data.items.map((item: any) => item.id)).toEqual(['fresh']);
    expect(page.data.nextCursor).toBe('cursor-new');

    newMore.resolve(pageResult(['next']));
    await newRequest;
    expect(page.data.items.map((item: any) => item.id)).toEqual(['fresh', 'next']);
    expect(page.data).toMatchObject({ nextCursor: null, loadingMore: false });
  });

  it('同视图 refresh 在途时 loadMore 方法零调用，完成后才允许新 cursor 分页', async () => {
    const page = await loadPage();
    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['cached'], 'cursor-old'));
    await page.load();

    const refresh = deferred<ReturnType<typeof pageResult>>();
    rideService.listActivityPage.mockReturnValueOnce(refresh.promise);
    const refreshRequest = page.load();
    await page.loadMore();
    expect(rideService.listActivityPage).toHaveBeenCalledTimes(2);

    refresh.resolve(pageResult(['fresh'], 'cursor-new'));
    await refreshRequest;
    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['next']));
    await page.loadMore();
    expect(rideService.listActivityPage).toHaveBeenLastCalledWith('future', 'cursor-new');
  });

  it('同视图 refresh 失败保留旧 cursor 并释放互斥以便再次分页', async () => {
    const page = await loadPage();
    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['cached'], 'cursor-old'));
    await page.load();
    rideService.listActivityPage.mockRejectedValueOnce(new Error('刷新失败'));

    await page.load();
    expect(page.data).toMatchObject({
      nextCursor: 'cursor-old',
      loading: false,
      refreshing: false,
      loadingMore: false,
      refreshError: '刷新失败',
    });

    rideService.listActivityPage.mockResolvedValueOnce(pageResult(['next']));
    await page.loadMore();
    expect(rideService.listActivityPage).toHaveBeenLastCalledWith('future', 'cursor-old');
    expect(page.data.items.map((item: any) => item.id)).toEqual(['cached', 'next']);
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
