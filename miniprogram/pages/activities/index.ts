import { rideService } from '../../services/ride-service';
import { activityDisplayStatus } from '../../utils/activity';
Page({
  data: { loading: true, error: '', items: [] as any[] },
  onShow() {
    void this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const activities = await rideService.listActivities();
      this.setData({
        items: activities.map((item) => ({
          ...item,
          occupied: item.occupiedCount || 0,
          remaining: Math.max(item.capacity - (item.occupiedCount || 0), 0),
          displayStatus: activityDisplayStatus(item, item.occupiedCount || 0),
        })),
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '活动加载失败，请稍后重试' });
    } finally {
      this.setData({ loading: false });
    }
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/activity-detail/index?id=' + e.currentTarget.dataset.id });
  },
});
