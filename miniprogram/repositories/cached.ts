import type {
  ActivityListFilter,
  PublicActivityPage,
  PublicActivityView,
  RideRepository,
} from './types';
import type { CacheStorage } from './persistent';

/**
 * 只读数据的默认缓存时长。
 * 列表、详情和资料摘要在该窗口内复用结果，用来合并页面 onShow、Tab 切换和详情返回带来的重复请求；
 * 超过窗口后自动回源，避免展示陈旧数据。
 */
export const REPOSITORY_CACHE_TTL_MS = 30_000;
/**
 * 弱网/断网时持久化数据的离线兜底窗口。
 * 仅在网络请求失败、且上次数据未超过该窗口时返回旧值，在线场景一律回源，避免掩盖名额或下架变化；
 * 取值保守以优先保证报名名额信息准确，超出窗口则把原始网络错误交给页面展示。
 */
export const REPOSITORY_OFFLINE_STALE_MS = 5 * 60_000;
/** 缓存条目上限，超出后按最早写入顺序淘汰，防止长时间运行占用过多内存。 */
export const REPOSITORY_CACHE_CAPACITY = 60;

// 资源前缀即“失效命名空间”：活动、报名和资料写入各自清理相关缓存。
const ACTIVITY_PREFIX = 'act:';
const REGISTRATION_PREFIX = 'reg:';
const PROFILE_PREFIX = 'profile:';

interface Entry<V> {
  value: V;
  expiresAt: number;
}

/** 最小可注入时钟的 TTL 缓存，按 Map 插入顺序做容量淘汰。 */
export class TtlCache<V> {
  private readonly store = new Map<string, Entry<V>>();

  constructor(
    private readonly ttlMs: number = REPOSITORY_CACHE_TTL_MS,
    private readonly capacity: number = REPOSITORY_CACHE_CAPACITY,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      // 过期即移除并触发上层回源，不把过期值交给页面。
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    // 以当前时刻重算过期点；冷启动从持久化层恢复时改用 hydrate 保留原始过期时刻。
    this.hydrate(key, value, this.now() + this.ttlMs);
  }

