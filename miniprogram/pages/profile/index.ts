import { rideService } from '../../services/ride-service';
import { appStore } from '../../store/app-store';
import { runPageTask } from '../../services/page-service';
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
  },
  async onShow() {
    const auth = appStore.refreshIdentity(wx.cloud);
    this.setData(identityViewData());
    await auth;
    const state = await runPageTask(() => rideService.getProfile(), '资料服务暂不可用');
    this.setData({
      profile: state.data || null,
      loading: false,
      error: state.error,
      ...identityViewData(),
    });
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
    await appStore.refreshIdentity(wx.cloud);
    this.setData(identityViewData());
  },
});
