import { rideService } from '../../services/ride-service';
import { syncPageTheme } from '../../services/theme-service';
import { formatActivityDate, formatChinaDateTime } from '../../utils/date-time';
import type { Activity, Registration } from '../../models';

const STATUS_LABELS: Record<string, string> = {
  waiting: '候补中',
  pending: '待审核',
  approved: '已通过',
  checked_in: '已签到',
  rejected: '已驳回',
  cancelled: '已取消',
};

function decorate(item: Registration, activities: Activity[]) {
  const activity = item.activity ||
    activities.find((candidate) => candidate.id === item.activityId) || {
      title: '历史活动',
      date: item.updatedAt,
    };
  return {
    ...item,
    updatedAt: formatChinaDateTime(item.updatedAt),
    activity: { ...activity, displayDate: formatActivityDate(activity.date) },
    statusText: STATUS_LABELS[item.status],
  };
}

async function fetchActivityCandidates(): Promise<Activity[]> {
  try {
    return await rideService.listActivities();
  } catch {
    return [];
  }
}

Page({
  loadRequestId: 0,
  data: {
    theme: 'dark',
    themeClass: 'theme-dark',
    loading: true,
    refreshing: false,
    loadingMore: false,
    error: '',
    refreshError: '',
    loadMoreError: '',
    items: [] as ReturnType<typeof decorate>[],
    nextCursor: null as string | null,
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
      const [page, activities] = await Promise.all([
        rideService.listRegistrationPage(),
        fetchActivityCandidates(),
      ]);
      if (requestId !== this.loadRequestId) return;
      this.setData({
        items: page.items.map((item) => decorate(item, activities)),
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      if (requestId !== this.loadRequestId) return;
      const message = error instanceof Error ? error.message : '报名加载失败';
      this.setData(hasItems ? { refreshError: message } : { error: message });
    } finally {
      if (requestId === this.loadRequestId) {
        this.setData({ loading: false, refreshing: false });
      }
    }
  },
  async loadMore() {
    const cursor = this.data.nextCursor;
    if (!cursor || this.data.loadingMore) return;
    this.setData({ loadingMore: true, loadMoreError: '' });
    try {
      const [page, activities] = await Promise.all([
        rideService.listRegistrationPage(cursor),
        fetchActivityCandidates(),
      ]);
      this.setData({
        items: [...this.data.items, ...page.items.map((item) => decorate(item, activities))],
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载更多失败';
      this.setData({ loadMoreError: message });
    } finally {
      this.setData({ loadingMore: false });
    }
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/credential/index?id=' + e.currentTarget.dataset.id });
  },
});
