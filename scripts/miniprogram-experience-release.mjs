import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
const RELEASE_ID_PATTERN = /^experience-[0-9A-Za-z._-]+-[0-9a-f]{12}$/;
const ENTRY_PATH_PATTERN = /^pages\/[0-9A-Za-z_/-]+\/[0-9A-Za-z_-]+$/;
const COMMAND_OPTIONS = {
  create: new Set([
    'stage',
    'mode',
    'main-sha',
    'version',
    'entry-path',
    'ci-run-url',
    'upload-run-url',
    'smoke-evidence',
    'smoke-outcome',
    'candidate-digest',
    'platform-evidence',
    'operator',
    'occurred-at',
    'previous-release-id',
    'rollback-reason',
    'output',
  ]),
  verify: new Set(['input']),
  'verify-transition': new Set(['candidate', 'verified']),
  'verify-rollback': new Set([
    'input',
    'main-sha',
    'version',
    'release-id',
    'ci-run-url',
    'upload-run-url',
    'smoke-evidence',
  ]),
  'verify-repository': new Set(['directory', 'base']),
};

function requiredText(value, name) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`${name} 不能为空`);
  return text;
}

function requireSha(value, name) {
  const sha = requiredText(value, name).toLowerCase();
  if (!SHA_PATTERN.test(sha)) throw new Error(`${name} 必须是 40 位十六进制提交 SHA`);
  return sha;
}

function requireUrl(value, name) {
  const text = requiredText(value, name);
  const url = new URL(text);
  if (url.protocol !== 'https:') throw new Error(`${name} 必须使用 HTTPS`);
  return url.toString();
}

function requireTimestamp(value, name) {
  const text = requiredText(value, name);
  const date = new Date(text);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== text) {
    throw new Error(`${name} 必须是 UTC ISO 时间`);
  }
  return text;
}

function digestManifest(manifest) {
  const payload = JSON.stringify(manifest);
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

export function buildExperienceReleaseManifest(input) {
  const stage = requiredText(input.stage, 'stage');
  if (!['candidate', 'verified'].includes(stage)) {
    throw new Error('stage 必须是 candidate 或 verified');
  }
  const mode = requiredText(input.mode, 'mode');
  if (!['promote', 'rollback'].includes(mode)) {
    throw new Error('mode 必须是 promote 或 rollback');
  }
  const mainSha = requireSha(input.mainSha, 'mainSha');
  const version = requiredText(input.version, 'version');
  if (!VERSION_PATTERN.test(version)) throw new Error('version 格式无效');
  const entryPath = requiredText(input.entryPath, 'entryPath');
  if (!ENTRY_PATH_PATTERN.test(entryPath)) throw new Error('entryPath 格式无效');
  const smokeOutcome = requiredText(input.smokeOutcome, 'smokeOutcome');
  if (smokeOutcome !== 'passed') throw new Error('只有 smokeOutcome=passed 才能进入体验版链路');
  const previousReleaseId = String(input.previousReleaseId || '').trim();
  const rollbackReason = String(input.rollbackReason || '').trim();
  if (mode === 'rollback' && (!RELEASE_ID_PATTERN.test(previousReleaseId) || !rollbackReason)) {
    throw new Error('回退必须提供有效 previousReleaseId 和 rollbackReason');
  }
  const platformEvidence = String(input.platformEvidence || '').trim();
  const candidateDigest = String(input.candidateDigest || '').trim();
  if (stage === 'verified' && !platformEvidence) {
    throw new Error('verified 阶段必须提供微信公众平台回读证据');
  }
  if (stage === 'verified' && !/^sha256:[0-9a-f]{64}$/.test(candidateDigest)) {
    throw new Error('verified 阶段必须关联有效 candidateDigest');
  }
  const releaseId = `experience-${version}-${mainSha.slice(0, 12)}`;
  const manifest = {
    schemaVersion: 1,
    releaseId,
    stage,
    mode,
    mainSha,
    version,
    entryPath,
    ciRunUrl: requireUrl(input.ciRunUrl, 'ciRunUrl'),
    uploadRunUrl: requireUrl(input.uploadRunUrl, 'uploadRunUrl'),
    smokeEvidence: requireUrl(input.smokeEvidence, 'smokeEvidence'),
    smokeOutcome,
    candidateDigest: candidateDigest || null,
    platformEvidence: platformEvidence ? requireUrl(platformEvidence, 'platformEvidence') : null,
    operator: requiredText(input.operator, 'operator'),
    occurredAt: requireTimestamp(input.occurredAt, 'occurredAt'),
    previousReleaseId: previousReleaseId || null,
    rollbackReason: rollbackReason || null,
  };
  return { ...manifest, digest: digestManifest(manifest) };
}

export function validateExperienceReleaseManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('体验版发布清单必须是对象');
  }
  const { digest, ...input } = value;
  const normalized = buildExperienceReleaseManifest(input);
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = Object.keys(normalized).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error('体验版发布清单字段集合不匹配');
  }
  if (digest !== normalized.digest) throw new Error('体验版发布清单摘要不匹配');
  return normalized;
}

