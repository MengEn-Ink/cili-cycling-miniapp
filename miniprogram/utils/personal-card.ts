import type { PersonalCapabilityCard, PersonalCapabilityCardState } from '../models/index';
import { formatChinaDate, formatChinaDateTime } from './date-time';
import { genderView } from './gender';

export interface PersonalCardMetric {
  key: keyof PersonalCapabilityCard['summary'];
  label: string;
  value: string;
  unit: string;
}

const STATUS: Record<
  PersonalCapabilityCardState,
  { label: string; tone: 'verified' | 'partial' | 'syncing' | 'repair' }
> = {
  ready: { label: '已连接', tone: 'verified' },
  partial: { label: '数据不完整', tone: 'partial' },
  syncing: { label: '同步中', tone: 'syncing' },
  failed: { label: '需要重新授权', tone: 'repair' },
  disconnected: { label: '需要重新授权', tone: 'repair' },
};

const EMPTY_METRICS: Record<PersonalCapabilityCardState, string> = {
  ready: '暂无可展示的骑行指标',
  partial: '暂无可展示的骑行指标',
  syncing: 'Strava 数据同步中，请稍后查看',
  failed: 'Strava 数据同步失败，请前往修复',
  disconnected: '连接 Strava 后展示骑行指标',
};

const METRICS: {
  key: keyof PersonalCapabilityCard['summary'];
  label: string;
  unit: string;
}[] = [
  { key: 'totalKm90d', label: '近 90 天', unit: 'km' },
  { key: 'rides90d', label: '骑行次数', unit: '次' },
  { key: 'longestKm', label: '最长骑行', unit: 'km' },
  { key: 'elevationM90d', label: '累计爬升', unit: 'm' },
  { key: 'weightedAvgSpeedKmh', label: '加权均速', unit: 'km/h' },
];

function fullYearsBetween(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const monthDiff = to.getUTCMonth() - from.getUTCMonth();
  const dayDiff = to.getUTCDate() - from.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    years -= 1;
  }
  return years < 0 ? 0 : years;
}

export function personalCardViewModel(card: PersonalCapabilityCard) {
  const backgrounds = card.backgrounds.slice(0, 3);
  const metrics = METRICS.flatMap((definition): PersonalCardMetric[] => {
    const value = card.summary[definition.key];
    return typeof value === 'number' && Number.isFinite(value)
      ? [{ ...definition, value: String(value) }]
      : [];
  });
  const primaryMetrics = metrics.filter((metric) =>
    ['totalKm90d', 'rides90d', 'longestKm'].includes(metric.key),
  );
  const secondaryMetrics = metrics.filter((metric) =>
    ['elevationM90d', 'weightedAvgSpeedKmh'].includes(metric.key),
  );
  const recentMetrics = [...primaryMetrics, ...secondaryMetrics];
  const stravaJoinedAt = card.stravaJoinedAt ? new Date(card.stravaJoinedAt) : null;
  const stravaTenureYears =
    stravaJoinedAt && !Number.isNaN(stravaJoinedAt.getTime())
      ? fullYearsBetween(stravaJoinedAt, new Date(card.generatedAt))
      : null;
  const stravaTenureText =
    stravaTenureYears === null
      ? ''
      : stravaTenureYears === 0
        ? '加入 STRAVA 未满 1 年'
        : `加入 STRAVA ${stravaTenureYears} 年`;
  const state = STATUS[card.state];
  return {
    state: card.state,
    statusLabel: state.label,
    statusTone: state.tone,
    ...genderView(card.profile.gender),
    displayName: card.profile.displayName || '此里骑手',
    avatarUrl: card.profile.avatarUrl || '',
    backgrounds,
    hasBackgrounds: backgrounds.length > 0,
    hasMultipleBackgrounds: backgrounds.length > 1,
    metrics,
    primaryMetrics,
    secondaryMetrics,
    recentMetrics,
    emptyMetricsText: EMPTY_METRICS[card.state],
    coverageText: card.coverage
      ? `${formatChinaDate(card.coverage.from)} 至 ${formatChinaDate(card.coverage.to)} · ${
          card.coverage.complete ? '覆盖完整' : '覆盖不完整'
        }`
      : '',
    syncedAtText: card.syncedAt ? `同步于 ${formatChinaDateTime(card.syncedAt)}` : '',
    generatedAtText: `生成于 ${formatChinaDateTime(card.generatedAt)}`,
    stravaProfileUrl: card.stravaProfileUrl || '',
    hasStravaProfile: Boolean(card.stravaProfileUrl),
    stravaTenureText,
    hasStravaTenure: stravaTenureYears !== null,
    canSyncStrava:
      Boolean(card.stravaProfileUrl) &&
      card.state !== 'disconnected' &&
      card.state !== 'failed' &&
      !card.needsStravaReauth,
    needsStravaRepair:
      card.state === 'disconnected' || card.state === 'failed' || card.needsStravaReauth,
    needsProfilePhoto: backgrounds.length === 0,
    isOldStravaUser: card.needsStravaReauth,
  };
}
