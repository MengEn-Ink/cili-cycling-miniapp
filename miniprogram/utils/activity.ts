import type { Activity, Registration } from '../models';

export type ActivityAction =
  | {
      kind: 'view-registration' | 'resubmit' | 'view-history' | 'register';
      label: string;
      enabled: true;
      registrationId?: string;
    }
  | { kind: 'closed'; label: string; enabled: false };

function closedLabel(activity: Activity): string {
  if (activity.registrationSetupPending === true) return '报名待开放';
  switch (activity.closedReason) {
    case 'finished':
      return '活动已结束';
    case 'deadline':
      return '报名已截止';
    case 'full':
      return '名额已满';
    case 'incomplete':
      return '报名信息待完善';
    default:
      return '活动状态不可用';
  }
}

export function resolveActivityAction(
  activity: Activity,
  registration?: Pick<Registration, 'id' | 'status'>,
): ActivityAction {
  if (
    registration?.status === 'pending' ||
    registration?.status === 'approved' ||
    registration?.status === 'checked_in'
  ) {
    return {
      kind: 'view-registration',
      label: '查看我的行程',
      enabled: true,
      registrationId: registration.id,
    };
  }

  const registrationOpen = activity.registrationState === 'open';
  if (registration?.status === 'rejected' || registration?.status === 'cancelled') {
    return registrationOpen
      ? {
          kind: 'resubmit',
          label: '修改后重新报名',
          enabled: true,
          registrationId: registration.id,
        }
      : {
          kind: 'view-history',
          label: '查看报名历史',
          enabled: true,
          registrationId: registration.id,
        };
  }

  if (!registrationOpen) return { kind: 'closed', label: closedLabel(activity), enabled: false };
  return { kind: 'register', label: '立即报名', enabled: true };
}

export function activityDisplayStatus(a: Activity) {
  if (a.status === 'draft') return '草稿';
  if (a.registrationState === 'open' && a.closedReason == null) return '报名中';
  if (a.registrationState === 'closed') return closedLabel(a);
  return '活动状态不可用';
}
