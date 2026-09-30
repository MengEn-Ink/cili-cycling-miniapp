import type { PersonalCapabilityCard } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { appStore } from '../../store/app-store';
import { personalCardViewModel } from '../../utils/personal-card';

const HERO_CARD_DEADLINE_MS = 1_200;
const HERO_BRAND_IMAGE = '/assets/profile/hero-alpine.svg';
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60_000;

type PersonalCardView = ReturnType<typeof personalCardViewModel>;

type HeroImageErrorEvent = {
  currentTarget: { dataset: { index?: number | string; url?: string } };
};

function settleBeforeDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    void promise.then(
      (value) => finish(value),
      () => finish(null),
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

Page({
  loadRequestId: 0,
  data: {
    profile: null as any,
    loading: true,
    refreshing: false,
    error: '',
    role: 'member',
    isSuper: false,
    authStatus: 'idle',
    authError: '',
    identityHintText: '',
    isAdmin: false,
    heroBackgrounds: [] as any[],
    heroAvatarUrl: '',
    heroBackgroundAvatarUrl: '',
    heroFallbackImageUrl: HERO_BRAND_IMAGE,
    heroCard: null as PersonalCardView | null,
    hasGuidance: false,
  },
  async onShow() {
    await this.load();
  },
  onHide() {
    this.loadRequestId += 1;
  },
  onUnload() {
    this.loadRequestId += 1;
  },
  async load(forceIdentity = false) {
    const requestId = ++this.loadRequestId;
    const hasProfile = Boolean(this.data.profile);
    this.setData({ loading: !hasProfile, refreshing: hasProfile, error: '' });

    const identityTask = runPageTask(
      () => appStore.ensureIdentity(wx.cloud, forceIdentity),
      '身份服务暂不可用',
    );
    const profileTask = runPageTask(() => rideService.getProfile(), '资料服务暂不可用');
    const cardTask = runPageTask(() => rideService.getPersonalCapabilityCard(), '骑行名片暂不可用');
    this.setData(identityViewData());

    void settleBeforeDeadline(cardTask, HERO_CARD_DEADLINE_MS).then((state) => {
      if (requestId !== this.loadRequestId) return;
      if (!state?.data) {
        this.setData({
          heroBackgrounds: [],
          heroAvatarUrl: '',
          heroBackgroundAvatarUrl: '',
          heroCard: null,
        });
        return;
      }
      const view = personalCardViewModel(state.data as PersonalCapabilityCard);
      const avatarBackground =
        view.avatarUrl ||
        view.backgrounds.find((background) => background.source === 'avatar')?.url ||
        '';
      this.setData({
        heroBackgrounds: view.backgrounds.filter(
          (background) => background.source === 'user_photo',
        ),
        heroAvatarUrl: avatarBackground,
        heroBackgroundAvatarUrl: avatarBackground,
        heroCard: view,
      });
    });

    await Promise.all([
      identityTask.then((state) => {
        if (requestId !== this.loadRequestId) return;
        this.setData(identityViewData(state.error));
      }),
      profileTask.then((state) => {
        if (requestId !== this.loadRequestId) return;
        if (state.error) {
          this.setData({ loading: false, refreshing: false, error: state.error });
          return;
        }
        const profile = state.data || null;
        this.setData({
          profile,
          loading: false,
          refreshing: false,
          error: '',
          hasGuidance: profile ? !profile.hasCompletedGuidance : false,
        });
      }),
    ]);
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
      await rideService.updateProfile({ hasCompletedGuidance: true });
      this.setData({ hasGuidance: false });
    } catch {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
  edit() {
    wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
  capabilityCard() {
    wx.navigateTo({ url: '/pages/capability-card/index' });
  },
  activities() {
    if (this.data.authStatus === 'authenticated')
      wx.navigateTo({ url: '/pages/admin/activity-list/index' });
  },
  admin() {
    if (this.data.isAdmin) wx.navigateTo({ url: '/pages/admin/reviews/index' });
  },
  async retryAuth() {
    await this.load(true);
  },
  async retryProfile() {
    await this.load();
  },
});
