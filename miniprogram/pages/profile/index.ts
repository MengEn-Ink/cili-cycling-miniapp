import { rideService } from '../../services/ride-service';
import { appStore } from '../../store/app-store';
import { runPageTask } from '../../services/page-service';
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
    isAdmin: false,
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
  async load() {
    const requestId = ++this.loadRequestId;
    const hasProfile = Boolean(this.data.profile);
    this.setData({
      loading: !hasProfile,
      refreshing: hasProfile,
      error: '',
    });

    const identity = runPageTask(() => appStore.refreshIdentity(wx.cloud), '身份服务暂不可用');
    this.setData(identityViewData());
    const profile = runPageTask(() => rideService.getProfile(), '资料服务暂不可用');

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
        this.setData({
          profile: state.data || null,
          loading: false,
          refreshing: false,
          error: '',
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
    await this.load();
  },
  async retryProfile() {
    await this.load();
  },
});
