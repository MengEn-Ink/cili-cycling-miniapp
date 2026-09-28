import type { RideRepository } from './types';
import { MockRepository } from './mock';
import { CloudRepository } from './cloud';
import { DEVELOPMENT_MOCK } from '../config/runtime';

export function createRepository(options: { developmentMock?: boolean } = {}): RideRepository {
  return (options.developmentMock ?? DEVELOPMENT_MOCK)
    ? new MockRepository()
    : new CloudRepository();
}

export const repository: RideRepository = createRepository();
export const isMock = false;
