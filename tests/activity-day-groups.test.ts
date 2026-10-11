import { describe, expect, it } from 'vitest';
import type { Activity } from '../miniprogram/models';
import { describeActivityDay } from '../miniprogram/utils/date-time';
import { buildTimelineRows } from '../miniprogram/pages/activities/timeline-state';

// 固定“现在”：2026-10-11 12:00 中国时间（UTC 04:00），保证相对称谓与日界确定性。
const NOW = '2026-10-11T04:00:00.000Z';
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const makeActivity = (id: string, startAt: string): Activity =>
  ({ id, startAt, date: startAt }) as Partial<Activity> as Activity;

describe('describeActivityDay 中国自然日分组', () => {
  it('当天活动归为“今天”，按 UTC+8 日界取日期键', () => {
    // 10-11 18:00 中国时间
    expect(describeActivityDay('2026-10-11T10:00:00.000Z', NOW)).toEqual({
      key: '2026-10-11',
      label: '今天',
    });
  });

  it('UTC 10-10 17:00 已跨入中国 10-11 凌晨，仍归“今天”', () => {
    expect(describeActivityDay('2026-10-10T17:00:00.000Z', NOW)).toEqual({
      key: '2026-10-11',
      label: '今天',
    });
  });

  it('依次给出明天、后天相对称谓', () => {
    expect(describeActivityDay('2026-10-12T00:00:00.000Z', NOW)?.label).toBe('明天');
    expect(describeActivityDay('2026-10-13T00:00:00.000Z', NOW)).toEqual({
      key: '2026-10-13',
      label: '后天',
    });
  });

  it('第三天及以后显示月日与星期', () => {
    const weekday = WEEKDAYS[new Date(Date.UTC(2026, 9, 14)).getUTCDay()];
    expect(describeActivityDay('2026-10-14T00:00:00.000Z', NOW)).toEqual({
      key: '2026-10-14',
      label: `10月14日 ${weekday}`,
    });
  });

  it('跨年的绝对日期补年份，跨到新年的相对称谓仍用明天/后天', () => {
    const yearEndNow = '2026-12-31T04:00:00.000Z';
    expect(describeActivityDay('2027-01-01', yearEndNow)?.label).toBe('明天');
    const weekday = WEEKDAYS[new Date(Date.UTC(2027, 0, 5)).getUTCDay()];
    expect(describeActivityDay('2027-01-05', yearEndNow)).toEqual({
      key: '2027-01-05',
      label: `2027年1月5日 ${weekday}`,
    });
  });

  it('支持纯日期输入，空值与非法值返回 null', () => {
    expect(describeActivityDay('2026-10-12', NOW)?.label).toBe('明天');
    expect(describeActivityDay('', NOW)).toBeNull();
    expect(describeActivityDay(undefined, NOW)).toBeNull();
    expect(describeActivityDay('not-a-date', NOW)).toBeNull();
    expect(describeActivityDay('2026-13-40', NOW)).toBeNull();
  });
});

describe('buildTimelineRows 首页行序列', () => {
  it('未来视图按日期插入分组头，合并同日活动并生成 chips', () => {
    const items = [
      makeActivity('a', '2026-10-11T10:00:00.000Z'),
      makeActivity('b', '2026-10-11T12:00:00.000Z'),
      makeActivity('c', '2026-10-12T02:00:00.000Z'),
    ];
    const { rows, dayChips } = buildTimelineRows(items, 'future', NOW);

    expect(rows.map((row) => row.kind)).toEqual(['header', 'item', 'item', 'header', 'item']);
    expect(rows[0]).toMatchObject({ kind: 'header', dayKey: '2026-10-11', dayLabel: '今天' });
    expect(rows[1]).toMatchObject({ kind: 'item', featured: true, showFollowing: false });
    expect(rows[1].item?.id).toBe('a');
    expect(rows[2]).toMatchObject({ kind: 'item', featured: false, showFollowing: true });
    expect(rows[2].item?.id).toBe('b');
    expect(rows[3]).toMatchObject({ kind: 'header', dayKey: '2026-10-12', dayLabel: '明天' });
    expect(rows[4]).toMatchObject({ kind: 'item', featured: false, showFollowing: false });
    expect(rows[4].item?.id).toBe('c');
    expect(dayChips).toEqual([
      { key: '2026-10-11', label: '今天' },
      { key: '2026-10-12', label: '明天' },
    ]);
  });

  it('日期缺失的活动归到“日期待公布”，且不出现在快捷 chips', () => {
    const items = [makeActivity('x', '')];
    const { rows, dayChips } = buildTimelineRows(items, 'future', NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'header', dayKey: 'pending', dayLabel: '日期待公布' });
    expect(rows[1]).toMatchObject({ kind: 'item', featured: true });
    expect(dayChips).toEqual([]);
  });

  it('空列表返回空行与空 chips', () => {
    expect(buildTimelineRows([], 'future', NOW)).toEqual({ rows: [], dayChips: [] });
  });

  it('历史视图保持平铺，不插入日期头也不产出 chips', () => {
    const items = [
      makeActivity('h1', '2026-10-05T00:00:00.000Z'),
      makeActivity('h2', '2026-10-04T00:00:00.000Z'),
    ];
    const { rows, dayChips } = buildTimelineRows(items, 'history', NOW);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === 'item')).toBe(true);
    expect(rows[1]).toMatchObject({ showFollowing: true });
    expect(dayChips).toEqual([]);
  });
});
