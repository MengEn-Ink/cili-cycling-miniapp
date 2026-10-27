import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import appRoutes from './app-routes.cjs';
import {
  classifyUiPath,
  digestFiles,
  evaluateUiSyncPolicy,
  validateManifest,
} from './ui-sync-policy.mjs';
import {
  changedContentFilesSinceBase,
  classifyValuePreservingThemeMigration,
  collectThemeMigrationSnapshot,
} from './theme-preservation-policy.mjs';

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

function provenanceError(message) {
  throw new Error(`UI 保值谱系无效：${message}`);
}

function validatePixelEvidenceReport(pixelBytes, record) {
  let report;
  try {
    report = JSON.parse(Buffer.from(pixelBytes).toString('utf8'));
  } catch {
    provenanceError('像素证据内容不是有效 JSON');
  }
  const routes = report.matrix?.routes;
  const widths = report.matrix?.widths;
  const results = report.results;
  if (
    report.schemaVersion !== 1 ||
    report.kind !== 'theme-token-migration-pixel-comparison' ||
    report.base?.gitSha !== record.base ||
    report.base?.uiDigest !== record.fromDigest ||
    report.head?.uiDigest !== record.toDigest ||
    !/^[0-9a-f]{40}$/.test(report.head?.gitSha || '') ||
    report.base?.porcelain !== '' ||
    report.head?.porcelain !== '' ||
    !Array.isArray(routes) ||
    routes.length !== 16 ||
    new Set(routes).size !== 16 ||
    !Array.isArray(widths) ||
    widths.join(',') !== '340,375,430' ||
    report.matrix?.files !== 48 ||
    !Array.isArray(results) ||
    results.length !== 48
  ) {
    provenanceError('像素证据内容必须证明 16×3 零差异');
  }

  const combinations = new Set();
  let totalPixels = 0;
  let containerByteDifferences = 0;
  for (const result of results) {
    const combination = `${result.route}\0${result.width}`;
    const expectedFile = `${result.route}-${result.width}.png`;
    if (
      !routes.includes(result.route) ||
      !widths.includes(result.width) ||
      combinations.has(combination) ||
      result.file !== expectedFile ||
      !Number.isInteger(result.pixelWidth) ||
      result.pixelWidth <= 0 ||
      !Number.isInteger(result.pixelHeight) ||
      result.pixelHeight <= 0 ||
      !/^[0-9a-f]{64}$/.test(result.beforePngSha256 || '') ||
      !/^[0-9a-f]{64}$/.test(result.afterPngSha256 || '') ||
      result.dimensionMismatch !== false ||
      result.diffPixels !== 0 ||
      result.maxChannelDelta !== 0 ||
      result.meanAbsoluteChannelDelta !== 0
    ) {
      provenanceError('像素证据内容必须证明 16×3 零差异');
    }
    combinations.add(combination);
    totalPixels += result.pixelWidth * result.pixelHeight;
    if (result.beforePngSha256 !== result.afterPngSha256) {
      containerByteDifferences += 1;
    }
  }

  const expectedCombinations = routes.flatMap((route) =>
    widths.map((width) => `${route}\0${width}`),
  );
  const summary = report.summary;
  if (
    expectedCombinations.some((combination) => !combinations.has(combination)) ||
    summary?.exactPixelMatches !== 48 ||
    summary?.dimensionMismatches !== 0 ||
    summary?.totalPixels !== totalPixels ||
    summary?.differentPixels !== 0 ||
    summary?.maxChannelDelta !== 0 ||
    summary?.meanAbsoluteChannelDelta !== 0 ||
    summary?.containerByteDifferences !== containerByteDifferences ||
    typeof summary?.containerByteDifferenceReason !== 'string' ||
    summary.containerByteDifferenceReason.trim() === ''
  ) {
    provenanceError('像素证据内容必须证明 16×3 零差异');
  }
}

export function validateValuePreservationProvenance({
  manifest,
  currentUiDigest,
  preservationBaseDigest,
  themeMigration,
  readEvidence,
}) {
  const entries = manifest.source?.valuePreservation;
  if (!Array.isArray(entries) || entries.length !== 1) {
    provenanceError('摘要不一致时必须且只能有一条记录');
  }
  const record = entries[0];
  if (record.kind !== 'theme-token-migration') provenanceError('kind 不受支持');
  if (!/^[0-9a-f]{40}$/.test(record.base || '')) provenanceError('base 必须是完整 SHA');
  if (!/^sha256:[0-9a-f]{64}$/.test(record.fromDigest || '')) {
    provenanceError('fromDigest 无效');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(record.toDigest || '')) {
    provenanceError('toDigest 无效');
  }
  if (record.fromDigest !== manifest.source.digest) {
    provenanceError('fromDigest 必须等于旧截图绑定摘要');
  }
  if (preservationBaseDigest !== record.fromDigest) {
    provenanceError('base 重算摘要与 fromDigest 不一致');
  }
  if (currentUiDigest !== record.toDigest) {
    provenanceError('当前摘要与 toDigest 不一致，谱系已自动失效');
  }
  if (currentUiDigest === manifest.source.digest) {
    provenanceError('摘要已自然对齐时必须删除谱系');
  }
  if (
    !themeMigration?.eligible ||
    themeMigration.base !== record.base ||
    themeMigration.mappingPath !== record.map ||
    themeMigration.migratedColorCount !== 53 ||
    themeMigration.directCount !== 49 ||
    themeMigration.fallbackCount !== 4 ||
    themeMigration.fontCount !== 1
  ) {
    provenanceError('base→head 不满足冻结的 53/49/4/1 主题保值分类');
  }
  if (!record.sunset?.includes('PR C Task 0')) {
    provenanceError('缺少 PR C Task 0 日落条款');
  }
  const pixelRef = record.pixelEvidence?.ref;
  const pixelSha256 = record.pixelEvidence?.sha256;
  if (
    typeof pixelRef !== 'string' ||
    !/^docs\/verification\/[a-z0-9./_-]+\.(?:json|md)$/.test(pixelRef) ||
    pixelRef.includes('..') ||
    !/^sha256:[0-9a-f]{64}$/.test(pixelSha256 || '')
  ) {
    provenanceError('像素证据引用或摘要无效');
  }
  let pixelBytes;
  try {
    pixelBytes = readEvidence(pixelRef);
  } catch {
    provenanceError(`像素证据缺失：${pixelRef}`);
  }
  const actualPixelSha256 = `sha256:${createHash('sha256').update(pixelBytes).digest('hex')}`;
  if (actualPixelSha256 !== pixelSha256) provenanceError('像素证据摘要不一致');
  validatePixelEvidenceReport(pixelBytes, record);

  return {
    eligible: true,
    kind: record.kind,
    base: record.base,
    fromDigest: record.fromDigest,
    toDigest: record.toDigest,
    map: record.map,
    pixelEvidence: record.pixelEvidence,
  };
}

