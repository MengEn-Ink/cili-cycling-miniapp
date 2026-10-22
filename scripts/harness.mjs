#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import {
  HARNESS_PROFILES,
  HARNESS_SCHEMA_VERSION,
  HARNESS_TASKS,
  resolveHarnessTasks,
} from './harness-registry.mjs';

const DEFAULT_REPORT = 'artifacts/harness/harness-report.json';

export function parseHarnessArgs(argv) {
  const [action = 'help', selection, ...rest] = argv;
  let reportPath = process.env.CILI_HARNESS_REPORT || DEFAULT_REPORT;
  let continueOnFailure = false;
  let resume = false;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--report') {
      reportPath = rest[++index];
      if (!reportPath) throw new Error('--report 需要文件路径');
      continue;
    }
    if (argument === '--continue-on-failure') {
      continueOnFailure = true;
      continue;
    }
    if (argument === '--resume') {
      resume = true;
      continue;
    }
    throw new Error(`未知参数：${argument}`);
  }

  return { action, selection, reportPath, continueOnFailure, resume };
}

export function inspectHarnessEnvironment({
  taskNames,
  env = process.env,
  platform = process.platform,
}) {
  const checks = [
    {
      id: 'node-version',
      ok: Number(process.versions.node.split('.')[0]) >= 22,
      message: `Node.js ${process.versions.node}（要求 >= 22）`,
    },
  ];

  for (const taskName of taskNames) {
    const task = HARNESS_TASKS[taskName];
    if (task.requiresInstall) {
      checks.push({
        id: `${taskName}:dependencies`,
        ok: existsSync(resolve('node_modules')),
        message: existsSync(resolve('node_modules'))
          ? '根依赖已安装'
          : '缺少 node_modules，请先执行 npm ci',
      });
    }
    for (const name of task.requiredEnv ?? []) {
      checks.push({
        id: `${taskName}:env:${name}`,
        ok: Boolean(env[name]),
        message: env[name] ? `${name} 已提供` : `缺少环境变量 ${name}`,
      });
    }
    if (task.platforms && !task.platforms.includes(platform)) {
      checks.push({
        id: `${taskName}:platform`,
        ok: false,
        message: `${taskName} 仅支持 ${task.platforms.join('/')}，当前为 ${platform}`,
      });
    }
  }

  return checks;
}

export function createHarnessReport({ selection, taskNames, commitSha, mode }) {
  return {
    schemaVersion: HARNESS_SCHEMA_VERSION,
    selection,
    mode,
    commitSha,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    outcome: 'running',
    failureCategory: null,
    resumedFrom: null,
    preflight: [],
    tasks: taskNames.map((name) => ({
      name,
      status: 'pending',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      failureCategory: null,
      skippedReason: null,
    })),
  };
}

export function applyResumeState(report, previousReport, reportPath) {
  if (previousReport.schemaVersion !== HARNESS_SCHEMA_VERSION) {
    throw new Error(
      `续跑报告 schemaVersion=${previousReport.schemaVersion}，当前要求 ${HARNESS_SCHEMA_VERSION}`,
    );
  }
  if (previousReport.selection !== report.selection) {
    throw new Error(
      `续跑报告 selection=${previousReport.selection}，当前选择为 ${report.selection}`,
    );
  }
  if (previousReport.commitSha !== report.commitSha) {
    throw new Error(
      `续跑报告绑定 ${previousReport.commitSha}，当前提交为 ${report.commitSha}；旧报告不能跨版本复用`,
    );
  }

  const previousTasks = new Map(previousReport.tasks.map((task) => [task.name, task]));
  for (const task of report.tasks) {
    if (previousTasks.get(task.name)?.status !== 'passed') continue;
    task.status = 'skipped';
    task.skippedReason = 'resume:previously-passed';
  }
  report.resumedFrom = {
    reportPath,
    commitSha: previousReport.commitSha,
    finishedAt: previousReport.finishedAt,
  };
  return report;
}

