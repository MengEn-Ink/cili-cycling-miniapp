'use strict';

const ALLOWED_PHOTO_CATEGORIES = new Set([
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

function safeFileId(value) {
  return typeof value === 'string' && value.length <= 512 ? value : '';
}

function adminCapabilityProfile(profile) {
  const value = profile && typeof profile === 'object' ? profile : {};
  const photos = Array.isArray(value.photos)
    ? value.photos
        .filter((photo) => photo && typeof photo === 'object')
        .map((photo) => ({
          file_id: safeFileId(photo.file_id),
          category: typeof photo.category === 'string' ? photo.category : '',
        }))
        .filter(
          (photo) => photo.file_id && ALLOWED_PHOTO_CATEGORIES.has(photo.category.toLowerCase()),
        )
    : [];
  return { avatar_file_id: safeFileId(value.avatar_file_id), photos };
}

module.exports = { adminCapabilityProfile };
