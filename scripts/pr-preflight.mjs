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

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';

import { parseDiffStats, validatePullRequest } from './check-pr-description.mjs';

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

const gitText = (args) => execFileSync('git', args, { encoding: 'utf8' });

function resolveBase() {
  try {
    return gitText(['merge-base', 'HEAD', 'origin/main']).trim();
  } catch {
    return gitText(['rev-parse', 'HEAD']).trim();
  }
}

function checkPrDescription() {
  if (!existsSync('.pr-body.md')) {
    console.log('▷ check:pr-description 跳过（无 .pr-body.md，可运行 npm run pr:body 生成）');
    return;
  }
  process.stdout.write('▶ check:pr-description ... ');
  const titleFile = existsSync('.pr-title.txt') ? readFileSync('.pr-title.txt', 'utf8').trim() : '';
  if (!titleFile) {
    console.log('✗');
    return {
      name: 'check:pr-description',
      error: '缺少 .pr-title.txt，请用 npm run pr:body -- --title "..." 生成',
    };
  }
  const body = readFileSync('.pr-body.md', 'utf8');
  const numstat = gitText(['diff', '--numstat', resolveBase()]);
  const stats = parseDiffStats(numstat);
  const errors = validatePullRequest({ title: titleFile, body, stats });
  if (errors.length) {
    console.log('✗');
    return { name: 'check:pr-description', error: errors.join('\n') };
  }
  const placeholders = (body.match(/【/g) || []).length;
  console.log(placeholders > 0 ? `⚠ 结构通过，但仍有 ${placeholders} 处【占位】未填写` : '✓');
  if (placeholders > 0) {
    return {
      warning: true,
      name: 'check:pr-description',
      issue: `仍有 ${placeholders} 处【占位】未填写`,
    };
  }
  return undefined;
}

function detectProxy() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: 7890, timeout: 600 });
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

async function main() {
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

  // PR 描述校验（可选，.pr-body.md 存在时才执行）
  const prResult = checkPrDescription();
  if (prResult?.error) failed.push(prResult);
  if (prResult?.warning) warnings.push(prResult);

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
        const lines = f.error.trim().split('\n').slice(0, 8).join('\n');
        console.log(`    ${lines.replace(/\n/g, '\n    ')}`);
      }
    }
    process.exitCode = 1;
  } else {
    console.log('✓ 全部通过，可以提交 PR');
  }

  if (await detectProxy()) {
    console.log('\n提示：检测到本地代理 127.0.0.1:7890，git/gh 访问 GitHub 前请设置：');
    console.log(
      "  git -c http.proxy=http://127.0.0.1:7890 ...  或  $env:HTTPS_PROXY='http://127.0.0.1:7890'",
    );
  }
}

main();
