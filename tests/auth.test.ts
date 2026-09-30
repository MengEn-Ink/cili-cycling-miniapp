import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthServiceError,
  authenticateWithCloud,
  parseAuthResponse,
} from '../miniprogram/services/auth-service';
import { AppStore } from '../miniprogram/store/app-store';

const fakeIdentity = {
  openid: 'openid-for-unit-test-only',
  role: 'admin' as const,
  isSuper: true,
};

function memoryStorage(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getStorageSync: vi.fn((key: string) => values.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => {
      values.set(key, value);
    }),
    removeStorageSync: vi.fn((key: string) => {
      values.delete(key);
    }),
    value(key: string) {
      return values.get(key);
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('云身份响应解析', () => {
  it('接受最小且一致的可信身份', () => {
    expect(parseAuthResponse({ result: fakeIdentity })).toEqual(fakeIdentity);
  });

  it.each([
    undefined,
    {},
    { result: null },
    { result: {} },
    { result: { openid: '', role: 'member', isSuper: false } },
    { result: { openid: 'x', role: 'owner', isSuper: false } },
    { result: { openid: 'x', role: 'member', isSuper: true } },
  ])('拒绝空或异常响应 %#', (response) => {
    expect(() => parseAuthResponse(response)).toThrow(AuthServiceError);
  });

  it('映射云端 openid 缺失错误', () => {
    expect(() =>
      parseAuthResponse({ result: { error: { code: 'AUTH_OPENID_MISSING' } } }),
    ).toThrowError('云端未取得微信身份，请从小程序内重试。');
  });
});

describe('云身份调用边界', () => {
  it('没有 wx.cloud 时返回 unavailable，且不生成 openid', async () => {
    await expect(authenticateWithCloud(undefined)).resolves.toEqual({
      status: 'unavailable',
      code: 'CLOUD_UNAVAILABLE',
      message: '当前环境不支持微信云开发，请在微信开发者工具或真机中重试。',
    });
  });

  it('始终调用 auth 且不向云函数传 openid', async () => {
    const callFunction = vi.fn().mockResolvedValue({ result: fakeIdentity });
    await expect(authenticateWithCloud({ callFunction })).resolves.toEqual({
      status: 'authenticated',
      identity: fakeIdentity,
    });
    expect(callFunction).toHaveBeenCalledWith({ name: 'auth' });
  });

  it('将未部署和普通调用失败映射为稳定错误', async () => {
    await expect(
      authenticateWithCloud({
        callFunction: vi.fn().mockRejectedValue({ errMsg: 'cloud function not found' }),
      }),
    ).resolves.toMatchObject({ status: 'error', code: 'FUNCTION_NOT_DEPLOYED' });
    await expect(
      authenticateWithCloud({ callFunction: vi.fn().mockRejectedValue(new Error('network')) }),
    ).resolves.toMatchObject({ status: 'error', code: 'CALL_FAILED' });
  });
});

describe('小程序身份启动', () => {
  it('持久提示读取异常时仍完成 cloud init 并发起远端认证', async () => {
    vi.resetModules();
    const callFunction = vi.fn().mockResolvedValue({ result: fakeIdentity });
    const cloud = { init: vi.fn(), callFunction };
    const getStorageSync = vi.fn(() => {
      throw new Error('storage read failed');
    });
    const setStorageSync = vi.fn();
    let application: { onLaunch(): void } | undefined;
    vi.stubGlobal('wx', {
      cloud,
      getStorageSync,
      setStorageSync,
      removeStorageSync: vi.fn(),
    });
    vi.stubGlobal('App', (definition: { onLaunch(): void }) => {
      application = definition;
    });
    await import('../miniprogram/app');

    expect(() => application?.onLaunch()).not.toThrow();
    await vi.waitFor(() => expect(callFunction).toHaveBeenCalledWith({ name: 'auth' }));
    await vi.waitFor(() =>
      expect(setStorageSync).toHaveBeenCalledWith(
        'ride-identity-hint',
        expect.objectContaining({ source: 'wechat_cloud' }),
      ),
    );

    expect(cloud.init).toHaveBeenCalledOnce();
    expect(getStorageSync).toHaveBeenCalledWith('ride-identity-hint');
  });

  it('近期已完成验证时跳过启动预热，进入受限页面前再按需校验', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T09:00:00.000Z'));
    const callFunction = vi.fn().mockResolvedValue({ result: fakeIdentity });
    const cloud = { init: vi.fn(), callFunction };
    const getStorageSync = vi.fn((key: string) =>
      key === 'ride-identity-hint'
        ? { source: 'wechat_cloud', verifiedAt: Date.parse('2026-09-30T01:30:00.000Z') }
        : undefined,
    );
    let application: { onLaunch(): void } | undefined;
    vi.stubGlobal('wx', {
      cloud,
      getStorageSync,
      setStorageSync: vi.fn(),
      removeStorageSync: vi.fn(),
    });
    vi.stubGlobal('App', (definition: { onLaunch(): void }) => {
      application = definition;
    });
    await import('../miniprogram/app');

    expect(() => application?.onLaunch()).not.toThrow();

    await Promise.resolve();
    expect(callFunction).not.toHaveBeenCalled();
    expect(cloud.init).toHaveBeenCalledOnce();
    expect(getStorageSync).toHaveBeenCalledWith('ride-identity-hint');
  });
});

describe('身份 store', () => {
  it('真实角色成功后不再允许开发态 storage 覆盖或切换', async () => {
    const storage = memoryStorage({ 'ride-role': 'member' });
    const store = new AppStore(storage, async () => ({
      status: 'authenticated',
      identity: fakeIdentity,
    }));
    store.bootstrap();
    await store.ensureIdentity();
    expect(store.role).toBe('admin');
    expect(store.canSwitchRole()).toBe(false);
    expect(() => store.switchRole('member')).toThrow('真实身份生效后不可切换角色');
    store.bootstrap();
    expect(store.role).toBe('admin');
  });

  it('cloud 不可用时不启用开发态角色且没有伪造身份', async () => {
    const store = new AppStore(memoryStorage({ 'ride-role': 'admin' }), authenticateWithCloud);
    store.bootstrap();
    await store.ensureIdentity(undefined);
    expect(store).toMatchObject({
      openid: null,
      role: 'member',
      isSuper: false,
      authStatus: 'unavailable',
    });
    expect(store.canSwitchRole()).toBe(false);
  });

  it('认证成功只持久化非特权微信身份提示，且新进程不会据此恢复权限', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T01:02:03.000Z'));
    const storage = memoryStorage();
    const store = new AppStore(storage, async () => ({
      status: 'authenticated',
      identity: fakeIdentity,
    }));

    await store.ensureIdentity();

    expect(storage.value('ride-identity-hint')).toEqual({
      source: 'wechat_cloud',
      verifiedAt: Date.parse('2026-09-30T01:02:03.000Z'),
    });
    expect(JSON.stringify(storage.value('ride-identity-hint'))).not.toMatch(
      /openid|role|isSuper|token/i,
    );

    const nextProcess = new AppStore(storage, vi.fn());
    nextProcess.bootstrap();
    expect(nextProcess).toMatchObject({
      openid: null,
      role: 'member',
      isSuper: false,
      authStatus: 'idle',
    });
  });

  it('五分钟 TTL 内复用当前进程的认证结果，过期后重新认证', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T00:00:00.000Z'));
    const authenticate = vi.fn().mockResolvedValue({
      status: 'authenticated',
      identity: fakeIdentity,
    });
    const store = new AppStore(memoryStorage(), authenticate);

    await store.ensureIdentity();
    vi.advanceTimersByTime(5 * 60_000 - 1);
    await store.ensureIdentity();
    expect(authenticate).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1);
    await store.ensureIdentity();
    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it('并发认证调用复用同一个 in-flight promise', async () => {
    const pending = deferred<{
      status: 'authenticated';
      identity: typeof fakeIdentity;
    }>();
    const authenticate = vi.fn().mockReturnValue(pending.promise);
    const store = new AppStore(memoryStorage(), authenticate);

    const first = store.ensureIdentity();
    const second = store.ensureIdentity();

    expect(second).toBe(first);
    expect(authenticate).toHaveBeenCalledOnce();
    pending.resolve({ status: 'authenticated', identity: fakeIdentity });
    await first;
  });

  it('force=true 绕过新鲜 TTL 并重新认证', async () => {
    const authenticate = vi.fn().mockResolvedValue({
      status: 'authenticated',
      identity: fakeIdentity,
    });
    const store = new AppStore(memoryStorage(), authenticate);

    await store.ensureIdentity();
    await store.ensureIdentity(undefined, true);

    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it('强制认证失败时清除当前进程的全部特权状态', async () => {
    const authenticate = vi
      .fn()
      .mockResolvedValueOnce({ status: 'authenticated', identity: fakeIdentity })
      .mockResolvedValueOnce({
        status: 'error',
        code: 'CALL_FAILED',
        message: '身份服务暂时不可用，请稍后重试。',
      });
    const store = new AppStore(memoryStorage(), authenticate);
    await store.ensureIdentity();

    await store.ensureIdentity(undefined, true);

    expect(store).toMatchObject({
      openid: null,
      role: 'member',
      isSuper: false,
      authStatus: 'error',
    });
  });

  it('身份提示写入失败不改变远端认证成功结果或 TTL', async () => {
    const storage = memoryStorage();
    storage.setStorageSync.mockImplementation(() => {
      throw new Error('storage quota exceeded');
    });
    const authenticate = vi.fn().mockResolvedValue({
      status: 'authenticated',
      identity: fakeIdentity,
    });
    const store = new AppStore(storage, authenticate);

    await expect(store.ensureIdentity()).resolves.toEqual({
      status: 'authenticated',
      identity: fakeIdentity,
    });
    await store.ensureIdentity();

    expect(authenticate).toHaveBeenCalledOnce();
    expect(store).toMatchObject({
      openid: fakeIdentity.openid,
      role: 'admin',
      isSuper: true,
      authStatus: 'authenticated',
      authError: '',
    });
  });

  it('bootstrap 删除旧 ride-role 且绝不据此恢复角色', () => {
    const storage = memoryStorage({ 'ride-role': 'admin' });
    const store = new AppStore(storage, vi.fn());

    store.bootstrap();

    expect(storage.removeStorageSync).toHaveBeenCalledWith('ride-role');
    expect(storage.value('ride-role')).toBeUndefined();
    expect(store).toMatchObject({ role: 'member', isSuper: false, openid: null });
  });

  it('bootstrap 忽略旧角色清理失败并继续保持 fail closed', () => {
    const storage = memoryStorage({
      'ride-role': 'admin',
      'ride-identity-hint': { source: 'wechat_cloud', verifiedAt: 123 },
    });
    storage.removeStorageSync.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const store = new AppStore(storage, vi.fn());

    expect(() => store.bootstrap()).not.toThrow();
    expect(storage.removeStorageSync).toHaveBeenCalledWith('ride-role');
    expect(store).toMatchObject({
      role: 'member',
      isSuper: false,
      openid: null,
      identityHint: { source: 'wechat_cloud', verifiedAt: 123 },
    });
  });

  it('bootstrap 读取身份提示失败时清空进程内旧提示', async () => {
    const storage = memoryStorage();
    const store = new AppStore(storage, async () => ({
      status: 'authenticated',
      identity: fakeIdentity,
    }));
    await store.ensureIdentity();
    storage.getStorageSync.mockImplementation(() => {
      throw new Error('storage read failed');
    });

    expect(() => store.bootstrap()).not.toThrow();
    expect(store.identityHint).toBeNull();
  });
});
