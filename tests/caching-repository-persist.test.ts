import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CachingRepository, REPOSITORY_OFFLINE_STALE_MS } from '../miniprogram/repositories/cached';
import {
  MemoryCacheStorage,
  REPO_CACHE_STORAGE_NAMESPACE,
  WxCacheStorage,
} from '../miniprogram/repositories/persistent';
import type { RideRepository } from '../miniprogram/repositories/types';

function makeInner() {
  return {
    listActivities: vi.fn(),
    listActivityPage: vi.fn(),
    getActivity: vi.fn(),
    getStravaStatus: vi.fn(),
    getStravaReadiness: vi.fn(),
    saveActivity: vi.fn(),
    cloneActivity: vi.fn(),
    deleteActivity: vi.fn(),
    saveRegistration: vi.fn(),
    updateRegistration: vi.fn(),
    cancelRegistration: vi.fn(),
    reviewRegistration: vi.fn(),
    checkInRegistration: vi.fn(),
    startStrava: vi.fn(),
    ensureStravaReady: vi.fn(),
    syncStrava: vi.fn(),
    cancelStravaAuthorization: vi.fn(),
    disconnectStrava: vi.fn(),
  } as unknown as RideRepository;
}

function seed(storage: MemoryCacheStorage, key: string, value: unknown, expiresAt: number) {
  storage.set(key, { value, expiresAt });
}

describe('CachingRepository 冷启动持久化', () => {
  let inner: ReturnType<typeof makeInner>;
  let storage: MemoryCacheStorage;
  let now: number;

  beforeEach(() => {
    inner = makeInner();
    storage = new MemoryCacheStorage();
    now = 1_000;
  });

  function build(ttlMs = 100, staleMs = REPOSITORY_OFFLINE_STALE_MS) {
    return new CachingRepository(inner, {
      storage,
      ttlMs,
      staleMs,
      now: () => now,
    });
  }

  it('首页可同步查看新鲜磁盘首屏缓存且不回源', () => {
    const cached = { items: [{ id: 'a' }], nextCursor: null, asOf: 'now' };
    seed(storage, 'act:page:future:', cached, 1_050);
    const repo = build();

    expect(repo.cacheControl.peekActivityPage('future')).toEqual(cached);
    expect(inner.listActivityPage).not.toHaveBeenCalled();
  });

  it('过期磁盘首屏缓存不会用于首页首帧', () => {
    seed(storage, 'act:page:future:', { items: [{ id: 'old' }] }, 999);
    const repo = build();

    expect(repo.cacheControl.peekActivityPage('future')).toBeUndefined();
  });

  it('冷启动命中新鲜持久化数据，直接复用且不回源', async () => {
    seed(storage, 'act:item:a', { id: 'a' }, 1_050);
    const repo = build();
    const value = await repo.getActivity('a');
    expect(value).toEqual({ id: 'a' });
    expect(inner.getActivity).not.toHaveBeenCalled();
    expect(repo.cacheControl.getMetrics().storageHits).toBe(1);
  });

  it('回源成功后写入持久化，新实例冷启动直接回读', async () => {
    vi.mocked(inner.getActivity).mockResolvedValue({ id: 'b' } as Awaited<
      ReturnType<RideRepository['getActivity']>
    >);
    const first = build(100);
    await first.getActivity('b');
    expect(first.cacheControl.getMetrics().originLoads).toBe(1);
    expect(first.cacheControl.getMetrics().storageWrites).toBe(1);

    const raw = storage.get<{ value: unknown; expiresAt: number }>('act:item:b');
    expect(raw?.value).toEqual({ id: 'b' });
    expect(raw?.expiresAt).toBe(1_100);

    const second = build(100);
    const cold = await second.getActivity('b');
    expect(cold).toEqual({ id: 'b' });
    expect(inner.getActivity).toHaveBeenCalledTimes(1); // 第二个实例没有再回源
  });

  it('冷启动恢复保留原始过期时刻，超过原始 TTL 后重新回源', async () => {
    seed(storage, 'act:item:a', { id: 'a' }, 1_050);
    const repo = build(100);
    await repo.getActivity('a'); // 冷启动命中
    now = 1_051; // 超过原始过期时刻
    vi.mocked(inner.getActivity).mockResolvedValue({ id: 'a2' } as Awaited<
      ReturnType<RideRepository['getActivity']>
    >);
    const refreshed = await repo.getActivity('a');
    expect(refreshed).toEqual({ id: 'a2' });
    expect(inner.getActivity).toHaveBeenCalledTimes(1);
  });

  it('弱网失败且数据在离线兜底窗口内时返回上次数据', async () => {
    // 已过期（1_050 < now 1_100），但仍在 5 分钟离线窗口内。
    seed(storage, 'act:item:a', { id: 'stale' }, 1_050);
    now = 1_100;
    vi.mocked(inner.getActivity).mockRejectedValue(new Error('网络不可用'));
    const repo = build(100, 5 * 60_000);
    const value = await repo.getActivity('a');
    expect(value).toEqual({ id: 'stale' });
    expect(repo.cacheControl.getMetrics().staleReads).toBe(1);
    expect(inner.getActivity).toHaveBeenCalledTimes(1);
  });

  it('在线时即使数据过期也强制回源，成功则展示新数据而非旧值', async () => {
    seed(storage, 'act:item:a', { id: 'old' }, 1_050);
    now = 1_100;
    vi.mocked(inner.getActivity).mockResolvedValue({ id: 'new' } as Awaited<
      ReturnType<RideRepository['getActivity']>
    >);
    const repo = build(100, 5 * 60_000);
    const value = await repo.getActivity('a');
    expect(value).toEqual({ id: 'new' });
    expect(repo.cacheControl.getMetrics().staleReads).toBe(0);
  });

  it('超出离线兜底窗口的网络失败继续抛错，不展示过旧数据', async () => {
    seed(storage, 'act:item:a', { id: 'old' }, 1_000);
    now = 1_000 + 5 * 60_000 + 1;
    vi.mocked(inner.getActivity).mockRejectedValue(new Error('离线'));
    const repo = build(100, 5 * 60_000);
    await expect(repo.getActivity('a')).rejects.toThrow('离线');
  });

  it('写入活动后失效活动持久化前缀，但保留 Strava 持久化', async () => {
    seed(storage, 'act:item:a', { id: 'a' }, 5_000);
    seed(storage, 'strava:status', { state: 'connected' }, 5_000);
    vi.mocked(inner.saveActivity).mockResolvedValue({ id: 'a' } as Awaited<
      ReturnType<RideRepository['saveActivity']>
    >);
    const repo = build();
    await repo.saveActivity({} as Parameters<RideRepository['saveActivity']>[0]);
    expect(storage.get('act:item:a')).toBeUndefined();
    expect(storage.get('strava:status')).toEqual({
      value: { state: 'connected' },
      expiresAt: 5_000,
    });
  });

  it('clear 清空全部持久化，并可重置指标', async () => {
    seed(storage, 'act:item:a', { id: 'a' }, 5_000);
    seed(storage, 'strava:status', { state: 'x' }, 5_000);
    const repo = build();
    await repo.getActivity('a');
    repo.cacheControl.clear();
    expect(storage.keys()).toHaveLength(0);
    repo.cacheControl.resetMetrics();
    expect(repo.cacheControl.getMetrics().storageHits).toBe(0);
  });

  it('持久化写入失败计入 storageErrors，但不影响返回值', async () => {
    const failingStorage: MemoryCacheStorage = new MemoryCacheStorage();
    vi.spyOn(failingStorage, 'set').mockReturnValue(false);
    vi.mocked(inner.getActivity).mockResolvedValue({ id: 'z' } as Awaited<
      ReturnType<RideRepository['getActivity']>
    >);
    const repo = new CachingRepository(inner, {
      storage: failingStorage,
      ttlMs: 100,
      now: () => now,
    });
    const value = await repo.getActivity('z');
    expect(value).toEqual({ id: 'z' });
    expect(repo.cacheControl.getMetrics().storageErrors).toBe(1);
    expect(repo.cacheControl.getMetrics().originLoads).toBe(1);
  });

  it('损坏的持久化内容被忽略并正常回源', async () => {
    storage.set('act:item:a', 'not-an-entry');
    vi.mocked(inner.getActivity).mockResolvedValue({ id: 'ok' } as Awaited<
      ReturnType<RideRepository['getActivity']>
    >);
    const repo = build();
    const value = await repo.getActivity('a');
    expect(value).toEqual({ id: 'ok' });
    expect(inner.getActivity).toHaveBeenCalledTimes(1);
  });
});

