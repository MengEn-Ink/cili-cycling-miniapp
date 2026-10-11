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
    statusCounts: { review: 0, ready: 0, expired: 0 },
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
    this.setData({ loading: !hasItems, refreshing: hasItems, error: '', refreshError: '' });
    try {
      const registrations = await rideService.listRegistrations();
      if (requestId !== this.loadRequestId) return;
      const items = registrations.map((item) => {
        const activity = item.activity || { title: '历史活动', date: item.updatedAt };
        const statusText = {
          waiting: '候补中',
          pending: '待审核',
          approved: '已通过',
          checked_in: '已签到',
          rejected: '已驳回',
          cancelled: '已取消',
        }[item.status];
        const displayStatusText = {
          waiting: '候补',
          pending: '待审核',
          approved: '已通过',
          checked_in: '已签到',
          rejected: '未通过',
          cancelled: '已取消',
        }[item.status];
        const statusGuidance = {
          waiting: '等待名额释放',
          pending: '资料审核中',
          approved: '凭证已就绪',
          checked_in: '本次行程已签到',
          rejected: '查看未通过原因',
          cancelled: '本次报名已取消',
        }[item.status];
        return {
          ...item,
          updatedAt: formatChinaDateTime(item.updatedAt),
          activity: { ...activity, displayDate: formatActivityDate(activity.date) },
          statusText,
          displayStatusText,
          statusGuidance,
          destinationLabel:
            item.status === 'approved' || item.status === 'checked_in' ? '查看凭证' : '查看详情',
        };
      });
      const statusCounts = items.reduce(
        (counts, item) => {
          if (item.status === 'waiting' || item.status === 'pending') counts.review += 1;
          else if (item.status === 'approved' || item.status === 'checked_in') counts.ready += 1;
          else counts.expired += 1;
          return counts;
        },
        { review: 0, ready: 0, expired: 0 },
      );
      this.setData({ items, statusCounts });
    } catch (error) {
      if (requestId !== this.loadRequestId) return;
      const message = error instanceof Error ? error.message : '报名加载失败';
      this.setData(hasItems ? { refreshError: message } : { error: message });
    } finally {
      if (requestId === this.loadRequestId) this.setData({ loading: false, refreshing: false });
    }
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/credential/index?id=' + e.currentTarget.dataset.id });
  },
});
