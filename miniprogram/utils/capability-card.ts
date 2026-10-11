import type { Registration } from '../models';
import { formatChinaDateOnly, formatChinaDateTime } from './date-time';
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
  const metricItem = (
    key: string,
    label: string,
    value: number | null | undefined,
    unit: string,
  ) => ({
    key,
    label,
    value: value === null || value === undefined ? '暂无' : String(value),
    unit: value === null || value === undefined ? '' : unit,
  });
  const lifetimeMetrics = [
    metricItem('lifetimeRides', '骑行次数', registration.strava.lifetimeRides, '次'),
    metricItem('lifetimeDistanceKm', '累计里程', registration.strava.lifetimeDistanceKm, 'km'),
    metricItem('lifetimeMovingHours', '运动时长', registration.strava.lifetimeMovingHours, 'h'),
    metricItem('lifetimeElevationM', '累计爬升', registration.strava.lifetimeElevationM, 'm'),
  ];
  const recentMetrics = [
    metricItem('totalKm', '骑行里程', registration.strava.totalKm, 'km'),
    metricItem('rides90d', '骑行次数', registration.strava.rides90d, '次'),
    metricItem('longestKm', '最长骑行', registration.strava.longestKm, 'km'),
    metricItem('elevationM', '累计爬升', registration.strava.elevationM, 'm'),
    metricItem('speedKmh', '加权均速', registration.strava.speedKmh, 'km/h'),
  ];
  const coverage = registration.strava.coverage;
  const datePart = (value: string) => formatChinaDateOnly(value);
  const coverageFrom = coverage ? datePart(coverage.from) : '';
  const coverageTo = coverage ? datePart(coverage.to) : '';
  const syncedAt = formatChinaDateTime(registration.strava.syncedAt || undefined) || '尚未同步';
  return {
    ...genderView(registration.profile.gender),
    images,
    hasMultipleImages: images.length > 1,
    displayName: registration.profile.nickname || registration.profile.realName || '未填写昵称',
    maskedName: maskRealName(registration.profile.realName),
    experience: registration.experience || '未填写',
    remark: registration.remark || '无',
    stravaStatus: status.label,
    statusTone: status.tone,
    lifetimeMetrics,
    recentMetrics,
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
