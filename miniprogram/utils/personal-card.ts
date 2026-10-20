import type { PersonalCapabilityCard } from '../models/index';
import { formatChinaDateTime } from './date-time';
import { genderView } from './gender';

export function personalCardViewModel(card: PersonalCapabilityCard) {
  const userBackgrounds = card.backgrounds.slice(0, 3);
  const backgrounds = userBackgrounds.length
    ? userBackgrounds
    : card.profile.avatarUrl
      ? [
          {
            url: card.profile.avatarUrl,
            source: 'avatar' as const,
            category: 'avatar',
          },
        ]
      : [];
  return {
    ...genderView(card.profile.gender),
    displayName: card.profile.displayName || '此里骑手',
    avatarUrl: card.profile.avatarUrl || '',
    backgrounds,
    hasBackgrounds: backgrounds.length > 0,
    hasMultipleBackgrounds: backgrounds.length > 1,
    generatedAtText: `生成于 ${formatChinaDateTime(card.generatedAt)}`,
    needsProfilePhoto: userBackgrounds.length === 0,
    // 名片云响应（profile capabilityCard）当前只下发昵称、性别与头像，不含骑行经验；
    // 不新增云函数字段，经验行在未接入真实数据前固定展示“未填写”。
    experienceLabel: '未填写',
  };
}
