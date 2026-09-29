import { rideService } from '../../services/ride-service';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';

function unavailableAction(): ActivityAction {
  return { kind: 'closed', label: '活动状态不可用', enabled: false };
}

Page({
  loadRequestId: 0,
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
  onUnload() {
    this.loadRequestId += 1;
  },
  async load(id: string) {
    const requestId = ++this.loadRequestId;
    this.setData({ loading: true, error: '', activityAction: unavailableAction() });
    try {
      const item = await rideService.getActivity(id);
      if (requestId !== this.loadRequestId) return;
      if (!item) throw new Error('活动不存在');
      const registration = (await rideService.listRegistrations()).find(
        (value) => value.activityId === id,
      );
      if (requestId !== this.loadRequestId) return;
      this.setData({
        item,
        registration,
        activityAction: resolveActivityAction(item, registration),
      });
    } catch (error) {
      if (requestId !== this.loadRequestId) return;
      this.setData({
        error: error instanceof Error ? error.message : '详情加载失败',
        activityAction: unavailableAction(),
      });
    } finally {
      if (requestId === this.loadRequestId) this.setData({ loading: false });
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
