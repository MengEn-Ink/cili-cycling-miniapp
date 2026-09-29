import { rideService } from '../../services/ride-service';
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
      const [registrations, activities] = await Promise.all([
        rideService.listRegistrations(),
        rideService.listActivities(),
      ]);
      if (requestId !== this.loadRequestId) return;
      this.setData({
        items: registrations.map((item) => ({
          ...item,
          activity: activities.find((activity) => activity.id === item.activityId) || {
            title: '活动信息不可用',
          },
          statusText: {
            pending: '待审核',
            approved: '已通过',
            rejected: '已驳回',
            cancelled: '已取消',
          }[item.status],
        })),
      });
    } catch (error) {
      if (requestId !== this.loadRequestId) return;
      const message = error instanceof Error ? error.message : '报名加载失败';
      this.setData(hasItems ? { refreshError: message } : { error: message });
    } finally {
      if (requestId === this.loadRequestId) {
        this.setData({ loading: false, refreshing: false });
      }
    }
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/credential/index?id=' + e.currentTarget.dataset.id });
  },
});
