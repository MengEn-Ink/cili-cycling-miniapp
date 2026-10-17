import type { ClubApplication } from '../../../models';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';

const requestId = () => `club_review_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
Page({
  applicationId: '',
  reviewRequestId: '',
  data: {
    application: null as ClubApplication | null,
    reason: '',
    reasonError: '',
    loading: true,
    submitting: false,
    error: '',
  },
  async onLoad(query: Record<string, string>) {
    this.applicationId = query.id || '';
    await this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    await appStore.ensureIdentity(wx.cloud);
    if (appStore.authStatus !== 'authenticated' || appStore.role !== 'admin') {
      this.setData({ loading: false, error: '仅已验证管理员可审批俱乐部申请' });
      return;
    }
    try {
      const application = await rideService.getClubApplication(this.applicationId);
      this.setData({ application, loading: false });
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '申请详情加载失败',
      });
    }
  },
  reason(e: any) {
    this.setData({ reason: e.detail.value, reasonError: '' });
  },
  async act(e: any) {
    if (this.data.submitting || this.data.application?.status !== 'pending_review') return;
    const decision = e.currentTarget.dataset.decision as 'approved' | 'rejected';
    const reason = this.data.reason.trim();
    if (decision === 'rejected' && reason.length < 2) {
      this.setData({ reasonError: '请填写至少 2 个字符的驳回原因' });
      return;
    }
    const confirmed = await new Promise<boolean>((resolve) =>
      wx.showModal({
        title: decision === 'approved' ? '确认通过申请' : '确认驳回申请',
        content:
          decision === 'approved'
            ? '通过后将立即创建俱乐部，并把申请人设为 OWNER。'
            : '申请人将看到驳回原因，并可修改后重新提交。',
        confirmText: decision === 'approved' ? '确认通过' : '确认驳回',
        success: (result: { confirm: boolean }) => resolve(result.confirm),
        fail: () => resolve(false),
      }),
    );
    if (!confirmed) return;
    this.reviewRequestId ||= requestId();
    this.setData({ submitting: true, error: '' });
    try {
      const application = await rideService.reviewClubApplication(
        this.applicationId,
        decision,
        reason,
        this.reviewRequestId,
      );
      this.reviewRequestId = '';
      this.setData({ application, submitting: false });
      wx.showToast({
        title: decision === 'approved' ? '俱乐部已创建' : '申请已驳回',
        icon: 'none',
      });
    } catch (error) {
      this.setData({
        submitting: false,
        error: error instanceof Error ? error.message : '审批失败，请重试',
      });
    }
  },
});
