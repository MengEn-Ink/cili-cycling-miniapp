#!/usr/bin/env node
// PR 提交前一键预检脚本。
//
// 目的：把所有本地能跑的校验一次性跑完，避免提交后 CI 反复失败返工。
// 适用时机：代码修改全部完成、准备提交 PR 前。
//
// 校验项（快速→慢速）：
//   1. git status 工作区状态
//   2. lint
//   3. typecheck
//   4. check:governance
//   5. check:main-package
//   6. check:ui-sync（摘要一致性）
//   7. check:release-notes + settings-page 测试
//   8. PR 描述校验（如果 .pr-body.md 存在）
//
// 用法：node scripts/pr-preflight.mjs

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const STEPS = [
  {
    name: 'git status',
    cmd: 'git status --porcelain',
    soft: true,
    check: (out) => out.trim() === '' || '工作区有未提交修改',
  },
  { name: 'lint', cmd: 'npx eslint .' },
  { name: 'typecheck', cmd: 'npx tsc --noEmit' },
  { name: 'check:governance', cmd: 'node scripts/check-project-governance.mjs' },
  { name: 'check:main-package', cmd: 'node scripts/check-main-package-size.mjs' },
  { name: 'check:ui-sync', cmd: 'node scripts/check-ui-sync.mjs' },
  { name: 'check:release-notes', cmd: 'node scripts/check-release-notes.mjs' },
  { name: 'settings-page test', cmd: 'npx vitest run tests/settings-page.test.ts' },
];

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function main() {
  const failed = [];
  const warnings = [];

  for (const step of STEPS) {
    process.stdout.write(`▶ ${step.name} ... `);
    try {
      const out = run(step.cmd);
      if (step.check) {
        const issue = step.check(out);
        if (issue) {
          console.log('⚠ ' + issue);
          warnings.push({ name: step.name, issue });
        } else {
          console.log('✓');
        }
      } else {
        console.log('✓');
      }
    } catch (e) {
      console.log('✗');
      failed.push({ name: step.name, error: e.stderr || e.stdout || e.message });
    }
  }

  // PR 描述校验（可选）
  if (existsSync('.pr-body.md')) {
    process.stdout.write('▶ check:pr-description ... ');
    try {
      run('node scripts/check-pr-description.mjs');
      console.log('✓');
    } catch (e) {
      console.log('✗');
      failed.push({ name: 'check:pr-description', error: e.stderr || e.stdout || e.message });
    }
  } else {
    console.log('▷ check:pr-description 跳过（无 .pr-body.md）');
  }

  console.log('\n' + '='.repeat(50));
  if (warnings.length) {
    console.log(`警告 (${warnings.length}):`);
    for (const w of warnings) console.log(`  ⚠ ${w.name}: ${w.issue}`);
  }
  if (failed.length) {
    console.log(`失败 (${failed.length}):`);
    for (const f of failed) {
      console.log(`  ✗ ${f.name}`);
      if (f.error) {
        const lines = f.error.trim().split('\n').slice(0, 5).join('\n');
        console.log(`    ${lines.replace(/\n/g, '\n    ')}`);
      }
    }
    process.exitCode = 1;
  } else {
    console.log('✓ 全部通过，可以提交 PR');
  }
}

main();
