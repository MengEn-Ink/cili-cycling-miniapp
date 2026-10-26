#!/usr/bin/env node
// PR 描述生成器：按 check-pr-description.mjs 的 8 个必填章节生成骨架，
// 自动填入与 CI 一致的 diff 统计（git diff --numstat <merge-base>，含工作区改动），
// 自动检测 docs/verification/ 下最新的验收报告。
//
// 用法：
//   npm run pr:body -- --title "fix(ui): 中文结果" [--report docs/verification/xxx.md]
//
// 产物：
//   .pr-body.md   PR 描述草稿（占位符用【】，填完后再跑 npm run pr:preflight）
//   .pr-title.txt PR 标题（预检与 gh pr create 复用）
//
// 流程约定：所有代码 commit 完成后再生成/填写，避免统计反复变动。

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BODY_PATH = '.pr-body.md';
const TITLE_PATH = '.pr-title.txt';
const VERIFICATION_DIR = 'docs/verification';
const TITLE_PATTERN = /^(feat|fix|refactor|docs|test|chore|ci|perf)(\([^)]+\))?: .*[\u3400-\u9fff]/;

const gitText = (args) => execFileSync('git', args, { encoding: 'utf8' });
const lines = (value) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--title') args.title = argv[i + 1];
    if (argv[i] === '--report') args.report = argv[i + 1];
  }
  return args;
}

function resolveBase() {
  try {
    return gitText(['merge-base', 'HEAD', 'origin/main']).trim();
  } catch {
    return gitText(['rev-parse', 'HEAD']).trim();
  }
}

function numstat(base) {
  return gitText(['diff', '--numstat', base]).split('\n').filter(Boolean);
}

function parseDiffStats(numstatOutput) {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  for (const line of numstatOutput) {
    const [added, deleted] = line.split('\t');
    files += 1;
    if (/^\d+$/.test(added)) additions += Number(added);
    if (/^\d+$/.test(deleted)) deletions += Number(deleted);
  }
  return { files, additions, deletions };
}

function changedFiles(base) {
  return lines(gitText(['diff', '--name-status', base])).map((line) => {
    const tab = line.indexOf('\t');
    return { status: line.slice(0, tab), file: line.slice(tab + 1) };
  });
}

function untrackedFiles() {
  return lines(gitText(['ls-files', '--others', '--exclude-standard']));
}

function latestVerificationReport() {
  if (!existsSync(VERIFICATION_DIR)) return undefined;
  const reports = readdirSync(VERIFICATION_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const full = join(VERIFICATION_DIR, name);
      return { path: `${VERIFICATION_DIR}/${name}`, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return reports[0]?.path;
}

function buildBody({ stats, files, untracked, reportPath }) {
  const fileRows = files.map(({ status, file }) => `| ${status} | ${file} |`).join('\n');
  const untrackedSection = untracked.length
    ? `\n\n未跟踪文件（尚未 git add，不计入上方统计）：${untracked.join('、')}`
    : '';

  return `## 需求上下文

一句话概要：【请补充：一句话说明本次改动达成的结果】

| 资料 | 链接 | 用途 |
| --- | --- | --- |
| 高优先级问题清单 | docs/high-priority-issues.md | 问题来源与验收口径 |
| UI 同步清单 | docs/ui-sync-manifest.json | 双端截图与 UI 摘要基线 |

## 背景

【请补充：为什么要做这件事，当前问题或痛点是什么】

## 修改方案

【请补充：方案要点、关键取舍与实现方式】

## 复现或验证路径

【请补充：如何复现原问题、验证修复的步骤（页面 / 操作 / 预期）】

## 改动

【请补充：列出主要改动点，按模块归纳】

## 影响面

- 行为变化：【请补充：用户可感知的行为差异】
- 数据/兼容性：【请补充：是否影响存量数据、旧版本兼容】
- 安全/隐私：【请补充：是否涉及个人信息、权限、鉴权变化；无则写"无"】
- 部署：【请补充：是否需要云函数重新部署或配置变更】
- 回滚：【请补充：回退方式，如 revert 单个 commit】

## 测试与端到端验收

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 全量校验 | npm run validate | 【请补充：通过 / 未执行 + 原因】 |
| 覆盖率 | npm run coverage | 【请补充】 |
| 安全审计 | npm run audit:all | 【请补充】 |
| 空白字符 | git diff --check | 【请补充】 |

| 关键用例 | 覆盖场景 |
| --- | --- |
| 【请补充：用例名】 | 【请补充：覆盖场景】 |

端到端验收：【请补充：真机 / 模拟器 / 写链路验收情况；未执行须写明原因与阻塞点】

验收报告：${reportPath}

## 改动文件

汇总：\`${stats.files} files changed, +${stats.additions}/-${stats.deletions}\`

| 状态 | 文件 |
| --- | --- |
${fileRows}${untrackedSection}
`;
}

function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.title || !TITLE_PATTERN.test(args.title)) {
    console.error(
      '缺少或不符合规范的 --title，格式：<type>(<scope>): <中文结果>，type 取 feat|fix|refactor|docs|test|chore|ci|perf',
    );
    process.exitCode = 1;
    return;
  }
  if (args.title.length > 72) {
    console.error('标题不得超过 72 个字符');
    process.exitCode = 1;
    return;
  }

  const base = resolveBase();
  const numstatOutput = numstat(base);
  const stats = parseDiffStats(numstatOutput);
  const files = changedFiles(base);
  const untracked = untrackedFiles();
  const reportPath = args.report || latestVerificationReport();

  if (!reportPath || !existsSync(reportPath)) {
    console.error(
      '未找到验收报告：请通过 --report docs/verification/xxx.md 指定，或先在 docs/verification/ 下创建报告',
    );
    process.exitCode = 1;
    return;
  }

  writeFileSync(TITLE_PATH, `${args.title}\n`, 'utf8');
  writeFileSync(BODY_PATH, buildBody({ stats, files, untracked, reportPath }), 'utf8');

  const placeholders = (readFileSync(BODY_PATH, 'utf8').match(/【/g) || []).length;
  console.log(`基准：${base.slice(0, 10)}（merge-base 与 origin/main）`);
  console.log(`统计：${stats.files} files changed, +${stats.additions}/-${stats.deletions}`);
  console.log(`验收报告：${reportPath}`);
  if (untracked.length)
    console.log(`未跟踪文件 ${untracked.length} 个（未计入统计，提交后重新生成）`);
  console.log(`已生成 ${TITLE_PATH} 与 ${BODY_PATH}（${placeholders} 处【占位】待填写）`);
  console.log('\n下一步：');
  console.log('  1. 填写 .pr-body.md 中所有【】占位内容');
  console.log('  2. npm run pr:preflight 复核');
  console.log(`  3. gh pr create --title "$(Get-Content .pr-title.txt)" --body-file ${BODY_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run();
}
