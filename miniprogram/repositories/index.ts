import type { RideRepository } from './types';
import { MockRepository } from './mock';
import { CloudRepository } from './cloud';
import { CachingRepository, type RepositoryCacheControl } from './cached';
import { WxCacheStorage, getWxStorageSyncApi } from './persistent';
import { DEVELOPMENT_MOCK } from '../config/runtime';

export function createRepository(options: { developmentMock?: boolean } = {}): RideRepository {
  const inner =
    (options.developmentMock ?? DEVELOPMENT_MOCK) ? new MockRepository() : new CloudRepository();
  // 冷启动持久化：宿主提供同步存储时叠加 wx 存储后端，否则退回纯内存缓存。
  const storage = getWxStorageSyncApi() ? new WxCacheStorage() : undefined;
  // 统一在仓储层叠加只读缓存、写后失效与冷启动持久化，页面无感知。
  return new CachingRepository(inner, { storage });
}

export const repository: RideRepository = createRepository();
export const repositoryCache: RepositoryCacheControl = (repository as CachingRepository)
  .cacheControl;
export const isMock = DEVELOPMENT_MOCK;
