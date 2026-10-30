/**
 * 只读仓储缓存的持久化后端。
 *
 * 设计目标：让“冷启动”（小程序重新打开、内存缓存已清空）在缓存 TTL 内仍能复用上次结果，
 * 并在弱网/断网时提供有严格时间边界的兜底数据。持久化失败必须静默降级，绝不影响页面主流程。
 */

/** 逻辑缓存键到持久化介质的最小接口，便于在测试中以内存实现替换微信存储。 */
export interface CacheStorage {
  /** 读取一个逻辑键；不存在、已损坏或读取失败时返回 undefined。 */
  get<T>(logicalKey: string): T | undefined;
  /** 写入一个逻辑键；返回是否持久化成功，失败由上层计入可观测指标但不阻断业务。 */
  set(logicalKey: string, value: unknown): boolean;
  /** 删除一个逻辑键，缺失或失败均静默。 */
  remove(logicalKey: string): void;
  /** 删除某个逻辑前缀（失效命名空间）下的全部键。 */
  removePrefix(logicalPrefix: string): void;
  /** 删除由本缓存管理的全部键。 */
  clearAll(): void;
  /** 返回当前受管逻辑键列表。 */
  keys(): string[];
}

/**
 * 持久化命名空间带版本号：缓存结构升级时整体作废旧数据，避免反序列化到不兼容结构。
 * v3：本人资料改为完整回显实名与电话，作废 v2 中残留的打星号资料快照。
 */
export const REPO_CACHE_STORAGE_NAMESPACE = 'cili-repo-cache-v3:';

interface WxStorageSyncApi {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  getStorageInfoSync(): { keys: string[] };
}

/** 在非小程序环境（或宿主缺少同步存储能力）返回 undefined，保证创建期可安全探测。 */
export function getWxStorageSyncApi(): WxStorageSyncApi | undefined {
  if (typeof wx === 'undefined') return undefined;
  const api = wx as unknown as Partial<WxStorageSyncApi>;
  if (
    typeof api.getStorageSync !== 'function' ||
    typeof api.setStorageSync !== 'function' ||
    typeof api.removeStorageSync !== 'function' ||
    typeof api.getStorageInfoSync !== 'function'
  )
    return undefined;
  return api as WxStorageSyncApi;
}

/** 基于 wx 同步存储的持久化实现，统一加版本化命名空间，失败全部静默。 */
export class WxCacheStorage implements CacheStorage {
  constructor(private readonly api: WxStorageSyncApi = getWxStorageSyncApi()!) {}

  private rawKey(logicalKey: string): string {
    return `${REPO_CACHE_STORAGE_NAMESPACE}${logicalKey}`;
  }

  get<T>(logicalKey: string): T | undefined {
    try {
      const value = this.api.getStorageSync(this.rawKey(logicalKey));
      // 微信对不存在的键返回 ''（空字符串），与真实缓存值区分开。
      if (value === '' || value === null || value === undefined) return undefined;
      return value as T;
    } catch {
      return undefined;
    }
  }

  set(logicalKey: string, value: unknown): boolean {
    try {
      this.api.setStorageSync(this.rawKey(logicalKey), value);
      return true;
    } catch {
      return false;
    }
  }

  remove(logicalKey: string): void {
    try {
      this.api.removeStorageSync(this.rawKey(logicalKey));
    } catch {
      // 与内存层一致：删除缺失键不报错。
    }
  }

  removePrefix(logicalPrefix: string): void {
    for (const rawKey of this.keys().map((key) => this.rawKey(key))) {
      if (rawKey.startsWith(this.rawKey(logicalPrefix))) {
        try {
          this.api.removeStorageSync(rawKey);
        } catch {
          // 单个键删除失败不阻断其余清理。
        }
      }
    }
  }

  clearAll(): void {
    this.removePrefix('');
  }

  keys(): string[] {
    try {
      return this.api
        .getStorageInfoSync()
        .keys.filter((key) => key.startsWith(REPO_CACHE_STORAGE_NAMESPACE))
        .map((key) => key.slice(REPO_CACHE_STORAGE_NAMESPACE.length));
    } catch {
      return [];
    }
  }
}
