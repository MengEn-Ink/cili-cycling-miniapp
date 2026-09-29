import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StravaReadiness, StravaReadinessState } from '../miniprogram/models';
import {
  pollStravaReadiness,
  stravaReadinessMessage,
} from '../miniprogram/services/strava-readiness-service';

const rideService = vi.hoisted(() => ({
  getStravaReadiness: vi.fn(),
  ensureStravaReady: vi.fn(),
  startStrava: vi.fn(),
  disconnectStrava: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

function readiness(state: StravaReadinessState): StravaReadiness {
  return {
    state,
    canRegister: state === 'ready',
    athleteName: state === 'ready' ? 'Rider' : null,
    snapshot: null,
    error:
      state === 'failed'
        ? { code: 'STRAVA_API_FAILED', message: 'Strava 暂时不可用', retryable: true }
        : null,
  };
}

describe('Strava readiness 轮询', () => {
  it('每 1.5 秒轮询直到 ready', async () => {
    const states = [readiness('syncing'), readiness('syncing'), readiness('ready')];
    const ensure = vi.fn(async () => states.shift()!);
    const sleep = vi.fn(async () => undefined);

    await expect(pollStravaReadiness(ensure, { sleep })).resolves.toEqual(readiness('ready'));
    expect(ensure).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 1500);
    expect(sleep).toHaveBeenNthCalledWith(2, 1500);
  });

  it('30 秒后以可重试错误停止', async () => {
    let elapsed = 0;
    const sleep = vi.fn(async (ms: number) => {
      elapsed += ms;
    });
    const ensure = vi.fn(async () => readiness('syncing'));

    const result = await pollStravaReadiness(ensure, { sleep, now: () => elapsed });

    expect(result).toMatchObject({
      state: 'failed',
      canRegister: false,
      error: {
        code: 'STRAVA_SYNC_TIMEOUT',
        message: '数据准备超时，请重试',
        retryable: true,
      },
    });
    expect(elapsed).toBe(30000);
    expect(ensure).toHaveBeenCalledTimes(21);
  });

  it.each(['ready', 'failed', 'disconnected', 'authorizing'] as const)(
    '立即返回终态 %s',
    async (state) => {
      const value = readiness(state);
      const ensure = vi.fn(async () => value);
      const sleep = vi.fn(async () => undefined);

      await expect(pollStravaReadiness(ensure, { sleep })).resolves.toBe(value);
      expect(ensure).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    },
  );
});

describe('Strava readiness 文案', () => {
  it.each([
    ['disconnected', '尚未绑定 Strava'],
    ['authorizing', '等待 Strava 授权完成'],
    ['syncing', '正在准备近 90 天骑行数据'],
    ['ready', 'Strava 数据已准备完成'],
    ['failed', 'Strava 暂时不可用'],
  ] as const)('%s 使用对应状态文案', (state, message) => {
    expect(stravaReadinessMessage(readiness(state))).toBe(message);
  });
});

describe('Strava 页面编排', () => {
  let page: any;
  let showModal: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    for (const value of Object.values(rideService)) value.mockReset();
    showModal = vi.fn();
    vi.stubGlobal('wx', {
      showModal,
      navigateTo: vi.fn(),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    });
    await import('../miniprogram/pages/strava/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('同步中自动 ensure 直到 ready', async () => {
    rideService.getStravaReadiness.mockResolvedValue(readiness('syncing'));
    rideService.ensureStravaReady.mockResolvedValue(readiness('ready'));

    await page.load();

    expect(rideService.getStravaReadiness).toHaveBeenCalledOnce();
    expect(rideService.ensureStravaReady).toHaveBeenCalledOnce();
    expect(page.data.readiness).toEqual(readiness('ready'));
    expect(page.data.readinessMessage).toBe('Strava 数据已准备完成');
  });

  it('busy 时忽略重复授权', async () => {
    page.data.busyAction = 'disconnect';

    await page.connect();

    expect(rideService.startStrava).not.toHaveBeenCalled();
  });

  it('解绑需确认，并在用户取消时不发请求', async () => {
    showModal.mockImplementation(({ success }: any) => success({ confirm: false }));

    await page.disconnect();

    expect(showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '确认解绑 Strava',
        content: '解绑后将无法提交新的活动报名，已提交记录不受影响。',
      }),
    );
    expect(rideService.disconnectStrava).not.toHaveBeenCalled();
    expect(page.data.busyAction).toBeNull();
  });
});
