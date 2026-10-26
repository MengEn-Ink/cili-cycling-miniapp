import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { normalize, resolve } from 'node:path';

import { parseDiffStats } from './check-pr-description.mjs';

export function readFinalPrState(cwd = process.cwd()) {
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const status = git(['status', '--porcelain', '-z']);
  if (status) throw new Error('工作区有未提交修改；先提交全部内容，再生成和校验最终 PR 描述');
  let base;
  try {
    base = git(['merge-base', 'HEAD', 'origin/main']).trim();
  } catch {
    throw new Error('无法解析 origin/main；请先 git fetch origin main 后重试');
  }
  const head = git(['rev-parse', 'HEAD']).trim();
  const paths = git(['diff', '--name-only', '--no-renames', '-z', base, head])
    .split('\0')
    .filter(Boolean);
  const statusParts = git(['diff', '--name-status', '--no-renames', '-z', base, head])
    .split('\0')
    .filter(Boolean);
  const files = [];
  for (let index = 0; index < statusParts.length; index += 2) {
    files.push({ status: statusParts[index], file: statusParts[index + 1] });
  }
  return {
    base,
    head,
    paths,
    files,
    stats: parseDiffStats(git(['diff', '--numstat', base, head])),
  };
}

export function resolveVerificationReport({ report, files, cwd = process.cwd() }) {
  const candidates = files
    .filter(({ status, file }) => status !== 'D' && /^docs\/verification\/.+\.md$/.test(file))
    .map(({ file }) => file);
  const path = report || (candidates.length === 1 ? candidates[0] : '');
  if (!path) {
    throw new Error('无法唯一确定本次验收报告；请用 --report docs/verification/xxx.md 指定');
  }
  if (
    normalize(path).replaceAll('\\', '/') !== path ||
    !/^docs\/verification\/.+\.md$/.test(path)
  ) {
    throw new Error(`验收报告路径越界或无效：${path}`);
  }
  const absolute = resolve(cwd, path);
  if (
    !existsSync(absolute) ||
    !statSync(absolute).isFile() ||
    !readFileSync(absolute, 'utf8').trim()
  ) {
    throw new Error(`验收报告文件不存在或为空：${path}`);
  }
  return path;
}
