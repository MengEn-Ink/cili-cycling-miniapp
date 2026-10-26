import { describe, expect, it } from 'vitest';
import { formatActivityTime } from '../miniprogram/utils/date-time';

describe('活动集合时间自然表达', () => {
  it.each([
    ['2026-10-18T08:00:00+08:00', '早上 8 点整'],
    ['2026-10-18T08:30:00+08:00', '早上 8 点半'],
    ['2026-10-18T06:20:00+08:00', '早上 6 点 20 分'],
    ['12:00', '中午 12 点整'],
    ['18:45', '晚上 6 点 45 分'],
  ])('%s 显示为 %s', (value, expected) => {
    expect(formatActivityTime(value)).toBe(expected);
  });

  it.each([undefined, '', 'not-a-date', '25:00', '08:90'])('%s 明确显示待公布', (value) => {
    expect(formatActivityTime(value)).toBe('时间待公布');
  });
});
