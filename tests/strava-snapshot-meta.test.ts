import { describe, expect, it } from 'vitest';
import type { StravaSnapshot } from '../miniprogram/models';
import { stravaSnapshotMeta } from '../miniprogram/services/strava-readiness-service';

const snapshot: StravaSnapshot = {
  totalKm: 1200,
  rides90d: 32,
  longestKm: 168,
  elevationM: 9000,
  speedKmh: 27.4,
  latestActivityAt: null,
  syncedAt: '2026-09-29T04:00:00.000Z',
  coverage: {
    from: '2026-07-01T04:00:00.000Z',
    to: '2026-09-29T04:00:00.000Z',
    complete: false,
  },
};

describe('Strava 快照展示元数据', () => {
  it('明确展示覆盖区间、不完整状态和同步时间', () => {
    expect(stravaSnapshotMeta(snapshot)).toEqual({
      coverageText: '2026年7月1日 至 2026年9月29日 · 数据可能不完整',
      syncedAtText: '同步于 2026-09-29 12:00:00',
      coverageComplete: false,
    });
  });

  it('旧快照缺少 coverage 时显示未知而不是完整', () => {
    expect(stravaSnapshotMeta({ ...snapshot, coverage: null })).toMatchObject({
      coverageText: '近 90 天覆盖范围未知',
      coverageComplete: null,
    });
  });
});
