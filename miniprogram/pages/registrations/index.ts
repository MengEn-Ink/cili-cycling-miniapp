import { rideService } from '../../services/ride-service';
import { activities } from '../../mock/fixtures';
Page({
  data: { loading: true, error: '', items: [] as any[] },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const r = await rideService.listRegistrations();
      this.setData({
        items: r.map((x) => ({
          ...x,
          activity: activities.find((a) => a.id === x.activityId),
          statusText: {
            pending: '待审核',
            approved: '已通过',
            rejected: '已驳回',
            cancelled: '已取消',
          }[x.status],
        })),
      });
    } catch {
      this.setData({ error: '报名加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/credential/index?id=' + e.currentTarget.dataset.id });
  },
});
