import type { Activity } from '../models';
export function activityDisplayStatus(a: Activity, n: number, now = new Date()) {
  if (a.status === 'draft') return '草稿';
  if (a.status === 'finished' || now > new Date(a.endAt)) return '已结束';
  if (now > new Date(a.deadline)) return '已截止';
  return n >= a.capacity ? '已满' : '报名中';
}
