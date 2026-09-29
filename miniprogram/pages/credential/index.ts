import { rideService } from '../../services/ride-service';

function confirmCancellation(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: '确认取消报名',
      content: '取消后将释放活动名额，可在报名开放期间重新提交。',
      confirmText: '确认取消',
      success: (result: { confirm: boolean }) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

Page({
  data: {
    item: null as any,
    activity: null as any,
    loading: true,
    error: '',
    cancelling: false,
    statusText: '',
  },
  async onLoad(q: any) {
    try {
      const item = await rideService.getRegistration(q.id || '');
      if (!item) throw new Error('报名不存在');
      const activity = await rideService.getActivity(item.activityId);
      const statusText = {
        pending: '待审核',
        approved: '已通过',
        rejected: '已驳回',
        cancelled: '已取消',
      }[item.status];
      this.setData({ item, activity, statusText });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '报名凭证加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  async cancel() {
    if (this.data.cancelling) return;
    this.setData({ cancelling: true, error: '' });
    try {
      if (!(await confirmCancellation())) return;
      await rideService.cancelRegistration(this.data.item.id);
      await this.onLoad({ id: this.data.item.id });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '取消失败' });
    } finally {
      this.setData({ cancelling: false });
    }
  },
  retry() {
    if (this.data.cancelling) return;
    wx.redirectTo({ url: '/pages/registration-form/index?id=' + this.data.item.activityId });
  },
});
