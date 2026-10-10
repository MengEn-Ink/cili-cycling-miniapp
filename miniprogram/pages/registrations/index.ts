import { rideService } from '../../services/ride-service';
import { formatActivityDate, formatChinaDateTime } from '../../utils/date-time';
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
      const registrations = await rideService.listRegistrations();
      if (requestId !== this.loadRequestId) return;
      this.setData({
        items: registrations.map((item) => {
          const activity = item.activity || {
            title: '历史活动',
            date: item.updatedAt,
          };
          return {
            ...item,
            updatedAt: formatChinaDateTime(item.updatedAt),
            activity: {
              ...activity,
              displayDate: formatActivityDate(activity.date),
            },
            statusText: {
              waiting: '候补中',
              pending: '待审核',
              approved: '已通过',
              checked_in: '已签到',
              rejected: '已驳回',
              cancelled: '已取消',
            }[item.status],
          };
        }),
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
