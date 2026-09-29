import { describe, expect, it } from 'vitest';
import type { Registration } from '../miniprogram/models';
import { capabilityCard, selectCapabilityImages } from '../miniprogram/utils/capability-card';

function registration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: 'r1',
    activityId: 'a1',
    status: 'pending',
    profile: {
      nickname: '山野骑手',
      realName: '曹蒙恩',
      phone: '138****5678',
      title: '',
      gender: '',
      emergencyName: '',
      emergencyPhone: '',
      avatarId: 'https://temporary.example/avatar',
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

const profileWith = (
  photos: { id: string; category: string }[],
  avatarId = 'https://temporary.example/avatar',
) => ({
  ...registration().profile,
  photos,
  avatarId,
});

describe('骑行能力卡图片', () => {
  it('5 张照片最多截取 3 张', () => {
    const photos = ['1', '2', '3', '4', '5'].map((id) => ({
      id: `https://temporary.example/${id}`,
      category: '生活',
    }));
    expect(selectCapabilityImages(profileWith(photos))).toEqual([
      { url: 'https://temporary.example/1', source: '个人上传' },
      { url: 'https://temporary.example/2', source: '个人上传' },
      { url: 'https://temporary.example/3', source: '个人上传' },
    ]);
  });

  it('骑行和训练相关照片优先且保持原有顺序', () => {
    const images = selectCapabilityImages(
      profileWith([
        { id: 'https://temporary.example/life', category: '生活' },
        { id: 'https://temporary.example/training', category: 'training' },
        { id: 'https://temporary.example/bike', category: 'bike' },
        { id: 'https://temporary.example/pet', category: '宠物' },
      ]),
    );
    expect(images.map((image) => image.url)).toEqual([
      'https://temporary.example/training',
      'https://temporary.example/bike',
      'https://temporary.example/life',
    ]);
  });

  it('其他个人上传照片补足骑行照片后的空位', () => {
    expect(
      selectCapabilityImages(
        profileWith([
          { id: 'https://temporary.example/portrait', category: '人像' },
          { id: 'https://temporary.example/ride', category: '骑行照' },
        ]),
      ),
    ).toEqual([
      { url: 'https://temporary.example/ride', source: '个人上传' },
      { url: 'https://temporary.example/portrait', source: '个人上传' },
      { url: 'https://temporary.example/avatar', source: '头像' },
    ]);
  });

  it('头像与上传照片重复时去重，并保留个人上传来源', () => {
    expect(
      selectCapabilityImages(
        profileWith(
          [{ id: 'https://temporary.example/avatar', category: 'cycling' }],
          'https://temporary.example/avatar',
        ),
      ),
    ).toEqual([{ url: 'https://temporary.example/avatar', source: '个人上传' }]);
  });

  it('仅头像时返回单图静态卡所需数据', () => {
    const card = capabilityCard(registration());
    expect(card.images).toEqual([{ url: 'https://temporary.example/avatar', source: '头像' }]);
    expect(card.hasMultipleImages).toBe(false);
    expect(card.maskedName).toBe('曹**');
  });

  it('无上传照片且无头像时保留无图占位所需数据', () => {
    const card = capabilityCard(registration({ profile: profileWith([], '') }));
    expect(card.images).toEqual([]);
    expect(card.hasMultipleImages).toBe(false);
  });

  it('客户端能力卡拒绝 raw cloud file ID 和非 https URL', () => {
    expect(
      selectCapabilityImages(
        profileWith(
          [
            { id: 'cloud://raw-photo', category: 'ride' },
            { id: 'http://temporary.example/insecure', category: 'ride' },
            { id: 'https://temporary.example/safe', category: 'ride' },
          ],
          'cloud://raw-avatar',
        ),
      ),
    ).toEqual([{ url: 'https://temporary.example/safe', source: '个人上传' }]);
  });
});

describe('骑行能力卡状态', () => {
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
