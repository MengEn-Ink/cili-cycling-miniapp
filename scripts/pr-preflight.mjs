#!/usr/bin/env node
// 最终提交门禁：先阻断 dirty / 描述漂移，再通过现有 Harness 执行 CI affected。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createAffectedPlan } from './affected-ci.mjs';
import { validatePullRequest } from './check-pr-description.mjs';
import { readFinalPrState, resolveVerificationReport } from './pr-final-state.mjs';
import { classifyUiPath } from './ui-sync-policy.mjs';

export function runPreflight({
  cwd = process.cwd(),
  bodyPath = '.pr-body.md',
  titlePath = '.pr-title.txt',
  logger = console,
  execute = spawnSync,
} = {}) {
  try {
    const state = readFinalPrState(cwd);
    const readRequired = (file) => {
      const path = resolve(cwd, file);
      if (!existsSync(path)) throw new Error(`缺少最终 PR 描述文件 ${file}，请先 npm run pr:body`);
      return readFileSync(path, 'utf8').trim();
    };
    const title = readRequired(titlePath);
    const body = readRequired(bodyPath);
    const errors = validatePullRequest({
      title,
      body,
      stats: state.stats,
      fileExists: (file) => existsSync(resolve(cwd, file)),
    });
    if (errors.length) throw new Error(`PR 描述校验失败：\n${errors.join('\n')}`);
    const report = body.match(/验收报告[^\n]*(docs\/verification\/[^\s`)\]]+\.md)/)?.[1];
    resolveVerificationReport({ report, files: state.files, cwd });
    logger.log(`PASS 最终状态与 PR 描述（${state.head.slice(0, 10)}）`);

    const plan = createAffectedPlan(state.paths);
    const product = state.paths.some((file) => /^(?:miniprogram|cloudfunctions)\//.test(file));
    const ui = state.paths.some(
      (file) =>
        classifyUiPath(file).ui ||
        /^docs\/(?:index\.html|styles\.css|app\.js|delivery-center\.js|schema\.js|templates\.js|ui-sync-manifest\.json)$/.test(
          file,
        ),
    );
    // 版本反例与严格 UI 同步先执行，避免进入较慢的全量门禁后才发现不一致。
    const steps = [
      ...(product
        ? [
            [process.execPath, ['scripts/check-release-notes.mjs']],
            ['npm', ['exec', '--', 'vitest', 'run', 'tests/settings-page.test.ts']],
          ]
        : []),
      ...(ui
        ? [
            [process.execPath, ['scripts/check-ui-sync.mjs', '--strict']],
            [process.execPath, ['scripts/check-project-governance.mjs']],
          ]
        : []),
      [process.execPath, ['scripts/harness.mjs', 'run', 'affected']],
      ...(ui && plan.mode !== 'full' ? [['npm', ['run', 'validate']]] : []),
    ];
    const env = {
      ...process.env,
      AFFECTED_BASE: state.base,
      AFFECTED_HEAD: state.head,
      RELEASE_NOTES_BASE: state.base,
      OUT_DIR: resolve(cwd, 'artifacts/pr-preflight'),
    };
    for (const [command, args] of steps) {
      logger.log(`▶ ${args.join(' ')}`);
      const result = execute(command, args, {
        cwd,
        env,
        stdio: 'inherit',
        // Windows npm 是 .cmd；参数均为固定的本仓库命令，不插入 PR 文本。
        shell: process.platform === 'win32' && command === 'npm',
      });
      if (result.error || result.status !== 0) {
        throw new Error(`检查失败：${args.join(' ')}（exit ${result.status ?? 'unknown'}）`);
      }
    }
    const final = readFinalPrState(cwd);
    if (state.head !== final.head || state.base !== final.base) {
      throw new Error('预检期间提交或主线基准发生变化，请重新生成描述并预检');
    }
    logger.log('✓ 最终提交预检通过，可以提交 PR（真实旅程与发布验收仍独立记录）');
    return 0;
  } catch (error) {
    logger.error(error.message);
    return 1;
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    if (!['--body', '--title-file'].includes(option) || !argv[index + 1]) {
      throw new Error(`无效参数：${option}`);
    }
    options[option === '--body' ? 'bodyPath' : 'titlePath'] = argv[index + 1];
  }
  return options;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.exitCode = runPreflight(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
