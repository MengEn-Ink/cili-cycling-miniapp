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

export type DayChip = ActivityDayBucket;

export interface TimelineRow {
  rowId: string;
  kind: 'header' | 'item';
  dayKey?: string;
  dayLabel?: string;
  item?: Activity;
  // 仅未来视图的第一场活动高亮；第二场活动上方展示“接下来”分隔。
  featured?: boolean;
  showFollowing?: boolean;
}

export interface TimelineRows {
  rows: TimelineRow[];
  dayChips: DayChip[];
}

const PENDING_DAY_KEY = 'pending';
const PENDING_DAY_LABEL = '日期待公布';

/**
 * 把已排序的活动列表整理为 WXML 直接渲染的行序列。
 * 未来视图按中国自然日插入日期分组头，并生成可快速定位的日期 chips；历史视图保持平铺。
 */
export function buildTimelineRows(
  items: Activity[],
  view: 'future' | 'history',
  nowValue: string | Date = new Date(),
): TimelineRows {
  if (view === 'history') {
    return {
      rows: items.map((item, index) => ({
        rowId: `item-${item.id}`,
        kind: 'item' as const,
        item,
        showFollowing: index === 1,
      })),
      dayChips: [],
    };
  }

  const rows: TimelineRow[] = [];
  const dayChips: DayChip[] = [];
  const seenDays = new Set<string>();
  items.forEach((item, index) => {
    const bucket = describeActivityDay(item.startAt || item.date || undefined, nowValue);
    const dayKey = bucket?.key ?? PENDING_DAY_KEY;
    if (!seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      rows.push({
        rowId: `header-${dayKey}`,
        kind: 'header',
        dayKey,
        dayLabel: bucket?.label ?? PENDING_DAY_LABEL,
      });
      if (bucket) dayChips.push(bucket);
    }
    rows.push({
      rowId: `item-${item.id}`,
      kind: 'item',
      item,
      featured: index === 0,
      showFollowing: index === 1,
    });
  });
  return { rows, dayChips };
}
