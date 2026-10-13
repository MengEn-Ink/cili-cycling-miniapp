import type { Registration } from '../models';
import { genderView } from './gender';

const MAX_CAPABILITY_IMAGES = 3;
const RIDING_CATEGORIES = new Set([
  'bike',
  'ride',
  'riding',
  'cycling',
  'training',
  'workout',
  '骑行',
  '骑行照',
  '训练',
  '训练照',
]);

export interface CapabilityImage {
  url: string;
  source: '个人上传' | '头像';
}

function isRidingPhoto(category: string) {
  return RIDING_CATEGORIES.has(category.trim().toLowerCase());
}

export function selectCapabilityImages(profile: Registration['profile']): CapabilityImage[] {
  const seen = new Set<string>();
  const images: CapabilityImage[] = [];
  const add = (url: string | undefined, source: CapabilityImage['source']) => {
    const normalizedUrl = url?.trim();
    if (
      !normalizedUrl ||
      !/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(normalizedUrl) ||
      seen.has(normalizedUrl) ||
      images.length >= MAX_CAPABILITY_IMAGES
    )
      return;
    seen.add(normalizedUrl);
    images.push({ url: normalizedUrl, source });
  };

  profile.photos
    .filter((photo) => isRidingPhoto(photo.category))
    .forEach((photo) => add(photo.id, '个人上传'));
  profile.photos
    .filter((photo) => !isRidingPhoto(photo.category))
    .forEach((photo) => add(photo.id, '个人上传'));
  add(profile.avatarId, '头像');

  return images;
}

export function capabilityCard(registration: Registration) {
  const images = selectCapabilityImages(registration.profile);
  const realName = registration.profile.realName.trim();
  return {
    ...genderView(registration.profile.gender),
    images,
    hasMultipleImages: images.length > 1,
    displayName: registration.profile.nickname || realName || '未填写昵称',
    // 审核管理员查看完整真实姓名，不再打星号。
    realName: realName || '实名信息未完善',
    experience: registration.experience || '未填写',
    remark: registration.remark || '无',
  };
}
