import { rideService } from '../../../services/ride-service';
import { activities } from '../../../mock/fixtures';
Page({
  data: { tab: 'pending', items: [] as any[], all: [] as any[] },
  onShow() {
    this.load();
  },
  async load() {
    const a = await rideService.listRegistrations();
    this.setData({ all: a });
    this.filter();
  },
  tab(e: any) {
    this.setData({ tab: e.currentTarget.dataset.v });
    this.filter();
  },
  filter() {
    const { all, tab } = this.data;
    this.setData({
      items: all
        .filter((x: any) => tab === 'all' || x.status === tab)
        .map((x: any) => ({ ...x, activity: activities.find((a) => a.id === x.activityId) })),
    });
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/admin/review-detail/index?id=' + e.currentTarget.dataset.id });
  },
});