describe('WxCacheStorage 适配器', () => {
  function makeFakeWx() {
    const map = new Map<string, unknown>();
    const api = {
      getStorageSync: (key: string) => (map.has(key) ? map.get(key) : ''),
      setStorageSync: (key: string, value: unknown) => void map.set(key, value),
      removeStorageSync: (key: string) => void map.delete(key),
      getStorageInfoSync: () => ({ keys: [...map.keys()] }),
    };
    return { api, map };
  }

  it('写入、读取、删除往返，缺失键返回 undefined', () => {
    const { api } = makeFakeWx();
    const store = new WxCacheStorage(api);
    expect(store.get('a')).toBeUndefined();
    store.set('a', { value: 1 });
    expect(store.get('a')).toEqual({ value: 1 });
    store.remove('a');
    expect(store.get('a')).toBeUndefined();
  });

  it('键加版本化命名空间，keys 返回逻辑键', () => {
    const { api, map } = makeFakeWx();
    const store = new WxCacheStorage(api);
    store.set('act:item:a', 1);
    expect([...map.keys()]).toEqual([`${REPO_CACHE_STORAGE_NAMESPACE}act:item:a`]);
    expect(store.keys()).toEqual(['act:item:a']);
  });

  it('removePrefix 只清理指定逻辑前缀，clearAll 清理全部受管键', () => {
    const { api, map } = makeFakeWx();
    const store = new WxCacheStorage(api);
    store.set('act:item:a', 1);
    store.set('act:item:b', 2);
    store.set('strava:status', 3);
    map.set('unrelated-key', 9);

    store.removePrefix('act:item:a');
    expect(store.keys().sort()).toEqual(['act:item:b', 'strava:status']);

    store.clearAll();
    expect(store.keys()).toEqual([]);
    // 非本缓存命名空间的键不被清理。
    expect(map.get('unrelated-key')).toBe(9);
  });

  it('读取到空字符串视为缺失', () => {
    const { api, map } = makeFakeWx();
    map.set(`${REPO_CACHE_STORAGE_NAMESPACE}blank`, '');
    const store = new WxCacheStorage(api);
    expect(store.get('blank')).toBeUndefined();
  });
});
