import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const UPLOAD_PREFIXES = ['miniprogram/', 'cloudfunctions/', 'tools/miniprogram-ci/'];
const UPLOAD_FILES = new Set([
  'scripts/upload-miniprogram-ci.mjs',
  'scripts/miniprogram-upload-decision.mjs',
  'project.config.json',
  'project.private.config.json',
  'package.json',
  'package-lock.json',
]);
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const execFileAsync = promisify(execFile);

function normalizePath(value) {
  return String(value).replace(/^\.\/+/, '');
}

function affectsMiniProgram(path) {
  return UPLOAD_FILES.has(path) || UPLOAD_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function shouldUploadMiniProgram(paths) {
  return paths.some((value) => affectsMiniProgram(normalizePath(value)));
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) {
    throw new Error(`${label} 必须是 40 位十六进制提交 SHA`);
  }
  return value.toLowerCase();
}

export function buildUploadDecision({ before, sha, paths }) {
  if (!Array.isArray(paths)) throw new Error('paths 必须是数组');
  const normalizedPaths = paths.map(normalizePath);
  const matchedPaths = [...new Set(normalizedPaths.filter((path) => affectsMiniProgram(path)))];
  return {
    schemaVersion: 1,
    before: requireSha(before, 'before'),
    sha: requireSha(sha, 'sha'),
    shouldUpload: matchedPaths.length > 0,
    matchedPaths,
  };
}

export function validateUploadDecision(value, expectedSha) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('上传判定必须是对象');
  }
  if (value.schemaVersion !== 1) throw new Error('上传判定 schemaVersion 无效');
  const before = requireSha(value.before, 'before');
  const sha = requireSha(value.sha, 'sha');
  const expected = requireSha(expectedSha, 'expected SHA');
  if (sha !== expected) throw new Error(`上传判定 SHA 不匹配：${sha} != ${expected}`);
  if (typeof value.shouldUpload !== 'boolean') {
    throw new Error('上传判定 shouldUpload 必须是布尔值');
  }
  if (
    !Array.isArray(value.matchedPaths) ||
    value.matchedPaths.some((path) => typeof path !== 'string' || !affectsMiniProgram(path))
  ) {
    throw new Error('上传判定 matchedPaths 无效');
  }
  if (value.shouldUpload !== value.matchedPaths.length > 0) {
    throw new Error('上传判定 shouldUpload 与 matchedPaths 不一致');
  }
  return {
    schemaVersion: 1,
    before,
    sha,
    shouldUpload: value.shouldUpload,
    matchedPaths: [...value.matchedPaths],
  };
}

function parseArguments(argv) {
  const [command, ...args] = argv;
  if (!['create', 'verify'].includes(command)) {
    throw new Error('命令必须是 create 或 verify');
  }
  if (args.length % 2 !== 0) throw new Error('命令参数必须成对提供');
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!name.startsWith('--') || args[index + 1].startsWith('--')) {
      throw new Error(`无效命令参数：${name}`);
    }
    options[name.slice(2)] = args[index + 1];
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || !value) throw new Error(`缺少 --${name}`);
  return value;
}

async function changedPaths(before, sha) {
  const normalizedBefore = requireSha(before, 'before');
  const normalizedSha = requireSha(sha, 'sha');
  const args =
    normalizedBefore === '0'.repeat(40)
      ? ['ls-tree', '-r', '--name-only', '-z', normalizedSha]
      : ['diff', '--name-only', '--diff-filter=ACMR', '-z', normalizedBefore, normalizedSha];
  const { stdout } = await execFileAsync('git', args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout.split('\0').filter(Boolean);
}

async function runCli(argv) {
  const { command, options } = parseArguments(argv);
  if (command === 'create') {
    const before = requireOption(options, 'before');
    const sha = requireOption(options, 'sha');
    const output = requireOption(options, 'output');
    const decision = buildUploadDecision({
      before,
      sha,
      paths: await changedPaths(before, sha),
    });
    await writeFile(output, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
    return;
  }

  const input = requireOption(options, 'input');
  const sha = requireOption(options, 'sha');
  const decision = validateUploadDecision(JSON.parse(await readFile(input, 'utf8')), sha);
  process.stdout.write(`should_upload=${decision.shouldUpload}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