export function validateExperienceReleaseTransition(candidateValue, verifiedValue) {
  const candidate = validateExperienceReleaseManifest(candidateValue);
  const verified = validateExperienceReleaseManifest(verifiedValue);
  if (candidate.stage !== 'candidate' || verified.stage !== 'verified') {
    throw new Error('体验版回读必须由 candidate 进入 verified');
  }
  if (verified.candidateDigest !== candidate.digest) {
    throw new Error('verified 清单未绑定当前 candidate 摘要');
  }
  for (const field of [
    'releaseId',
    'mode',
    'mainSha',
    'version',
    'entryPath',
    'ciRunUrl',
    'uploadRunUrl',
    'smokeEvidence',
    'smokeOutcome',
    'previousReleaseId',
    'rollbackReason',
  ]) {
    if (candidate[field] !== verified[field]) {
      throw new Error(`verified 清单字段 ${field} 与 candidate 不一致`);
    }
  }
  return verified;
}

export function validateRollbackTarget(
  value,
  { mainSha, version, releaseId, ciRunUrl, uploadRunUrl, smokeEvidence },
) {
  const manifest = validateExperienceReleaseManifest(value);
  if (manifest.stage !== 'verified' || manifest.mode !== 'promote') {
    throw new Error('回退目标必须是已验证的稳定晋级清单');
  }
  if (
    manifest.mainSha !== requireSha(mainSha, 'mainSha') ||
    manifest.version !== requiredText(version, 'version') ||
    manifest.releaseId !== requiredText(releaseId, 'releaseId') ||
    (ciRunUrl && manifest.ciRunUrl !== requireUrl(ciRunUrl, 'ciRunUrl')) ||
    (uploadRunUrl && manifest.uploadRunUrl !== requireUrl(uploadRunUrl, 'uploadRunUrl')) ||
    (smokeEvidence && manifest.smokeEvidence !== requireUrl(smokeEvidence, 'smokeEvidence'))
  ) {
    throw new Error('回退目标的 releaseId、构建信息或验收证据不一致');
  }
  return manifest;
}

export async function verifyReleaseDirectory({ directory, base, cwd = process.cwd() }) {
  const root = resolve(cwd, directory);
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const manifest = validateExperienceReleaseManifest(
      JSON.parse(await readFile(resolve(root, entry.name), 'utf8')),
    );
    if (entry.name !== `${manifest.releaseId}.json` || manifest.stage !== 'verified') {
      throw new Error(`长期发布记录 ${entry.name} 必须是同名 verified 清单`);
    }
  }
  if (base) {
    const { stdout } = await execFileAsync('git', [
      '-C',
      cwd,
      'diff',
      '--name-status',
      `${base}...HEAD`,
      '--',
      directory,
    ]);
    for (const line of stdout.split('\n').filter(Boolean)) {
      const [status, path] = line.split('\t');
      if (path?.endsWith('.json') && status !== 'A') {
        throw new Error(`体验版发布记录只允许新增，禁止 ${status}：${path}`);
      }
    }
  }
}

