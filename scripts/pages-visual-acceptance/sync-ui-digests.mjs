#!/usr/bin/env node
// ui-sync manifest 双端摘要回算器（可复用）。
//
// 复用场景：改动 docs/ 原型或 miniprogram/ UI 后，check:ui-sync 会因内容摘要漂移而失败。
// 默认无参数只打印 source(ui) 与 prototype 摘要；`--write` 历史行为为全量回写。
// `--scope=prototype` 只回写 Pages 原型摘要，禁止触碰 source.digest / syncedThrough / syncedAt；
// 该作用域不读取 miniprogram 工作树，也不能把 Pages 对齐表述为 native 或双端截图新证据。
//
// 用法：
//   node scripts/pages-visual-acceptance/sync-ui-digests.mjs
//   node scripts/pages-visual-acceptance/sync-ui-digests.mjs --write --scope=prototype
//   node scripts/pages-visual-acceptance/sync-ui-digests.mjs --write
//
// 注意：回算摘要只让门禁与“当前内容”对齐，不代表已重新采集真机/双端截图证据。
// 真机、普通成员写链路与公开媒体验收仍需按 docs/high-priority-issues.md 独立留证。

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { currentPrototypeDigest, currentUiDigest } from '../check-ui-sync.mjs';

const MANIFEST_PATH = 'docs/ui-sync-manifest.json';
const SCOPES = Object.freeze(['all', 'prototype']);

function parseOptions(argv) {
  const options = { write: false, scope: 'all' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write') {
      options.write = true;
    } else if (token.startsWith('--scope=')) {
      options.scope = token.slice('--scope='.length);
    } else if (token === '--scope') {
      options.scope = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`不支持的 binder 参数：${token}`);
    }
  }
  if (!SCOPES.includes(options.scope)) {
    throw new Error(`不支持的 binder scope：${options.scope}（仅支持 ${SCOPES.join(' / ')}）`);
  }
  return options;
}

function run() {
  const options = parseOptions(process.argv.slice(2));
  const prototype = currentPrototypeDigest();
  // prototype 作用域只读取六个 docs 原型文件；source(ui) 属于小程序内容摘要，不能被 Pages 对齐动作改写。
  const source = options.scope === 'prototype' ? undefined : currentUiDigest();

  if (source) process.stdout.write(`source(ui):  ${source}\n`);
  process.stdout.write(`prototype:   ${prototype}\n`);
  if (!options.write) {
    process.stdout.write('\n（仅打印；加 --write 按选定 scope 写回 manifest）\n');
    return;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const anchorBefore = {
    sourceDigest: manifest.source.digest,
    syncedThrough: manifest.syncedThrough,
    syncedAt: manifest.syncedAt,
  };

  if (options.scope === 'prototype') {
    manifest.prototype.digest = prototype;
    // 强守卫：Pages 受控回写不得借同一次文件保存改写小程序摘要或同步锚点。
    if (
      manifest.source.digest !== anchorBefore.sourceDigest ||
      manifest.syncedThrough !== anchorBefore.syncedThrough ||
      manifest.syncedAt !== anchorBefore.syncedAt
    ) {
      throw new Error(
        'prototype scope 误修改 source.digest、syncedThrough 或 syncedAt，已中止写入',
      );
    }
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(
      `\n已受控写回 prototype.digest；source.digest、syncedThrough、syncedAt 保持原值。\n`,
    );
    process.stdout.write(
      '该操作只闭合 Pages 原型摘要；不代表 native 真机、普通成员写链路或双端截图新证据。\n',
    );
    return;
  }

  manifest.source.digest = source;
  manifest.prototype.digest = prototype;
  manifest.syncedThrough = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  manifest.syncedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `\n已全量写回 ${MANIFEST_PATH}（syncedThrough=${manifest.syncedThrough.slice(0, 8)}）\n`,
  );
  process.stdout.write('提醒：真机/双端截图证据仍需独立采集，见 docs/high-priority-issues.md。\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
