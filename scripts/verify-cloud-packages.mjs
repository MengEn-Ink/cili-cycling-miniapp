import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const names = ['activity-read', 'registration', 'admin-review'];
const sharedFiles = ['index.js', 'domain.js', 'use-cases.js'];
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

for (const name of names) {
  const directory = resolve(root, 'cloudfunctions', name);
  const packageJson = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  for (const [dependency, version] of Object.entries(packageJson.dependencies || {})) {
    if (String(version).startsWith('file:')) {
      throw new Error(`${name} 仍包含不可远端安装的本地依赖：${dependency}=${version}`);
    }
  }
  const lockText = readFileSync(resolve(directory, 'package-lock.json'), 'utf8');
  if (lockText.includes('file:') || lockText.includes('@cili/cloud-domain')) {
    throw new Error(`${name} package-lock.json 仍包含旧的本地共享包引用`);
  }
  for (const file of sharedFiles) {
    const source = resolve(root, 'cloudfunctions/shared', file);
    const copied = resolve(directory, 'domain', file);
    if (hash(source) !== hash(copied)) throw new Error(`${name}/domain/${file} 与共享源码不一致`);
  }

  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: directory,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`${name} npm pack --dry-run 失败：${result.stderr}`);
  const files = JSON.parse(result.stdout)[0].files.map((item) => item.path);
  for (const required of [
    'index.js',
    'package.json',
    'domain/index.js',
    'domain/domain.js',
    'domain/use-cases.js',
  ]) {
    if (!files.includes(required)) throw new Error(`${name} 部署包缺少 ${required}`);
  }
  if (files.some((file) => file.startsWith('vendor/'))) {
    throw new Error(`${name} 部署包仍包含 vendor 残留`);
  }
}

console.log('云函数部署包校验通过：领域源码自包含、哈希一致且无 file:/vendor 依赖');
