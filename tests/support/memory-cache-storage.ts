import type { CacheStorage } from '../../miniprogram/repositories/persistent';

/** 与微信持久化适配器行为一致的测试替身，不进入小程序产物。 */
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
