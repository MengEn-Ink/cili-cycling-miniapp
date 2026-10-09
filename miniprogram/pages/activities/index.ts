import type { ActivityListFilter } from '../../repositories/types';
import { rideService } from '../../services/ride-service';
import { syncPageTheme } from '../../services/theme-service';
import { activityDisplayStatus } from '../../utils/activity';
import { formatActivityDate } from '../../utils/date-time';
Page({
  loadRequestId: 0,
  data: {
    theme: 'dark',
    themeClass: 'theme-dark',
    loading: true,
    refreshing: false,
    error: '',
    refreshError: '',
    filter: 'upcoming' as ActivityListFilter,
    sectionEyebrow: 'UPCOMING RIDES',
    sectionTitle: '下一场',
    emptyTitle: '暂无未来活动',
    emptyCopy: '新的骑行计划正在路上',
    items: [] as any[],
  },
  onShow() {
    syncPageTheme(this);
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
    this.setData({
      loading: !hasItems,
      refreshing: hasItems,
      error: '',
      refreshError: '',
    });
    try {
      const activities = await rideService.listActivities(this.data.filter);
      if (requestId !== this.loadRequestId) return;
      this.setData({
        items: activities.map((item) => ({
          ...item,
          occupied: item.occupiedCount || 0,
          remaining: Math.max(item.capacity - (item.occupiedCount || 0), 0),
          displayDate: formatActivityDate(item.startAt || item.date),
          displayStatus: activityDisplayStatus(item),
        })),
      });
    } catch (error) {
      if (requestId !== this.loadRequestId) return;
      const message = error instanceof Error ? error.message : '活动加载失败，请稍后重试';
      this.setData(hasItems ? { refreshError: message } : { error: message });
    } finally {
      if (requestId === this.loadRequestId) {
        this.setData({ loading: false, refreshing: false });
      }
    }
  },
  selectFilter(event: { currentTarget?: { dataset?: { filter?: unknown } } }) {
    const value = event.currentTarget?.dataset?.filter;
    if (!['upcoming', 'history'].includes(String(value))) return;
    const filter = value as ActivityListFilter;
    if (filter === this.data.filter) return;
    const history = filter === 'history';
    this.loadRequestId += 1;
    this.setData({
      filter,
      sectionEyebrow: history ? 'RIDE ARCHIVE' : 'UPCOMING RIDES',
      sectionTitle: history ? '历史活动' : '下一场',
      emptyTitle: history ? '暂无历史活动' : '暂无未来活动',
      emptyCopy: history ? '完成的骑行会收录在这里' : '新的骑行计划正在路上',
      items: [],
      error: '',
      refreshError: '',
    });
    void this.load();
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/activity-detail/index?id=' + e.currentTarget.dataset.id });
  },
});
