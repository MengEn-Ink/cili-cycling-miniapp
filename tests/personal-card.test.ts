import { describe, expect, it } from 'vitest';
import type { PersonalCapabilityCard } from '../miniprogram/models';
import { personalCardViewModel } from '../miniprogram/utils/personal-card';

const baseCard: PersonalCapabilityCard = {
  generatedAt: '2026-09-29T04:10:00.000Z',
  profile: {
    displayName: '山野骑手',
    gender: '男',
    avatarUrl: 'https://temporary.example/avatar.jpg',
  },
  backgrounds: [
    { url: 'https://temporary.example/ride.jpg', source: 'user_photo', category: 'ride' },
  ],
};

describe('个人骑行名片 view model', () => {
  it('只投影用户资料、照片与生成时间', () => {
    expect(personalCardViewModel(baseCard)).toEqual({
      displayName: '山野骑手',
      avatarUrl: 'https://temporary.example/avatar.jpg',
      backgrounds: baseCard.backgrounds,
      hasBackgrounds: true,
      hasMultipleBackgrounds: false,
      generatedAtText: '生成于 2026-09-29 12:10:00',
      needsProfilePhoto: false,
      gender: '男',
      genderLabel: '男',
      genderClass: 'gender-male',
    });
  });

  it('无照片时启用资料完善入口', () => {
    const view = personalCardViewModel({ ...baseCard, backgrounds: [] });
    expect(view.hasBackgrounds).toBe(false);
    expect(view.hasMultipleBackgrounds).toBe(false);
    expect(view.needsProfilePhoto).toBe(true);
  });

  it('最多保留前三张背景并维持服务端顺序', () => {
    const backgrounds = Array.from({ length: 4 }, (_, index) => ({
      url: `https://temporary.example/${index}.jpg`,
      source: 'user_photo' as const,
      category: 'ride',
    }));
    const view = personalCardViewModel({ ...baseCard, backgrounds });
    expect(view.backgrounds.map((item) => item.url)).toEqual(
      backgrounds.slice(0, 3).map((item) => item.url),
    );
    expect(view.hasMultipleBackgrounds).toBe(true);
  });

  it('昵称、头像和性别缺失时提供可读降级', () => {
    const view = personalCardViewModel({
      ...baseCard,
      profile: { displayName: '', gender: '' },
    });
    expect(view.displayName).toBe('此里骑手');
    expect(view.avatarUrl).toBe('');
    expect(view.genderLabel).toBe('未标注');
    expect(view.genderClass).toBe('gender-unknown');
  });
});