function parseArguments(argv) {
  const [command, ...args] = argv;
  if (
    !['create', 'verify', 'verify-transition', 'verify-rollback', 'verify-repository'].includes(
      command,
    )
  ) {
    throw new Error(
      '命令必须是 create、verify、verify-transition、verify-rollback 或 verify-repository',
    );
  }
  if (args.length % 2 !== 0) throw new Error('命令参数必须成对提供');
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!name.startsWith('--') || args[index + 1]?.startsWith('--')) {
      throw new Error(`无效命令参数：${name}`);
    }
    const optionName = name.slice(2);
    if (!COMMAND_OPTIONS[command].has(optionName)) {
      throw new Error(`命令 ${command} 不支持参数 --${optionName}`);
    }
    if (Object.hasOwn(options, optionName)) {
      throw new Error(`参数 --${optionName} 不允许重复`);
    }
    options[optionName] = args[index + 1];
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || !value) throw new Error(`缺少 --${name}`);
  return value;
}

async function runCli(argv) {
  const { command, options } = parseArguments(argv);
  if (command === 'verify') {
    const input = JSON.parse(await readFile(resolve(requireOption(options, 'input')), 'utf8'));
    const manifest = validateExperienceReleaseManifest(input);
    process.stdout.write(`release_id=${manifest.releaseId}\nrelease_digest=${manifest.digest}\n`);
    return;
  }
  if (command === 'verify-transition') {
    const candidate = JSON.parse(
      await readFile(resolve(requireOption(options, 'candidate')), 'utf8'),
    );
    const verified = JSON.parse(
      await readFile(resolve(requireOption(options, 'verified')), 'utf8'),
    );
    const manifest = validateExperienceReleaseTransition(candidate, verified);
    process.stdout.write(`release_id=${manifest.releaseId}\nrelease_digest=${manifest.digest}\n`);
    return;
  }
  if (command === 'verify-rollback') {
    const input = JSON.parse(await readFile(resolve(requireOption(options, 'input')), 'utf8'));
    const manifest = validateRollbackTarget(input, {
      mainSha: requireOption(options, 'main-sha'),
      version: requireOption(options, 'version'),
      releaseId: requireOption(options, 'release-id'),
      ciRunUrl: options['ci-run-url'],
      uploadRunUrl: options['upload-run-url'],
      smokeEvidence: options['smoke-evidence'],
    });
    process.stdout.write(`release_id=${manifest.releaseId}\nrelease_digest=${manifest.digest}\n`);
    return;
  }
  if (command === 'verify-repository') {
    await verifyReleaseDirectory({
      directory: requireOption(options, 'directory'),
      base: options.base,
    });
    process.stdout.write('experience_release_repository=valid\n');
    return;
  }
  const manifest = buildExperienceReleaseManifest({
    stage: requireOption(options, 'stage'),
    mode: requireOption(options, 'mode'),
    mainSha: requireOption(options, 'main-sha'),
    version: requireOption(options, 'version'),
    entryPath: requireOption(options, 'entry-path'),
    ciRunUrl: requireOption(options, 'ci-run-url'),
    uploadRunUrl: requireOption(options, 'upload-run-url'),
    smokeEvidence: requireOption(options, 'smoke-evidence'),
    smokeOutcome: requireOption(options, 'smoke-outcome'),
    candidateDigest: options['candidate-digest'],
    platformEvidence: options['platform-evidence'],
    operator: requireOption(options, 'operator'),
    occurredAt: requireOption(options, 'occurred-at'),
    previousReleaseId: options['previous-release-id'],
    rollbackReason: options['rollback-reason'],
  });
  await writeFile(
    resolve(requireOption(options, 'output')),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      encoding: 'utf8',
      flag: 'wx',
    },
  );
  process.stdout.write(`release_id=${manifest.releaseId}\nrelease_digest=${manifest.digest}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
