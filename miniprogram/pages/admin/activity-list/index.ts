import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
Page({
  data: { items: [] as any[], error: '', allowed: false },
  async onShow() {
    await appStore.refreshIdentity(wx.cloud);
    if (appStore.role !== 'admin' || appStore.authStatus !== 'authenticated') {
      this.setData({ error: '仅已验证管理员可访问', allowed: false });
      return;
    }
    try {
      this.setData({ items: await rideService.listActivities(), allowed: true, error: '' });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '加载失败' });
    }
  },
  edit() {
    wx.showToast({ title: '真实云端活动编辑暂未开放', icon: 'none' });
  },
  create() {
    wx.showToast({ title: '真实云端活动新建暂未开放', icon: 'none' });
  },
  reviews() {
    wx.navigateTo({ url: '/pages/admin/reviews/index' });
  },
});
