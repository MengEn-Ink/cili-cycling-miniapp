import type { Registration } from '../models';

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

function maskRealName(realName: string) {
  const name = realName.trim();
  if (!name) return '实名信息未完善';
  if (name.includes('*')) return name;
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(1, name.length - 1))}`;
}

export function capabilityCard(registration: Registration) {
  const images = selectCapabilityImages(registration.profile);
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
  const coverage = registration.strava.coverage;
  const datePart = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
  };
  const coverageFrom = coverage ? datePart(coverage.from) : '';
  const coverageTo = coverage ? datePart(coverage.to) : '';
  const syncedDate = registration.strava.syncedAt
    ? new Date(registration.strava.syncedAt)
    : undefined;
  const syncedAt =
    syncedDate && Number.isFinite(syncedDate.getTime())
      ? `${syncedDate.toISOString().slice(0, 16).replace('T', ' ')} UTC`
      : '尚未同步';
  return {
    images,
    hasMultipleImages: images.length > 1,
    displayName: registration.profile.nickname || registration.profile.realName || '未填写昵称',
    maskedName: maskRealName(registration.profile.realName),
    experience: registration.experience || '未填写',
    remark: registration.remark || '无',
    stravaStatus: status.label,
    statusTone: status.tone,
    totalKm: metric(registration.strava.totalKm, ' km'),
    rides90d: metric(registration.strava.rides90d, ' 次'),
    longestKm: metric(registration.strava.longestKm, ' km'),
    elevationM: metric(registration.strava.elevationM, ' m'),
    speedKmh: metric(registration.strava.speedKmh, ' km/h'),
    coverageRange: coverageFrom && coverageTo ? `${coverageFrom} 至 ${coverageTo}` : '覆盖范围未知',
    coverageState: coverage
      ? coverage.complete
        ? '数据覆盖完整'
        : '数据覆盖不完整'
      : '完整性未知',
    syncedAt,
  };
}
