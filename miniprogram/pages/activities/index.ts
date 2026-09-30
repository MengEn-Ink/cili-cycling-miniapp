import { rideService } from '../../services/ride-service';
import { activityDisplayStatus } from '../../utils/activity';
import { formatActivityDate } from '../../utils/date-time';
Page({
  loadRequestId: 0,
  data: {
    loading: true,
    refreshing: false,
    error: '',
    refreshError: '',
    items: [] as any[],
  },
  onShow() {
    void this.load();
  },
  onHide() {
    this.loadRequestId += 1;
  },
  onUnload() {
    this.loadRequestId += 1;
  },
  async load() {
    const requestId = ++this.loadRequestId;
    const hasItems = this.data.items.length > 0;
    this.setData({
      loading: !hasItems,
      refreshing: hasItems,
      error: '',
      refreshError: '',
    });
    try {
      const activities = await rideService.listActivities();
      if (requestId !== this.loadRequestId) return;
      this.setData({
        items: activities.map((item) => ({
          ...item,
          occupied: item.occupiedCount || 0,
          remaining: Math.max(item.capacity - (item.occupiedCount || 0), 0),
          displayDate: formatActivityDate(item.startAt || item.date),
          displayStatus: activityDisplayStatus(item),
        })),
      });
    } catch (error) {
      if (requestId !== this.loadRequestId) return;
      const message = error instanceof Error ? error.message : '活动加载失败，请稍后重试';
      this.setData(hasItems ? { refreshError: message } : { error: message });
    } finally {
      if (requestId === this.loadRequestId) {
        this.setData({ loading: false, refreshing: false });
      }
    }
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/activity-detail/index?id=' + e.currentTarget.dataset.id });
  },
});
