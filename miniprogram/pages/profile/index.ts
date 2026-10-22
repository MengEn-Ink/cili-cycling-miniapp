import type { PersonalCapabilityCard, Profile } from '../../models';
import { repositoryCache } from '../../repositories/index';
import { runPageTask, type PageTaskState } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { appStore } from '../../store/app-store';
import { customNavigationTopPx } from '../../utils/custom-navigation';
import { personalCardViewModel } from '../../utils/personal-card';
import {
  applyCachedImages,
  clearProfilePageCache,
  discardPersistedProfileCardImages,
  isProfilePageCacheFresh,
  persistProfileCardImages,
  readProfilePageCache,
  writeProfilePageCache,
  type ProfilePageCache,
} from '../../utils/profile-page-cache';

const PROFILE_REQUEST_DEADLINE_MS = 8_000;
const HERO_BRAND_IMAGE = '/assets/profile/hero-alpine.svg';
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60_000;

type PersonalCardView = ReturnType<typeof personalCardViewModel>;

type HeroImageErrorEvent = {
  currentTarget: { dataset: { index?: number | string; url?: string } };
};

function settlePageTaskBeforeDeadline<T>(
  promise: Promise<PageTaskState<T>>,
  timeoutMessage: string,
): Promise<PageTaskState<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: PageTaskState<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(
      () => finish({ loading: false, error: timeoutMessage }),
      PROFILE_REQUEST_DEADLINE_MS,
    );
    promise.then(
      (value) => finish(value),
      () => finish({ loading: false, error: timeoutMessage }),
    );
  });
}

