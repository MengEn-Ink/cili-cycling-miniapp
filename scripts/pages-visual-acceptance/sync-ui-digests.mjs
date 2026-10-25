#!/usr/bin/env node
// ui-sync manifest 双端摘要回算器（可复用）。
//
// 复用场景：改动 docs/ 原型或 miniprogram/ UI 后，check:ui-sync 会因内容摘要漂移而失败。
// 本脚本按 check-ui-sync.mjs 相同口径重算 source(ui) 与 prototype 两个 digest，
// 默认只打印；加 --write 时就地更新 docs/ui-sync-manifest.json 的
// source.digest / prototype.digest / syncedThrough(=当前 HEAD) / syncedAt。
//
// 注意：回算摘要只让门禁与“当前内容”对齐，不代表已重新采集真机/双端截图证据。
// 真机、普通成员写链路与公开媒体验收仍需按 docs/high-priority-issues.md 独立留证。
//
// 用法：
//   node scripts/pages-visual-acceptance/sync-ui-digests.mjs           # 仅打印
//   node scripts/pages-visual-acceptance/sync-ui-digests.mjs --write   # 写回 manifest

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { classifyUiPath, digestFiles } from '../ui-sync-policy.mjs';

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

const git = (args) => execFileSync('git', args, { encoding: 'utf8' });
const gitBuffer = (args) => execFileSync('git', args);
const lines = (value) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

// 统一 LF：CI checkout 的文件均为 LF，Windows 工作区可能是 CRLF。
// 用 git show HEAD:file 读取仓库 blob（LF），未跟踪文件则规范化 CRLF→LF。
function readNormalized(file) {
  try {
    return gitBuffer(['show', `HEAD:${file}`]).toString('utf8');
  } catch {
    return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  }
}

function currentUiDigest() {
  const files = lines(
    git(['ls-files', '--cached', '--others', '--exclude-standard', '--', ...UI_PATHS]),
  ).filter((file) => classifyUiPath(file).ui);
  return digestFiles(new Map([...new Set(files)].map((file) => [file, readNormalized(file)])));
}

function currentPrototypeDigest() {
  return digestFiles(new Map(PROTOTYPE_FILES.map((file) => [file, readNormalized(file)])));
}

function run() {
  const write = process.argv.includes('--write');
  const source = currentUiDigest();
  const prototype = currentPrototypeDigest();
  process.stdout.write(`source(ui):  ${source}\nprototype:   ${prototype}\n`);
  if (!write) {
    process.stdout.write('\n（仅打印；加 --write 写回 manifest）\n');
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  manifest.source.digest = source;
  manifest.prototype.digest = prototype;
  manifest.syncedThrough = git(['rev-parse', 'HEAD']).trim();
  manifest.syncedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `\n已写回 ${MANIFEST_PATH}（syncedThrough=${manifest.syncedThrough.slice(0, 8)}）\n`,
  );
  process.stdout.write('提醒：真机/双端截图证据仍需独立采集，见 docs/high-priority-issues.md。\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run();
}
