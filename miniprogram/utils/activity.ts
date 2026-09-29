import type { Activity, Registration } from '../models';

export type ActivityAction =
  | {
      kind: 'view-registration' | 'resubmit' | 'view-history' | 'register';
      label: string;
      enabled: true;
      registrationId?: string;
    }
  | { kind: 'closed'; label: string; enabled: false };

function reached(value: string, now: Date): boolean {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && now.getTime() >= timestamp;
}

function closedLabel(activity: Activity, now: Date): string | undefined {
  if (activity.status === 'finished' || reached(activity.endAt, now)) return '活动已结束';
  if (reached(activity.deadline, now)) return '报名已截止';
  if (activity.occupiedCount !== undefined && activity.occupiedCount >= activity.capacity)
    return '名额已满';
  if (
    activity.status !== 'published' ||
    activity.occupiedCount === undefined ||
    !Number.isFinite(new Date(activity.endAt).getTime()) ||
    !Number.isFinite(new Date(activity.deadline).getTime())
  )
    return '活动暂不可报名';
  return undefined;
}

export function resolveActivityAction(
  activity: Activity,
  registration?: Pick<Registration, 'id' | 'status'>,
  now = new Date(),
): ActivityAction {
  if (registration?.status === 'pending' || registration?.status === 'approved') {
    return {
      kind: 'view-registration',
      label: '查看我的报名',
      enabled: true,
      registrationId: registration.id,
    };
  }

  const closed = closedLabel(activity, now);
  if (registration?.status === 'rejected' || registration?.status === 'cancelled') {
    return closed
      ? {
          kind: 'view-history',
          label: '查看报名历史',
          enabled: true,
          registrationId: registration.id,
        }
      : {
          kind: 'resubmit',
          label: '修改后重新报名',
          enabled: true,
          registrationId: registration.id,
        };
  }

  if (closed) return { kind: 'closed', label: closed, enabled: false };
  return { kind: 'register', label: '立即报名', enabled: true };
}

export function activityDisplayStatus(a: Activity, n: number, now = new Date()) {
  if (a.status === 'draft') return '草稿';
  if (a.status === 'finished' || now > new Date(a.endAt)) return '已结束';
  if (now > new Date(a.deadline)) return '已截止';
  return n >= a.capacity ? '已满' : '报名中';
}
