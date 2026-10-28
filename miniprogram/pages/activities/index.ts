import type { Activity } from '../../models';
import { repositoryCache } from '../../repositories/index';
import type { PublicActivityView } from '../../repositories/types';
import { rideService } from '../../services/ride-service';
import { activityDisplayStatus } from '../../utils/activity';
import { customNavigationTopPx } from '../../utils/custom-navigation';
import { createNavigationSingleFlight } from '../../utils/navigation-single-flight';
import {
  formatActivityDate,
  formatActivityDateTime,
  formatActivityTime,
} from '../../utils/date-time';
import {
  appendUniqueActivities,
  buildCarouselDayChips,
  createTimelineViewState,
  invalidateTimelineView,
  type CarouselDayChip,
  type TimelineViewState,
} from './timeline-state';

const VIEW_COPY = {
  future: {
    emptyTitle: '暂无未来活动',
    emptyCopy: '新的骑行活动正在筹备中',
  },
  history: {
    emptyTitle: '暂无历史活动',
    emptyCopy: '每一次转弯，都有值得记住的风景。完成的骑行活动会出现在这里',
  },
} as const;

type DisplayDayChip = CarouselDayChip & { relativeLabel: string; dateLabel: string };

function displayDayChip(chip: CarouselDayChip): DisplayDayChip {
  const [, month, day] = chip.key.split('-');
  const labelParts = chip.label.split(' ');
  const relativeLabel = /^(今天|明天|后天)$/.test(chip.label)
    ? chip.label
    : labelParts[labelParts.length - 1] || '活动日';
  return { ...chip, relativeLabel, dateLabel: `${Number(month)}月${Number(day)}日` };
}

function displayActivity(item: Activity) {
  const startAt = item.startAt || item.date;
  const hasSpecificTime = Boolean(item.startAt && !/^\d{4}-\d{2}-\d{2}$/.test(item.startAt));
  const durationSeconds = item.route?.estimatedMovingTimeSeconds;
  const durationHours =
    typeof durationSeconds === 'number' && durationSeconds > 0
      ? Math.round((durationSeconds / 3600) * 10) / 10
      : null;
  return {
    ...item,
    occupied: item.occupiedCount || 0,
    remaining: Math.max(item.capacity - (item.occupiedCount || 0), 0),
    displayDate: formatActivityDateTime(startAt),
    displayDateLabel: formatActivityDate(startAt),
    displayTimeLabel: hasSpecificTime ? formatActivityTime(item.startAt) : '时间待公布',
    displayStatus: activityDisplayStatus(item),
    estimatedRideTime: durationHours ? `${durationHours} h` : '',
  };
}

Page({
  navigation: createNavigationSingleFlight((options) => wx.navigateTo(options)),
  viewStates: {
    future: createTimelineViewState(),
    history: createTimelineViewState(),
  } as Record<PublicActivityView, TimelineViewState>,
  loadHandles: {} as Partial<Record<PublicActivityView, Promise<void>>>,
  loadMoreHandles: {} as Partial<Record<PublicActivityView, Promise<void>>>,
  loadMoreOwners: {} as Partial<Record<PublicActivityView, symbol>>,
  data: {
    navigationTopPx: customNavigationTopPx(),
    activeView: 'future' as PublicActivityView,
    loading: true,
    refreshing: false,
    loadingMore: false,
    error: '',
    refreshError: '',
    nextCursor: null as string | null,
    emptyTitle: VIEW_COPY.future.emptyTitle,
    emptyCopy: VIEW_COPY.future.emptyCopy,
    items: [] as ReturnType<typeof displayActivity>[],
    dayChips: [] as DisplayDayChip[],
    selectedDayKey: '',
    layoutMode: 'card' as 'card' | 'compact',
  },
  onShow() {
    const view = this.data.activeView as PublicActivityView;
    const cached = repositoryCache.peekActivityPage(view);
    if (cached && this.viewStates[view].items.length === 0) {
      this.viewStates[view] = {
        ...this.viewStates[view],
        items: cached.items,
        nextCursor: cached.nextCursor,
        loading: false,
        loaded: true,
      };
      this.renderActiveView();
    }
    void this.load();
  },
  onHide() {
    this.navigation.release();
    this.invalidateAllViews();
  },
  onUnload() {
    this.navigation.release();
    this.invalidateAllViews();
  },
  invalidateAllViews() {
    for (const view of ['future', 'history'] as const) {
      this.viewStates[view] = invalidateTimelineView(this.viewStates[view]);
      delete this.loadHandles[view];
      delete this.loadMoreHandles[view];
      delete this.loadMoreOwners[view];
    }
  },
  renderActiveView() {
    const view = this.data.activeView as PublicActivityView;
    const state = this.viewStates[view];
    const displayItems = state.items.map(displayActivity);
    const dayChips =
      view === 'future' ? buildCarouselDayChips(state.items).map(displayDayChip) : [];
    const selectedDayKey = dayChips.some((chip) => chip.key === this.data.selectedDayKey)
      ? this.data.selectedDayKey
      : dayChips[0]?.key || '';
    this.setData({
      ...VIEW_COPY[view],
      items: displayItems,
      dayChips,
      selectedDayKey,
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
    delete this.loadMoreHandles[view];
    delete this.loadMoreOwners[view];
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
    const state = this.viewStates[view];
    if (this.loadHandles[view] || state.loading || state.refreshing) return;
    const existing = this.loadMoreHandles[view];
    if (existing) return existing;
    const cursor = state.nextCursor;
    if (!cursor) return;
    const revision = state.revision;
    this.viewStates[view] = { ...state, loadingMore: true, refreshError: '' };
    this.renderActiveView();
    const owner = Symbol(`loadMore:${view}:${revision}`);
    this.loadMoreOwners[view] = owner;
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
        if (this.viewStates[view].revision === revision && this.loadMoreOwners[view] === owner) {
          delete this.loadMoreOwners[view];
          delete this.loadMoreHandles[view];
        }
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
    delete this.loadMoreOwners[previous];
    this.setData({ activeView: candidate, selectedDayKey: '' });
    this.renderActiveView();
    void this.load();
  },
  switchLayout(event: { currentTarget?: { dataset?: { mode?: unknown } } }) {
    const mode = event.currentTarget?.dataset?.mode;
    if (mode !== 'card' && mode !== 'compact') return;
    if (mode !== this.data.layoutMode) {
      this.setData({ layoutMode: mode }, () => {
        const chip = this.data.dayChips.find(
          (item: CarouselDayChip) => item.key === this.data.selectedDayKey,
        );
        if (chip) this.scrollToActivity(chip.index);
      });
    }
  },
  selectDay(event: { currentTarget?: { dataset?: { index?: unknown } } }) {
    const index = Number(event.currentTarget?.dataset?.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.items.length) return;
    const selectedDayKey =
      this.data.dayChips.find((chip: CarouselDayChip) => chip.index === index)?.key ?? '';
    this.setData({ selectedDayKey });
    this.scrollToActivity(index);
  },
  scrollToActivity(index: number) {
    if (typeof wx.pageScrollTo === 'function') {
      wx.pageScrollTo({
        selector: `#activity-index-${index}`,
        offsetTop: -16,
        duration: 180,
      });
    }
  },
  open(event: { currentTarget: { dataset: { id: string } } }) {
    this.navigation.run('/pages/activity-detail/index?id=' + event.currentTarget.dataset.id);
  },
});
