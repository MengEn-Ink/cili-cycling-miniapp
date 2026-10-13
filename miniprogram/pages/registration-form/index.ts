import type { Activity } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { validateRegistration, validateRegistrationProfile } from '../../utils/validation';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';
import { formatChinaDateTime } from '../../utils/date-time';
import { genderView } from '../../utils/gender';

function unavailableAction(): ActivityAction {
  return { kind: 'closed', label: '活动状态不可用', enabled: false };
}

// 提交按钮置灰时给出的唯一提示；返回空串表示可以提交。
function submitBlockedHint(state: {
  profile: unknown;
  profileErrors: string[];
  gatheringMode: string;
  experience: string;
  activityCanSubmit: boolean;
  activityAction: ActivityAction;
}): string {
  if (!state.profile) return '请先完成必填项';
  const missing = [
    state.profileErrors.length ? '个人资料' : '',
    state.gatheringMode ? '' : '集合方式',
    state.experience ? '' : '骑行经验',
  ].filter(Boolean);
  if (missing.length) return `还差 ${missing.length} 项：${missing.join('、')}`;
  return state.activityCanSubmit ? '' : state.activityAction.label;
}

const NOTIFICATION_TEMPLATE_TIMEOUT_MS = 1000;
const MAX_SUBSCRIPTION_TEMPLATES = 3;

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
    activityId: '',
    activity: null as Activity | null,
    displayActivityDate: '日期待公布',
    profile: null as any,
    gatheringMode: 'self_drive',
    showGatheringChoice: false,
    // 骑行经验是审核参考，必须由本人主动选择，不预置默认值。
    experience: '',
    remark: '',
    teamId: '',
    teamParameterError: '',
    notificationTemplateIds: [] as string[],
    errors: [] as string[],
    profileErrors: [] as string[],
    submitting: false,
    loading: true,
    activityAction: unavailableAction(),
    activityCanSubmit: false,
    submitBlockedHint: '请先完成必填项',
  },
  async onShow() {
    this.pageVisible = true;
    const requestId = ++this.loadRequestId;
    this.setData({
      loading: true,
      errors: [],
      submitting: this.submissionPending,
      notificationTemplateIds: [],
    });
    void this.loadNotificationTemplates(requestId);
    const [profileState, activityState] = await Promise.all([
      runPageTask(() => rideService.getProfile(), '个人资料加载失败'),
      runPageTask(() => loadActivityContext(this.data.activityId), '活动报名状态加载失败'),
    ]);
    if (requestId !== this.loadRequestId) return;
    const errors = [profileState.error, activityState.error].filter(Boolean);
    const activityContext = activityState.data;
    const activityAction = activityContext?.action || unavailableAction();
    const profile = profileState.data
      ? { ...profileState.data, ...genderView(profileState.data.gender) }
      : null;
    const activity = activityContext?.activity || null;
    const showGatheringChoice = Number(activity?.supportVehicleCapacity || 0) > 0;
    const next = {
      gatheringMode: showGatheringChoice ? this.data.gatheringMode || 'self_drive' : 'self_drive',
      profile,
      profileErrors: profile ? validateRegistrationProfile(profile) : [],
      activityAction,
      activityCanSubmit: activityAction.kind === 'register' || activityAction.kind === 'resubmit',
    };
    this.setData({
      ...next,
      activity,
      showGatheringChoice,
      displayActivityDate: formatChinaDateTime(
        activityContext?.activity?.startAt || activityContext?.activity?.date,
      ),
      submitBlockedHint: submitBlockedHint({ ...next, experience: this.data.experience }),
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
    const key = e.currentTarget.dataset.key;
    const patch: Record<string, unknown> = { [key]: e.detail.value };
    if (key === 'gatheringMode' || key === 'experience')
      patch.submitBlockedHint = submitBlockedHint({ ...this.data, [key]: e.detail.value });
    this.setData(patch);
  },
  async submit() {
    if (this.submissionPending || this.data.submitting) return;
    const errors = validateRegistration(this.data);
    if (this.data.teamParameterError) errors.push(this.data.teamParameterError);
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
  profile() {
    if (this.data.submitting) return;
    wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
});
