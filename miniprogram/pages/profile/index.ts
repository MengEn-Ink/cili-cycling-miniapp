import { rideService } from '../../services/ride-service';
import { appStore } from '../../store/app-store';

function identityViewData() {
  return {
    openid: appStore.openid,
    role: appStore.role,
    isSuper: appStore.isSuper,
    authStatus: appStore.authStatus,
    authError: appStore.authError,
    canSwitchRole: appStore.canSwitchRole(),
  };
}

Page({
  data: {
    profile: null as any,
    openid: null as string | null,
    role: 'member',
    isSuper: false,
    authStatus: 'idle',
    authError: '',
    canSwitchRole: true,
  },
  async onShow() {
    const profilePromise = rideService.getProfile();
    const authPromise = appStore.refreshIdentity(wx.cloud);
    this.setData(identityViewData());
    const [profile] = await Promise.all([profilePromise, authPromise]);
    this.setData({ profile, ...identityViewData() });
  },
  edit() {
    wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
  strava() {
    wx.navigateTo({ url: '/pages/strava/index' });
  },
  async retryAuth() {
    const authPromise = appStore.refreshIdentity(wx.cloud);
    this.setData(identityViewData());
    await authPromise;
    this.setData(identityViewData());
  },
  copyOpenid() {
    if (!appStore.openid) return;
    wx.setClipboardData({ data: appStore.openid });
  },
  switchRole() {
    const role = this.data.role === 'member' ? 'admin' : 'member';
    try {
      appStore.switchRole(role);
      this.setData(identityViewData());
      wx.showToast({ title: '已切换 ' + role, icon: 'none' });
    } catch {
      this.setData(identityViewData());
      wx.showToast({ title: '真实身份已生效，无法本地切换', icon: 'none' });
    }
  },
});
