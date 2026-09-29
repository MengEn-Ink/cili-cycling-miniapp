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

// 解析两种可选头像：微信头像来自名片背景中的 avatar 资源，Strava 头像来自授权后的运动员资料。
function avatarUrls(card: PersonalCapabilityCard | null) {
  const view = card ? personalCardViewModel(card) : null;
  return {
    wechatAvatarUrl: view?.backgrounds.find((item) => item.source === 'avatar')?.url || '',
    stravaAvatarUrl: card?.stravaAvatarUrl || '',
  };
}

function cardHeroData(card: PersonalCapabilityCard | null, profile: Profile | null) {
  const view = card ? personalCardViewModel(card) : null;
  const { wechatAvatarUrl, stravaAvatarUrl } = avatarUrls(card);
  const preferStrava = profile?.avatarSource === 'strava';
  // 用户选定来源优先；该来源缺图时再回退另一来源，最后才使用资料内已上传头像。
  const profileAvatarUrl =
    (preferStrava ? stravaAvatarUrl : wechatAvatarUrl) ||
    (preferStrava ? wechatAvatarUrl : stravaAvatarUrl) ||
    profile?.avatarId ||
    '';
  const heroBackground = view?.backgrounds.find((item) => item.source === 'user_photo')?.url || '';

  return {
    profileHeroBackground: heroBackground,
    hasProfileHeroBackground: Boolean(heroBackground),
    profileAvatarUrl,
    hasProfileAvatar: Boolean(profileAvatarUrl),
    profileAvatarSourceLabel:
      profileAvatarUrl && profileAvatarUrl === stravaAvatarUrl
        ? 'Strava 头像'
        : profileAvatarUrl
          ? '微信头像'
          : '默认头像',
    profileInitial: initialOf(profile),
    profileCardStatus: view?.statusLabel || '',
    // 头像快捷切换：两个来源的可用性与当前已保存偏好
    avatarSourceWechatAvailable: Boolean(wechatAvatarUrl),
    avatarSourceStravaAvailable: Boolean(stravaAvatarUrl),
    avatarSourcePreference: preferStrava ? 'strava' : 'wechat',
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
    avatarSourceWechatAvailable: false,
    avatarSourceStravaAvailable: false,
    avatarSourcePreference: 'wechat',
    avatarSourceSwitching: false,
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
  // 快捷切换头像来源：乐观更新并持久化，失败时回滚，避免只能进二级编辑页修改。
  async selectAvatarSource(event: { currentTarget: { dataset: { source?: string } } }) {
    if (this.data.avatarSourceSwitching) return;
    const profile = this.data.profile;
    if (!profile) return;
    const source = event.currentTarget.dataset.source === 'strava' ? 'strava' : 'wechat';
    if (this.data.avatarSourcePreference === source) return;
    const { wechatAvatarUrl, stravaAvatarUrl } = avatarUrls(this.data.profileCapabilityCard);
    const targetUrl = source === 'strava' ? stravaAvatarUrl : wechatAvatarUrl;
    if (!targetUrl)
      return wx.showToast({
        title: source === 'strava' ? '暂无 Strava 头像，请先授权' : '暂无微信头像',
        icon: 'none',
      });

    // 记录回滚快照，持久化失败时恢复原头像与偏好。
    const rollback = {
      profile,
      profileAvatarUrl: this.data.profileAvatarUrl,
      hasProfileAvatar: this.data.hasProfileAvatar,
      profileAvatarSourceLabel: this.data.profileAvatarSourceLabel,
      avatarSourcePreference: this.data.avatarSourcePreference,
    };
    const nextProfile: Profile = { ...profile, avatarSource: source };
    this.setData({
      avatarSourceSwitching: true,
      profile: nextProfile,
      profileAvatarUrl: targetUrl,
      hasProfileAvatar: true,
      profileAvatarSourceLabel: source === 'strava' ? 'Strava 头像' : '微信头像',
      avatarSourcePreference: source,
    });
    try {
      const saved = await rideService.updateProfile({ avatarSource: source });
      // 旧部署回包可能缺 avatarSource，保留用户刚确认的选择，不被旧值覆盖。
      const savedProfile: Profile = {
        ...(saved || nextProfile),
        avatarSource: saved?.avatarSource ?? source,
      };
      this.setData({
        avatarSourceSwitching: false,
        profile: savedProfile,
        ...cardHeroData(this.data.profileCapabilityCard, savedProfile),
      });
    } catch {
      this.setData({ avatarSourceSwitching: false, ...rollback });
      wx.showToast({ title: '头像切换失败，请稍后重试', icon: 'none' });
    }
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
