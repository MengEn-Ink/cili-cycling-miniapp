// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StravaReadiness, StravaReadinessState } from '../miniprogram/models';
import {
  pollStravaAuthorization,
  pollStravaReadiness,
  stravaReadinessMessage,
} from '../miniprogram/services/strava-readiness-service';

const rideService = vi.hoisted(() => ({
  getStravaReadiness: vi.fn(),
  ensureStravaReady: vi.fn(),
  startStrava: vi.fn(),
  cancelStravaAuthorization: vi.fn(),
  disconnectStrava: vi.fn(),
}));

const invalidateProfilePageCache = vi.hoisted(() => vi.fn());

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/utils/profile-page-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../miniprogram/utils/profile-page-cache')>()),
  invalidateProfilePageCache,
}));

function readiness(state: StravaReadinessState): StravaReadiness {
  return {
    state,
    canRegister: state === 'ready',
    avatarAvailable: state === 'ready',
    athleteName: state === 'ready' ? 'Rider' : null,
    snapshot: null,
    error:
      state === 'failed'
        ? {
            code: 'STRAVA_API_FAILED',
            message: 'Strava 暂时不可用',
            retryable: true,
            recoveryAction: 'retry',
          }
        : null,
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe('Strava readiness 轮询', () => {
  afterEach(() => vi.useRealTimers());

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
    expect(ensure).toHaveBeenCalledTimes(20);
  });

  it('单次 ensure 一直不返回时仍受 30 秒总截止时间约束', async () => {
    vi.useFakeTimers();
    let resolveEnsure!: (value: StravaReadiness) => void;
    const ensure = vi.fn(
      () =>
        new Promise<StravaReadiness>((resolve) => {
          resolveEnsure = resolve;
        }),
    );

    let result: StravaReadiness | undefined;
    const pending = pollStravaReadiness(ensure).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(30000);
    await Promise.resolve();

    expect(result).toMatchObject({
      state: 'failed',
      canRegister: false,
      error: { code: 'STRAVA_SYNC_TIMEOUT', retryable: true },
    });

    resolveEnsure(readiness('ready'));
    await pending;
    expect(result).toMatchObject({ state: 'failed', error: { code: 'STRAVA_SYNC_TIMEOUT' } });
    expect(ensure).toHaveBeenCalledOnce();
  });

  it('取消后当前 ensure 返回即停止轮询', async () => {
    let cancelled = false;
    let resolveEnsure!: (value: StravaReadiness) => void;
    const ensure = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<StravaReadiness>((resolve) => {
            resolveEnsure = resolve;
          }),
      )
      .mockResolvedValueOnce(readiness('ready'));
    const sleep = vi.fn(async () => undefined);

    const pending = pollStravaReadiness(ensure, { sleep, isCancelled: () => cancelled });
    cancelled = true;
    resolveEnsure(readiness('syncing'));

    await expect(pending).resolves.toEqual(readiness('syncing'));
    expect(ensure).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
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

describe('Strava 浏览器授权恢复轮询', () => {
  it('返回微信后从 authorizing 轮询到 syncing', async () => {
    const states = [readiness('authorizing'), readiness('syncing')];
    const readStatus = vi.fn(async () => states.shift()!);
    const sleep = vi.fn(async () => undefined);

    await expect(pollStravaAuthorization(readStatus, { sleep })).resolves.toEqual(
      readiness('syncing'),
    );
    expect(readStatus).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1500);
  });

  it('首次 status 一直不返回时仍受 30 秒总截止时间约束', async () => {
    vi.useFakeTimers();
    const readStatus = vi.fn(() => new Promise<StravaReadiness>(() => undefined));

    let result: StravaReadiness | undefined;
    void pollStravaAuthorization(readStatus).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(30000);

    expect(result).toMatchObject({
      state: 'failed',
      error: { code: 'STRAVA_AUTH_STATUS_TIMEOUT', retryable: true },
    });
    expect(readStatus).toHaveBeenCalledOnce();
  });

  it('后续 status 一直不返回时也受同一总截止时间约束', async () => {
    vi.useFakeTimers();
    const readStatus = vi
      .fn()
      .mockResolvedValueOnce(readiness('authorizing'))
      .mockImplementationOnce(() => new Promise<StravaReadiness>(() => undefined));

    let result: StravaReadiness | undefined;
    void pollStravaAuthorization(readStatus).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(30000);

    expect(result).toMatchObject({
      state: 'failed',
      error: { code: 'STRAVA_AUTH_STATUS_TIMEOUT', retryable: true },
    });
    expect(readStatus).toHaveBeenCalledTimes(2);
  });
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
    invalidateProfilePageCache.mockReset();
    showModal = vi.fn();
    vi.stubGlobal('wx', {
      showModal,
      setClipboardData: vi.fn(({ success }: any) => success()),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    });
    await import('../miniprogram/pages/strava/index');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('从路线权限提示进入时提供重新授权入口', () => {
    page.onLoad({ reauthorize: '1' });
    expect(page.data.reauthorize).toBe(true);
    expect(readFileSync('miniprogram/pages/strava/index.wxml', 'utf8')).toContain(
      '重新授权路线读取权限',
    );
  });

  it('同步中自动 ensure 直到 ready', async () => {
    rideService.getStravaReadiness.mockResolvedValue(readiness('syncing'));
    rideService.ensureStravaReady.mockResolvedValue(readiness('ready'));

    await page.load();

    expect(rideService.getStravaReadiness).toHaveBeenCalledOnce();
    expect(rideService.ensureStravaReady).toHaveBeenCalledOnce();
    expect(page.data.readiness).toEqual(readiness('ready'));
    expect(page.data.readinessMessage).toBe('Strava 数据已准备完成');
    expect(invalidateProfilePageCache).toHaveBeenCalledOnce();
  });

  it('重复 onShow 时忽略较早请求的迟到结果', async () => {
    let resolveFirst!: (value: StravaReadiness) => void;
    rideService.getStravaReadiness
      .mockImplementationOnce(
        () =>
          new Promise<StravaReadiness>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(readiness('ready'));

    page.onShow();
    page.onShow();
    await flushMicrotasks();
    expect(page.data.readiness).toEqual(readiness('ready'));

    resolveFirst(readiness('disconnected'));
    await flushMicrotasks();
    expect(page.data.readiness).toEqual(readiness('ready'));
  });

  it.each(['onHide', 'onUnload'] as const)('%s 后忽略在途请求结果', async (lifecycle) => {
    let resolveReadiness!: (value: StravaReadiness) => void;
    rideService.getStravaReadiness.mockImplementationOnce(
      () =>
        new Promise<StravaReadiness>((resolve) => {
          resolveReadiness = resolve;
        }),
    );
    const setData = vi.spyOn(page, 'setData');

    page.onShow();
    page[lifecycle]?.();
    setData.mockClear();
    resolveReadiness(readiness('ready'));
    await flushMicrotasks();

    expect(setData).not.toHaveBeenCalled();
  });

  it.each(['onHide', 'onUnload'] as const)(
    '%s 后当前 ensure 返回 syncing 时不再发起下一轮',
    async (lifecycle) => {
      vi.useFakeTimers();
      let resolveEnsure!: (value: StravaReadiness) => void;
      rideService.getStravaReadiness.mockResolvedValue(readiness('syncing'));
      rideService.ensureStravaReady
        .mockImplementationOnce(
          () =>
            new Promise<StravaReadiness>((resolve) => {
              resolveEnsure = resolve;
            }),
        )
        .mockResolvedValueOnce(readiness('ready'));

      page.onShow();
      await flushMicrotasks();
      expect(rideService.ensureStravaReady).toHaveBeenCalledOnce();

      page[lifecycle]();
      resolveEnsure(readiness('syncing'));
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(1500);

      expect(rideService.ensureStravaReady).toHaveBeenCalledOnce();
    },
  );

  it('新的 onShow 使手动 retry 失效且不接受其迟到结果', async () => {
    vi.useFakeTimers();
    let resolveRetry!: (value: StravaReadiness) => void;
    rideService.ensureStravaReady
      .mockImplementationOnce(
        () =>
          new Promise<StravaReadiness>((resolve) => {
            resolveRetry = resolve;
          }),
      )
      .mockResolvedValueOnce(readiness('disconnected'));
    rideService.getStravaReadiness.mockResolvedValue(readiness('ready'));

    const retry = page.retry();
    await flushMicrotasks();
    page.onShow();
    await flushMicrotasks();
    expect(page.data.readiness).toEqual(readiness('ready'));
    expect(page.data.busyAction).toBeNull();

    resolveRetry(readiness('syncing'));
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1500);
    await retry;
    expect(page.data.readiness).toEqual(readiness('ready'));
    expect(rideService.ensureStravaReady).toHaveBeenCalledOnce();
  });

  it.each(['onHide', 'onUnload'] as const)('%s 后手动 retry 不再 setData', async (lifecycle) => {
    vi.useFakeTimers();
    let resolveRetry!: (value: StravaReadiness) => void;
    rideService.ensureStravaReady
      .mockImplementationOnce(
        () =>
          new Promise<StravaReadiness>((resolve) => {
            resolveRetry = resolve;
          }),
      )
      .mockResolvedValueOnce(readiness('ready'));
    const setData = vi.spyOn(page, 'setData');

    const retry = page.retry();
    await flushMicrotasks();
    page[lifecycle]();
    setData.mockClear();
    resolveRetry(readiness('syncing'));
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1500);
    await retry;

    expect(setData).not.toHaveBeenCalled();
    expect(rideService.ensureStravaReady).toHaveBeenCalledOnce();
  });

  it('复制成功并确认后明确进入等待授权状态', async () => {
    const authorizationUrl = 'https://www.strava.com/oauth/authorize?state=once';
    page.data.readiness = readiness('disconnected');
    rideService.startStrava.mockResolvedValue({ authorizationUrl, expiresAt: 'soon' });
    showModal.mockImplementation(({ success }: any) => success({ confirm: true }));

    await page.connect();

    expect(wx.setClipboardData).toHaveBeenCalledWith(
      expect.objectContaining({ data: authorizationUrl }),
    );
    expect(page.data.readiness.state).toBe('authorizing');
    expect(page.data.error).toBe('');
    expect(invalidateProfilePageCache).toHaveBeenCalledOnce();
  });

  it('复制失败时保留明确错误且不伪装授权成功', async () => {
    rideService.startStrava.mockResolvedValue({
      authorizationUrl: 'https://www.strava.com/oauth/authorize?state=once',
      expiresAt: 'soon',
    });
    vi.mocked(wx.setClipboardData).mockImplementation(({ fail }: any) => fail(new Error('no')));

    await page.connect();

    expect(page.data.readiness).toBeNull();
    expect(page.data.error).toContain('复制失败');
    expect(showModal).not.toHaveBeenCalled();
  });

  it('用户取消浏览器引导时撤销服务端 state 并恢复未连接状态', async () => {
    rideService.startStrava.mockResolvedValue({
      authorizationUrl: 'https://www.strava.com/oauth/authorize?state=once',
      expiresAt: 'soon',
    });
    showModal.mockImplementation(({ success }: any) => success({ confirm: false }));
    rideService.cancelStravaAuthorization.mockResolvedValue(undefined);

    await page.connect();

    expect(rideService.cancelStravaAuthorization).toHaveBeenCalledOnce();
    expect(invalidateProfilePageCache).toHaveBeenCalledTimes(2);
    expect(page.data.readiness).toMatchObject({ state: 'disconnected', canRegister: false });
    expect(page.data.error).toContain('已取消浏览器授权');
  });

  it.each(['onHide', 'onUnload'] as const)(
    'startStrava 返回前 %s，之后不复制、不弹窗、不 setData',
    async (lifecycle) => {
      let resolveStart!: (value: { authorizationUrl: string; expiresAt: string }) => void;
      rideService.startStrava.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStart = resolve;
          }),
      );
      showModal.mockImplementation(({ success }: any) => success({ confirm: true }));
      const setData = vi.spyOn(page, 'setData');

      const connect = page.connect();
      await flushMicrotasks();
      page[lifecycle]();
      setData.mockClear();
      resolveStart({
        authorizationUrl: 'https://www.strava.com/oauth/authorize',
        expiresAt: 'soon',
      });
      await connect;

      expect(wx.setClipboardData).not.toHaveBeenCalled();
      expect(showModal).not.toHaveBeenCalled();
      expect(setData).not.toHaveBeenCalled();
    },
  );

  it('复制完成前离页，之后不弹窗、不 setData', async () => {
    let resolveCopy!: () => void;
    rideService.startStrava.mockResolvedValue({
      authorizationUrl: 'https://www.strava.com/oauth/authorize',
      expiresAt: 'soon',
    });
    vi.mocked(wx.setClipboardData).mockImplementation(({ success }: any) => {
      resolveCopy = success;
    });
    showModal.mockImplementation(({ success }: any) => success({ confirm: true }));
    const setData = vi.spyOn(page, 'setData');

    const connect = page.connect();
    await flushMicrotasks();
    page.onHide();
    setData.mockClear();
    resolveCopy();
    await connect;

    expect(showModal).not.toHaveBeenCalled();
    expect(setData).not.toHaveBeenCalled();
  });

  it('浏览器引导回调前离页，之后不撤销 state、不 setData', async () => {
    let resolveGuide!: (result: { confirm: boolean }) => void;
    rideService.startStrava.mockResolvedValue({
      authorizationUrl: 'https://www.strava.com/oauth/authorize',
      expiresAt: 'soon',
    });
    showModal.mockImplementation(({ success }: any) => {
      resolveGuide = success;
    });
    const setData = vi.spyOn(page, 'setData');

    const connect = page.connect();
    await flushMicrotasks();
    page.onHide();
    setData.mockClear();
    resolveGuide({ confirm: false });
    await connect;

    expect(rideService.cancelStravaAuthorization).not.toHaveBeenCalled();
    expect(setData).not.toHaveBeenCalled();
  });

  it('新 load 代际使迟到的 startStrava 结果失效', async () => {
    let resolveStart!: (value: { authorizationUrl: string; expiresAt: string }) => void;
    rideService.startStrava.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );
    rideService.getStravaReadiness.mockResolvedValue(readiness('ready'));
    showModal.mockImplementation(({ success }: any) => success({ confirm: true }));

    const connect = page.connect();
    await flushMicrotasks();
    await page.load();
    vi.mocked(wx.setClipboardData).mockClear();
    showModal.mockClear();
    resolveStart({ authorizationUrl: 'https://www.strava.com/oauth/authorize', expiresAt: 'soon' });
    await connect;

    expect(wx.setClipboardData).not.toHaveBeenCalled();
    expect(showModal).not.toHaveBeenCalled();
    expect(page.data.readiness).toEqual(readiness('ready'));
  });

  it('modal 晚回调绝不覆盖 onShow 已恢复的较新 ready 状态', async () => {
    let resolveGuide!: (result: { confirm: boolean }) => void;
    page.data.readiness = readiness('disconnected');
    rideService.startStrava.mockResolvedValue({
      authorizationUrl: 'https://www.strava.com/oauth/authorize?state=once',
      expiresAt: 'soon',
    });
    showModal.mockImplementation(({ success }: any) => {
      resolveGuide = success;
    });

    const connect = page.connect();
    await flushMicrotasks();
    expect(showModal).toHaveBeenCalledOnce();

    rideService.getStravaReadiness.mockResolvedValue(readiness('ready'));
    await page.load();
    expect(page.data.readiness).toEqual(readiness('ready'));

    resolveGuide({ confirm: true });
    await connect;

    expect(page.data.readiness).toEqual(readiness('ready'));
    expect(page.data.readinessMessage).toBe('Strava 数据已准备完成');
  });

  it('onShow 从 authorizing 恢复并自动准备到 ready', async () => {
    rideService.getStravaReadiness
      .mockResolvedValueOnce(readiness('authorizing'))
      .mockResolvedValueOnce(readiness('syncing'));
    rideService.ensureStravaReady.mockResolvedValue(readiness('ready'));

    await page.load();

    expect(rideService.getStravaReadiness).toHaveBeenCalledTimes(2);
    expect(rideService.ensureStravaReady).toHaveBeenCalledOnce();
    expect(page.data.readiness).toEqual(readiness('ready'));
  });

  it('授权轮询超时结果保持 failed，不再调用 ensureReady 覆盖', async () => {
    vi.useFakeTimers();
    rideService.getStravaReadiness
      .mockResolvedValueOnce(readiness('authorizing'))
      .mockImplementationOnce(() => new Promise<StravaReadiness>(() => undefined));
    rideService.ensureStravaReady.mockResolvedValue(readiness('authorizing'));

    const load = page.load();
    await vi.advanceTimersByTimeAsync(30000);
    await load;

    expect(rideService.ensureStravaReady).not.toHaveBeenCalled();
    expect(page.data.readiness).toMatchObject({
      state: 'failed',
      error: { code: 'STRAVA_AUTH_STATUS_TIMEOUT' },
    });
  });

  it('重试成功后失效个人中心缓存', async () => {
    rideService.ensureStravaReady.mockResolvedValue(readiness('ready'));

    await page.retry();

    expect(invalidateProfilePageCache).toHaveBeenCalledOnce();
    expect(page.data.readiness).toEqual(readiness('ready'));
  });

  it('解绑成功后失效个人中心缓存', async () => {
    showModal.mockImplementation(({ success }: any) => success({ confirm: true }));
    rideService.disconnectStrava.mockResolvedValue(undefined);

    await page.disconnect();

    expect(invalidateProfilePageCache).toHaveBeenCalledOnce();
    expect(page.data.readiness).toMatchObject({ state: 'disconnected' });
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
        content:
          '这只会断开此里并清理本地 Strava 数据，不会撤销 Strava 网站中的外部授权；已提交记录不受影响。',
      }),
    );
    expect(rideService.disconnectStrava).not.toHaveBeenCalled();
    expect(page.data.busyAction).toBeNull();
  });
});

describe('Strava failed recovery action', () => {
  it('非 retry 失败不会自动同步或被手动 retry 绕过', async () => {
    let page: any;
    vi.resetModules();
    for (const value of Object.values(rideService)) value.mockReset();
    vi.stubGlobal('wx', { showModal: vi.fn(), setClipboardData: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    });
    await import('../miniprogram/pages/strava/index');
    const failed = readiness('failed');
    failed.error = {
      code: 'STRAVA_SCOPE_REQUIRED',
      message: 'Strava 授权范围不足，请重新授权',
      retryable: false,
      recoveryAction: 'reauthorize',
    };
    rideService.getStravaReadiness.mockResolvedValue(failed);

    await page.load();
    await page.retry();

    expect(page.data.readiness).toEqual(failed);
    expect(rideService.ensureStravaReady).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
