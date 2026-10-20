/**
 * 已解析云存储临时地址（getTempFileURL）缓存。
 *
 * 微信云存储的 tempFileURL 是带有效期的 https 地址：每个页面若都重新调用
 * getTempFileURL，会产生重复请求。这里以应用级单例缓存 fileID -> tempFileURL，并：
 * - 合并同一事件循环内的解析请求为一次批量调用（DataLoader 式）；
 * - 对同一 fileID 的并发解析做单飞去重；
 * - 在临期前视为失效并自动重新解析，避免拿到临界过期地址；
 * - 解析失败不写入缓存，下次解析仍会重试（不做“失败即永久空”的负缓存）。
 *
 * 仅做内存缓存：tempFileURL 本身会过期，持久化到本地反而可能在冷启动后给出已失效地址，
 * 因此不接入 CacheStorage。
 */

export type TempFileItem = {
  fileID?: string;
  tempFileURL?: string;
};

export type GetTempFileURL = (options: {
  fileList: string[];
}) => Promise<{ fileList?: TempFileItem[] }>;

export type TempFileUrlCacheOptions = {
  getTempFileURL: GetTempFileURL;
  // 腾讯云 getTempFileURL 返回地址默认有效期约 2 小时。
  ttlMs?: number;
  // 提前刷新余量：在真正到期前就视为失效，规避临界过期。
  refreshMarginMs?: number;
  now?: () => number;
};

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Entry = {
  url: string;
  expiresAt: number;
};

type Waiter = {
  resolve: (url: string) => void;
  reject: (error: unknown) => void;
};

export function getSharedTempFileUrlCache(options: TempFileUrlCacheOptions): TempFileUrlCache {
  sharedTempFileUrlCache ??= new TempFileUrlCache(options);
  return sharedTempFileUrlCache;
}

/** 清理可重新签发的临时地址；不触碰云文件或业务数据。 */
export function clearSharedTempFileUrlCache(): void {
  sharedTempFileUrlCache?.invalidate();
}

let sharedTempFileUrlCache: TempFileUrlCache | null = null;

export class TempFileUrlCache {
  private readonly entries = new Map<string, Entry>();
  // 当前批次待请求的 fileID 及其等待者。
  private queuedIds: string[] = [];
  private readonly waiters = new Map<string, Waiter[]>();
  private dispatchScheduled = false;

  private readonly getTempFileURL: GetTempFileURL;
  private readonly ttlMs: number;
  private readonly refreshMarginMs: number;
  private readonly now: () => number;

  constructor(options: TempFileUrlCacheOptions) {
    this.getTempFileURL = options.getTempFileURL;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.refreshMarginMs = options.refreshMarginMs ?? DEFAULT_REFRESH_MARGIN_MS;
    this.now = options.now ?? Date.now;
  }

  // 同步读取仍“安全有效”的地址；缺失或已临期返回空串。
  get(fileId: string): string {
    const entry = this.entries.get(fileId);
    if (!entry) return '';
    return entry.expiresAt - this.refreshMarginMs > this.now() ? entry.url : '';
  }

  // 批量解析：命中且仍有效的直接返回，其余合并为一次 getTempFileURL 调用。
  async resolve(fileIds: string[]): Promise<Record<string, string>> {
    const now = this.now();
    const result: Record<string, string> = {};
    const need: string[] = [];
    for (const id of [...new Set(fileIds)]) {
      if (!id) continue;
      const entry = this.entries.get(id);
      if (entry && entry.expiresAt - this.refreshMarginMs > now) {
        result[id] = entry.url;
      } else {
        need.push(id);
      }
    }
    if (need.length) {
      const urls = await Promise.all(need.map((id) => this.enqueue(id)));
      need.forEach((id, index) => {
        if (urls[index]) result[id] = urls[index];
      });
    }
    return result;
  }

  // 使指定（或全部）缓存失效。不影响已在途的请求。
  invalidate(fileIds?: string[]): void {
    if (!fileIds) {
      this.entries.clear();
      return;
    }
    for (const id of fileIds) this.entries.delete(id);
  }

  private enqueue(id: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const list = this.waiters.get(id);
      if (list) {
        list.push({ resolve, reject });
      } else {
        this.waiters.set(id, [{ resolve, reject }]);
        this.queuedIds.push(id);
      }
      if (!this.dispatchScheduled) {
        this.dispatchScheduled = true;
        // 微任务延迟：把同一事件循环内所有 resolve 调用合并进同一次批量请求。
        Promise.resolve().then(() => {
          this.dispatchScheduled = false;
          void this.dispatch();
        });
      }
    });
  }

  private async dispatch(): Promise<void> {
    const ids = this.queuedIds;
    this.queuedIds = [];
    let fetched: Record<string, string> = {};
    let failure: unknown = null;
    try {
      fetched = await this.requestUrls(ids);
    } catch (error) {
      failure = error;
    }
    for (const id of ids) {
      const list = this.waiters.get(id) ?? [];
      this.waiters.delete(id);
      // 整批失败则拒绝全部等待者，调用方据此回退，且因未写入缓存下次仍可重试。
      if (failure) {
        for (const waiter of list) waiter.reject(failure);
      } else {
        const url = fetched[id] ?? '';
        for (const waiter of list) waiter.resolve(url);
      }
    }
  }

  private async requestUrls(ids: string[]): Promise<Record<string, string>> {
    const response = await this.getTempFileURL({ fileList: ids });
    const now = this.now();
    const map: Record<string, string> = {};
    for (const file of response?.fileList ?? []) {
      const id = typeof file.fileID === 'string' ? file.fileID : '';
      const url = typeof file.tempFileURL === 'string' ? file.tempFileURL : '';
      // 仅缓存合法 https 地址，异常结果跳过（不报错、不污染缓存）。
      if (id && /^https:\/\//i.test(url)) {
        map[id] = url;
        this.entries.set(id, { url, expiresAt: now + this.ttlMs });
      }
    }
    return map;
  }
}
