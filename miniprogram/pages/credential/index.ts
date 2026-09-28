import { rideService } from '../../services/ride-service';
Page({
  data: { item: null as any, activity: null as any, loading: true, error: '' },
  async onLoad(q: any) {
    try {
      const item = await rideService.getRegistration(q.id || '');
      if (!item) throw new Error('报名不存在');
      const activity = await rideService.getActivity(item.activityId);
      this.setData({ item, activity });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '报名凭证加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  async cancel() {
    try {
      await rideService.updateRegistration(this.data.item.id, 'cancelled');
      await this.onLoad({ id: this.data.item.id });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '取消失败' });
    }
  },
  retry() {
    wx.redirectTo({ url: '/pages/registration-form/index?id=' + this.data.item.activityId });
  },
});
