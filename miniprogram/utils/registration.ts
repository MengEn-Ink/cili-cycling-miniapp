import type { RegistrationStatus as S } from '../models';
const m: Record<S, S[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['checked_in', 'cancelled'],
  checked_in: [],
  rejected: ['pending'],
  cancelled: ['pending'],
};
export function canTransition(a: S, b: S) {
  return m[a].includes(b);
}
export function transition(a: S, b: S) {
  if (!canTransition(a, b)) throw Error('非法状态迁移');
  return b;
}
