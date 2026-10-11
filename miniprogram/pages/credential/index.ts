import { rideService } from '../../services/ride-service';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';
import { formatActivityDate, formatActivityTime, formatChinaDateTime } from '../../utils/date-time';
import { personalCardViewModel } from '../../utils/personal-card';

function optionalBeforeDeadline<T>(load: () => Promise<T>, timeoutMs = 1_800): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(null);
        },
      );
  });
}

function unavailableAction(): ActivityAction {
  return { kind: 'closed', label: '活动状态不可用', enabled: false };
}

function confirmCancellation(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: '确认取消报名',
      content: '取消后将释放活动名额，可在报名开放期间重新提交。',
      confirmText: '确认取消',
      success: (result: { confirm: boolean }) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

Page({
  data: {
    item: null as any,
    activity: null as any,
    loading: true,
    error: '',
    cancelling: false,
    statusText: '',
    activityAction: unavailableAction(),
    backgroundImages: [] as string[],
    avatarUrl: '',
    riderName: '骑行伙伴',
    cardMetrics: [] as { key: string; label: string; unit: string; value: string }[],
    meetingTime: '以活动通知为准',
    meetingLocation: '集合地点待通知',
    meetingAddress: '',
    navigationLocation: null as any,
    canNavigate: false,
  },
  onShow() {},
  async onLoad(q: any) {
    try {
      const item = await rideService.getRegistration(q.id || '');
      if (!item) throw new Error('报名不存在');
      const activity = item.activity || (await rideService.getActivity(item.activityId));
      const statusText = {
        waiting: '候补中',
        pending: '待审核',
        approved: '已通过',
        checked_in: '已签到',
        rejected: '已驳回',
        cancelled: '已取消',
      }[item.status];
      if (!activity) throw new Error('活动不存在');
      let profile = item.profile || {
        avatarRevision: 0,
        nickname: '',
        title: '',
        realName: '',
        phone: '',
        gender: '',
        emergencyName: '',
        emergencyPhone: '',
        photos: [],
      };
      const [latestProfile, capabilityCard] = await Promise.all([
        optionalBeforeDeadline(() => rideService.getProfile()),
        optionalBeforeDeadline(() => rideService.getPersonalCapabilityCard()),
      ]);
      if (latestProfile) profile = latestProfile;
      const avatarUrl = capabilityCard?.profile?.avatarUrl || '';
      const cardView = capabilityCard ? personalCardViewModel(capabilityCard) : null;
      const backgroundImages = (capabilityCard?.backgrounds || [])
        .filter((background) => background.source === 'user_photo')
        .map((background) => background.url)
        .filter((url, index, values) => !!url && values.indexOf(url) === index);
      const riderName = profile.nickname || profile.realName || '骑行伙伴';
      const schedule = Array.isArray(activity.schedule) ? activity.schedule[0] : undefined;
      const startLocation = activity.route?.startLocation;
      const scheduleLocation = schedule?.location?.trim() || '';
      const displayMatchesStart =
        !scheduleLocation ||
        scheduleLocation === startLocation?.name ||
        scheduleLocation === startLocation?.address;
      const navigationLocation =
        startLocation &&
        displayMatchesStart &&
        Number.isFinite(startLocation.latitude) &&
        Number.isFinite(startLocation.longitude)
          ? startLocation
          : null;
      const meetingLocation =
        scheduleLocation || startLocation?.name || activity.route?.start || '集合地点待通知';
      const meetingAddress = displayMatchesStart ? startLocation?.address || '' : '';
      this.setData({
        item: {
          ...item,
          profile,
          updatedAt: formatChinaDateTime(item.updatedAt),
          checkedInAt: formatChinaDateTime(item.checkedInAt),
        },
        activity: {
          ...activity,
          displayDate: formatActivityDate(activity.startAt || activity.date),
        },
        statusText,
        activityAction: resolveActivityAction(activity, item),
        backgroundImages,
        avatarUrl,
        riderName,
        cardMetrics: cardView?.primaryMetrics || [],
        meetingTime: formatActivityTime(schedule?.time || activity.startAt || activity.date),
        meetingLocation,
        meetingAddress,
        navigationLocation,
        canNavigate: !!navigationLocation,
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '报名凭证加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  onShareAppMessage() {
    const activity = this.data.activity;
    const item = this.data.item;
    const teamQuery =
      item?.isTeamLeader && item?.teamId ? `&team_id=${encodeURIComponent(item.teamId)}` : '';
    return {
      title: item?.isTeamLeader
        ? `加入${item.teamName || '我的队伍'} · ${activity?.title || '骑行活动'}`
        : activity?.title || '骑行活动',
      path: `pages/activity-detail/index?id=${encodeURIComponent(activity?.id || '')}${teamQuery}`,
    };
  },
  async cancel() {
    if (
      this.data.cancelling ||
      !['waiting', 'pending', 'approved'].includes(this.data.item?.status as string)
    )
      return;
    this.setData({ cancelling: true, error: '' });
    try {
      if (!(await confirmCancellation())) return;
      await rideService.cancelRegistration(this.data.item.id);
      await this.onLoad({ id: this.data.item.id });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '取消失败' });
    } finally {
      this.setData({ cancelling: false });
    }
  },
  navigateToMeeting() {
    const location = this.data.navigationLocation;
    if (!location) return;
    wx.openLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name,
      address: location.address,
      scale: 16,
    });
  },
  retry() {
    if (this.data.cancelling || this.data.activityAction.kind !== 'resubmit') return;
    wx.redirectTo({ url: '/pages/registration-form/index?id=' + this.data.item.activityId });
  },
});
