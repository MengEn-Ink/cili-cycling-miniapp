import { rideService } from '../../../services/ride-service';
import { activities } from '../../../mock/fixtures';
Page({
  data: { a: null as any },
  async onLoad(q: any) {
    const a = q.id
      ? await rideService.getActivity(q.id)
      : { ...activities[0], id: 'act-' + Date.now(), title: '未命名骑行活动', status: 'draft' };
    this.setData({ a });
  },
  set(e: any) {
    this.setData({ ['a.' + e.currentTarget.dataset.k]: e.detail.value });
  },
  async save() {
    await rideService.saveActivity(this.data.a);
    wx.showToast({ title: '已保存 Mock' });
    setTimeout(() => wx.navigateBack(), 500);
  },
});
