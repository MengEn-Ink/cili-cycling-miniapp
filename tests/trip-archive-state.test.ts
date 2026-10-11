import { describe, expect, it } from 'vitest';
import {
  buildTripMeetingInfo,
  isTripArchived,
} from '../miniprogram/pages/registrations/trip-state';

describe('我的行程归档口径', () => {
  const endAt = '2026-10-11T14:30:00+08:00';

  it('活动结束当天仍保留到中国时间次日 0 点前', () => {
    expect(isTripArchived(endAt, new Date('2026-10-11T23:59:59.999+08:00'))).toBe(false);
  });

  it('中国时间次日 0 点整开始归档隐藏', () => {
    expect(isTripArchived(endAt, new Date('2026-10-12T00:00:00.000+08:00'))).toBe(true);
  });

  it('跨月、跨年仍按活动结束日的下一个中国自然日归档', () => {
    expect(isTripArchived('2026-12-31T23:30:00+08:00', new Date('2027-01-01T00:00:00+08:00'))).toBe(
      true,
    );
  });

  it('结束时间缺失或非法时不误隐藏行程', () => {
    expect(isTripArchived(undefined, new Date('2026-10-12T00:00:00+08:00'))).toBe(false);
    expect(isTripArchived('not-a-date', new Date('2026-10-12T00:00:00+08:00'))).toBe(false);
  });
});

describe('行程卡片集合信息', () => {
  it('展示活动开始时间并优先使用正式集合地点', () => {
    expect(
      buildTripMeetingInfo({
        startAt: '2026-10-18T07:30:00+08:00',
        date: '2026-10-18',
        schedule: [{ time: '07:30', title: '集合整备', location: '旧日程地点' }],
        route: { start: '青岚公园北门' },
      }),
    ).toEqual({ time: '早上 7 点半', location: '青岚公园北门' });
  });

  it('正式集合地点缺失时兼容旧日程地点，均缺失时明确待公布', () => {
    expect(
      buildTripMeetingInfo({
        startAt: '2026-10-18T07:30:00+08:00',
        date: '2026-10-18',
        schedule: [{ location: '白帆广场' }],
        route: { start: '' },
      }).location,
    ).toBe('白帆广场');
    expect(
      buildTripMeetingInfo({ date: '', startAt: '', schedule: [], route: { start: '' } }),
    ).toEqual({ time: '时间待公布', location: '地点待公布' });
  });
});
