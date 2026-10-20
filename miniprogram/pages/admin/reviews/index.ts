import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';

const statusText: Record<string, string> = {
  waiting: '候补中',
  pending: '待审核',
  approved: '已通过',
  checked_in: '已签到',
  rejected: '已驳回',
  cancelled: '已取消',
};
let loadGeneration = 0;
const failedAvatarIds = new Set<string>();

Page({
  data: {
    tab: 'pending',
    items: [] as any[],
    all: [] as any[],
    activities: [] as any[],
    activityId: '',
    activityIndex: 0,
    selectedActivityTitle: '',
    loading: false,
    sendingReminders: false,
    error: '',
    showLimitNotice: false,
  },
  onShow() {
    void this.load();
  },
  async load() {
    const generation = ++loadGeneration;
    this.setData({ loading: true, error: '' });
    await appStore.ensureIdentity(wx.cloud);
    if (generation !== loadGeneration) return;
    if (appStore.role !== 'admin' || appStore.authStatus !== 'authenticated') {
      this.setData({ loading: false, all: [], items: [], error: '仅已验证管理员可审批' });
      return;
    }
    try {
      const activities = await rideService.listActivities();
      if (generation !== loadGeneration) return;
      const activityId = this.data.activityId || activities[0]?.id;
      if (!activityId) {
        this.setData({
          activities,
          activityId: '',
          activityIndex: 0,
          selectedActivityTitle: '',
          loading: false,
          all: [],
          items: [],
          showLimitNotice: false,
          error: '暂无可审批活动',
        });
        return;
      }
      const all = await rideService.listReviewRegistrations(activityId);
      if (generation !== loadGeneration) return;
      const activityIndex = Math.max(
        0,
        activities.findIndex((activity) => activity.id === activityId),
      );
      const selectedActivity = activities[activityIndex];
      this.setData({
        activities,
        activityId,
        activityIndex,
        selectedActivityTitle: selectedActivity?.title || '活动信息不可用',
        all,
        loading: false,
        error: '',
        // 服务端固定最多返回 100 条；拉满时给出非阻断提示，避免静默截断。
        showLimitNotice: all.length >= 100,
      });
      this.filter();
    } catch (error) {
      if (generation !== loadGeneration) return;
      this.setData({
        loading: false,
        all: [],
        items: [],
        showLimitNotice: false,
        error: error instanceof Error ? error.message : '审批列表加载失败',
      });
    }
  },
  choose(e: any) {
    const index = Number(e.detail.value);
    const selected = this.data.activities[index];
    if (!selected) return;
    this.setData({
      activityId: selected.id,
      activityIndex: index,
      selectedActivityTitle: selected.title,
      loading: true,
      all: [],
      items: [],
      showLimitNotice: false,
      error: '',
    });
    void this.load();
  },
  tab(e: any) {
    this.setData({ tab: e.currentTarget.dataset.v });
    this.filter();
  },
  filter() {
    const activity = this.data.activities.find((item: any) => item.id === this.data.activityId);
    this.setData({
      items: this.data.all
        .filter((item: any) => this.data.tab === 'all' || item.status === this.data.tab)
        .map((item: any) => {
          const nickname = String(item.profile?.nickname || '').trim();
          const avatarUrl = failedAvatarIds.has(String(item.id))
            ? ''
            : String(item.profile?.avatarUrl || item.profile?.avatarId || '').trim();
          return {
            ...item,
            activity,
            avatarUrl,
            avatarInitial: nickname.slice(0, 1) || '骑',
            submittedAt: item.createdAt || item.updatedAt || '',
            statusText: statusText[item.status] || item.status,
          };
        }),
    });
  },
  avatarError(e: any) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) return;
    failedAvatarIds.add(id);
    const index = this.data.items.findIndex((item: { id: string }) => item.id === id);
    if (index >= 0) this.setData({ [`items[${index}].avatarUrl`]: '' });
  },
  async sendReminders() {
    if (!this.data.activityId || this.data.sendingReminders) return;
    this.setData({ sendingReminders: true, error: '' });
    try {
      const result = await rideService.enqueueActivityReminders(this.data.activityId);
      wx.showToast({
        title: result.queued ? `已安排 ${result.queued} 条提醒` : '提醒已安排，无需重复操作',
        icon: 'none',
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '活动提醒安排失败' });
    } finally {
      this.setData({ sendingReminders: false });
    }
  },
  open(e: any) {
    wx.navigateTo({ url: '/pages/admin/review-detail/index?id=' + e.currentTarget.dataset.id });
  },
});