  /** 以指定过期时刻写入条目，用于跨冷启动恢复，保证 TTL 不被重新打开而延长。 */
  hydrate(key: string, value: V, expiresAt: number): void {
    // 已存在的 key 先删除，保证其在插入顺序中重新排到末尾，淘汰口径始终为最久未写入。
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt });
    while (this.store.size > this.capacity) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  /** 删除指定命名空间（前缀）下的全部条目。 */
  clearPrefix(prefix: string): void {
    for (const key of this.store.keys()) if (key.startsWith(prefix)) this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** 缓存命中率等可观测指标快照，用于诊断和手动刷新验收。 */
export interface CacheMetricsSnapshot {
  /** 命中内存缓存的次数。 */
  memoryHits: number;
  /** 冷启动命中持久化缓存（TTL 内）的次数。 */
  storageHits: number;
  /** 网络失败后回退到持久化兜底数据的次数。 */
  staleReads: number;
  /** 真正回源成功的次数。 */
  originLoads: number;
  /** 持久化写入成功次数。 */
  storageWrites: number;
  /** 持久化写入失败次数（存储满或宿主异常）。 */
  storageErrors: number;
}

export interface RepositoryCacheControl {
  /** 同步读取首页首屏的新鲜缓存，供页面在网络刷新前避免空态闪烁。 */
  peekActivityPage(view: PublicActivityView): PublicActivityPage | undefined;
  /** 单场活动的签名媒体失效后，仅让该详情重新回源。 */
  invalidateActivity(id: string): void;
  /** 活动或报名发生变化后，让活动列表/详情下次读取重新回源。 */
  invalidateActivities(): void;
  /** 资料媒体加载失败后，让资料和骑行名片下次读取重新向云函数签发地址。 */
  invalidateProfiles(): void;
  /** 账号切换或退出时清空全部只读缓存。 */
  clear(): void;
  /** 读取命中率等指标快照。 */
  getMetrics(): CacheMetricsSnapshot;
  /** 重新统计指标，用于手动刷新前后对比命中率。 */
  resetMetrics(): void;
}

/**
 * 仓储缓存装饰器：对高频只读方法做 read-through 缓存与并发去重，写方法在成功后精准失效对应命名空间。
 * 不直接编辑各页面即可统一收口；未列出的方法原样透传，保证现有功能和协议不变。
 */
export interface CachingRepositoryOptions {
  /** 持久化后端；不传则仅内存缓存，行为与基线一致。 */
  storage?: CacheStorage;
  /** 读缓存有效期，默认 {@link REPOSITORY_CACHE_TTL_MS}。 */
  ttlMs?: number;
  /** 断网兜底窗口，默认 {@link REPOSITORY_OFFLINE_STALE_MS}。 */
  staleMs?: number;
  /** 可注入时钟。 */
  now?: () => number;
}

export class CachingRepository implements RideRepository {
  readonly cacheControl: RepositoryCacheControl;

  private readonly ttlMs: number;
  private readonly staleMs: number;
  private readonly now: () => number;
  private readonly storage: CacheStorage | undefined;

  private readonly cache: TtlCache<unknown>;
  // 进行中的请求按 key 复用，确保同一时刻并发的相同读取只发起一次网络调用。
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly metrics: CacheMetricsSnapshot = {
    memoryHits: 0,
    storageHits: 0,
    staleReads: 0,
    originLoads: 0,
    storageWrites: 0,
    storageErrors: 0,
  };

  constructor(
    private readonly inner: RideRepository,
    options: CachingRepositoryOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? REPOSITORY_CACHE_TTL_MS;
    this.staleMs = options.staleMs ?? REPOSITORY_OFFLINE_STALE_MS;
    this.now = options.now ?? Date.now;
    this.storage = options.storage;
    this.cache = new TtlCache(this.ttlMs, REPOSITORY_CACHE_CAPACITY, this.now);
    this.cacheControl = {
      peekActivityPage: (view) =>
        this.peekFresh<PublicActivityPage>(`${ACTIVITY_PREFIX}page:${view}:`),
      invalidateActivity: (id) => this.invalidatePrefix(`${ACTIVITY_PREFIX}item:${id}`),
      invalidateActivities: () => this.invalidatePrefix(ACTIVITY_PREFIX),
      invalidateProfiles: () => this.invalidatePrefix(PROFILE_PREFIX),
      clear: () => {
        this.cache.clear();
        this.inflight.clear();
        this.storage?.clearAll();
      },
      getMetrics: () => ({ ...this.metrics }),
      resetMetrics: () => {
        for (const resetKey of Object.keys(this.metrics) as Array<keyof CacheMetricsSnapshot>)
          this.metrics[resetKey] = 0;
      },
    };
  }

  /** 删除某命名空间的内存、进行中请求和持久化条目，保证写后冷启动也读不到旧数据。 */
  private invalidatePrefix(prefix: string): void {
    this.cache.clearPrefix(prefix);
    for (const inflightKey of [...this.inflight.keys()])
      if (inflightKey.startsWith(prefix)) this.inflight.delete(inflightKey);
    this.storage?.removePrefix(prefix);
  }

  /** 同步查看新鲜缓存；仅供页面首帧预热，不触发回源。 */
  private peekFresh<T>(key: string): T | undefined {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached as T;
    const persisted = this.readPersisted<T>(key);
    return persisted && persisted.expiresAt > this.now() ? persisted.value : undefined;
  }

  /** 从持久化层回读条目：新鲜条目 hydrate 内存；过期条目返回供网络失败时兜底。 */
  private readPersisted<T>(key: string): { value: T; expiresAt: number } | undefined {
    if (!this.storage) return undefined;
    const raw = this.storage.get<unknown>(key);
    if (!raw || typeof raw !== 'object') return undefined;
    const entry = raw as { value?: unknown; expiresAt?: unknown };
    if (typeof entry.expiresAt !== 'number' || !Number.isFinite(entry.expiresAt)) return undefined;
    const value = entry.value as T;
    if (entry.expiresAt > this.now()) {
      // 保留原始过期时刻，冷启动恢复不会变相延长 TTL。
      this.cache.hydrate(key, value, entry.expiresAt);
      this.metrics.storageHits++;
    }
    return { value, expiresAt: entry.expiresAt };
  }

  /** 回源成功后写入持久化，失败计入指标但不影响返回。 */
  private writePersisted(key: string, value: unknown, expiresAt: number): void {
    if (!this.storage) return;
    if (this.storage.set(key, { value, expiresAt })) this.metrics.storageWrites++;
    else this.metrics.storageErrors++;
  }

  /** 通用读路径：命中内存/持久化直接返回；命中并发请求则复用；否则回源。在线错误不缓存。 */
  private readThrough<T>(key: string, produce: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.metrics.memoryHits++;
      return Promise.resolve(cached as T);
    }
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    // 冷启动回读持久化：新鲜则直接复用（readPersisted 已 hydrate 内存）。
    const persisted = this.readPersisted<T>(key);
    if (persisted && persisted.expiresAt > this.now()) return Promise.resolve(persisted.value);

    // 立即触发回源（同步调用 produce），并兜住其同步抛出，保证 inflight 在返回前登记。
    let started: Promise<T>;
    try {
      started = Promise.resolve(produce());
    } catch (error) {
      started = Promise.reject(error) as Promise<T>;
    }
    const request = started.then(
      (value) => {
        // 写操作失效或新一轮请求已接管时，旧响应只返回给原调用方，不得重新污染缓存。
        if (this.inflight.get(key) === request) {
          const expiresAt = this.now() + this.ttlMs;
          this.cache.hydrate(key, value, expiresAt);
          this.inflight.delete(key);
          this.writePersisted(key, value, expiresAt);
        }
        this.metrics.originLoads++;
        return value;
      },
      (error: unknown) => {
        // 失败时仅清理自己持有的并发标记；仅在离线兜底窗口内返回上次数据。
        if (this.inflight.get(key) === request) this.inflight.delete(key);
        if (persisted && persisted.expiresAt + this.staleMs > this.now()) {
          this.metrics.staleReads++;
          return persisted.value;
        }
        throw error;
      },
    );
    this.inflight.set(key, request);
    return request;
  }

  // ---- 活动读取（act: 命名空间）----

  listActivities(filter?: ActivityListFilter) {
    return this.readThrough(`${ACTIVITY_PREFIX}list:${filter ?? ''}`, () =>
      this.inner.listActivities(filter),
    );
  }

  listActivityPage(view: PublicActivityView, cursor?: string) {
    return this.readThrough(`${ACTIVITY_PREFIX}page:${view}:${cursor ?? ''}`, () =>
      this.inner.listActivityPage(view, cursor),
    );
  }

  getActivity(id: string) {
    return this.readThrough(`${ACTIVITY_PREFIX}item:${id}`, () => this.inner.getActivity(id));
  }

  // ---- 活动写入：成功后失效活动命名空间 ----

  async saveActivity(
    value: Parameters<RideRepository['saveActivity']>[0],
    id?: string,
    expectedVersion?: number,
    createRequestId?: string,
    operationReason?: string,
  ) {
    const result = await this.inner.saveActivity(
      value,
      id,
      expectedVersion,
      createRequestId,
      operationReason,
    );
    this.cacheControl.invalidateActivities();
    return result;
  }

  async cloneActivity(input: Parameters<RideRepository['cloneActivity']>[0]) {
    const result = await this.inner.cloneActivity(input);
    this.cacheControl.invalidateActivities();
    return result;
  }

  async deleteActivity(id: string, reason: string) {
    await this.inner.deleteActivity(id, reason);
    this.cacheControl.invalidateActivities();
  }

  // ---- 报名写入：会影响活动名额与报名状态，失效活动命名空间 ----

  async saveRegistration(value: Parameters<RideRepository['saveRegistration']>[0]) {
    const result = await this.inner.saveRegistration(value);
    this.cacheControl.invalidateActivities();
    this.invalidatePrefix(REGISTRATION_PREFIX);
    return result;
  }

  async updateRegistration(
    id: string,
    status: Parameters<RideRepository['updateRegistration']>[1],
    comment?: string,
  ) {
    const result = await this.inner.updateRegistration(id, status, comment);
    this.cacheControl.invalidateActivities();
    this.invalidatePrefix(REGISTRATION_PREFIX);
    return result;
  }

  async cancelRegistration(id: string) {
    const result = await this.inner.cancelRegistration(id);
    this.cacheControl.invalidateActivities();
    this.invalidatePrefix(REGISTRATION_PREFIX);
    return result;
  }

  async deleteRegistration(id: string): Promise<void> {
    await this.inner.deleteRegistration(id);
    this.cacheControl.invalidateActivities();
    this.invalidatePrefix(REGISTRATION_PREFIX);
  }

  async reviewRegistration(id: string, decision: 'approved' | 'rejected', reason?: string) {
    const result = await this.inner.reviewRegistration(id, decision, reason);
    this.cacheControl.invalidateActivities();
    this.invalidatePrefix(REGISTRATION_PREFIX);
    return result;
  }

  async checkInRegistration(id: string) {
    const result = await this.inner.checkInRegistration(id);
    this.cacheControl.invalidateActivities();
    this.invalidatePrefix(REGISTRATION_PREFIX);
    return result;
  }

  // ---- 其余方法原样透传，不做缓存 ----

  listRegistrations() {
    return this.readThrough(`${REGISTRATION_PREFIX}mine`, () => this.inner.listRegistrations());
  }

  getRegistration(id: string) {
    return this.inner.getRegistration(id);
  }

  getReviewNotificationTemplateIds() {
    return this.inner.getReviewNotificationTemplateIds();
  }

  requestReviewNotificationSubscription(templateIds: string[]) {
    return this.inner.requestReviewNotificationSubscription(templateIds);
  }

  listAdminActivities() {
    return this.inner.listAdminActivities();
  }

  listAdminActivitiesPage(input: Parameters<RideRepository['listAdminActivitiesPage']>[0]) {
    return this.inner.listAdminActivitiesPage(input);
  }

  getAdminActivity(id: string) {
    return this.inner.getAdminActivity(id);
  }

  listReviewRegistrations(
    activityId: string,
    status?: Parameters<RideRepository['listReviewRegistrations']>[1],
  ) {
    return this.inner.listReviewRegistrations(activityId, status);
  }

  getReviewRegistration(id: string) {
    return this.inner.getReviewRegistration(id);
  }

  enqueueActivityReminders(activityId: string) {
    return this.inner.enqueueActivityReminders(activityId);
  }

  getMyClubApplication() {
    return this.inner.getMyClubApplication();
  }

  listJoinableClubs() {
    return this.inner.listJoinableClubs();
  }

  async joinPublicClub(clubId: string, requestId: string) {
    const result = await this.inner.joinPublicClub(clubId, requestId);
    this.invalidatePrefix(PROFILE_PREFIX);
    return result;
  }

  saveClubApplicationDraft(value: Parameters<RideRepository['saveClubApplicationDraft']>[0]) {
    return this.inner.saveClubApplicationDraft(value);
  }

  submitClubApplication(
    value: Parameters<RideRepository['submitClubApplication']>[0],
    requestId: string,
  ) {
    return this.inner.submitClubApplication(value, requestId);
  }

  listClubApplications(status?: Parameters<RideRepository['listClubApplications']>[0]) {
    return this.inner.listClubApplications(status);
  }

  getClubApplication(id: string) {
    return this.inner.getClubApplication(id);
  }

  reviewClubApplication(
    id: string,
    decision: 'approved' | 'rejected',
    reason: string,
    requestId: string,
  ) {
    return this.inner.reviewClubApplication(id, decision, reason, requestId);
  }

  getProfile() {
    return this.readThrough(`${PROFILE_PREFIX}self`, () => this.inner.getProfile());
  }

  getProfileMediaUploadPath() {
    return this.inner.getProfileMediaUploadPath();
  }

  getPersonalCapabilityCard() {
    return this.readThrough(`${PROFILE_PREFIX}capability-card`, () =>
      this.inner.getPersonalCapabilityCard(),
    );
  }

  async registerProfileMedia(
    fileId: string,
    category: 'ride' | 'bike' | 'other',
    origin?: Parameters<RideRepository['registerProfileMedia']>[2],
  ) {
    await this.inner.registerProfileMedia(fileId, category, origin);
    this.invalidatePrefix(PROFILE_PREFIX);
  }

  reportProfileMediaOrphan(
    fileId: string,
    category: 'ride' | 'bike' | 'other',
    origin?: Parameters<RideRepository['reportProfileMediaOrphan']>[2],
  ) {
    return this.inner.reportProfileMediaOrphan(fileId, category, origin);
  }

  async setAvatar(source: Parameters<RideRepository['setAvatar']>[0], fileId: string) {
    const result = await this.inner.setAvatar(source, fileId);
    this.invalidatePrefix(PROFILE_PREFIX);
    return result;
  }

  async updateProfile(profile: Parameters<RideRepository['updateProfile']>[0]) {
    const result = await this.inner.updateProfile(profile);
    this.invalidatePrefix(PROFILE_PREFIX);
    return result;
  }

  async getPhoneNumber(code: string) {
    const result = await this.inner.getPhoneNumber(code);
    this.invalidatePrefix(PROFILE_PREFIX);
    return result;
  }

  previewPublicStravaRoute(routeUrl: string) {
    return this.inner.previewPublicStravaRoute(routeUrl);
  }

  previewRouteGpx(input: Parameters<RideRepository['previewRouteGpx']>[0]) {
    return this.inner.previewRouteGpx(input);
  }

  bindRoutePreviewImage(previewId: string, generatedPreviewFileId: string) {
    return this.inner.bindRoutePreviewImage(previewId, generatedPreviewFileId);
  }

  downloadRouteGpx(activityId: string) {
    return this.inner.downloadRouteGpx(activityId);
  }
}
