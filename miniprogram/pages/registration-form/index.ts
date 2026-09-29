import type { StravaReadiness } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import {
  pollStravaReadiness,
  stravaReadinessMessage,
} from '../../services/strava-readiness-service';
import { validateRegistration } from '../../utils/validation';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';

function unavailableAction(): ActivityAction {
  return { kind: 'closed', label: '活动状态不可用', enabled: false };
}

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

async function loadBoundedReadiness(isCancelled: () => boolean): Promise<StravaReadiness> {
  const status = await rideService.getStravaReadiness();
  if (isCancelled() || (status.state !== 'syncing' && status.state !== 'failed')) return status;
  return pollStravaReadiness(() => rideService.ensureStravaReady(), { isCancelled });
}

async function loadActivityAction(activityId: string): Promise<ActivityAction> {
  if (!activityId) return unavailableAction();
  const [activity, registrations] = await Promise.all([
    rideService.getActivity(activityId),
    rideService.listRegistrations(),
  ]);
  if (!activity) throw new Error('活动不存在');
  return resolveActivityAction(
    activity,
    registrations.find((registration) => registration.activityId === activityId),
  );
}

Page({
  loadRequestId: 0,
  submitRequestId: 0,
  pageVisible: false,
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
    activityAction: unavailableAction(),
    activityCanSubmit: false,
  },
  async onShow() {
    this.pageVisible = true;
    const requestId = ++this.loadRequestId;
    const isCancelled = () => requestId !== this.loadRequestId;
    this.setData({ loading: true, errors: [], submitting: false });
    const [profileState, readinessState, activityState] = await Promise.all([
      runPageTask(() => rideService.getProfile(), '个人资料加载失败'),
      runPageTask(() => loadBoundedReadiness(isCancelled), 'Strava 数据准备状态加载失败'),
      runPageTask(() => loadActivityAction(this.data.activityId), '活动报名状态加载失败'),
    ]);
    if (requestId !== this.loadRequestId) return;
    const errors = [profileState.error, readinessState.error, activityState.error].filter(Boolean);
    const readiness =
      readinessState.data ||
      requestFailedReadiness(readinessState.error || 'Strava 数据准备状态加载失败');
    const activityAction = activityState.data || unavailableAction();
    this.setData({
      profile: profileState.data || null,
      readiness,
      readinessMessage: stravaReadinessMessage(readiness),
      activityAction,
      activityCanSubmit: activityAction.kind === 'register' || activityAction.kind === 'resubmit',
      loading: false,
      errors,
    });
  },
  onHide() {
    this.pageVisible = false;
    this.loadRequestId += 1;
    this.submitRequestId += 1;
  },
  onUnload() {
    this.pageVisible = false;
    this.loadRequestId += 1;
    this.submitRequestId += 1;
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
    if (!this.data.activityCanSubmit) errors.push(this.data.activityAction.label);
    if (errors.length) return this.setData({ errors });
    const requestId = ++this.submitRequestId;
    this.setData({ submitting: true, errors: [] });
    try {
      const item = await rideService.saveRegistration(this.data);
      if (requestId === this.submitRequestId && this.pageVisible)
        wx.redirectTo({ url: '/pages/credential/index?id=' + item.id });
    } catch (error) {
      if (requestId === this.submitRequestId && this.pageVisible)
        this.setData({ errors: [error instanceof Error ? error.message : '提交失败'] });
    } finally {
      if (requestId === this.submitRequestId && this.pageVisible)
        this.setData({ submitting: false });
    }
  },
  strava() {
    if (this.data.submitting) return;
    wx.navigateTo({ url: '/pages/strava/index' });
  },
  profile() {
    if (this.data.submitting) return;
    wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
});
