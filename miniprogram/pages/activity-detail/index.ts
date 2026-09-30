import { rideService } from '../../services/ride-service';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';
import { formatActivityDate } from './format';

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
    galleryImages: [] as string[],
    displayDate: '',
    coverFailed: false,
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
    this.setData({
      loading: true,
      error: '',
      coverFailed: false,
      activityAction: unavailableAction(),
    });
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
        galleryImages: item.images?.length ? item.images : item.coverImage ? [item.coverImage] : [],
        displayDate: formatActivityDate(item.startAt || item.date),
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
  coverImageError() {
    this.setData({ coverFailed: true, galleryImages: [] });
  },
  galleryImageError(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.galleryImages.length) return;
    const galleryImages = this.data.galleryImages.filter(
      (_: string, imageIndex: number) => imageIndex !== index,
    );
    this.setData({ galleryImages, coverFailed: galleryImages.length === 0 });
  },
  navigate(event: any) {
    const target = event.currentTarget.dataset.target === 'end' ? 'endLocation' : 'startLocation';
    const location = this.data.item?.route?.[target];
    if (!location) return;
    wx.openLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name,
      address: location.address,
      scale: 16,
    });
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
