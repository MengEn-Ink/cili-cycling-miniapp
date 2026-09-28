import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
Page({
  data: {
    tab: 'pending',
    items: [] as any[],
    all: [] as any[],
    activities: [] as any[],
    activityId: '',
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
      this.setData({ activities, activityId, all, error: '' });
      this.filter();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '审批列表加载失败' });
    }
  },
  choose(e: any) {
    const selected = this.data.activities[Number(e.detail.value)];
    if (selected) this.setData({ activityId: selected.id });
    void this.load();
  },
  tab(e: any) {
    this.setData({ tab: e.currentTarget.dataset.v });
    this.filter();
  },
  filter() {
    const activity = this.data.activities.find((a: any) => a.id === this.data.activityId);
    this.setData({
      items: this.data.all
        .filter((x: any) => this.data.tab === 'all' || x.status === this.data.tab)
        .map((x: any) => ({ ...x, activity })),
    });
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/admin/review-detail/index?id=' + e.currentTarget.dataset.id });
  },
});
