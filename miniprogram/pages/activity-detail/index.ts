import { rideService } from '../../services/ride-service';
Page({
  data: { loading: true, error: '', item: null as any, registration: null as any },
  onLoad(q: any) {
    void this.load(q.id || '');
  },
  async load(id: string) {
    try {
      const item = await rideService.getActivity(id);
      let registration;
      try {
        registration = (await rideService.listRegistrations()).find(
          (value) => value.activityId === id,
        );
      } catch {
        registration = undefined;
      }
      this.setData({ item, registration });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '详情加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  go() {
    const r = this.data.registration;
    wx.navigateTo({
      url: r
        ? '/pages/credential/index?id=' + r.id
        : '/pages/registration-form/index?id=' + this.data.item.id,
    });
  },
});
