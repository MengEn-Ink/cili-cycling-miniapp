import type { Activity } from '../../models';
import { describeActivityDay, type ActivityDayBucket } from '../../utils/date-time';

export interface TimelineViewState {
  items: Activity[];
  nextCursor: string | null;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string;
  refreshError: string;
  revision: number;
  loaded: boolean;
}

export function createTimelineViewState(): TimelineViewState {
  return {
    items: [],
    nextCursor: null,
    loading: false,
    refreshing: false,
    loadingMore: false,
    error: '',
    refreshError: '',
    revision: 0,
    loaded: false,
  };
}

export function invalidateTimelineView(state: TimelineViewState): TimelineViewState {
  return {
    ...state,
    loading: false,
    refreshing: false,
    loadingMore: false,
    revision: state.revision + 1,
  };
}

export function appendUniqueActivities(current: Activity[], incoming: Activity[]): Activity[] {
  const seen = new Set(current.map((item) => item.id));
  const result = [...current];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export interface CarouselDayChip extends ActivityDayBucket {
  index: number;
}

/**
 * 横向轮播按首场活动索引生成日期快捷入口，点击日期即可直接定位到当天第一张卡片。
 */
export function buildCarouselDayChips(
  items: Activity[],
  nowValue: string | Date = new Date(),
): CarouselDayChip[] {
  const chips: CarouselDayChip[] = [];
  const seenDays = new Set<string>();
  items.forEach((item, index) => {
    const bucket = describeActivityDay(item.startAt || item.date || undefined, nowValue);
    if (!bucket || seenDays.has(bucket.key)) return;
    seenDays.add(bucket.key);
    chips.push({ ...bucket, index });
  });
  return chips;
}
