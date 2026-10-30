import type { Activity } from '../../miniprogram/models';
import { describeActivityDay, type ActivityDayBucket } from '../../miniprogram/utils/date-time';

/**
 * 测试专用首页行序列构建器：运行时页面仅使用轮播 chips 与视图状态，
 * 行序列结构无生产调用方；与 B1/B2 一致外置到 tests/support，不进入主包计量。
 */
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