function loadReport(reportPath) {
  const absolutePath = resolve(reportPath);
  if (!existsSync(absolutePath)) throw new Error(`续跑报告不存在：${reportPath}`);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function gitCommitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

function saveReport(reportPath, report) {
  const absolutePath = resolve(reportPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
}

function finishReport(report) {
  report.finishedAt = new Date().toISOString();
  if (report.preflight.some((check) => !check.ok)) {
    report.outcome = 'blocked';
    report.failureCategory = 'environment';
  } else if (report.tasks.some((task) => task.status === 'failed')) {
    report.outcome = 'failed';
    report.failureCategory = report.tasks.find((task) => task.status === 'failed')?.failureCategory;
  } else if (report.tasks.some((task) => task.status === 'pending')) {
    report.outcome = 'blocked';
    report.failureCategory = 'incomplete';
  } else {
    report.outcome = 'passed';
    report.failureCategory = null;
  }
  return report;
}

function printHelp() {
  console.log(`用法：
  npm run harness -- list
  npm run harness -- preflight <任务|配置>
  npm run harness -- run <任务|配置> [--report <路径>] [--resume] [--continue-on-failure]

任务：${Object.keys(HARNESS_TASKS).join(', ')}
配置：${Object.keys(HARNESS_PROFILES).join(', ')}`);
}

export function runHarness(argv = process.argv.slice(2)) {
  const { action, selection, reportPath, continueOnFailure, resume } = parseHarnessArgs(argv);
  if (action === 'help' || action === '--help' || action === '-h') {
    printHelp();
    return 0;
  }
  if (action === 'list') {
    console.log(JSON.stringify({ tasks: HARNESS_TASKS, profiles: HARNESS_PROFILES }, null, 2));
    return 0;
  }
  if (!['preflight', 'run'].includes(action) || !selection) {
    printHelp();
    return 2;
  }

  const taskNames = resolveHarnessTasks(selection);
  const report = createHarnessReport({
    selection,
    taskNames,
    commitSha: gitCommitSha(),
    mode: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
  });
  if (resume) applyResumeState(report, loadReport(reportPath), reportPath);
  const runnableTaskNames = report.tasks
    .filter((task) => task.status === 'pending')
    .map((task) => task.name);
  report.preflight = inspectHarnessEnvironment({ taskNames: runnableTaskNames });

  for (const check of report.preflight) {
    console.log(`${check.ok ? 'PASS' : 'BLOCKED'} ${check.id}: ${check.message}`);
  }

  if (action === 'preflight' || report.preflight.some((check) => !check.ok)) {
    if (action === 'preflight' && report.preflight.every((check) => check.ok)) {
      for (const task of report.tasks) task.status = 'not_executed';
    }
    finishReport(report);
    saveReport(reportPath, report);
    console.log(`Harness 报告：${reportPath}`);
    return report.outcome === 'passed' ? 0 : 1;
  }

  for (const taskResult of report.tasks) {
    if (taskResult.status === 'skipped') {
      console.log(`SKIPPED ${taskResult.name}: 已由同一提交的历史报告证明通过`);
      continue;
    }
    const [command, args] = HARNESS_TASKS[taskResult.name].command;
    taskResult.status = 'running';
    taskResult.startedAt = new Date().toISOString();
    const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
    taskResult.finishedAt = new Date().toISOString();
    taskResult.exitCode = result.status ?? 1;
    taskResult.status = taskResult.exitCode === 0 ? 'passed' : 'failed';
    taskResult.failureCategory =
      taskResult.status === 'failed' ? (result.error ? 'infrastructure' : 'application') : null;
    saveReport(reportPath, report);
    if (taskResult.status === 'failed' && !continueOnFailure) break;
  }

  finishReport(report);
  saveReport(reportPath, report);
  console.log(`Harness ${report.outcome.toUpperCase()}：${reportPath}`);
  return report.outcome === 'passed' ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = runHarness();
  } catch (error) {
    console.error(`Harness 参数错误：${error.message}`);
    process.exitCode = 2;
  }
}
