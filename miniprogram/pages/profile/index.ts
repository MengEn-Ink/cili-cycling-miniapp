import { rideService } from '../../services/ride-service';
import { appStore } from '../../store/app-store';
import { runPageTask } from '../../services/page-service';
import { personalCardViewModel } from '../../utils/personal-card';
import type { PersonalCapabilityCard } from '../../models';

function identityViewData() {
  return {
    role: appStore.role,
    isSuper: appStore.isSuper,
    authStatus: appStore.authStatus,
    authError: appStore.authError,
    isAdmin: appStore.authStatus === 'authenticated' && appStore.role === 'admin',
  };
}
Page({
  data: {
    profile: null as any,
    loading: true,
    error: '',
    role: 'member',
    isSuper: false,
    authStatus: 'idle',
    authError: '',
    isAdmin: false,
    heroBackgrounds: [] as any[],
    heroAvatarUrl: '',
    hasGuidance: false,
  },
  async onShow() {
    await this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    const auth = appStore.refreshIdentity(wx.cloud);
    this.setData(identityViewData());
    await auth;

    const [profileState, cardState] = await Promise.all([
      runPageTask(() => rideService.getProfile(), '资料服务暂不可用'),
      runPageTask(() => rideService.getPersonalCapabilityCard(), '').catch(() => ({
        data: null,
        error: '',
      })),
    ]);

    const profile = profileState.data;
    const card = cardState.data as PersonalCapabilityCard | null;
    const vm = card ? personalCardViewModel(card) : null;

    this.setData({
      profile: profile || null,
      loading: false,
      error: profileState.error,
      heroBackgrounds: vm?.backgrounds || [],
      heroAvatarUrl: vm?.avatarUrl || '',
      hasGuidance: profile ? !profile.hasCompletedGuidance : false,
      ...identityViewData(),
    });
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
    await this.load();
  },
});
