import { rideService } from '../../services/ride-service';
import { activityDisplayStatus } from '../../utils/activity';
import { occupiedCount } from '../../utils/capacity';
Page({
  data: { loading: true, error: '', items: [] as any[] },
  onShow() {
    this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const [a, r] = await Promise.all([
        rideService.listActivities(),
        rideService.listRegistrations(),
      ]);
      this.setData({
        items: a.map((x) => ({
          ...x,
          occupied: occupiedCount(r.filter((v) => v.activityId === x.id)),
          displayStatus: activityDisplayStatus(
            x,
            occupiedCount(r.filter((v) => v.activityId === x.id)),
          ),
        })),
      });
    } catch {
      this.setData({ error: '活动加载失败，请稍后重试' });
    } finally {
      this.setData({ loading: false });
    }
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/activity-detail/index?id=' + e.currentTarget.dataset.id });
  },
});
