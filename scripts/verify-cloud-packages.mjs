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
  return directory;
}
function pack(name, required) {
  const directory = assertRegistryDependencies(name);
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: directory,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`${name} npm pack --dry-run 失败：${result.stderr}`);
  const files = JSON.parse(result.stdout)[0].files.map((item) => item.path);
  for (const file of required)
    if (!files.includes(file)) throw new Error(`${name} 部署包缺少 ${file}`);
}
for (const name of ['activity-read', 'registration']) {
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
  ]);
}
pack('admin-review', [
  'index.js',
  'package.json',
  'domain/index.js',
  'domain/domain.js',
  'domain/use-cases.js',
]);
pack('notification-send', ['index.js', 'core.js', 'store.js', 'access.js', 'package.json']);
const cloudbaseConfig = JSON.parse(readFileSync(resolve(root, 'cloudbaserc.json'), 'utf8'));
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
  'domain-index.js',
  'domain.js',
  'use-cases.js',
  'package.json',
]);
pack('auth', ['index.js', 'core.js', 'package.json']);
pack('profile', ['index.js', 'core.js', 'package.json']);
for (const name of ['strava-auth', 'strava-callback']) {
  for (const file of ['core.js', 'api.js'])
    if (
      hash(resolve(root, 'cloudfunctions/strava-shared', file)) !==
      hash(resolve(root, 'cloudfunctions', name, 'oauth', file))
    )
      throw new Error(`${name}/oauth/${file} 与共享源码不一致`);
  const packageRootFiles = name === 'strava-auth' ? ['store.js'] : ['http.js'];
  pack(name, ['index.js', 'package.json', 'oauth/core.js', 'oauth/api.js', ...packageRootFiles]);
}
console.log('云函数部署包校验通过：源码自包含、共享代码一致且依赖均来自 registry');
