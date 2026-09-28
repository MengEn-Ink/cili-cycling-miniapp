import type { RideRepository } from './types';
import { MockRepository } from './mock';
import { CloudRepository } from './cloud';
import { runtimeConfig } from '../config/runtime';

export const repository: RideRepository =
  runtimeConfig.dataMode === 'production' ? new CloudRepository() : new MockRepository();
export const isMock = runtimeConfig.dataMode === 'mock';
