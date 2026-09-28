import { rideService } from '../../../services/ride-service';
Page({
  data: { items: [] as any[] },
  async onShow() {
    this.setData({ items: await rideService.listActivities() });
  },
  edit(e: any) {
    wx.navigateTo({ url: '/pages/admin/activity-edit/index?id=' + e.currentTarget.dataset.id });
  },
  create() {
    wx.navigateTo({ url: '/pages/admin/activity-edit/index' });
  },
});
