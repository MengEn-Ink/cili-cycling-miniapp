import { describe, expect, it } from 'vitest';
import type { Registration } from '../miniprogram/models';
import { capabilityCard, selectCapabilityImage } from '../miniprogram/utils/capability-card';

function registration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: 'r1',
    activityId: 'a1',
    status: 'pending',
    profile: {
      nickname: '山野骑手',
      realName: '曹*',
      phone: '138****5678',
      idNumber: '11******1234',
      title: '',
      idType: '',
      gender: '',
      emergencyName: '',
      emergencyPhone: '',
      avatarId: 'cloud://avatar',
      photos: [],
    },
    bikeMode: '自带车',
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
      syncedAt: '2026-09-29T04:00:00.000Z',
    },
    updatedAt: '',
    ...overrides,
  };
}

describe('骑行能力卡', () => {
  it('显式优先第一张骑行或训练照片，并标记为个人上传', () => {
    const profile = {
      ...registration().profile,
      photos: [
        { id: 'cloud://bike', category: 'bike' },
        { id: 'cloud://training', category: 'training' },
        { id: 'cloud://ride', category: 'ride' },
      ],
    };
    expect(selectCapabilityImage(profile)).toEqual({
      url: 'cloud://training',
      source: '个人上传',
    });
  });

  it('无骑行照片时回退头像，无头像时给出明确缺失态', () => {
    expect(selectCapabilityImage(registration().profile)).toEqual({
      url: 'cloud://avatar',
      source: '头像',
    });
    expect(selectCapabilityImage({ ...registration().profile, avatarId: '' })).toEqual({
      url: '',
      source: '暂无照片',
    });
  });

  it.each([
    ['pending', '未授权'],
    ['syncing', '同步中'],
    ['failed', '数据失败'],
  ] as const)('展示 Strava %s 缺失态', (status, label) => {
    expect(
      capabilityCard(registration({ strava: { ...registration().strava, status, syncedAt: '' } }))
        .stravaStatus,
    ).toBe(label);
  });
});
