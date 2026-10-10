import type { Activity, StravaReadiness } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { syncPageTheme } from '../../services/theme-service';
import {
  pollStravaReadiness,
  stravaReadinessMessage,
} from '../../services/strava-readiness-service';
import { validateRegistration } from '../../utils/validation';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';
import { formatChinaDateTime } from '../../utils/date-time';
import { genderView } from '../../utils/gender';

function unavailableAction(): ActivityAction {
  return { kind: 'closed', label: '活动状态不可用', enabled: false };
}

const NOTIFICATION_TEMPLATE_TIMEOUT_MS = 1000;
const MAX_SUBSCRIPTION_TEMPLATES = 3;

function loadingReadiness(): StravaReadiness {
  return {
    state: 'syncing',
    canRegister: false,
    avatarAvailable: false,
    athleteName: null,
    snapshot: null,
    error: null,
  };
}

function requestFailedReadiness(message: string): StravaReadiness {
  return {
    state: 'failed',
    canRegister: false,
    avatarAvailable: false,
    athleteName: null,
    snapshot: null,
    error: {
      code: 'STRAVA_READINESS_UNAVAILABLE',
      message,
      retryable: true,
      recoveryAction: 'retry',
    },
  };
}

async function loadBoundedReadiness(isCancelled: () => boolean): Promise<StravaReadiness> {
  const status = await rideService.getStravaReadiness();
  if (isCancelled() || status.state !== 'syncing') return status;
  return pollStravaReadiness(() => rideService.ensureStravaReady(), { isCancelled });
}

async function loadActivityContext(
  activityId: string,
): Promise<{ activity: Activity; action: ActivityAction }> {
  if (!activityId) throw new Error('缺少活动 ID');
  const [activity, registrations] = await Promise.all([
    rideService.getActivity(activityId),
    rideService.listRegistrations(),
  ]);
  if (!activity) throw new Error('活动不存在');
  return {
    activity,
    action: resolveActivityAction(
      activity,
      registrations.find((registration) => registration.activityId === activityId),
    ),
  };
}

Page({
  loadRequestId: 0,
  submitRequestId: 0,
  submissionPending: false,
  pageVisible: false,
  data: {
    theme: 'light',
    themeClass: 'theme-light',
    activityId: '',
    activity: null as Activity | null,
    displayActivityDate: '日期待公布',
    profile: null as any,
    gatheringMode: '',
    experience: '常骑',
    remark: '',
    teamId: '',
    teamName: '',
    teamParameterError: '',
    readiness: loadingReadiness(),
    readinessMessage: '正在检查 Strava 数据',
    notificationTemplateIds: [] as string[],
    errors: [] as string[],
    submitting: false,
    loading: true,
    activityAction: unavailableAction(),
    activityCanSubmit: false,
  },
  async onShow() {
    syncPageTheme(this);
    this.pageVisible = true;
    const requestId = ++this.loadRequestId;
    const isCancelled = () => requestId !== this.loadRequestId;
    this.setData({
      loading: true,
      errors: [],
      submitting: this.submissionPending,
      notificationTemplateIds: [],
    });
    void this.loadNotificationTemplates(requestId);
    const [profileState, readinessState, activityState] = await Promise.all([
      runPageTask(() => rideService.getProfile(), '个人资料加载失败'),
      runPageTask(() => loadBoundedReadiness(isCancelled), 'Strava 数据准备状态加载失败'),
      runPageTask(() => loadActivityContext(this.data.activityId), '活动报名状态加载失败'),
    ]);
    if (requestId !== this.loadRequestId) return;
    const errors = [profileState.error, readinessState.error, activityState.error].filter(Boolean);
    const readiness =
      readinessState.data ||
      requestFailedReadiness(readinessState.error || 'Strava 数据准备状态加载失败');
    const activityContext = activityState.data;
    const activityAction = activityContext?.action || unavailableAction();
    this.setData({
      activity: activityContext?.activity || null,
      displayActivityDate: formatChinaDateTime(
        activityContext?.activity?.startAt || activityContext?.activity?.date,
      ),
      profile: profileState.data
        ? { ...profileState.data, ...genderView(profileState.data.gender) }
        : null,
      readiness,
      readinessMessage: stravaReadinessMessage(readiness),
      activityAction,
      activityCanSubmit: activityAction.kind === 'register' || activityAction.kind === 'resubmit',
      loading: false,
      errors,
    });
  },
  async loadNotificationTemplates(requestId: number) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const templateIds = await Promise.race([
        rideService.getReviewNotificationTemplateIds(),
        new Promise<string[]>((resolve) => {
          timeoutId = setTimeout(() => resolve([]), NOTIFICATION_TEMPLATE_TIMEOUT_MS);
        }),
      ]).catch(() => []);
      if (requestId === this.loadRequestId)
        this.setData({
          notificationTemplateIds: templateIds
            .filter((item, index, values) => Boolean(item && values.indexOf(item) === index))
            .slice(0, MAX_SUBSCRIPTION_TEMPLATES),
        });
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
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
    const rawTeamId = typeof q.team_id === 'string' ? q.team_id : '';
    const teamId = /^team_[A-Za-z0-9_-]{8,80}$/.test(rawTeamId) ? rawTeamId : '';
    this.setData({
      activityId: q.id || '',
      teamId,
      teamParameterError: rawTeamId && !teamId ? '队伍邀请参数无效' : '',
    });
  },
  set(e: any) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  async submit() {
    if (this.submissionPending || this.data.submitting) return;
    const errors = validateRegistration(this.data);
    if (this.data.teamParameterError) errors.push(this.data.teamParameterError);
    if (
      this.data.teamName &&
      (this.data.teamName.trim().length < 2 || this.data.teamName.trim().length > 30)
    )
      errors.push('队伍名称需为 2 至 30 个字符');
    if (!this.data.activityCanSubmit) errors.push(this.data.activityAction.label);
    if (errors.length) return this.setData({ errors });
    const requestId = ++this.submitRequestId;
    this.submissionPending = true;
    this.setData({ submitting: true, errors: [] });
    try {
      try {
        await rideService.requestReviewNotificationSubscription(this.data.notificationTemplateIds);
      } catch {
        // 订阅授权只是提醒能力，拒绝、封禁或平台失败都不能阻断报名。
      }
      const item = await rideService.saveRegistration(this.data);
      if (requestId === this.submitRequestId && this.pageVisible) {
        // 兜底异常响应：缺少记录 ID 时不跳到无效凭证页，提示去“我的行程”核对。
        if (!item || !item.id)
          this.setData({ errors: ['报名已提交，但未取得记录，请在“我的行程”中查看'] });
        else wx.redirectTo({ url: '/pages/credential/index?id=' + item.id });
      }
    } catch (error) {
      if (requestId === this.submitRequestId && this.pageVisible)
        this.setData({ errors: [error instanceof Error ? error.message : '提交失败'] });
    } finally {
      this.submissionPending = false;
      if (this.pageVisible) this.setData({ submitting: false });
    }
  },
  back() {
    if (!this.data.submitting) wx.navigateBack();
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
