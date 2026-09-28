import { rideService } from '../../services/ride-service';
Page({
  data: { p: null as any },
  async onLoad() {
    this.setData({ p: await rideService.getProfile() });
  },
  set(e: any) {
    this.setData({ ['p.' + e.currentTarget.dataset.k]: e.detail.value });
  },
  add() {
    const p = this.data.p;
    p.photos.push({ id: 'mock-' + Date.now(), category: '骑行照' });
    this.setData({ p });
  },
  remove() {
    const p = this.data.p;
    p.photos.pop();
    this.setData({ p });
  },
  async save() {
    await rideService.saveProfile(this.data.p);
    wx.showToast({ title: '已保存 Mock' });
    setTimeout(() => wx.navigateBack(), 500);
  },
});
