import { describe, expect, it, vi } from 'vitest';
import { AppStore } from '../miniprogram/store/app-store';
import type { AuthAttempt } from '../miniprogram/services/auth-service';

const HOUR = 60 * 60 * 1000;
const CACHE_KEY = 'ride-identity-v1';
const identity = { openid: 'openid-1', role: 'member' as const, isSuper: false };

function successAttempt(): AuthAttempt {
  return { status: 'authenticated', identity: { ...identity } };
}

function errorAttempt(): AuthAttempt {
  return { status: 'error', code: 'CALL_FAILED', message: '失败' };
}

interface Harness {
  map: Map<string, unknown>;
  current: number;
  advance: (ms: number) => void;
  newStore: (authenticate?: () => Promise<AuthAttempt>) => {
    store: AppStore;
    authenticate: ReturnType<typeof vi.fn>;
  };
}

function harness(startNow = 10 * 24 * HOUR): Harness {
  const map = new Map<string, unknown>();
  const h: Harness = {
    map,
    current: startNow,
    advance(ms) {
      h.current += ms;
    },
    newStore(authenticateImpl) {
      const storage = {
        getStorageSync: (key: string) => map.get(key),
        setStorageSync: (key: string, value: unknown) => void map.set(key, value),
      };
      const authenticate = vi.fn(authenticateImpl ?? (async () => successAttempt()));
      const store = new AppStore(storage, authenticate, () => h.current);
      return { store, authenticate };
    },
  };
  return h;
}

describe('AppStore 已授权身份持久化', () => {
  it('首次认证成功后将身份写入本地缓存', async () => {
    const h = harness();
    const { store, authenticate } = h.newStore();
    const attempt = await store.refreshIdentity();
    expect(attempt.status).toBe('authenticated');
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(h.map.get(CACHE_KEY)).toEqual({
      ...identity,
      saved_at: 240 * HOUR,
    });
  });

  it('24 小时内重进小程序直接恢复缓存，不调用云端', async () => {
    const h = harness();
    await h.newStore().store.refreshIdentity();
    h.advance(23 * HOUR);
    // 模拟冷启动：全新的 AppStore，但保留本地存储
    const { store, authenticate } = h.newStore();
    const attempt = await store.refreshIdentity();
    expect(attempt.status).toBe('authenticated');
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('同会话内再次刷新命中内存身份，零网络', async () => {
    const h = harness();
    const { store, authenticate } = h.newStore();
    await store.refreshIdentity();
    await store.refreshIdentity();
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('缓存过期后重新向云端获取并更新缓存', async () => {
    const h = harness();
    h.map.set(CACHE_KEY, { ...identity, saved_at: 0 });
    const { store, authenticate } = h.newStore();
    h.advance(25 * HOUR);
    const attempt = await store.refreshIdentity();
    expect(attempt.status).toBe('authenticated');
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(h.map.get(CACHE_KEY)).toEqual({ ...identity, saved_at: 265 * HOUR });
  });

  it('手动强制刷新跳过内存身份与本地缓存', async () => {
    const h = harness();
    const { store, authenticate } = h.newStore();
    await store.refreshIdentity();
    const forced = await store.refreshIdentity(undefined, true);
    expect(forced.status).toBe('authenticated');
    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it('云端失败但存在过期缓存时沿用旧身份', async () => {
    const h = harness();
    h.map.set(CACHE_KEY, { ...identity, saved_at: 0 });
    const { store } = h.newStore(async () => errorAttempt());
    h.advance(48 * HOUR);
    const attempt = await store.refreshIdentity();
    expect(attempt.status).toBe('authenticated');
    if (attempt.status === 'authenticated') {
      expect(attempt.identity.openid).toBe('openid-1');
    }
    expect(store.authStatus).toBe('authenticated');
  });

  it('云端失败且无可用缓存时返回错误状态', async () => {
    const h = harness();
    const { store } = h.newStore(async () => errorAttempt());
    const attempt = await store.refreshIdentity();
    expect(attempt.status).toBe('error');
    expect(store.authStatus).toBe('error');
  });

  it('语义非法的缓存被忽略并走云端', async () => {
    const h = harness();
    h.map.set(CACHE_KEY, {
      openid: 'x',
      role: 'member',
      isSuper: true, // member 不允许 isSuper
      saved_at: 0,
    });
    const { store, authenticate } = h.newStore();
    const attempt = await store.refreshIdentity();
    expect(attempt.status).toBe('authenticated');
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('结构损坏的缓存被忽略并走云端', async () => {
    const h = harness();
    h.map.set(CACHE_KEY, 'not-an-object');
    const { store, authenticate } = h.newStore();
    const attempt = await store.refreshIdentity();
    expect(attempt.status).toBe('authenticated');
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('并发调用只触发一次云端认证', async () => {
    const h = harness();
    const { store, authenticate } = h.newStore();
    const [a, b] = await Promise.all([store.refreshIdentity(), store.refreshIdentity()]);
    expect(a.status).toBe('authenticated');
    expect(b.status).toBe('authenticated');
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
});