function formatIdentityHint(authStatus: string) {
  const hint = appStore.identityHint;
  if (!['loading', 'unavailable', 'error'].includes(authStatus) || !hint) return '';
  const date = new Date(hint.verifiedAt + CHINA_TIME_OFFSET_MS);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `上次微信登录 ${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function identityViewData(fallbackError = '') {
  const authStatus = fallbackError ? 'error' : appStore.authStatus;
  return {
    role: appStore.role,
    isSuper: appStore.isSuper,
    authStatus,
    authError: appStore.authError || fallbackError,
    identityHintText: formatIdentityHint(authStatus),
    isAdmin: authStatus === 'authenticated' && appStore.role === 'admin',
  };
}

function formatUpdatedAt(cachedAt: number, now = Date.now()) {
  const age = Math.max(0, now - cachedAt);
  if (age < 60_000) return '刚刚更新';
  const date = new Date(cachedAt + CHINA_TIME_OFFSET_MS);
  const time = `${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes(),
  ).padStart(2, '0')}`;
  if (age < 24 * 60 * 60_000) return `更新于 ${time}`;
  return `缓存于 ${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${time}`;
}

function clubViewData() {
  return { clubAvatarFailed: false };
}

function cardView(card: PersonalCapabilityCard, images: Record<string, string> = {}) {
  const view = personalCardViewModel(applyCachedImages(card, images));
  const avatarBackground =
    view.avatarUrl ||
    view.backgrounds.find((background) => background.source === 'avatar')?.url ||
    '';
  return {
    heroBackgrounds: view.backgrounds.filter((background) => background.source === 'user_photo'),
    heroAvatarUrl: avatarBackground,
    heroBackgroundAvatarUrl: avatarBackground,
    heroCard: view,
  };
}

Page({
  loadRequestId: 0,
  lifecycleRevision: 0,
  pageVisible: false,
  loadPromise: null as {
    forceIdentity: boolean;
    forceData: boolean;
    promise: Promise<void>;
  } | null,
  cardLoadPromise: null as Promise<void> | null,
  hydratedCache: null as ProfilePageCache | null,
  heroMediaRetryUrls: new Set<string>(),
  heroMediaRecoveryPending: false,
  data: {
    navigationTopPx: customNavigationTopPx(),
    profile: null as Profile | null,
    clubAvatarFailed: false,
    loading: true,
    refreshing: false,
    error: '',
    refreshMessage: '',
    refreshFailed: false,
    failedClubAvatars: {} as Record<string, string>,
    updatedAtText: '',
    usingCache: false,
    role: 'member',
    isSuper: false,
    authStatus: 'idle',
    authError: '',
    identityHintText: '',
    isAdmin: false,
    heroBackgrounds: [] as { url: string; source: string; category: string }[],
    heroAvatarUrl: '',
    heroBackgroundAvatarUrl: '',
    heroFallbackImageUrl: HERO_BRAND_IMAGE,
    heroCard: null as PersonalCardView | null,
    currentHeroIndex: 0,
    hasGuidance: false,
  },
  hydrateCache() {
    if (this.hydratedCache) return this.hydratedCache;
    const cache = readProfilePageCache();
    this.hydratedCache = cache;
    if (cache && appStore.openid && cache.ownerOpenid === appStore.openid)
      this.applyHydratedCache(cache);
    return cache;
  },
  applyHydratedCache(cache: ProfilePageCache) {
    this.setData({
      profile: cache.profile,
      ...clubViewData(),
      loading: false,
      usingCache: true,
      updatedAtText: formatUpdatedAt(cache.cachedAt),
      hasGuidance: !cache.profile.hasCompletedGuidance,
      ...cardView(cache.card, cache.images),
    });
  },
  async onShow() {
    this.pageVisible = true;
    this.heroMediaRetryUrls.clear();
    this.lifecycleRevision += 1;
    const cache = this.hydrateCache();
    await this.load(false, !cache || !isProfilePageCacheFresh(cache));
  },
  onHide() {
    this.pageVisible = false;
    this.lifecycleRevision += 1;
    this.loadRequestId += 1;
    this.loadPromise = null;
    // 返回页面时重新读取磁盘缓存，确保编辑页写入的失效标记能够生效。
    this.hydratedCache = null;
  },
  onUnload() {
    this.pageVisible = false;
    this.lifecycleRevision += 1;
    this.loadRequestId += 1;
    this.loadPromise = null;
  },
  async onPullDownRefresh() {
    const loadPromise = this.load(false, true);
    const cardLoadPromise = this.cardLoadPromise;
    try {
      await loadPromise;
      if (cardLoadPromise) await cardLoadPromise;
    } finally {
      if (typeof wx.stopPullDownRefresh === 'function') wx.stopPullDownRefresh();
    }
    // 刷新结果通过 refreshing/refreshFailed/refreshMessage 顶部非阻断提示反馈，不遮挡当前内容。
  },
  async load(forceIdentity = false, forceData = true) {
    const current = this.loadPromise;
    if (current && (!forceIdentity || current.forceIdentity) && (!forceData || current.forceData))
      return current.promise;
    if (current) {
      const queuedAtRevision = this.lifecycleRevision;
      await current.promise;
      // 页面隐藏或重新展示后，旧生命周期中排队的刷新不再发起网络请求。
      if (!this.pageVisible || queuedAtRevision !== this.lifecycleRevision) return;
    }
    const run = this.performLoad(forceIdentity, forceData);
    const tracked = run.finally(() => {
      if (this.loadPromise?.promise === tracked) this.loadPromise = null;
    });
    this.loadPromise = { forceIdentity, forceData, promise: tracked };
    return tracked;
  },
  async performLoad(forceIdentity = false, forceData = true) {
    const requestId = ++this.loadRequestId;
    const hasContent = Boolean(this.data.profile || this.data.heroCard);
    this.setData({
      loading: !hasContent,
      refreshing: hasContent && forceData,
      error: '',
      refreshFailed: false,
      refreshMessage: forceData && hasContent ? '正在更新，当前内容保持可用' : '',
    });

    const identityTask = runPageTask(
      () => appStore.ensureIdentity(wx.cloud, forceIdentity),
      '身份服务暂不可用',
    );
    this.setData(identityViewData());

    if (!forceData && this.hydratedCache && isProfilePageCacheFresh(this.hydratedCache)) {
      const identityState = await identityTask;
      if (requestId !== this.loadRequestId) return;
      const cacheBelongsToCurrentUser =
        Boolean(appStore.openid) && this.hydratedCache.ownerOpenid === appStore.openid;
      if (!cacheBelongsToCurrentUser) {
        clearProfilePageCache();
        this.hydratedCache = null;
        this.setData({
          profile: null,
          heroBackgrounds: [],
          heroAvatarUrl: '',
          heroBackgroundAvatarUrl: '',
          heroCard: null,
          hasGuidance: false,
          usingCache: false,
          updatedAtText: '',
        });
        return this.performLoad(false, true);
      }
      this.applyHydratedCache(this.hydratedCache);
      this.setData({ ...identityViewData(identityState.error), loading: false, refreshing: false });
      return;
    }

    const profileTask = settlePageTaskBeforeDeadline(
      runPageTask(() => rideService.getProfile(), '资料服务暂不可用'),
      '资料加载超时，请重试',
    );
    const cardTask = settlePageTaskBeforeDeadline(
      runPageTask(() => rideService.getPersonalCapabilityCard(), '骑行名片暂不可用'),
      '骑行数据更新超时，请重试',
    );
    const previousCache = this.hydratedCache;

    const cardUpdate = Promise.all([profileTask, cardTask]).then(
      async ([profileState, cardState]) => {
        if (requestId !== this.loadRequestId) return;
        const profile = profileState.data || null;
        const card = cardState?.data || null;
        if (!card) {
          const hasPrevious = Boolean(this.data.heroCard);
          this.setData({
            refreshing: false,
            refreshFailed: hasPrevious,
            refreshMessage: hasPrevious
              ? `${cardState.error || '骑行数据更新失败'}，继续展示${this.data.updatedAtText || '缓存数据'}`
              : cardState.error,
          });
          return;
        }

        const cachedAt = Date.now();
        const nextCardView = cardView(card);
        const hasStableImages =
          !this.heroMediaRecoveryPending &&
          Boolean(
            this.data.heroBackgrounds.length ||
            this.data.heroAvatarUrl ||
            this.data.heroBackgroundAvatarUrl,
          );
        this.heroMediaRecoveryPending = false;
        this.setData({
          refreshing: false,
          // 只有资料与名片都成功才清除失败提示；资料分支失败时这里保持非阻断提醒。
          refreshFailed: !profile,
          refreshMessage: profile ? '已更新全部名片信息' : this.data.refreshMessage,
          updatedAtText: formatUpdatedAt(cachedAt, cachedAt),
          usingCache: false,
          heroCard: nextCardView.heroCard,
          ...(hasStableImages ? {} : nextCardView),
        });
        if (!profile) return;
        const ownerOpenid = appStore.openid || previousCache?.ownerOpenid || '';
        const previousImages = previousCache?.images || {};
        const persisted = await persistProfileCardImages(card, previousImages);
        if (requestId !== this.loadRequestId) {
          discardPersistedProfileCardImages(persisted.created);
          return;
        }
        const committed = writeProfilePageCache(
          ownerOpenid,
          profile,
          card,
          persisted.images,
          cachedAt,
        );
        if (!committed) {
          discardPersistedProfileCardImages(persisted.created);
          return;
        }
        this.hydratedCache = readProfilePageCache();
        this.setData(cardView(card, persisted.images));
      },
    );
    const trackedCardUpdate = cardUpdate.finally(() => {
      if (this.cardLoadPromise === trackedCardUpdate) this.cardLoadPromise = null;
    });
    this.cardLoadPromise = trackedCardUpdate;

    const [identityState, profileState] = await Promise.all([identityTask, profileTask]);
    if (requestId !== this.loadRequestId) return;
    this.setData(identityViewData(identityState.error));

    let cache = this.hydratedCache;
    if (cache && appStore.openid && cache.ownerOpenid && cache.ownerOpenid !== appStore.openid) {
      clearProfilePageCache();
      cache = null;
      this.hydratedCache = null;
      this.setData({
        profile: null,
        heroBackgrounds: [],
        heroAvatarUrl: '',
        heroBackgroundAvatarUrl: '',
        heroCard: null,
        hasGuidance: false,
        usingCache: false,
        updatedAtText: '',
      });
    }

    if (profileState.error) {
      const hasPrevious = Boolean(this.data.profile || this.data.heroCard);
      this.setData({
        loading: false,
        refreshing: false,
        error: hasPrevious ? '' : profileState.error,
        refreshFailed: hasPrevious,
        refreshMessage: hasPrevious
          ? `${profileState.error}，继续展示${this.data.updatedAtText || '缓存数据'}`
          : '',
      });
      return;
    }

    const profile = profileState.data || null;
    this.setData({
      profile,
      ...clubViewData(),
      loading: false,
      error: '',
      refreshFailed: false,
      hasGuidance: profile ? !profile.hasCompletedGuidance : false,
    });
  },
  openSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },
  clubAvatarError() {
    if (!this.data.clubAvatarFailed) this.setData({ clubAvatarFailed: true });
  },
  heroSwiperChange(event: { detail?: { current?: number } }) {
    this.setData({ currentHeroIndex: Math.max(0, Number(event.detail?.current) || 0) });
  },
  previewHeroImage(event: HeroImageErrorEvent) {
    const backgrounds = this.data.heroBackgrounds as { url: string }[];
    const urls = backgrounds.map((item) => item.url);
    if (!urls.length) return;
    const requested = event.currentTarget.dataset.url;
    const current =
      requested && urls.includes(requested) ? requested : urls[this.data.currentHeroIndex];
    wx.previewImage({ current: current || urls[0], urls });
  },
  previewAvatar() {
    const current = this.data.heroAvatarUrl;
    if (typeof current !== 'string' || !/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(current)) return;
    wx.previewImage({ current, urls: [current] });
  },
  recoverHeroMedia(retryKey: string) {
    if (!retryKey || this.heroMediaRetryUrls.has(retryKey)) return;
    this.heroMediaRetryUrls.add(retryKey);
    this.heroMediaRecoveryPending = true;
    repositoryCache.invalidateProfiles();
    clearProfilePageCache();
    this.hydratedCache = null;
    void this.load(false, true);
  },
  heroBackgroundError(event: HeroImageErrorEvent) {
    const backgrounds = this.data.heroBackgrounds as { url: string }[];
    const failedUrl = event.currentTarget.dataset.url;
    const reportedIndex = Number(event.currentTarget.dataset.index);
    const matchingIndex =
      Number.isInteger(reportedIndex) && backgrounds[reportedIndex]?.url === failedUrl
        ? reportedIndex
        : backgrounds.findIndex((background) => background.url === failedUrl);
    if (matchingIndex < 0) return;
    this.setData({
      heroBackgrounds: backgrounds.filter((_, index) => index !== matchingIndex),
    });
    this.recoverHeroMedia(`background:${matchingIndex}`);
  },
  heroAvatarBackgroundError(event: HeroImageErrorEvent) {
    if (event.currentTarget.dataset.url !== this.data.heroBackgroundAvatarUrl) return;
    this.setData({ heroBackgroundAvatarUrl: '' });
    this.recoverHeroMedia('avatar');
  },
  heroFallbackBackgroundError(event: HeroImageErrorEvent) {
    if (event.currentTarget.dataset.url !== this.data.heroFallbackImageUrl) return;
    this.setData({ heroFallbackImageUrl: '' });
  },
  heroAvatarError(event: HeroImageErrorEvent) {
    if (event.currentTarget.dataset.url !== this.data.heroAvatarUrl) return;
    this.setData({ heroAvatarUrl: '' });
    this.recoverHeroMedia('avatar');
  },
  async dismissGuidance() {
    if (!this.data.profile) return;
    try {
      const profile = await rideService.updateProfile({
        ...(this.data.profile.generation === undefined
          ? {}
          : { generation: this.data.profile.generation }),
        hasCompletedGuidance: true,
      });
      this.setData({ hasGuidance: false, profile, ...clubViewData() });
      clearProfilePageCache();
      this.hydratedCache = null;
    } catch {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
  edit() {
    wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
  openClubCenter() {
    wx.navigateTo({ url: '/pages/club/center/index' });
  },
  clubApplications() {
    if (this.data.isAdmin) wx.navigateTo({ url: '/pages/admin/club-applications/index' });
  },
  activities() {
    if (this.data.isAdmin) wx.navigateTo({ url: '/pages/admin/activity-list/index' });
  },
  admin() {
    if (this.data.isAdmin) wx.navigateTo({ url: '/pages/admin/reviews/index' });
  },
  async retryAuth() {
    await this.load(true, true);
  },
  async retryProfile() {
    await this.load(false, true);
  },
});
