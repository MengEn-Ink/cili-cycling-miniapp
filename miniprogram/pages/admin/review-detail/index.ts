import { rideService } from '../../../services/ride-service';
import { maskId, maskPhone } from '../../../utils/mask';
Page({
  data: { x: null as any, phone: '', id: '', reason: '能力与路线要求暂不匹配' },
  async onLoad(q: any) {
    const x = await rideService.getRegistration(q.id || 'r1');
    if (x) this.setData({ x, phone: maskPhone(x.profile.phone), id: maskId(x.profile.idNumber) });
  },
  reason(e: any) {
    this.setData({ reason: e.detail.value });
  },
  async act(e: any) {
    const s = e.currentTarget.dataset.s;
    if (s === 'rejected' && !this.data.reason.trim())
      return wx.showToast({ title: '驳回理由必填', icon: 'none' });
    await rideService.updateRegistration(this.data.x.id, s, this.data.reason);
    wx.showToast({ title: s === 'approved' ? '已通过' : '已驳回' });
    setTimeout(() => wx.navigateBack(), 500);
  },
});
