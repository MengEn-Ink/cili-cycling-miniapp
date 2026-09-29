// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Registration } from '../miniprogram/models';
import { capabilityCard } from '../miniprogram/utils/capability-card';

const registration = (coverage: Registration['strava']['coverage']): Registration => ({
  id: 'r1',
  activityId: 'a1',
  status: 'pending',
  profile: {
    avatarRevision: 0,
    nickname: '骑手',
    title: '',
    realName: '曹**',
    phone: '138****5678',
    gender: '',
    emergencyName: '',
    emergencyPhone: '',
    photos: [],
  },
  gatheringMode: '自驾',
  experience: '常骑',
  remark: '',
  strava: {
    status: 'connected',
    years: 3,
    totalKm: 812,
    rides90d: 28,
    longestKm: 126,
    elevationM: 9300,
    speedKmh: 25.6,
    syncedAt: '2026-09-29T04:05:06.000Z',
    coverage,
  },
  updatedAt: '',
});

describe('管理员 Strava 视图契约', () => {
  it('展示精确 90 天覆盖范围、完整性和格式化同步时间', () => {
    const card = capabilityCard(
      registration({
        from: '2026-07-01T04:00:00.000Z',
        to: '2026-09-29T04:00:00.000Z',
        complete: false,
      }),
    );
    expect(card.coverageRange).toBe('2026-07-01 至 2026-09-29');
    expect(card.coverageState).toBe('数据覆盖不完整');
    expect(card.syncedAt).toBe('2026-09-29 04:05 UTC');
  });

  it('缺少覆盖范围时显示未知而不是伪造成完整或零', () => {
    const card = capabilityCard(registration(null));
    expect(card.coverageRange).toBe('覆盖范围未知');
    expect(card.coverageState).toBe('完整性未知');
  });

  it('审批详情模板以文本呈现覆盖范围、完整性和同步时间', () => {
    const wxml = readFileSync('miniprogram/pages/admin/review-detail/index.wxml', 'utf8');
    expect(wxml).toContain('{{card.coverageRange}}');
    expect(wxml).toContain('{{card.coverageState}}');
    expect(wxml).toContain('{{card.syncedAt}}');
    expect(wxml).toContain('{{phoneSource}}');
  });
});
