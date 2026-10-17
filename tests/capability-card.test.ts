import { describe, expect, it } from 'vitest';
import type { Profile, Registration } from '../miniprogram/models';
import { capabilityCard, selectCapabilityImages } from '../miniprogram/utils/capability-card';

const profile: Profile = {
  avatarRevision: 1,
  clubs: [],
  nickname: '山野骑手',
  title: '',
  realName: '曹蒙恩',
  phone: '13812345678',
  gender: '男',
  emergencyName: '',
  emergencyPhone: '',
  photos: [],
};

const registration = (patch: Partial<Registration> = {}): Registration => ({
  id: 'r1',
  activityId: 'a1',
  status: 'pending',
  profile,
  gatheringMode: '自行前往',
  experience: '常骑',
  remark: '无',
  updatedAt: '2026-10-13T08:00:00.000Z',
  ...patch,
});

describe('骑行能力卡图片', () => {
  it('骑行照片优先、其他照片补位并最多保留三张', () => {
    const images = selectCapabilityImages({
      ...profile,
      photos: [
        { id: 'https://example.test/other.jpg', category: 'other' },
        { id: 'https://example.test/ride.jpg', category: 'ride' },
        { id: 'https://example.test/bike.jpg', category: 'bike' },
        { id: 'https://example.test/fourth.jpg', category: 'other' },
      ],
    });
    expect(images).toEqual([
      { url: 'https://example.test/ride.jpg', source: '个人上传' },
      { url: 'https://example.test/bike.jpg', source: '个人上传' },
      { url: 'https://example.test/other.jpg', source: '个人上传' },
    ]);
  });

  it('头像与照片重复时去重，非法 URL 不进入名片', () => {
    const url = 'https://example.test/avatar.jpg';
    const images = selectCapabilityImages({
      ...profile,
      avatarId: url,
      photos: [
        { id: url, category: 'ride' },
        { id: 'cloud://private.jpg', category: 'ride' },
      ],
    });
    expect(images).toEqual([{ url, source: '个人上传' }]);
  });
});

describe('骑行能力卡资料', () => {
  it('只返回审核所需资料和照片', () => {
    expect(
      capabilityCard(
        registration({
          profile: {
            ...profile,
            avatarId: 'https://example.test/avatar.jpg',
            photos: [{ id: 'https://example.test/ride.jpg', category: 'ride' }],
          },
        }),
      ),
    ).toMatchObject({
      displayName: '山野骑手',
      realName: '曹蒙恩',
      experience: '常骑',
      remark: '无',
      genderLabel: '男',
      images: [
        { url: 'https://example.test/ride.jpg', source: '个人上传' },
        { url: 'https://example.test/avatar.jpg', source: '头像' },
      ],
      hasMultipleImages: true,
    });
  });
});
