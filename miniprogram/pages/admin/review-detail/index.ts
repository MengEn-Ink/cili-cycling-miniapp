import { rideService } from '../../../services/ride-service';
import { syncPageTheme } from '../../../services/theme-service';
import { appStore } from '../../../store/app-store';
import { capabilityCard } from '../../../utils/capability-card';
import { formatChinaDateTime } from '../../../utils/date-time';

const statusText: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  checked_in: '已签到',
  rejected: '已驳回',
  cancelled: '已取消',
};

const confirmCheckIn = () =>
  new Promise<boolean>((resolve) => {
    wx.showModal({
      title: '确认签到',
      content: '确认该骑手已到场并完成签到？核销后不可取消报名。',
      confirmText: '确认签到',
      success: (result: { confirm: boolean }) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });

let loadRequestId = 0;

Page({
  data: {
    theme: 'dark',
    themeClass: 'theme-dark',
    x: null as any,
    card: null as any,
    phone: '',
    phoneSource: '',
    statusText: '',
    reason: '',
    error: '',
    loading: false,
    submitting: false,
  },
  onShow() {
    syncPageTheme(this);
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
          x: {
            ...x,
            updatedAt: formatChinaDateTime(x.updatedAt),
            checkedInAt: formatChinaDateTime(x.checkedInAt),
          },
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
  async checkIn() {
    if (this.data.submitting || this.data.x?.status !== 'approved') return;
    const requestId = loadRequestId;
    this.setData({ submitting: true, error: '' });
    if (!(await confirmCheckIn())) {
      if (requestId === loadRequestId) this.setData({ submitting: false });
      return;
    }
    if (requestId !== loadRequestId) return;
    try {
      const x = await rideService.checkInRegistration(this.data.x.id);
      if (requestId !== loadRequestId) return;
      this.setData({
        x: { ...x, checkedInAt: formatChinaDateTime(x.checkedInAt) },
        statusText: statusText[x.status] || x.status,
        submitting: false,
      });
      wx.showToast({ title: '签到成功' });
    } catch (error) {
      if (requestId !== loadRequestId) return;
      this.setData({
        error: error instanceof Error ? error.message : '签到失败',
        submitting: false,
      });
    }
  },
  async act(e: any) {
    if (this.data.submitting || !this.data.x) return;
    const status = e.currentTarget.dataset.s;
    if (status === 'rejected' && !this.data.reason.trim())
      return wx.showToast({ title: '驳回理由必填', icon: 'none' });
    // 记录提交瞬间的加载代次，onUnload 会递增 loadRequestId 使在途请求的代次失效。
    const requestId = loadRequestId;
    this.setData({ submitting: true, error: '' });
    try {
      await rideService.updateRegistration(this.data.x.id, status, this.data.reason);
      // 请求在途期间用户若已手动返回（onUnload 递增代次），不能再回写已卸载页面，也不能再次 navigateBack 报错。
      if (requestId !== loadRequestId) return;
      this.setData({ statusText: statusText[status] || status, submitting: false });
      wx.showToast({ title: status === 'approved' ? '已通过' : '已驳回' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      if (requestId !== loadRequestId) return;
      this.setData({
        error: error instanceof Error ? error.message : '审批失败',
        submitting: false,
      });
    }
  },
});
