import type { Activity, SoleClubHome } from '../../../models';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';
import { activityDisplayStatus } from '../../../utils/activity';
import { formatActivityDate, formatActivityTime } from '../../../utils/date-time';

type CenterMode = 'loading' | 'error' | 'home' | 'empty';
type ActivityMode = 'loading' | 'ready' | 'empty' | 'error';

function activityTime(value: Activity): number {
  const parsed = new Date(value.startAt || value.date).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function displayActivity(item: Activity) {
  const occupied = item.approvedRegistrationCount ?? item.occupiedCount ?? 0;
  return {
    ...item,
    displayDate: formatActivityDate(item.startAt || item.date),
    displayTime: formatActivityTime(item.startAt),
    meetingPlace: item.route.start || '集合地待公布',
    displayDistance: item.route.distanceKm > 0 ? `${item.route.distanceKm} km` : '里程待公布',
    displayElevation: item.route.elevationM > 0 ? `${item.route.elevationM} m` : '爬升待公布',
    registrationSummary: item.registrationUnlimited
      ? `${occupied} 人已报名 · 不限名额`
      : `${occupied}/${item.capacity} 人已报名`,
    displayStatus: activityDisplayStatus(item),
  };
}

Page({
  loadToken: 0,
  activityLoadToken: 0,
  unloaded: false,
  isCurrent(token: number) {
    return !this.unloaded && this.loadToken === token;
  },
  isCurrentActivity(pageToken: number, activityToken: number) {
    return this.isCurrent(pageToken) && this.activityLoadToken === activityToken;
  },
  data: {
    mode: 'loading' as CenterMode,
    club: null as SoleClubHome | null,
    avatarInitial: '俱',
    avatarFailed: false,
    coverFailed: false,
    isAdmin: false,
    loadError: '',
    activityMode: 'loading' as ActivityMode,
    activityError: '',
    activities: [] as ReturnType<typeof displayActivity>[],
  },
  onShow() {
    this.unloaded = false;
    void this.load();
  },
  onUnload() {
    this.unloaded = true;
    this.loadToken += 1;
    this.activityLoadToken += 1;
  },
  async load() {
    const token = ++this.loadToken;
    const activityToken = ++this.activityLoadToken;
    this.setData({
      mode: 'loading',
      loadError: '',
      avatarFailed: false,
      coverFailed: false,
      activityMode: 'loading',
      activityError: '',
      activities: [],
    });
    try {
      await appStore.ensureIdentity(wx.cloud);
      if (!this.isCurrent(token)) return;
      if (appStore.authStatus !== 'authenticated') {
        this.setData({
          mode: 'error',
          club: null,
          isAdmin: false,
          loadError: '请先完成微信登录后再进入俱乐部主页',
        });
        return;
      }

      const isAdmin = appStore.role === 'admin';
      const clubPromise = rideService.getSoleClubHome().then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason) => ({ status: 'rejected' as const, reason }),
      );
      const activityPromise = rideService.listActivities('upcoming').then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason) => ({ status: 'rejected' as const, reason }),
      );
      const clubResult = await clubPromise;
      if (!this.isCurrent(token)) return;
      if (clubResult.status === 'rejected') throw clubResult.reason;

      if (clubResult.value.exists) {
        const club = clubResult.value.club;
        this.setData({
          mode: 'home',
          club,
          avatarInitial: Array.from(club.name.trim())[0] || '俱',
          isAdmin,
          loadError: '',
        });
      } else {
        this.setData({ mode: 'empty', club: null, isAdmin, loadError: '' });
      }

      const activityResult = await activityPromise;
      if (!this.isCurrentActivity(token, activityToken)) return;
      if (activityResult.status === 'fulfilled') {
        const activities = [...activityResult.value]
          .sort((left, right) => activityTime(left) - activityTime(right))
          .slice(0, 3)
          .map(displayActivity);
        this.setData({
          activities,
          activityMode: activities.length ? 'ready' : 'empty',
          activityError: '',
        });
      } else {
        this.setData({
          activities: [],
          activityMode: 'error',
          activityError: '近期活动暂时加载失败，请重试',
        });
      }
    } catch (error) {
      if (!this.isCurrent(token)) return;
      this.setData({
        mode: 'error',
        club: null,
        loadError: error instanceof Error ? error.message : '俱乐部主页加载失败',
      });
    }
  },
  retry() {
    return this.load();
  },
  async retryActivities() {
    const pageToken = this.loadToken;
    const activityToken = ++this.activityLoadToken;
    this.setData({ activityMode: 'loading', activityError: '' });
    try {
      const activities = (await rideService.listActivities('upcoming'))
        .slice()
        .sort((left, right) => activityTime(left) - activityTime(right))
        .slice(0, 3)
        .map(displayActivity);
      if (!this.isCurrentActivity(pageToken, activityToken)) return;
      this.setData({
        activities,
        activityMode: activities.length ? 'ready' : 'empty',
        activityError: '',
      });
    } catch {
      if (!this.isCurrentActivity(pageToken, activityToken)) return;
      this.setData({ activityMode: 'error', activityError: '近期活动暂时加载失败，请重试' });
    }
  },
  avatarError() {
    if (!this.data.avatarFailed) this.setData({ avatarFailed: true });
  },
  coverError() {
    if (!this.data.coverFailed) this.setData({ coverFailed: true });
  },
  openActivities() {
    wx.switchTab({ url: '/pages/activities/index' });
  },
  openActivity(event: { currentTarget?: { dataset?: { id?: unknown } } }) {
    const id = event.currentTarget?.dataset?.id;
    if (typeof id !== 'string' || !id) return;
    wx.navigateTo({ url: `/pages/activity-detail/index?id=${encodeURIComponent(id)}` });
  },
  editClub() {
    if (!this.data.club?.canManage) return;
    wx.navigateTo({ url: '/pages/admin/club-application-detail/index?mode=edit' });
  },
  createClub() {
    if (!this.data.isAdmin) return;
    wx.navigateTo({ url: '/pages/admin/club-application-detail/index?mode=bootstrap' });
  },
});
