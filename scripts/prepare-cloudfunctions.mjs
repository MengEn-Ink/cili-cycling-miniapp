import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const shared = resolve(root, 'cloudfunctions/shared');
const domainFunctions = ['activity-read', 'registration', 'admin-review'];
const sharedFiles = ['index.js', 'domain.js', 'use-cases.js'];
for (const name of domainFunctions) {
  const functionRoot = resolve(root, 'cloudfunctions', name);
  const domainRoot = resolve(functionRoot, 'domain');
  rmSync(resolve(functionRoot, 'vendor'), { recursive: true, force: true });
  rmSync(domainRoot, { recursive: true, force: true });
  mkdirSync(domainRoot, { recursive: true });
  for (const file of sharedFiles) copyFileSync(resolve(shared, file), resolve(domainRoot, file));
}
copyFileSync(
  resolve(root, 'cloudfunctions/activity-admin/gpx.js'),
  resolve(root, 'cloudfunctions/strava-bridge/gpx.js'),
);
for (const target of ['strava-callback', 'strava-revocation-worker'])
  for (const file of ['core.js', 'store.js', 'privacy-contract.js'])
    copyFileSync(
      resolve(root, 'cloudfunctions/strava-bridge', file),
      resolve(root, 'cloudfunctions', target, file),
    );
console.log(
  `共享领域源码已复制到 ${domainFunctions.length} 个业务函数，Strava 复用 GPX 解析器与 OAuth 核心已同步`,
);
