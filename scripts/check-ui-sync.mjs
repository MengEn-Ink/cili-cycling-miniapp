import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  classifyUiPath,
  digestFiles,
  evaluateUiSyncPolicy,
  validateManifest,
} from './ui-sync-policy.mjs';

const MANIFEST_PATH = 'docs/ui-sync-manifest.json';
const UI_PATHS = [
  'miniprogram/app.json',
  'miniprogram/app.wxss',
  'miniprogram/pages',
  'miniprogram/components',
  'miniprogram/assets',
];
const PROTOTYPE_FILES = [
  'docs/index.html',
  'docs/styles.css',
  'docs/app.js',
  'docs/schema.js',
  'docs/templates.js',
];
const DAY_MS = 24 * 60 * 60 * 1000;

export function assessUiSyncState({
  manifest,
  appPages,
  baselineUiDigest,
  currentPrototypeDigest,
  uiCommitShas,
  changedFiles,
  readEvidence,
  now = new Date(),
  strict = false,
}) {
  validateManifest(manifest, { appPages, readEvidence });
  if (baselineUiDigest !== manifest.source.digest) {
    throw new Error(
      `UI 基线摘要不匹配：清单 ${manifest.source.digest}，Git ${baselineUiDigest}`,
    );
  }
  if (currentPrototypeDigest !== manifest.prototype.digest) {
    throw new Error(
      `Pages 原型摘要不匹配：清单 ${manifest.prototype.digest}，当前 ${currentPrototypeDigest}`,
    );
  }

  const immediateFiles = [...new Set(changedFiles.filter((file) => classifyUiPath(file).immediate))];
  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(manifest.syncedAt)) / DAY_MS),
  );
  const policy = evaluateUiSyncPolicy({
    uiCommits: new Set(uiCommitShas).size,
    ageDays,
    immediateFiles,
    strict,
    maxUiCommits: manifest.policy.maxUnsyncedUiCommits,
    maxAgeDays: manifest.policy.maxAgeDays,
  });

  return {
    ok: policy.ok,
    uiCommits: new Set(uiCommitShas).size,
    ageDays,
    remaining: policy.remaining,
    immediateFiles,
    reason: policy.reason,
  };
}

function gitText(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function gitBuffer(args) {
  return execFileSync('git', args);
}

function lines(value) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function baselineUiDigest(ref) {
  const files = lines(gitText(['ls-tree', '-r', '--name-only', ref, '--', ...UI_PATHS])).filter(
    (file) => classifyUiPath(file).ui,
  );
  return digestFiles(
    new Map(files.map((file) => [file, gitBuffer(['show', `${ref}:${file}`])])),
  );
}

function currentPrototypeDigest() {
  return digestFiles(
    new Map(PROTOTYPE_FILES.map((file) => [file, readFileSync(file)])),
  );
}

function readManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function uiCommitShas(ref) {
  return lines(gitText(['log', '--format=%H', `${ref}..HEAD`, '--', ...UI_PATHS]));
}

function changedFiles(ref) {
  return lines(gitText(['diff', '--name-only', ref, '--']));
}

export function run({ strict = process.argv.includes('--strict') } = {}) {
  const manifest = readManifest();
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', manifest.syncedThrough, 'HEAD']);
  } catch {
    throw new Error(`同步基线不是当前分支祖先：${manifest.syncedThrough}`);
  }

  const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
  const result = assessUiSyncState({
    manifest,
    appPages: appConfig.pages,
    baselineUiDigest: baselineUiDigest(manifest.syncedThrough),
    currentPrototypeDigest: currentPrototypeDigest(),
    uiCommitShas: uiCommitShas(manifest.syncedThrough),
    changedFiles: changedFiles(manifest.syncedThrough),
    readEvidence: (file) => readFileSync(file),
    strict,
  });

  const mode = strict ? '发布严格模式' : '普通模式';
  const summary = [
    `${mode}：${result.reason}`,
    `未同步 UI 提交：${result.uiCommits}`,
    `距上次同步：${result.ageDays} 天`,
    `剩余额度：${result.remaining}`,
  ];
  if (result.immediateFiles.length > 0) {
    summary.push(`即时同步文件：${result.immediateFiles.join(', ')}`);
  }
  console.log(summary.join('\n'));
  if (!result.ok) {
    throw new Error('UI 高保真原型已超过允许漂移，请同步 docs/ 与双端截图证据');
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
