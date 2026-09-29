import type { StravaReadiness } from '../models';

export interface PollStravaReadinessOptions {
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export async function pollStravaReadiness(
  ensureReady: () => Promise<StravaReadiness>,
  options: PollStravaReadinessOptions = {},
): Promise<StravaReadiness> {
  const intervalMs = options.intervalMs ?? 1500;
  const timeoutMs = options.timeoutMs ?? 30000;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const startedAt = now();

  for (;;) {
    const readiness = await ensureReady();
    if (readiness.state !== 'syncing') return readiness;

    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) {
      return {
        ...readiness,
        state: 'failed',
        canRegister: false,
        error: {
          code: 'STRAVA_SYNC_TIMEOUT',
          message: '数据准备超时，请重试',
          retryable: true,
        },
      };
    }
    await sleep(Math.min(intervalMs, timeoutMs - elapsed));
  }
}

export function stravaReadinessMessage(readiness: StravaReadiness): string {
  switch (readiness.state) {
    case 'disconnected':
      return '尚未绑定 Strava';
    case 'authorizing':
      return '等待 Strava 授权完成';
    case 'syncing':
      return '正在准备近 90 天骑行数据';
    case 'ready':
      return 'Strava 数据已准备完成';
    case 'failed':
      return readiness.error?.message || 'Strava 数据准备失败，请重试';
  }
}
