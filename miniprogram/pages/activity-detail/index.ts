import { rideService } from '../../services/ride-service';
Page({
  data: { loading: true, error: '', item: null as any, registration: null as any },
  onLoad(q: any) {
    this.load(q.id || 'forest');
  },
  async load(id: string) {
    try {
      const [a, rs] = await Promise.all([
        rideService.getActivity(id),
        rideService.listRegistrations(),
      ]);
      if (!a) throw Error();
      this.setData({ item: a, registration: rs.find((x) => x.activityId === id) });
    } catch {
      this.setData({ error: '详情加载失败' });
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
