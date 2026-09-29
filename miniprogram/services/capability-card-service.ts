import type { StravaReadinessState } from '../models';
import type { RideRepository } from '../repositories/types';

const STATUS: Record<StravaReadinessState, { title: string; detail: string; action: string }> = {
  disconnected: {
    title: '尚未授权 Strava',
    detail: '授权后生成你的近 90 天骑行快照',
    action: '去授权 Strava',
  },
  authorizing: {
    title: '等待完成授权',
    detail: '请在系统浏览器完成授权，返回后刷新',
    action: '查看授权进度',
  },
  syncing: { title: '正在生成骑行快照', detail: '后台同步中，稍后刷新即可', action: '刷新状态' },
  failed: { title: '快照生成失败', detail: '可前往 Strava 页面重试同步', action: '去重试' },
  ready: {
    title: 'Strava 数据已就绪',
    detail: '下列指标来自最近 90 天汇总',
    action: '管理 Strava',
  },
};

function dateLabel(value: string | null): string {
  if (!value) return '未获取';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '未获取';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function loadCapabilityCard(repository: RideRepository) {
  const card = await repository.getCapabilityCard();
  const status = STATUS[card.readiness.state];
  return {
    ...card,
    status: {
      ...status,
      detail: card.readiness.error?.message || status.detail,
    },
    latestActivityLabel: dateLabel(card.metrics?.latestActivityAt || null),
    syncedAtLabel: dateLabel(card.metrics?.syncedAt || null),
  };
}

export type CapabilityCardView = Awaited<ReturnType<typeof loadCapabilityCard>>;
