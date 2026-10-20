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
      experienceLabel: '未填写',
      gender: '男',
      genderLabel: '男',
      genderClass: 'gender-male',
    });
  });

  it('名片云响应不带骑行经验字段，经验行固定展示未填写而不虚构', () => {
    expect(personalCardViewModel(baseCard).experienceLabel).toBe('未填写');
  });

  it('无照片时用头像补位并保留资料完善入口', () => {
    const view = personalCardViewModel({ ...baseCard, backgrounds: [] });
    expect(view.hasBackgrounds).toBe(true);
    expect(view.backgrounds).toEqual([
      {
        url: 'https://temporary.example/avatar.jpg',
        source: 'avatar',
        category: 'avatar',
      },
    ]);
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
