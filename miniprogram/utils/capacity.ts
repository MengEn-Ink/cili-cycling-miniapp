import type { Registration } from '../models';
export function occupiedCount(v: Pick<Registration, 'status'>[]) {
  return v.filter((x) => x.status === 'pending' || x.status === 'approved').length;
}
