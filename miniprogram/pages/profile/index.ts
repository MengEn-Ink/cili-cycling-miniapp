import type { PersonalCapabilityCard, Profile } from '../../models/index';
import { rideService } from '../../services/ride-service';
import { appStore } from '../../store/app-store';
import { runPageTask } from '../../services/page-service';
import { personalCardViewModel } from '../../utils/personal-card';

function identityViewData(fallbackError = '') {
  const authStatus = fallbackError ? 'error' : appStore.authStatus;
  return {
    role: appStore.role,
    isSuper: appStore.isSuper,
    authStatus,
    authError: appStore.authError || fallbackError,
    isAdmin: authStatus === 'authenticated' && appStore.role === 'admin',
  };
}

function initialOf(profile: Profile | null) {
  const name = profile?.nickname?.trim() || 'C';
  return Array.from(name)[0] || 'C';
}

function cardHeroData(card: PersonalCapabilityCard | null, profile: Profile | null) {
  const view = card ? personalCardViewModel(card) : null;
  const wechatAvatar = view?.backgrounds.find((item) => item.source === 'avatar')?.url || '';
  const stravaAvatar = card?.stravaAvatarUrl || '';
  const preferredAvatar = profile?.avatarSource === 'strava' ? stravaAvatar : wechatAvatar;
  const fallbackAvatar = profile?.avatarSource === 'strava' ? wechatAvatar : stravaAvatar;
  const profileAvatarUrl = preferredAvatar || fallbackAvatar || profile?.avatarId || '';
  const heroBackground = view?.backgrounds.find((item) => item.source === 'user_photo')?.url || '';

  return {
    profileHeroBackground: heroBackground,
    hasProfileHeroBackground: Boolean(heroBackground),
    profileAvatarUrl,
    hasProfileAvatar: Boolean(profileAvatarUrl),
    profileAvatarSourceLabel:
      profileAvatarUrl === stravaAvatar
        ? 'Strava 头像'
        : profileAvatarUrl
          ? '微信头像'
          : '默认头像',
    profileInitial: initialOf(profile),
    profileCardStatus: view?.statusLabel || '',
  };
}

Page({
  loadRequestId: 0,
  data: {
    profile: null as Profile | null,
    loading: true,
    refreshing: false,
    error: '',
    role: 'member',
    isSuper: false,
    authStatus: 'idle',
    authError: '',
    isAdmin: false,
    profileHeroBackground: '',
    hasProfileHeroBackground: false,
    profileAvatarUrl: '',
    hasProfileAvatar: false,
    profileInitial: 'C',
    profileAvatarSourceLabel: '默认头像',
    profileCardStatus: '',
    profileCapabilityCard: null as PersonalCapabilityCard | null,
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
    this.setData({
      loading: !hasProfile,
      refreshing: hasProfile,
      error: '',
    });

    const identity = runPageTask(
      () => appStore.refreshIdentity(wx.cloud, forceIdentity),
      '身份服务暂不可用',
    );
    this.setData(identityViewData());
    const profile = runPageTask(() => rideService.getProfile(), '资料服务暂不可用');
    const capabilityCard = runPageTask(
      () => rideService.getPersonalCapabilityCard(),
      '骑行名片暂时无法加载',
    );

    await Promise.all([
      identity.then((state) => {
        if (requestId !== this.loadRequestId) return;
        this.setData(identityViewData(state.error));
      }),
      profile.then((state) => {
        if (requestId !== this.loadRequestId) return;
        if (state.error) {
          this.setData({ loading: false, refreshing: false, error: state.error });
          return;
        }
        const nextProfile = state.data || null;
        this.setData({
          profile: nextProfile,
          ...cardHeroData(this.data.profileCapabilityCard, nextProfile),
          loading: false,
          refreshing: false,
          error: '',
        });
      }),
      capabilityCard.then((state) => {
        if (requestId !== this.loadRequestId || state.error || !state.data) return;
        const nextCard = state.data as PersonalCapabilityCard;
        this.setData({
          profileCapabilityCard: nextCard,
          ...cardHeroData(nextCard, this.data.profile),
        });
      }),
    ]);
  },
  edit() {
    wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
  capabilityCard() {
    wx.navigateTo({ url: '/pages/capability-card/index' });
  },
  strava() {
    wx.navigateTo({ url: '/pages/strava/index' });
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
  avatarError() {
    if (!this.data.hasProfileAvatar) return;
    this.setData({
      profileAvatarUrl: '',
      hasProfileAvatar: false,
      profileAvatarSourceLabel: '默认头像',
    });
  },
  heroBackgroundError() {
    if (!this.data.hasProfileHeroBackground) return;
    this.setData({ profileHeroBackground: '', hasProfileHeroBackground: false });
  },
});
