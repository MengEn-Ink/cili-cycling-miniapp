import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const shared = resolve(root, 'cloudfunctions/shared');
const domainFunctions = ['activity-read', 'registration'];
const sharedFiles = ['index.js', 'domain.js', 'use-cases.js'];
for (const name of domainFunctions) {
  const functionRoot = resolve(root, 'cloudfunctions', name);
  const domainRoot = resolve(functionRoot, 'domain');
  rmSync(resolve(functionRoot, 'vendor'), { recursive: true, force: true });
  rmSync(domainRoot, { recursive: true, force: true });
  mkdirSync(domainRoot, { recursive: true });
  for (const file of sharedFiles) copyFileSync(resolve(shared, file), resolve(domainRoot, file));
}
const oauthSource = resolve(root, 'cloudfunctions/strava-shared');
for (const name of ['strava-auth', 'strava-callback']) {
  const oauthRoot = resolve(root, 'cloudfunctions', name, 'oauth');
  rmSync(oauthRoot, { recursive: true, force: true });
  mkdirSync(oauthRoot, { recursive: true });
  for (const file of ['core.js', 'api.js'])
    copyFileSync(resolve(oauthSource, file), resolve(oauthRoot, file));
}
console.log(
  `共享领域源码已复制到 ${domainFunctions.length} 个业务函数，OAuth 核心已复制到 2 个函数`,
);
