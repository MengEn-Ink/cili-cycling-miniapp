import type { Registration } from '../models';

const RIDING_CATEGORIES = new Set([
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

export function selectCapabilityImage(profile: Registration['profile']) {
  const photo = profile.photos.find((item) => RIDING_CATEGORIES.has(item.category.toLowerCase()));
  if (photo) return { url: photo.id, source: '个人上传' };
  if (profile.avatarId) return { url: profile.avatarId, source: '头像' };
  return { url: '', source: '暂无照片' };
}

export function capabilityCard(registration: Registration) {
  const image = selectCapabilityImage(registration.profile);
  const hasSnapshot = Boolean(registration.strava.syncedAt);
  const status =
    registration.strava.status === 'pending'
      ? { label: '未授权', tone: 'muted' }
      : registration.strava.status === 'syncing' ||
          (registration.strava.status === 'connected' && !hasSnapshot)
        ? { label: '同步中', tone: 'warning' }
        : registration.strava.status === 'failed'
          ? { label: '数据失败', tone: 'danger' }
          : registration.strava.status === 'exempted'
            ? { label: '人工豁免', tone: 'warning' }
            : { label: '已同步', tone: 'success' };
  const metric = (value: number | null | undefined, suffix = '') =>
    value === null || value === undefined ? '暂无' : `${value}${suffix}`;
  return {
    imageUrl: image.url,
    imageSource: image.source,
    displayName: registration.profile.nickname || registration.profile.realName || '未填写昵称',
    maskedName: registration.profile.realName || '实名信息未完善',
    bikeMode: registration.bikeMode || '未填写',
    experience: registration.experience || '未填写',
    remark: registration.remark || '无',
    stravaStatus: status.label,
    statusTone: status.tone,
    totalKm: metric(registration.strava.totalKm, ' km'),
    rides90d: metric(registration.strava.rides90d, ' 次'),
    longestKm: metric(registration.strava.longestKm, ' km'),
    elevationM: metric(registration.strava.elevationM, ' m'),
    speedKmh: metric(registration.strava.speedKmh, ' km/h'),
    syncedAt: registration.strava.syncedAt || '尚未同步',
  };
}
