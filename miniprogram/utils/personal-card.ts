import type { PersonalCapabilityCard } from '../models/index';
import { formatChinaDateTime } from './date-time';
import { genderView } from './gender';

export function personalCardViewModel(card: PersonalCapabilityCard) {
  const backgrounds = card.backgrounds.slice(0, 3);
  return {
    ...genderView(card.profile.gender),
    displayName: card.profile.displayName || '此里骑手',
    avatarUrl: card.profile.avatarUrl || '',
    backgrounds,
    hasBackgrounds: backgrounds.length > 0,
    hasMultipleBackgrounds: backgrounds.length > 1,
    generatedAtText: `生成于 ${formatChinaDateTime(card.generatedAt)}`,
    needsProfilePhoto: backgrounds.length === 0,
  };
}
