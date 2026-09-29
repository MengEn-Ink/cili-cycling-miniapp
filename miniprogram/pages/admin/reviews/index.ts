import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';

const statusText: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  cancelled: '已取消',
};

Page({
  data: {
    tab: 'pending',
    items: [] as any[],
    all: [] as any[],
    activities: [] as any[],
    activityId: '',
    selectedActivityTitle: '',
    error: '',
  },
  onShow() {
    void this.load();
  },
  async load() {
    await appStore.refreshIdentity(wx.cloud);
    if (appStore.role !== 'admin' || appStore.authStatus !== 'authenticated') {
      this.setData({ error: '仅已验证管理员可审批' });
      return;
    }
    try {
      const activities = await rideService.listActivities();
      const activityId = this.data.activityId || activities[0]?.id;
      if (!activityId) {
        this.setData({ activities, error: '暂无可审批活动' });
        return;
      }
      const all = await rideService.listReviewRegistrations(activityId);
      const selectedActivity = activities.find((activity) => activity.id === activityId);
      this.setData({
        activities,
        activityId,
        selectedActivityTitle: selectedActivity?.title || '活动信息不可用',
        all,
        error: '',
      });
      this.filter();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '审批列表加载失败' });
    }
  },
  choose(e: any) {
    const selected = this.data.activities[Number(e.detail.value)];
    if (selected) this.setData({ activityId: selected.id, selectedActivityTitle: selected.title });
    void this.load();
  },
  tab(e: any) {
    this.setData({ tab: e.currentTarget.dataset.v });
    this.filter();
  },
  filter() {
    const activity = this.data.activities.find((item: any) => item.id === this.data.activityId);
    this.setData({
      items: this.data.all
        .filter((item: any) => this.data.tab === 'all' || item.status === this.data.tab)
        .map((item: any) => ({
          ...item,
          activity,
          statusText: statusText[item.status] || item.status,
        })),
    });
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/admin/review-detail/index?id=' + e.currentTarget.dataset.id });
  },
});
