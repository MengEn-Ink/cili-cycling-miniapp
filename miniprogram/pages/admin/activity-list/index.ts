import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
Page({
  data: { items: [] as any[], error: '', allowed: false, isAdmin: false },
  async onShow() {
    await appStore.refreshIdentity(wx.cloud, true);
    if (appStore.authStatus !== 'authenticated') {
      this.setData({ error: '请先完成微信身份验证', allowed: false });
      return;
    }
    try {
      this.setData({
        items: await rideService.listAdminActivities(),
        allowed: true,
        isAdmin: appStore.role === 'admin',
        error: '',
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '加载失败' });
    }
  },
  edit(event: any) {
    wx.navigateTo({ url: `/pages/admin/activity-edit/index?id=${event.currentTarget.dataset.id}` });
  },
  create() {
    wx.navigateTo({ url: '/pages/admin/activity-edit/index' });
  },
  reviews() {
    if (this.data.isAdmin) wx.navigateTo({ url: '/pages/admin/reviews/index' });
  },
});
