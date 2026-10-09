import type { Activity } from '../../models';
import type { PublicActivityView } from '../../repositories/types';
import { rideService } from '../../services/ride-service';
import { syncPageTheme } from '../../services/theme-service';
import { activityDisplayStatus } from '../../utils/activity';
import { formatActivityDate } from '../../utils/date-time';
import {
  appendUniqueActivities,
  createTimelineViewState,
  invalidateTimelineView,
  type TimelineViewState,
} from './timeline-state';

const VIEW_COPY = {
  future: {
    sectionEyebrow: 'UPCOMING RIDES',
    sectionTitle: '下一场',
    followingTitle: '接下来',
    emptyTitle: '暂无未来活动',
    emptyCopy: '新的骑行活动正在筹备中',
  },
  history: {
    sectionEyebrow: 'RIDE ARCHIVE',
    sectionTitle: '最近结束',
    followingTitle: '更早活动',
    emptyTitle: '暂无历史活动',
    emptyCopy: '完成的骑行活动会出现在这里',
  },
} as const;

function displayActivity(item: Activity) {
  return {
    ...item,
    occupied: item.occupiedCount || 0,
    remaining: Math.max(item.capacity - (item.occupiedCount || 0), 0),
    displayDate: formatActivityDate(item.startAt || item.date),
    displayStatus: activityDisplayStatus(item),
  };
}

Page({
  viewStates: {
    future: createTimelineViewState(),
    history: createTimelineViewState(),
  } as Record<PublicActivityView, TimelineViewState>,
  loadHandles: {} as Partial<Record<PublicActivityView, Promise<void>>>,
  loadMoreHandles: {} as Partial<Record<PublicActivityView, Promise<void>>>,
  data: {
    theme: 'dark',
    themeClass: 'theme-dark',
    activeView: 'future' as PublicActivityView,
    loading: true,
    refreshing: false,
    loadingMore: false,
    error: '',
    refreshError: '',
    nextCursor: null as string | null,
    sectionEyebrow: VIEW_COPY.future.sectionEyebrow,
    sectionTitle: VIEW_COPY.future.sectionTitle,
    followingTitle: VIEW_COPY.future.followingTitle,
    emptyTitle: VIEW_COPY.future.emptyTitle,
    emptyCopy: VIEW_COPY.future.emptyCopy,
    items: [] as ReturnType<typeof displayActivity>[],
  },
  onShow() {
    syncPageTheme(this);
    void this.load();
  },
  onHide() {
    this.invalidateAllViews();
  },
  onUnload() {
    this.invalidateAllViews();
  },
  invalidateAllViews() {
    for (const view of ['future', 'history'] as const) {
      this.viewStates[view] = invalidateTimelineView(this.viewStates[view]);
      delete this.loadHandles[view];
      delete this.loadMoreHandles[view];
    }
  },
  renderActiveView() {
    const view = this.data.activeView as PublicActivityView;
    const state = this.viewStates[view];
    this.setData({
      ...VIEW_COPY[view],
      items: state.items.map(displayActivity),
      nextCursor: state.nextCursor,
      loading: state.loading,
      refreshing: state.refreshing,
      loadingMore: state.loadingMore,
      error: state.error,
      refreshError: state.refreshError,
    });
  },
  isCurrent(view: PublicActivityView, revision: number, cursor?: string | null) {
    const state = this.viewStates[view];
    return (
      this.data.activeView === view &&
      state.revision === revision &&
      (cursor === undefined || state.nextCursor === cursor)
    );
  },
  async load() {
    const view = this.data.activeView as PublicActivityView;
    const previous = invalidateTimelineView(this.viewStates[view]);
    const hasItems = previous.items.length > 0;
    const state: TimelineViewState = {
      ...previous,
      loading: !hasItems,
      refreshing: hasItems,
      error: '',
      refreshError: '',
    };
    this.viewStates[view] = state;
    this.renderActiveView();
    const revision = state.revision;
    const request = (async () => {
      try {
        const result = await rideService.listActivityPage(view);
        if (!this.isCurrent(view, revision)) return;
        this.viewStates[view] = {
          ...this.viewStates[view],
          items: result.items,
          nextCursor: result.nextCursor,
          loading: false,
          refreshing: false,
          error: '',
          refreshError: '',
          loaded: true,
        };
        this.renderActiveView();
      } catch (error) {
        if (!this.isCurrent(view, revision)) return;
        const message = error instanceof Error ? error.message : '活动加载失败，请稍后重试';
        this.viewStates[view] = {
          ...this.viewStates[view],
          loading: false,
          refreshing: false,
          ...(hasItems ? { refreshError: message } : { error: message }),
        };
        this.renderActiveView();
      } finally {
        if (this.viewStates[view].revision === revision) delete this.loadHandles[view];
      }
    })();
    this.loadHandles[view] = request;
    await request;
  },
  async loadMore() {
    const view = this.data.activeView as PublicActivityView;
    const existing = this.loadMoreHandles[view];
    if (existing) return existing;
    const state = this.viewStates[view];
    const cursor = state.nextCursor;
    if (!cursor) return;
    const revision = state.revision;
    this.viewStates[view] = { ...state, loadingMore: true, refreshError: '' };
    this.renderActiveView();
    const request = (async () => {
      try {
        const result = await rideService.listActivityPage(view, cursor);
        if (!this.isCurrent(view, revision, cursor)) return;
        this.viewStates[view] = {
          ...this.viewStates[view],
          items: appendUniqueActivities(this.viewStates[view].items, result.items),
          nextCursor: result.nextCursor,
          loadingMore: false,
          refreshError: '',
        };
        this.renderActiveView();
      } catch (error) {
        if (!this.isCurrent(view, revision, cursor)) return;
        this.viewStates[view] = {
          ...this.viewStates[view],
          loadingMore: false,
          refreshError: error instanceof Error ? error.message : '更多活动加载失败，请稍后重试',
        };
        this.renderActiveView();
      } finally {
        if (this.viewStates[view].revision === revision) delete this.loadMoreHandles[view];
      }
    })();
    this.loadMoreHandles[view] = request;
    await request;
  },
  switchView(event: { currentTarget?: { dataset?: { view?: unknown } } }) {
    const candidate = event.currentTarget?.dataset?.view;
    if (candidate !== 'future' && candidate !== 'history') return;
    if (candidate === this.data.activeView) return;
    const previous = this.data.activeView as PublicActivityView;
    this.viewStates[previous] = invalidateTimelineView(this.viewStates[previous]);
    delete this.loadHandles[previous];
    delete this.loadMoreHandles[previous];
    this.setData({ activeView: candidate });
    this.renderActiveView();
    void this.load();
  },
  open(event: { currentTarget: { dataset: { id: string } } }) {
    wx.navigateTo({ url: '/pages/activity-detail/index?id=' + event.currentTarget.dataset.id });
  },
});
