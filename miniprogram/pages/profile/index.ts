import type { PersonalCapabilityCard, Profile } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { appStore } from '../../store/app-store';
import { personalCardViewModel } from '../../utils/personal-card';
import {
  applyCachedImages,
  clearProfilePageCache,
  isProfilePageCacheFresh,
  persistProfileCardImages,
  readProfilePageCache,
  writeProfilePageCache,
  type ProfilePageCache,
} from '../../utils/profile-page-cache';

const HERO_CARD_DEADLINE_MS = 1_200;
const HERO_BRAND_IMAGE = '/assets/profile/hero-alpine.svg';
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60_000;
const EXPAND_THRESHOLD_PX = 96;

type PersonalCardView = ReturnType<typeof personalCardViewModel>;

type HeroImageErrorEvent = {
  currentTarget: { dataset: { index?: number | string; url?: string } };
};

function settleBeforeDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

function formatIdentityHint(authStatus: string) {
  const hint = appStore.identityHint;
  if (!['loading', 'unavailable', 'error'].includes(authStatus) || !hint) return '';
  const date = new Date(hint.verifiedAt + CHINA_TIME_OFFSET_MS);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `上次已完成微信身份验证 ${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
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
  heroTouchStartY: 0,
  heroPageScrollTop: 0,
  loadPromise: null as {
    forceIdentity: boolean;
    forceData: boolean;
    promise: Promise<void>;
  } | null,
  cardLoadPromise: null as Promise<void> | null,
  hydratedCache: null as ProfilePageCache | null,
  data: {
    profile: null as Profile | null,
    loading: true,
    refreshing: false,
    error: '',
    refreshMessage: '',
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
    heroPullOffset: 0,
    heroImageMode: 'aspectFill' as 'aspectFill' | 'aspectFit',
    currentHeroIndex: 0,
    cardExpanded: false,
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
      loading: false,
      usingCache: true,
      updatedAtText: formatUpdatedAt(cache.cachedAt),
      hasGuidance: !cache.profile.hasCompletedGuidance,
      ...cardView(cache.card, cache.images),
    });
  },
  async onShow() {
    this.pageVisible = true;
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
    this.setData({ cardExpanded: true, refreshMessage: '正在更新资料与骑行数据…' });
    await this.load(false, true);
    if (this.cardLoadPromise) await this.cardLoadPromise;
    if (typeof wx.stopPullDownRefresh === 'function') wx.stopPullDownRefresh();
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

    const profileTask = runPageTask(() => rideService.getProfile(), '资料服务暂不可用');
    const cardTask = settleBeforeDeadline(
      runPageTask(() => rideService.getPersonalCapabilityCard(), '骑行名片暂不可用'),
      HERO_CARD_DEADLINE_MS,
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
            refreshMessage: hasPrevious
              ? `骑行数据更新超时，继续展示${this.data.updatedAtText || '缓存数据'}`
              : '',
          });
          return;
        }

        const cachedAt = Date.now();
        const nextCardView = cardView(card);
        const hasStableImages = Boolean(
          this.data.heroBackgrounds.length ||
          this.data.heroAvatarUrl ||
          this.data.heroBackgroundAvatarUrl,
        );
        this.setData({
          refreshing: false,
          refreshMessage: profile ? '已更新全部名片信息' : this.data.refreshMessage,
          updatedAtText: formatUpdatedAt(cachedAt, cachedAt),
          usingCache: false,
          heroCard: nextCardView.heroCard,
          ...(hasStableImages ? {} : nextCardView),
        });
        if (!profile) return;
        const ownerOpenid = appStore.openid || previousCache?.ownerOpenid || '';
        const previousImages = previousCache?.images || {};
        const images = await persistProfileCardImages(card, previousImages);
        if (requestId !== this.loadRequestId) return;
        const imageSources = [
          card.profile.avatarUrl,
          ...card.backgrounds.map((background) => background.url),
        ].filter((value): value is string => Boolean(value));
        const allImagesReady = imageSources.every((source) => Boolean(images[source]));
        if (hasStableImages && allImagesReady) this.setData(cardView(card, images));
        if (!previousCache || allImagesReady) {
          writeProfilePageCache(ownerOpenid, profile, card, images, cachedAt);
          this.hydratedCache = readProfilePageCache();
        }
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
        refreshMessage: hasPrevious
          ? `${profileState.error}，继续展示${this.data.updatedAtText || '缓存数据'}`
          : '',
      });
      return;
    }

    const profile = profileState.data || null;
    this.setData({
      profile,
      loading: false,
      error: '',
      hasGuidance: profile ? !profile.hasCompletedGuidance : false,
    });
  },
  onPageScroll(event: { scrollTop?: number }) {
    this.heroPageScrollTop = Math.max(0, Number(event.scrollTop) || 0);
  },
  heroTouchStart(event: { touches?: { clientY?: number }[] }) {
    this.heroTouchStartY = Number(event.touches?.[0]?.clientY) || 0;
  },
  heroTouchMove(event: { touches?: { clientY?: number }[] }) {
    if (this.heroPageScrollTop > 0 || !this.data.heroBackgrounds.length) return;
    const currentY = Number(event.touches?.[0]?.clientY) || 0;
    const distance = Math.max(0, Math.min(180, currentY - this.heroTouchStartY));
    this.setData({
      heroPullOffset: distance,
      heroImageMode: distance >= 48 ? 'aspectFit' : 'aspectFill',
      cardExpanded: this.data.cardExpanded || distance >= EXPAND_THRESHOLD_PX,
    });
  },
  heroTouchEnd() {
    if (!this.data.heroPullOffset && this.data.heroImageMode === 'aspectFill') return;
    this.setData({ heroPullOffset: 0, heroImageMode: 'aspectFill' });
  },
  toggleCard() {
    this.setData({ cardExpanded: !this.data.cardExpanded });
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
  },
  heroAvatarBackgroundError(event: HeroImageErrorEvent) {
    if (event.currentTarget.dataset.url !== this.data.heroBackgroundAvatarUrl) return;
    this.setData({ heroBackgroundAvatarUrl: '' });
  },
  heroFallbackBackgroundError(event: HeroImageErrorEvent) {
    if (event.currentTarget.dataset.url !== this.data.heroFallbackImageUrl) return;
    this.setData({ heroFallbackImageUrl: '' });
  },
  heroAvatarError(event: HeroImageErrorEvent) {
    if (event.currentTarget.dataset.url !== this.data.heroAvatarUrl) return;
    this.setData({ heroAvatarUrl: '' });
  },
  async dismissGuidance() {
    if (!this.data.profile) return;
    try {
      const profile = await rideService.updateProfile({ hasCompletedGuidance: true });
      this.setData({ hasGuidance: false, profile });
      clearProfilePageCache();
      this.hydratedCache = null;
    } catch {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
  edit() {
    wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
  activities() {
    if (this.data.authStatus === 'authenticated')
      wx.navigateTo({ url: '/pages/admin/activity-list/index' });
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
