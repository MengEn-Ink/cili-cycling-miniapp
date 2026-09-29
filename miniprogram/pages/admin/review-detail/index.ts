import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
import { maskId, maskPhone } from '../../../utils/mask';
import { capabilityCard } from '../../../utils/capability-card';
Page({
  data: {
    x: null as any,
    card: null as any,
    phone: '',
    id: '',
    reason: '能力与路线要求暂不匹配',
    error: '',
  },
  async onLoad(q: any) {
    await appStore.refreshIdentity(wx.cloud);
    if (appStore.role !== 'admin' || appStore.authStatus !== 'authenticated') {
      this.setData({ error: '仅已验证管理员可审批' });
      return;
    }
    try {
      const x = await rideService.getReviewRegistration(q.id || '');
      if (x)
        this.setData({
          x,
          card: capabilityCard(x),
          phone: maskPhone(x.profile.phone),
          id: maskId(x.profile.idNumber),
        });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '报名详情加载失败' });
    }
  },
  reason(e: any) {
    this.setData({ reason: e.detail.value });
  },
  async act(e: any) {
    const status = e.currentTarget.dataset.s;
    if (status === 'rejected' && !this.data.reason.trim())
      return wx.showToast({ title: '驳回理由必填', icon: 'none' });
    try {
      await rideService.updateRegistration(this.data.x.id, status, this.data.reason);
      wx.showToast({ title: status === 'approved' ? '已通过' : '已驳回' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '审批失败' });
    }
  },
});
