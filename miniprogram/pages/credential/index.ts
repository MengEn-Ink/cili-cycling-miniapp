import { rideService } from '../../services/ride-service';
import { syncPageTheme } from '../../services/theme-service';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';
import { formatChinaDateTime } from '../../utils/date-time';

function unavailableAction(): ActivityAction {
  return { kind: 'closed', label: '活动状态不可用', enabled: false };
}

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
    theme: 'dark',
    themeClass: 'theme-dark',
    item: null as any,
    activity: null as any,
    loading: true,
    error: '',
    cancelling: false,
    statusText: '',
    activityAction: unavailableAction(),
  },
  onShow() {
    syncPageTheme(this);
  },
  async onLoad(q: any) {
    try {
      const item = await rideService.getRegistration(q.id || '');
      if (!item) throw new Error('报名不存在');
      const activity = await rideService.getActivity(item.activityId);
      const statusText = {
        pending: '待审核',
        approved: '已通过',
        checked_in: '已签到',
        rejected: '已驳回',
        cancelled: '已取消',
      }[item.status];
      if (!activity) throw new Error('活动不存在');
      this.setData({
        item: {
          ...item,
          updatedAt: formatChinaDateTime(item.updatedAt),
          checkedInAt: formatChinaDateTime(item.checkedInAt),
        },
        activity: {
          ...activity,
          displayDateTime: formatChinaDateTime(activity.startAt || activity.date),
        },
        statusText,
        activityAction: resolveActivityAction(activity, item),
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '报名凭证加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  async cancel() {
    if (this.data.cancelling || !['pending', 'approved'].includes(this.data.item?.status as string))
      return;
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
  navigateToMeeting() {
    const location = this.data.activity?.route?.startLocation;
    if (!location) return;
    wx.openLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name,
      address: location.address,
      scale: 16,
    });
  },
  retry() {
    if (this.data.cancelling || this.data.activityAction.kind !== 'resubmit') return;
    wx.redirectTo({ url: '/pages/registration-form/index?id=' + this.data.item.activityId });
  },
});
