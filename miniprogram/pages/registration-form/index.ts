import type { StravaReadiness } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import {
  pollStravaReadiness,
  stravaReadinessMessage,
} from '../../services/strava-readiness-service';
import { validateRegistration } from '../../utils/validation';

function loadingReadiness(): StravaReadiness {
  return {
    state: 'syncing',
    canRegister: false,
    athleteName: null,
    snapshot: null,
    error: null,
  };
}

function requestFailedReadiness(message: string): StravaReadiness {
  return {
    state: 'failed',
    canRegister: false,
    athleteName: null,
    snapshot: null,
    error: {
      code: 'STRAVA_READINESS_UNAVAILABLE',
      message,
      retryable: true,
    },
  };
}

async function loadBoundedReadiness(): Promise<StravaReadiness> {
  const status = await rideService.getStravaReadiness();
  if (status.state !== 'syncing' && status.state !== 'failed') return status;
  return pollStravaReadiness(() => rideService.ensureStravaReady());
}

Page({
  loadRequestId: 0,
  data: {
    activityId: '',
    profile: null as any,
    bikeMode: '自带车',
    experience: '常骑',
    remark: '',
    readiness: loadingReadiness(),
    readinessMessage: '正在检查 Strava 数据',
    errors: [] as string[],
    submitting: false,
    loading: true,
  },
  async onShow() {
    const requestId = ++this.loadRequestId;
    this.setData({ loading: true, errors: [] });
    const [profileState, readinessState] = await Promise.all([
      runPageTask(() => rideService.getProfile(), '个人资料加载失败'),
      runPageTask(loadBoundedReadiness, 'Strava 数据准备状态加载失败'),
    ]);
    if (requestId !== this.loadRequestId) return;
    const errors = [profileState.error, readinessState.error].filter(Boolean);
    const readiness =
      readinessState.data ||
      requestFailedReadiness(readinessState.error || 'Strava 数据准备状态加载失败');
    this.setData({
      profile: profileState.data || null,
      readiness,
      readinessMessage: stravaReadinessMessage(readiness),
      loading: false,
      errors,
    });
  },
  onHide() {
    this.loadRequestId += 1;
  },
  onUnload() {
    this.loadRequestId += 1;
  },
  onLoad(q: any) {
    this.setData({ activityId: q.id || '' });
  },
  set(e: any) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  async submit() {
    if (this.data.submitting) return;
    const errors = validateRegistration(this.data);
    if (errors.length) return this.setData({ errors });
    this.setData({ submitting: true, errors: [] });
    try {
      const item = await rideService.saveRegistration(this.data);
      wx.redirectTo({ url: '/pages/credential/index?id=' + item.id });
    } catch (error) {
      this.setData({ errors: [error instanceof Error ? error.message : '提交失败'] });
    } finally {
      this.setData({ submitting: false });
    }
  },
  strava() {
    wx.navigateTo({ url: '/pages/strava/index' });
  },
  profile() {
    wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
});
