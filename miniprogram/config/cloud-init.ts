import { runtimeConfig } from './runtime';

export interface CloudInitializer {
  init(options: { env: string; traceUser?: boolean }): void;
}

export type CloudInitializationResult = 'initialized' | 'unavailable' | 'failed';

export function initializeCloud(cloud?: CloudInitializer): CloudInitializationResult {
  if (!cloud) return 'unavailable';

  try {
    cloud.init({ env: runtimeConfig.cloudEnvId, traceUser: true });
    return 'initialized';
  } catch {
    return 'failed';
  }
}
