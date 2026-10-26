import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { findTrackedModeViolations } from './project-governance-policy.mjs';

const trackedModes = spawnSync('git', ['ls-files', '--stage', '-z'], { encoding: 'utf8' });
if (trackedModes.status !== 0) {
  throw new Error(`无法读取 Git 文件模式：${trackedModes.stderr.trim()}`);
}

const modeViolations = findTrackedModeViolations(
  trackedModes.stdout,
  (file) => readFileSync(file, 'utf8').split(/\r?\n/, 1)[0],
);
if (modeViolations.length) {
  throw new Error(`Git 文件模式不符合源码卫生策略：${modeViolations.join(', ')}`);
}

console.log('Git 文件模式校验通过：15 个显式 CLI 入口，无额外 100755 文件');
