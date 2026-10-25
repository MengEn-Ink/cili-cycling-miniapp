import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import appRoutes from './app-routes.cjs';
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
  'docs/delivery-center.js',
  'docs/schema.js',
  'docs/templates.js',
];
const DAY_MS = 24 * 60 * 60 * 1000;

export function assessUiSyncState({
  manifest,
  appPages,
  baselineUiDigest,
  currentUiDigest,
  currentPrototypeDigest,
  uiCommitShas,
  changedFiles,
  readEvidence,
  now = new Date(),
  strict = false,
}) {
  validateManifest(manifest, { appPages, readEvidence });
  if (manifest.schemaVersion === 2 && currentUiDigest !== manifest.source.digest) {
    throw new Error('截图对应的 UI 内容摘要不匹配，请重新采集并核对双端证据');
  }
  if (manifest.schemaVersion === 1 && baselineUiDigest !== manifest.source.digest) {
    throw new Error(`UI 基线摘要不匹配：清单 ${manifest.source.digest}，Git ${baselineUiDigest}`);
  }
  if (currentPrototypeDigest !== manifest.prototype.digest) {
    throw new Error(
      `Pages 原型摘要不匹配：清单 ${manifest.prototype.digest}，当前 ${currentPrototypeDigest}`,
    );
  }
  if (manifest.schemaVersion === 2) {
    return {
      ok: true,
      uiCommits: 0,
      ageDays: Math.max(0, Math.floor((now.getTime() - Date.parse(manifest.syncedAt)) / DAY_MS)),
      remaining: manifest.policy.maxUnsyncedUiCommits,
      immediateFiles: [],
      reason: '双端截图与当前 UI / Pages 内容摘要一致（业务与真机验收见独立记录）',
    };
  }

  const immediateFiles = [
    ...new Set(changedFiles.filter((file) => classifyUiPath(file).immediate)),
  ];
  const ageDays = Math.max(0, Math.floor((now.getTime() - Date.parse(manifest.syncedAt)) / DAY_MS));
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
  return digestFiles(new Map(files.map((file) => [file, gitBuffer(['show', `${ref}:${file}`])])));
}

function currentPrototypeDigest() {
  return digestFiles(new Map(PROTOTYPE_FILES.map((file) => [file, readNormalized(file)])));
}

function currentUiDigest() {
  const files = lines(
    gitText(['ls-files', '--cached', '--others', '--exclude-standard', '--', ...UI_PATHS]),
  ).filter((file) => classifyUiPath(file).ui);
  return digestFiles(new Map([...new Set(files)].map((file) => [file, readNormalized(file)])));
}

// 统一 LF：CI checkout 的文件均为 LF，Windows 工作区可能是 CRLF。
// 用 git show HEAD:file 读取仓库 blob（LF），未跟踪文件则规范化 CRLF→LF。
function readNormalized(file) {
  try {
    return gitBuffer(['show', `HEAD:${file}`]).toString('utf8');
  } catch {
    return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  }
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

function readGitHubEvent(env) {
  if (!env.GITHUB_EVENT_PATH) return undefined;
  try {
    return JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {
    return undefined;
  }
}

export function shouldSkipUiSync({ strict, env = process.env, event } = {}) {
  if (strict) return false;
  if (env.CILI_SKIP_UI_SYNC === '1') return true;
  // 合入主分支前已经由 PR 门禁校验；push CI 不重复消费同一份视觉漂移预算。
  if (env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main') return true;
  const payload = event ?? readGitHubEvent(env);
  return (
    payload?.pull_request?.labels?.some((label) => label?.name === 'sandbox-skip-ui-sync') === true
  );
}

export function run({ strict = process.argv.includes('--strict') } = {}) {
  if (shouldSkipUiSync({ strict })) {
    const result = {
      ok: true,
      skipped: true,
      reason: '已通过受控标签跳过本次沙箱视觉证据同步',
    };
    console.log(`普通模式：${result.reason}`);
    return result;
  }

  const manifest = readManifest();
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', manifest.syncedThrough, 'HEAD']);
  } catch {
    throw new Error(`同步基线不是当前分支祖先：${manifest.syncedThrough}`);
  }

  const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
  const result = assessUiSyncState({
    manifest,
    appPages: appRoutes.expandAppRoutes(appConfig),
    baselineUiDigest:
      manifest.schemaVersion === 1 ? baselineUiDigest(manifest.syncedThrough) : undefined,
    currentUiDigest: currentUiDigest(),
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
