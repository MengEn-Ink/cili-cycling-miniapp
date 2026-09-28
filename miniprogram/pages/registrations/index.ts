import { rideService } from '../../services/ride-service';
Page({
  data: { loading: true, error: '', items: [] as any[] },
  onShow() {
    void this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const [registrations, activities] = await Promise.all([
        rideService.listRegistrations(),
        rideService.listActivities(),
      ]);
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
      this.setData({ error: error instanceof Error ? error.message : '报名加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/credential/index?id=' + e.currentTarget.dataset.id });
  },
});
