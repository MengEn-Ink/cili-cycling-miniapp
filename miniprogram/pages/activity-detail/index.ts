import { rideService } from '../../services/ride-service';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';

function unavailableAction(): ActivityAction {
  return { kind: 'closed', label: '活动状态不可用', enabled: false };
}

Page({
  data: {
    loading: true,
    error: '',
    item: null as any,
    registration: null as any,
    activityAction: unavailableAction(),
  },
  onLoad(q: any) {
    void this.load(q.id || '');
  },
  async load(id: string) {
    this.setData({ loading: true, error: '', activityAction: unavailableAction() });
    try {
      const item = await rideService.getActivity(id);
      if (!item) throw new Error('活动不存在');
      const registration = (await rideService.listRegistrations()).find(
        (value) => value.activityId === id,
      );
      this.setData({
        item,
        registration,
        activityAction: resolveActivityAction(item, registration),
      });
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : '详情加载失败',
        activityAction: unavailableAction(),
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  go() {
    const action = this.data.activityAction as ActivityAction;
    if (!action.enabled || !this.data.item) return;
    if (action.kind === 'view-registration' || action.kind === 'view-history') {
      if (action.registrationId)
        wx.navigateTo({ url: '/pages/credential/index?id=' + action.registrationId });
      return;
    }
    wx.navigateTo({ url: '/pages/registration-form/index?id=' + this.data.item.id });
  },
});
