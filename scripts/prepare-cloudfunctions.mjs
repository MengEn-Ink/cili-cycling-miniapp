import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const shared = resolve(root, 'cloudfunctions/shared');
const functions = ['activity-read', 'registration', 'admin-review'];
const sharedFiles = ['index.js', 'domain.js', 'use-cases.js'];

for (const name of functions) {
  const functionRoot = resolve(root, 'cloudfunctions', name);
  const domainRoot = resolve(functionRoot, 'domain');

  // 清除旧的 file: tarball 方案，避免 CloudBase 远端安装阶段解析本地依赖。
  rmSync(resolve(functionRoot, 'vendor'), { recursive: true, force: true });
  rmSync(domainRoot, { recursive: true, force: true });
  mkdirSync(domainRoot, { recursive: true });
  for (const file of sharedFiles) {
    copyFileSync(resolve(shared, file), resolve(domainRoot, file));
  }
}

console.log(`共享领域源码已复制到 ${functions.length} 个独立部署目录`);
