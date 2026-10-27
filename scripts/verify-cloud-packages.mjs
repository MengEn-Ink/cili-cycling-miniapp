import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
function assertRegistryDependencies(name) {
  const directory = resolve(root, 'cloudfunctions', name);
  const packageJson = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  for (const [dependency, version] of Object.entries(packageJson.dependencies || {}))
    if (String(version).startsWith('file:'))
      throw new Error(`${name} 包含不可远端安装的本地依赖：${dependency}`);
  const lock = readFileSync(resolve(directory, 'package-lock.json'), 'utf8');
  if (lock.includes('file:')) throw new Error(`${name} package-lock 包含 file: 依赖`);
  const nonPublicRegistry = [...lock.matchAll(/"resolved": "(https?:\/\/[^/]+)\//g)].find(
    ([, origin]) => origin !== 'https://registry.npmjs.org',
  );
  if (nonPublicRegistry)
    throw new Error(`${name} package-lock 包含 CI 不可访问的依赖源：${nonPublicRegistry[1]}`);
  return directory;
}
function pack(name, required) {
  const directory = assertRegistryDependencies(name);
  // Windows 下 spawn 无法解析无扩展名 npm，且 Node 22 出于 CVE-2024-27980 防护
  // 要求 npm.cmd 必须启用 shell；Linux CI 行为保持不变。
  const isWindows = process.platform === 'win32';
  const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], {
    cwd: directory,
    encoding: 'utf8',
    shell: isWindows,
  });
  if (result.status !== 0) throw new Error(`${name} npm pack --dry-run 失败：${result.stderr}`);
  const files = JSON.parse(result.stdout)[0].files.map((item) => item.path);
  for (const file of required)
    if (!files.includes(file)) throw new Error(`${name} 部署包缺少 ${file}`);
}
for (const name of ['activity-read', 'registration', 'admin-review']) {
  for (const file of ['index.js', 'domain.js', 'use-cases.js'])
    if (
      hash(resolve(root, 'cloudfunctions/shared', file)) !==
      hash(resolve(root, 'cloudfunctions', name, 'domain', file))
    )
      throw new Error(`${name}/domain/${file} 与共享源码不一致`);
  pack(name, [
    'index.js',
    'package.json',
    'domain/index.js',
    'domain/domain.js',
    'domain/use-cases.js',
    ...(name === 'activity-read' ? ['public-avatar.js', 'list-page.js'] : []),
  ]);
}
pack('strava-bridge', [
  'index.js',
  'core.js',
  'store.js',
  'privacy-contract.js',
  'gpx.js',
  'package.json',
]);
pack('strava-callback', ['index.js', 'core.js', 'store.js', 'privacy-contract.js', 'package.json']);
if (
  hash(resolve(root, 'cloudfunctions/activity-admin/gpx.js')) !==
  hash(resolve(root, 'cloudfunctions/strava-bridge/gpx.js'))
)
  throw new Error('strava-bridge/gpx.js 未复用当前 activity-admin parseGpx');
const cloudbaseConfig = JSON.parse(readFileSync(resolve(root, 'cloudbaserc.json'), 'utf8'));
for (const target of ['strava-callback', 'strava-revocation-worker'])
  for (const file of ['core.js', 'store.js', 'privacy-contract.js'])
    if (
      hash(resolve(root, 'cloudfunctions/strava-bridge', file)) !==
      hash(resolve(root, 'cloudfunctions', target, file))
    )
      throw new Error(`${target}/${file} 与 strava-bridge/${file} 不一致`);
const stravaWorkerFunction = cloudbaseConfig.functions.find(
  (item) => item.name === 'strava-revocation-worker',
);
const stravaWorkerTimer = stravaWorkerFunction?.triggers?.find(
  (item) => item.name === 'strava-revocation-worker' && item.type === 'timer',
);
if (
  !stravaWorkerTimer ||
  typeof stravaWorkerTimer.config !== 'string' ||
  !stravaWorkerTimer.config.trim()
)
  throw new Error('strava-revocation-worker 缺少可部署的定时触发器');
pack('strava-revocation-worker', [
  'index.js',
  'core.js',
  'store.js',
  'privacy-contract.js',
  'package.json',
]);
pack('notification-send', ['index.js', 'core.js', 'store.js', 'access.js', 'package.json']);
pack('club-application', ['index.js', 'core.js', 'media.js', 'package.json']);
const notificationFunction = cloudbaseConfig.functions.find(
  (item) => item.name === 'notification-send',
);
const timer = notificationFunction?.triggers?.find(
  (item) => item.name === 'notification-outbox-worker' && item.type === 'timer',
);
if (!timer || typeof timer.config !== 'string' || !timer.config.trim())
  throw new Error('notification-send 缺少可部署的 notification-outbox-worker 定时触发器');
pack('activity-admin', [
  'index.js',
  'list-pagination.js',
  'domain-index.js',
  'domain.js',
  'use-cases.js',
  'package.json',
]);
pack('auth', ['index.js', 'core.js', 'package.json']);
pack('profile', [
  'index.js',
  'core.js',
  'capability-card.js',
  'media-upload.js',
  'store.js',
  'package.json',
]);
const mediaCleanupFunction = cloudbaseConfig.functions.find(
  (item) => item.name === 'profile-media-cleanup',
);
const mediaCleanupTimer = mediaCleanupFunction?.triggers?.find(
  (item) => item.name === 'profile-media-cleanup-worker' && item.type === 'timer',
);
if (
  !mediaCleanupTimer ||
  typeof mediaCleanupTimer.config !== 'string' ||
  !mediaCleanupTimer.config.trim()
)
  throw new Error('profile-media-cleanup 缺少可部署的定时触发器');
pack('profile-media-cleanup', ['index.js', 'core.js', 'store.js', 'package.json']);
const routeMaintenanceFunction = cloudbaseConfig.functions.find(
  (item) => item.name === 'route-maintenance',
);
const routeMaintenanceTimer = routeMaintenanceFunction?.triggers?.find(
  (item) => item.name === 'route-maintenance-worker' && item.type === 'timer',
);
if (
  !routeMaintenanceTimer ||
  typeof routeMaintenanceTimer.config !== 'string' ||
  !routeMaintenanceTimer.config.trim()
)
  throw new Error('route-maintenance 缺少可部署的定时触发器');
pack('route-maintenance', ['index.js', 'package.json']);
console.log('云函数部署包校验通过：源码自包含、共享代码一致且依赖均来自 registry');
