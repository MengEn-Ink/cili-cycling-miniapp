import type { RideRepository } from './types';
import { MockRepository } from './mock';
import { CloudRepository } from './cloud';
import { CachingRepository, type RepositoryCacheControl } from './cached';
import { DEVELOPMENT_MOCK } from '../config/runtime';

export function createRepository(options: { developmentMock?: boolean } = {}): RideRepository {
  const inner =
    (options.developmentMock ?? DEVELOPMENT_MOCK) ? new MockRepository() : new CloudRepository();
  // 统一在仓储层叠加只读缓存与写后失效，页面无感知。
  return new CachingRepository(inner);
}

export const repository: RideRepository = createRepository();
export const repositoryCache: RepositoryCacheControl = (repository as CachingRepository)
  .cacheControl;
export const isMock = DEVELOPMENT_MOCK;
