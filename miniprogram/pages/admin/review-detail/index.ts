import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
import { capabilityCard } from '../../../utils/capability-card';

const statusText: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  cancelled: '已取消',
};

let loadRequestId = 0;

Page({
  data: {
    x: null as any,
    card: null as any,
    phone: '',
    phoneSource: '',
    statusText: '',
    reason: '能力与路线要求暂不匹配',
    error: '',
    loading: false,
    submitting: false,
  },
  async onLoad(q: any) {
    const requestId = ++loadRequestId;
    this.setData({ loading: true, error: '' });
    await appStore.ensureIdentity(wx.cloud);
    if (requestId !== loadRequestId) return;
    if (appStore.role !== 'admin' || appStore.authStatus !== 'authenticated') {
      this.setData({ error: '仅已验证管理员可审批', loading: false });
      return;
    }
    try {
      const x = await rideService.getReviewRegistration(q.id || '');
      if (requestId !== loadRequestId) return;
      if (x)
        this.setData({
          x,
          card: capabilityCard(x),
          phone: x.profile.phone,
          phoneSource:
            x.profile.sensitiveStatus?.phoneSource === 'wechat'
              ? '微信授权 · 已验证'
              : x.profile.sensitiveStatus?.phoneSource === 'manual'
                ? '个人手填 · 未验证'
                : x.profile.sensitiveStatus?.phoneSource === 'legacy'
                  ? '历史资料 · 验证状态未知'
                  : '来源未知',
          statusText: statusText[x.status] || x.status,
          loading: false,
        });
      else this.setData({ error: '报名记录不存在', loading: false });
    } catch (error) {
      if (requestId !== loadRequestId) return;
      this.setData({
        error: error instanceof Error ? error.message : '报名详情加载失败',
        loading: false,
      });
    }
  },
  onUnload() {
    loadRequestId += 1;
  },
  reason(e: any) {
    this.setData({ reason: e.detail.value });
  },
  async act(e: any) {
    if (this.data.submitting || !this.data.x) return;
    const status = e.currentTarget.dataset.s;
    if (status === 'rejected' && !this.data.reason.trim())
      return wx.showToast({ title: '驳回理由必填', icon: 'none' });
    this.setData({ submitting: true, error: '' });
    try {
      await rideService.updateRegistration(this.data.x.id, status, this.data.reason);
      this.setData({ statusText: statusText[status] || status, submitting: false });
      wx.showToast({ title: status === 'approved' ? '已通过' : '已驳回' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : '审批失败',
        submitting: false,
      });
    }
  },
});
