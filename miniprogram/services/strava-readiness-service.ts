import type { StravaReadiness } from '../models';

export interface PollStravaReadinessOptions {
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  isCancelled?: () => boolean;
}

const timeout = Symbol('strava-readiness-timeout');

function timeoutReadiness(previous?: StravaReadiness): StravaReadiness {
  return {
    ...previous,
    state: 'failed',
    canRegister: false,
    athleteName: previous?.athleteName ?? null,
    snapshot: previous?.snapshot ?? null,
    error: {
      code: 'STRAVA_SYNC_TIMEOUT',
      message: '数据准备超时，请重试',
      retryable: true,
    },
  };
}

async function waitUntilDeadline<T>(
  task: Promise<T>,
  remainingMs: number,
): Promise<T | typeof timeout> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof timeout>((resolve) => {
    timeoutId = setTimeout(() => resolve(timeout), remainingMs);
  });
  try {
    return await Promise.race([task, deadline]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
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
  const isCancelled = options.isCancelled ?? (() => false);
  const startedAt = now();
  let previous: StravaReadiness | undefined;

  for (;;) {
    if (previous && isCancelled()) return previous;
    const remainingMs = timeoutMs - (now() - startedAt);
    if (remainingMs <= 0) return timeoutReadiness(previous);

    const readiness = await waitUntilDeadline(ensureReady(), remainingMs);
    if (readiness === timeout) return timeoutReadiness(previous);
    previous = readiness;
    if (isCancelled() || readiness.state !== 'syncing') return readiness;

    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) return timeoutReadiness(readiness);
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
