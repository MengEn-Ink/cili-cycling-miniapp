import type { CacheStorage } from '../../miniprogram/repositories/persistent';

/**
 * 测试用内存持久化：行为与 WxCacheStorage 对齐，但不依赖 wx。
 * 仅测试使用，不进入主包生产代码；生产实现见 repositories/persistent.ts。
 */
export class MemoryCacheStorage implements CacheStorage {
  private readonly store = new Map<string, unknown>();

  get<T>(logicalKey: string): T | undefined {
    return this.store.has(logicalKey) ? (this.store.get(logicalKey) as T) : undefined;
  }

  set(logicalKey: string, value: unknown): boolean {
    this.store.set(logicalKey, value);
    return true;
  }

  remove(logicalKey: string): void {
    this.store.delete(logicalKey);
  }

  removePrefix(logicalPrefix: string): void {
    for (const key of this.store.keys()) if (key.startsWith(logicalPrefix)) this.store.delete(key);
  }

  clearAll(): void {
    this.store.clear();
  }

  keys(): string[] {
    return [...this.store.keys()];
  }
}
