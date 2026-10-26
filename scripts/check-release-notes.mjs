import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PRODUCT_PATH = /^(?:miniprogram|cloudfunctions)\//;
const RELEASE_NOTES_PATH = 'miniprogram/pages/settings/index.ts';

export function parseContentChangedFiles(rawDiff) {
  const fields = rawDiff.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2 !== 0) throw new Error('无法解析 Git raw diff：记录不完整');

  const contentChangedFiles = [];
  for (let index = 0; index < fields.length; index += 2) {
    const metadata = fields[index];
    const file = fields[index + 1];
    const match = metadata.match(/^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) [A-Z]$/);
    if (!match) throw new Error(`无法解析 Git raw diff 元数据：${metadata}`);

    const [, oldMode, newMode, oldHash, newHash] = match;
    const executableModeOnly =
      oldHash === newHash &&
      ((oldMode === '100755' && newMode === '100644') ||
        (oldMode === '100644' && newMode === '100755'));
    if (!executableModeOnly) contentChangedFiles.push(file);
  }

  return contentChangedFiles;
}

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
    throw new Error('App 更新必须且只能有一条 latest: true');
  }

  if (!/version:\s*CLIENT_RELEASE_VERSION/.test(source)) {
    throw new Error('App 更新首条版本必须使用 CLIENT_RELEASE_VERSION');
  }
  if (!/currentRelease:\s*RELEASE_NOTES\[0\]/.test(source)) {
    throw new Error('设置页必须只展示当前版本的 App 更新');
  }

  const firstEntry = source.match(/const RELEASE_NOTES\s*=\s*\[\s*\{([\s\S]*?)\n\s*\},/);
  if (!firstEntry?.[1].includes('version: CLIENT_RELEASE_VERSION')) {
    throw new Error('App 更新首条版本必须使用 CLIENT_RELEASE_VERSION');
  }
  if (!firstEntry[1].includes('latest: true')) {
    throw new Error('App 更新的当前版本必须标记为 latest: true');
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
  const rawDiff = execFileSync(
    'git',
    ['diff', '--raw', '--no-abbrev', '--no-renames', '-z', base],
    { encoding: 'utf8' },
  );
  const changedFiles = parseContentChangedFiles(rawDiff);
  const source = readFileSync(RELEASE_NOTES_PATH, 'utf8');
  const result = validateReleaseNotes(changedFiles, source);

  console.log(
    result.required
      ? `App 更新校验通过：${result.productFiles.length} 个产品文件已记录`
      : 'App 更新校验通过：本次无产品代码改动',
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
