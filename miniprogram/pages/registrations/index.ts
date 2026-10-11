import { rideService } from '../../services/ride-service';
import { formatActivityDate } from '../../utils/date-time';
import { buildTripMeetingInfo, isTripArchived } from './trip-state';

const SWIPE_DISTANCE_PX = 75;
const SWIPE_OPEN_THRESHOLD_PX = 30;

const statusCounts = (items: any[]) =>
  items.reduce(
    (counts, item) => {
      if (item.status === 'waiting' || item.status === 'pending') counts.review += 1;
      else if (item.status === 'approved' || item.status === 'checked_in') counts.ready += 1;
      else counts.expired += 1;
      return counts;
    },
    { review: 0, ready: 0, expired: 0 },
  );

Page({
  loadRequestId: 0,
  touchStartX: 0,
  touchStartY: 0,
  touchRegistrationId: '',
  data: {
    loading: true,
    refreshing: false,
    error: '',
    refreshError: '',
    deletingId: '',
    items: [] as any[],
    statusCounts: { review: 0, ready: 0, expired: 0 },
  },
  onShow() {
    void this.load();
  },
  onHide() {
    this.loadRequestId += 1;
  },
  onUnload() {
    this.loadRequestId += 1;
  },
  async load() {
    const requestId = ++this.loadRequestId;
    const hasItems = this.data.items.length > 0;
    this.setData({ loading: !hasItems, refreshing: hasItems, error: '', refreshError: '' });
    try {
      const registrations = await rideService.listRegistrations();
      if (requestId !== this.loadRequestId) return;
      const items = registrations
        .filter((item) => !isTripArchived(item.activity?.endAt))
        .map((item) => {
          const activity = item.activity || { title: '历史活动', date: item.updatedAt };
          const meeting = buildTripMeetingInfo(activity);
          const statusText = {
            waiting: '候补中',
            pending: '待审核',
            approved: '已通过',
            checked_in: '已签到',
            rejected: '已驳回',
            cancelled: '已取消',
          }[item.status];
          const displayStatusText = {
            waiting: '候补',
            pending: '待审核',
            approved: '已通过',
            checked_in: '已签到',
            rejected: '未通过',
            cancelled: '已取消',
          }[item.status];
          const statusGuidance = {
            waiting: '等待名额释放',
            pending: '资料审核中',
            approved: '凭证已就绪',
            checked_in: '本次行程已签到',
            rejected: '查看未通过原因',
            cancelled: '可左滑或点击删除记录',
          }[item.status];
          return {
            ...item,
            activity: {
              ...activity,
              displayDate: formatActivityDate(
                ('startAt' in activity && activity.startAt) || activity.date,
              ),
            },
            meetingTime: meeting.time,
            meetingLocation: meeting.location,
            statusText,
            displayStatusText,
            statusGuidance,
            swipeX: 0,
            destinationLabel:
              item.status === 'approved' || item.status === 'checked_in' ? '查看凭证' : '查看详情',
          };
        });
      this.setData({ items, statusCounts: statusCounts(items) });
    } catch (error) {
      if (requestId !== this.loadRequestId) return;
      const message = error instanceof Error ? error.message : '报名加载失败';
      this.setData(hasItems ? { refreshError: message } : { error: message });
    } finally {
      if (requestId === this.loadRequestId) this.setData({ loading: false, refreshing: false });
    }
  },
  setSwipeX(id: string, swipeX: number) {
    this.setData({
      items: this.data.items.map((item: any) => ({
        ...item,
        swipeX: item.id === id ? swipeX : 0,
      })),
    });
  },
  clearRowTouch() {
    this.touchRegistrationId = '';
    this.touchStartX = 0;
    this.touchStartY = 0;
  },
  onRowTouchStart(event: any) {
    this.clearRowTouch();
    const id = String(event.currentTarget.dataset.id || '');
    const item = this.data.items.find((candidate: any) => candidate.id === id);
    if (!item || item.status !== 'cancelled') return;
    const touch = event.touches[0] || {};
    this.touchRegistrationId = id;
    this.touchStartX = touch.clientX || 0;
    this.touchStartY = touch.clientY || 0;
  },
  onRowTouchMove(event: any) {
    if (!this.touchRegistrationId) return;
    const touch = event.touches[0] || {};
    const deltaX = (touch.clientX || 0) - this.touchStartX;
    const deltaY = (touch.clientY || 0) - this.touchStartY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    this.setSwipeX(this.touchRegistrationId, Math.max(-SWIPE_DISTANCE_PX, Math.min(0, deltaX)));
  },
  onRowTouchEnd(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const item = this.data.items.find((candidate: any) => candidate.id === id);
    if (!item || id !== this.touchRegistrationId) return;
    this.setSwipeX(id, item.swipeX <= -SWIPE_OPEN_THRESHOLD_PX ? -SWIPE_DISTANCE_PX : 0);
    this.clearRowTouch();
  },
  onRowTouchCancel() {
    if (this.touchRegistrationId) this.setSwipeX(this.touchRegistrationId, 0);
    this.clearRowTouch();
  },
  open(e: any) {
    const id = String(e.currentTarget.dataset.id || '');
    const item = this.data.items.find((candidate: any) => candidate.id === id);
    if (item?.swipeX < 0) {
      this.setSwipeX(id, 0);
      return;
    }
    wx.navigateTo({ url: '/pages/credential/index?id=' + id });
  },
  async confirmDelete(event: any) {
    const id = String(event.currentTarget.dataset.id || '');
    const item = this.data.items.find((candidate: any) => candidate.id === id);
    if (!item || item.status !== 'cancelled' || this.data.deletingId) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '删除已取消行程？',
        content: '删除后，这条行程记录将不再显示且无法恢复。',
        confirmText: '删除记录',
        confirmColor: '#b43b32',
        success: (result: { confirm: boolean }) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    this.setData({ deletingId: id });
    try {
      await rideService.deleteRegistration(id);
      const items = this.data.items.filter((candidate: any) => candidate.id !== id);
      this.setData({ items, statusCounts: statusCounts(items) });
      wx.showToast({ title: '行程记录已删除', icon: 'success' });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '删除失败，请稍后重试',
        icon: 'none',
      });
      this.setSwipeX(id, 0);
    } finally {
      this.setData({ deletingId: '' });
    }
  },
});
