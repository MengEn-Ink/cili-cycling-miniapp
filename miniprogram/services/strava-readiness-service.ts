import type { StravaReadiness, StravaSnapshot } from '../models';

export interface PollStravaReadinessOptions {
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  isCancelled?: () => boolean;
}

export interface StravaSnapshotMeta {
  coverageText: string;
  syncedAtText: string;
  coverageComplete: boolean | null;
}

function shortDate(value: string): string {
  return value.slice(0, 10);
}

function shortDateTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}

export function stravaSnapshotMeta(snapshot: StravaSnapshot | null): StravaSnapshotMeta {
  if (!snapshot) {
    return {
      coverageText: '近 90 天覆盖范围未知',
      syncedAtText: '尚无同步时间',
      coverageComplete: null,
    };
  }
  const coverage = snapshot.coverage;
  return {
    coverageText: coverage
      ? `${shortDate(coverage.from)} 至 ${shortDate(coverage.to)} · ${coverage.complete ? '已完整覆盖' : '数据可能不完整'}`
      : '近 90 天覆盖范围未知',
    syncedAtText: `同步于 ${shortDateTime(snapshot.syncedAt)}`,
    coverageComplete: coverage?.complete ?? null,
  };
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

function authorizationTimeoutReadiness(previous?: StravaReadiness): StravaReadiness {
  return {
    ...previous,
    state: 'failed',
    canRegister: false,
    athleteName: previous?.athleteName ?? null,
    snapshot: previous?.snapshot ?? null,
    error: {
      code: 'STRAVA_AUTH_STATUS_TIMEOUT',
      message: '授权状态检查超时，请返回后重试',
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

export async function pollStravaAuthorization(
  readStatus: () => Promise<StravaReadiness>,
  options: PollStravaReadinessOptions = {},
): Promise<StravaReadiness> {
  const intervalMs = options.intervalMs ?? 1500;
  const timeoutMs = options.timeoutMs ?? 30000;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const isCancelled = options.isCancelled ?? (() => false);
  const startedAt = now();
  let readiness: StravaReadiness | undefined;

  // 用户从系统浏览器返回微信时没有可靠回调事件，只能在页面可见期间轮询服务端状态。
  for (;;) {
    if (readiness && isCancelled()) return readiness;
    const remainingMs = timeoutMs - (now() - startedAt);
    if (remainingMs <= 0) return authorizationTimeoutReadiness(readiness);
    const next = await waitUntilDeadline(readStatus(), remainingMs);
    if (next === timeout) return authorizationTimeoutReadiness(readiness);
    readiness = next;
    if (isCancelled() || readiness.state !== 'authorizing') return readiness;

    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) return authorizationTimeoutReadiness(readiness);
    const waited = await waitUntilDeadline(
      sleep(Math.min(intervalMs, timeoutMs - elapsed)),
      timeoutMs - elapsed,
    );
    if (waited === timeout) return authorizationTimeoutReadiness(readiness);
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
