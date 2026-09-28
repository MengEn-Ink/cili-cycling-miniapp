import { rideService } from '../../services/ride-service';
Page({
  data: { status: 'connected' },
  async connect() {
    await rideService.setStrava('connected');
    this.setData({ status: 'connected' });
    wx.showToast({ title: 'Mock 绑定成功', icon: 'none' });
  },
  async exempt() {
    await rideService.setStrava('pending');
    this.setData({ status: 'pending' });
    wx.showToast({ title: '豁免申请已提交', icon: 'none' });
  },
});
