import { copyFileSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const shared = resolve(root, 'cloudfunctions/shared');
const domainFunctions = ['activity-read', 'registration', 'admin-review'];
const sharedFiles = ['index.js', 'domain.js', 'use-cases.js', 'privacy.js'];
for (const name of domainFunctions) {
  const functionRoot = resolve(root, 'cloudfunctions', name);
  const domainRoot = resolve(functionRoot, 'domain');
  rmSync(resolve(functionRoot, 'vendor'), { recursive: true, force: true });
  rmSync(domainRoot, { recursive: true, force: true });
  mkdirSync(domainRoot, { recursive: true });
  for (const file of sharedFiles) copyFileSync(resolve(shared, file), resolve(domainRoot, file));
}
for (const name of [
  'profile',
  'privacy-maintenance',
  'profile-media-cleanup',
  'activity-admin',
  'club-application',
]) {
  copyFileSync(
    resolve(shared, 'privacy.js'),
    resolve(root, 'cloudfunctions', name, 'privacy-contract.js'),
  );
}
copyFileSync(
  resolve(root, 'cloudfunctions/profile-media-cleanup/core.js'),
  resolve(root, 'cloudfunctions/privacy-maintenance/media-core.js'),
);
writeFileSync(
  resolve(root, 'cloudfunctions/privacy-maintenance/media-store.js'),
  readFileSync(resolve(root, 'cloudfunctions/profile-media-cleanup/store.js'), 'utf8').replace(
    "require('./core')",
    "require('./media-core')",
  ),
);
copyFileSync(
  resolve(root, 'cloudfunctions/activity-admin/gpx.js'),
  resolve(root, 'cloudfunctions/strava-bridge/gpx.js'),
);
copyFileSync(
  resolve(root, 'cloudfunctions/strava-bridge/core.js'),
  resolve(root, 'cloudfunctions/strava-callback/core.js'),
);
console.log(
  `共享领域源码已复制到 ${domainFunctions.length} 个业务函数，Strava 复用 GPX 解析器与 OAuth 核心已同步`,
);
