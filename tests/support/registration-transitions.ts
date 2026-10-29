import type { RegistrationStatus as S } from '../../miniprogram/models';

/**
 * 报名状态机迁移表：仅测试与测试替身仓储使用，不进入主包生产代码。
 * 运行时业务状态判定仍以 models 契约与云端返回为准。
 */
const TRANSITIONS: Record<S, S[]> = {
  waiting: ['pending', 'cancelled'],
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['checked_in', 'cancelled'],
  checked_in: [],
  rejected: ['pending'],
  cancelled: ['pending'],
};

export function canTransition(a: S, b: S): boolean {
  return TRANSITIONS[a].includes(b);
}

export function transition(a: S, b: S): S {
  if (!canTransition(a, b)) throw Error('非法状态迁移');
  return b;
}
