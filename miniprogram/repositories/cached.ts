import type { ActivityListFilter, PublicActivityView, RideRepository } from './types';

/**
 * 只读数据的默认缓存时长。
 * 列表/详情/Strava 摘要在该窗口内复用结果，用来合并页面 onShow、Tab 切换和详情返回带来的重复请求；
 * 超过窗口后自动回源，避免展示陈旧数据。
 */
export const REPOSITORY_CACHE_TTL_MS = 30_000;
/** 缓存条目上限，超出后按最早写入顺序淘汰，防止长时间运行占用过多内存。 */
export const REPOSITORY_CACHE_CAPACITY = 60;

// 资源前缀即“失效命名空间”：活动相关写入只清 act: 前缀，Strava 变更只清 strava: 前缀。
const ACTIVITY_PREFIX = 'act:';
const STRAVA_PREFIX = 'strava:';

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
    // 已存在的 key 先删除，保证其在插入顺序中重新排到末尾，淘汰口径始终为最久未写入。
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
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

export interface RepositoryCacheControl {
  /** 活动或报名发生变化后，让活动列表/详情下次读取重新回源。 */
  invalidateActivities(): void;
  /** Strava 授权、解绑或同步后，让 Strava 摘要下次读取重新回源。 */
  invalidateStrava(): void;
  /** 账号切换或退出时清空全部只读缓存。 */
  clear(): void;
}

/**
 * 仓储缓存装饰器：对高频只读方法做 read-through 缓存与并发去重，写方法在成功后精准失效对应命名空间。
 * 不直接编辑各页面即可统一收口；未列出的方法原样透传，保证现有功能和协议不变。
 */
export class CachingRepository implements RideRepository {
  readonly cacheControl: RepositoryCacheControl;

  private readonly cache = new TtlCache<unknown>();
  // 进行中的请求按 key 复用，确保同一时刻并发的相同读取只发起一次网络调用。
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly inner: RideRepository) {
    this.cacheControl = {
      invalidateActivities: () => this.cache.clearPrefix(ACTIVITY_PREFIX),
      invalidateStrava: () => this.cache.clearPrefix(STRAVA_PREFIX),
      clear: () => {
        this.cache.clear();
        this.inflight.clear();
      },
    };
  }

  /** 通用读路径：命中缓存直接返回；命中并发请求则复用；否则回源并写入缓存。错误不缓存。 */
  private readThrough<T>(key: string, produce: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached as T);
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    // 立即触发回源（同步调用 produce），并兜住其同步抛出，保证 inflight 在返回前登记。
    let started: Promise<T>;
    try {
      started = Promise.resolve(produce());
    } catch (error) {
      started = Promise.reject(error) as Promise<T>;
    }
    const request = started.then(
      (value) => {
        this.cache.set(key, value);
        this.inflight.delete(key);
        return value;
      },
      (error: unknown) => {
        // 失败时移除并发标记且不写入缓存，允许后续重试重新回源。
        this.inflight.delete(key);
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

  // ---- Strava 摘要（strava: 命名空间）----

  getStravaStatus() {
    return this.readThrough(`${STRAVA_PREFIX}status`, () => this.inner.getStravaStatus());
  }

  getStravaReadiness() {
    return this.readThrough(`${STRAVA_PREFIX}readiness`, () => this.inner.getStravaReadiness());
  }

  // ---- 活动写入：成功后失效活动命名空间 ----

  async saveActivity(
    value: Parameters<RideRepository['saveActivity']>[0],
    id?: string,
    expectedVersion?: number,
  ) {
    const result = await this.inner.saveActivity(value, id, expectedVersion);
    this.cacheControl.invalidateActivities();
    return result;
  }

  async cloneActivity(input: Parameters<RideRepository['cloneActivity']>[0]) {
    const result = await this.inner.cloneActivity(input);
    this.cacheControl.invalidateActivities();
    return result;
  }

  async deleteActivity(id: string) {
    await this.inner.deleteActivity(id);
    this.cacheControl.invalidateActivities();
  }

  // ---- 报名写入：会影响活动名额与报名状态，失效活动命名空间 ----

  async saveRegistration(value: Parameters<RideRepository['saveRegistration']>[0]) {
    const result = await this.inner.saveRegistration(value);
    this.cacheControl.invalidateActivities();
    return result;
  }

  async updateRegistration(
    id: string,
    status: Parameters<RideRepository['updateRegistration']>[1],
    comment?: string,
  ) {
    const result = await this.inner.updateRegistration(id, status, comment);
    this.cacheControl.invalidateActivities();
    return result;
  }

  async cancelRegistration(id: string) {
    const result = await this.inner.cancelRegistration(id);
    this.cacheControl.invalidateActivities();
    return result;
  }

  async reviewRegistration(id: string, decision: 'approved' | 'rejected', reason?: string) {
    const result = await this.inner.reviewRegistration(id, decision, reason);
    this.cacheControl.invalidateActivities();
    return result;
  }

  async checkInRegistration(id: string) {
    const result = await this.inner.checkInRegistration(id);
    this.cacheControl.invalidateActivities();
    return result;
  }

  // ---- Strava 写入：成功后失效 Strava 命名空间 ----

  async startStrava() {
    const result = await this.inner.startStrava();
    this.cacheControl.invalidateStrava();
    return result;
  }

  async ensureStravaReady() {
    const result = await this.inner.ensureStravaReady();
    this.cacheControl.invalidateStrava();
    return result;
  }

  async syncStrava() {
    const result = await this.inner.syncStrava();
    this.cacheControl.invalidateStrava();
    return result;
  }

  async cancelStravaAuthorization() {
    await this.inner.cancelStravaAuthorization();
    this.cacheControl.invalidateStrava();
  }

  async disconnectStrava() {
    await this.inner.disconnectStrava();
    this.cacheControl.invalidateStrava();
  }

  // ---- 其余方法原样透传，不做缓存 ----

  listRegistrations() {
    return this.inner.listRegistrations();
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

  getProfile() {
    return this.inner.getProfile();
  }

  getProfileMediaUploadPath() {
    return this.inner.getProfileMediaUploadPath();
  }

  getPersonalCapabilityCard() {
    return this.inner.getPersonalCapabilityCard();
  }

  registerProfileMedia(
    fileId: string,
    category: 'ride' | 'bike' | 'other',
    origin?: Parameters<RideRepository['registerProfileMedia']>[2],
  ) {
    return this.inner.registerProfileMedia(fileId, category, origin);
  }

  reportProfileMediaOrphan(
    fileId: string,
    category: 'ride' | 'bike' | 'other',
    origin?: Parameters<RideRepository['reportProfileMediaOrphan']>[2],
  ) {
    return this.inner.reportProfileMediaOrphan(fileId, category, origin);
  }

  setAvatar(source: Parameters<RideRepository['setAvatar']>[0], fileId: string) {
    return this.inner.setAvatar(source, fileId);
  }

  importStravaAvatar() {
    return this.inner.importStravaAvatar();
  }

  updateProfile(profile: Parameters<RideRepository['updateProfile']>[0]) {
    return this.inner.updateProfile(profile);
  }

  getPhoneNumber(code: string) {
    return this.inner.getPhoneNumber(code);
  }

  previewStravaRoute(routeUrl: string) {
    return this.inner.previewStravaRoute(routeUrl);
  }

  getStravaRouteGpx(activityId: string, routeId: string) {
    return this.inner.getStravaRouteGpx(activityId, routeId);
  }

  exportActivityGpx(activityId: string) {
    return this.inner.exportActivityGpx(activityId);
  }
}
