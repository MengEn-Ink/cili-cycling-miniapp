import { rideService } from '../../services/ride-service';
import { activities } from '../../mock/fixtures';
Page({
  data: { item: null as any, activity: null as any },
  async onLoad(q: any) {
    const x = await rideService.getRegistration(q.id || 'r1');
    this.setData({ item: x, activity: activities.find((a) => a.id === x?.activityId) });
  },
  async cancel() {
    await rideService.updateRegistration(this.data.item.id, 'cancelled');
    this.onLoad({ id: this.data.item.id });
  },
  retry() {
    wx.redirectTo({ url: '/pages/registration-form/index?id=' + this.data.item.activityId });
  },
});
