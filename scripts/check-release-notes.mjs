import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PRODUCT_PATH = /^(?:miniprogram|cloudfunctions)\//;
const RELEASE_NOTES_PATH = 'miniprogram/pages/settings/index.ts';

export function validateReleaseNotes(changedFiles, source) {
  const productFiles = changedFiles.filter(
    (file) => PRODUCT_PATH.test(file) && file !== RELEASE_NOTES_PATH,
  );

  if (productFiles.length === 0) return { required: false, productFiles };
  if (!changedFiles.includes(RELEASE_NOTES_PATH)) {
    throw new Error(
      `检测到产品代码改动，但未更新 ${RELEASE_NOTES_PATH}：\n${productFiles.join('\n')}`,
    );
  }

  const latestMatches = source.match(/latest:\s*true/g) || [];
  if (latestMatches.length !== 1) {
    throw new Error('功能升级日志必须且只能有一条 latest: true');
  }

  const firstEntry = source.match(/const RELEASE_NOTES\s*=\s*\[\s*\{([\s\S]*?)\n\s*\},/);
  if (!firstEntry?.[1].includes('latest: true')) {
    throw new Error('功能升级日志的第一条必须标记为 latest: true');
  }

  return { required: true, productFiles };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function resolveBase() {
  if (process.env.RELEASE_NOTES_BASE) return process.env.RELEASE_NOTES_BASE;

  try {
    return git(['merge-base', 'HEAD', 'origin/main']);
  } catch {
    return 'HEAD';
  }
}

export function run() {
  const base = resolveBase();
  const changedFiles = git(['diff', '--name-only', base])
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
  const source = readFileSync(RELEASE_NOTES_PATH, 'utf8');
  const result = validateReleaseNotes(changedFiles, source);

  console.log(
    result.required
      ? `功能升级日志校验通过：${result.productFiles.length} 个产品文件已记录`
      : '功能升级日志校验通过：本次无产品代码改动',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
