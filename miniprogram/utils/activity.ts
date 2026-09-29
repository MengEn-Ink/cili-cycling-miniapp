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
  switch (activity.closedReason) {
    case 'finished':
      return '活动已结束';
    case 'deadline':
      return '报名已截止';
    case 'full':
      return '名额已满';
    default:
      return '活动状态不可用';
  }
}

export function resolveActivityAction(
  activity: Activity,
  registration?: Pick<Registration, 'id' | 'status'>,
): ActivityAction {
  if (registration?.status === 'pending' || registration?.status === 'approved') {
    return {
      kind: 'view-registration',
      label: '查看我的报名',
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

export function activityDisplayStatus(a: Activity, n: number, now = new Date()) {
  if (a.status === 'draft') return '草稿';
  if (a.status === 'finished' || now > new Date(a.endAt)) return '已结束';
  if (now > new Date(a.deadline)) return '已截止';
  return n >= a.capacity ? '已满' : '报名中';
}
