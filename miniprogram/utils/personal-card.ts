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
  };
}
