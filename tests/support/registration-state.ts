import type { RegistrationStatus } from '../../miniprogram/models';

const transitions: Record<RegistrationStatus, RegistrationStatus[]> = {
  waiting: ['pending', 'cancelled'],
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['checked_in', 'cancelled'],
  checked_in: [],
  rejected: ['pending'],
  cancelled: ['pending'],
};

export function canTransition(from: RegistrationStatus, to: RegistrationStatus) {
  return transitions[from].includes(to);
}

export function transition(from: RegistrationStatus, to: RegistrationStatus) {
  if (!canTransition(from, to)) throw Error('非法状态迁移');
  return to;
}
