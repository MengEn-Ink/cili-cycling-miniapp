import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 通过 hoisted 占位，保证 vi.mock 工厂可以稳定引用同一批 spy。
const mocks = vi.hoisted(() => ({
  initializeCloud: vi.fn(),
  bootstrap: vi.fn(),
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/config/cloud-init', () => ({
  initializeCloud: mocks.initializeCloud,
}));
vi.mock('../miniprogram/store/app-store', () => ({
  appStore: { bootstrap: mocks.bootstrap, ensureIdentity: mocks.ensureIdentity },
}));

let appDefinition: any;

async function loadApp(wxApi: Record<string, unknown>) {
  vi.resetModules();
  vi.stubGlobal('App', (definition: unknown) => {
    appDefinition = definition;
  });
  vi.stubGlobal('wx', wxApi);
  await import('../miniprogram/app');
}

describe('小程序全局运行时兜底', () => {
  beforeEach(() => {
    mocks.initializeCloud.mockReturnValue('initialized');
    mocks.ensureIdentity.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('注册全局错误与未处理拒绝回调，并记录带前缀的诊断信息', async () => {
    const onError = vi.fn();
    const onUnhandledRejection = vi.fn();
    const cloud = { marker: 'cloud' };
    await loadApp({ onError, onUnhandledRejection, cloud });

    expect(appDefinition).toBeTruthy();
    appDefinition.onLaunch();

    expect(mocks.bootstrap).toHaveBeenCalledOnce();
    expect(mocks.initializeCloud).toHaveBeenCalledWith(cloud);
    expect(mocks.ensureIdentity).toHaveBeenCalledWith(cloud);
    expect(onError).toHaveBeenCalledOnce();
    expect(onUnhandledRejection).toHaveBeenCalledOnce();

    const handleError = onError.mock.calls[0][0] as (error: unknown) => void;
    const scriptError = new Error('页面脚本异常');
    handleError(scriptError);
    expect(console.error).toHaveBeenCalledWith('[此里运行时异常:error]', scriptError);

    const handleRejection = onUnhandledRejection.mock.calls[0][0] as (event: {
      reason?: unknown;
    }) => void;
    const reason = new Error('未处理的 Promise 拒绝');
    handleRejection({ reason });
    expect(console.error).toHaveBeenCalledWith('[此里运行时异常:unhandledrejection]', reason);

    // 回调事件缺少 reason 时回退记录整个事件对象，不抛出二次异常。
    handleRejection({});
    expect(console.error).toHaveBeenCalledWith('[此里运行时异常:unhandledrejection]', {});
  });

  it('基础库缺少错误监听 API 时，onLaunch 不抛错且照常初始化身份', async () => {
    const cloud = {};
    await loadApp({ cloud });

    expect(() => appDefinition.onLaunch()).not.toThrow();
    expect(mocks.bootstrap).toHaveBeenCalledOnce();
    expect(mocks.ensureIdentity).toHaveBeenCalled();
  });
});