export function assessUiSyncState({
  manifest,
  appPages,
  baselineUiDigest,
  currentUiDigest,
  currentPrototypeDigest,
  preservationBaseDigest,
  themeMigration,
  uiCommitShas,
  changedFiles,
  readEvidence,
  now = new Date(),
  strict = false,
}) {
  validateManifest(manifest, { appPages, readEvidence });
  if (manifest.schemaVersion === 1 && baselineUiDigest !== manifest.source.digest) {
    throw new Error(`UI 基线摘要不匹配：清单 ${manifest.source.digest}，Git ${baselineUiDigest}`);
  }
  if (currentPrototypeDigest !== manifest.prototype.digest) {
    throw new Error(
      `Pages 原型摘要不匹配：清单 ${manifest.prototype.digest}，当前 ${currentPrototypeDigest}`,
    );
  }
  let valuePreservation;
  if (manifest.schemaVersion === 2) {
    const hasProvenance = manifest.source?.valuePreservation !== undefined;
    if (currentUiDigest === manifest.source.digest) {
      if (hasProvenance) {
        provenanceError('摘要已自然对齐时必须删除谱系');
      }
    } else {
      if (!hasProvenance) {
        throw new Error('截图对应的 UI 内容摘要不匹配，请重新采集并核对双端证据');
      }
      valuePreservation = validateValuePreservationProvenance({
        manifest,
        currentUiDigest,
        preservationBaseDigest,
        themeMigration,
        readEvidence,
      });
    }
  }
  if (manifest.schemaVersion === 2) {
    return {
      ok: true,
      uiCommits: 0,
      ageDays: Math.max(0, Math.floor((now.getTime() - Date.parse(manifest.syncedAt)) / DAY_MS)),
      remaining: manifest.policy.maxUnsyncedUiCommits,
      immediateFiles: [],
      reason: valuePreservation
        ? '主题 token 保值谱系已机械复算（旧截图仍绑定原摘要，PR C Task 0 日落）'
        : '双端截图与当前 UI / Pages 内容摘要一致（业务与真机验收见独立记录）',
      ...(valuePreservation ? { valuePreservation } : {}),
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

export function currentPrototypeDigest() {
  return digestFiles(new Map(PROTOTYPE_FILES.map((file) => [file, readNormalized(file)])));
}

export function currentUiDigest() {
  const files = gitBuffer([
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    ...UI_PATHS,
  ])
    .toString('utf8')
    .split('\0')
    .filter((file) => file && classifyUiPath(file).ui && existsSync(file));
  return digestFiles(new Map([...new Set(files)].map((file) => [file, readNormalized(file)])));
}

// 读取实际工作树：未提交修改也必须进入摘要；二进制资源保持原始字节。
function readNormalized(file) {
  const bytes = readFileSync(file);
  return /\.(?:json|wxss|wxml|[cm]?[jt]s|css|html|svg)$/i.test(file)
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))
    : bytes;
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
  const currentSourceDigest = currentUiDigest();
  const preservationRecord = manifest.source?.valuePreservation?.[0];
  let preservationBaseDigest;
  let themeMigration;
  if (preservationRecord) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', preservationRecord.base, 'HEAD']);
    } catch {
      provenanceError(`base 不是当前 HEAD 祖先：${preservationRecord.base}`);
    }
    preservationBaseDigest = baselineUiDigest(preservationRecord.base);
    const preservationChangedFiles = changedContentFilesSinceBase(preservationRecord.base);
    themeMigration = classifyValuePreservingThemeMigration(
      collectThemeMigrationSnapshot(preservationRecord.base, preservationChangedFiles),
    );
  }
  const result = assessUiSyncState({
    manifest,
    appPages: appRoutes.expandAppRoutes(appConfig),
    baselineUiDigest:
      manifest.schemaVersion === 1 ? baselineUiDigest(manifest.syncedThrough) : undefined,
    currentUiDigest: currentSourceDigest,
    currentPrototypeDigest: currentPrototypeDigest(),
    preservationBaseDigest,
    themeMigration,
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
