#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_PACKAGE = '@cloudbase/cli@3.8.4';
export const MEDIA_CLEANUP_BATCH_SIZE = 20;
export const CLEANUP_STALL_ROUND_BUDGET = 24;
const CLEANUP_WAIT_MS = 30_000;
export const CONFIRMATION_PHRASE = 'DELETE_PRELAUNCH_MEDIA_DATA';
export const STORAGE_PREFIXES = Object.freeze(['profiles/**', 'profile-canonical/**']);

const CLUB_MEDIA_FILTER = {
  $or: [{ avatar_url: { $exists: true } }, { cover_file_id: { $exists: true } }],
};
const APPLICATION_MEDIA_FILTER = {
  $or: [{ avatar_file_id: { $exists: true } }, { cover_file_id: { $exists: true } }],
};
const ACTIVITY_MEDIA_FILTER = {
  $or: [
    { images: { $exists: true } },
    { cover_image: { $exists: true } },
    { group_qr_code: { $exists: true } },
    { group_qr_code_uploaded_at: { $exists: true } },
    { 'club_identity.avatar_url': { $exists: true } },
    { 'route.generated_preview_file_id': { $exists: true } },
    { 'route.public_route_preview_id': { $exists: true } },
  ],
};
const MEDIA_TERMINAL_STATUSES = ['deleted', 'delete_failed_terminal'];
const IMPORT_TERMINAL_STATUSES = [
  'deleted',
  'completed',
  'invalid',
  'aborted',
  'delete_failed_terminal',
];

function command(table, type, value) {
  return { TableName: table, CommandType: type, Command: JSON.stringify(value) };
}

function queryCommand(collection, filter = {}) {
  return command(collection, 'QUERY', {
    find: collection,
    filter,
    projection: { _id: 1, status: 1 },
    limit: 1,
  });
}

function countCommand(collection, filter = {}) {
  return command(collection, 'COMMAND', { count: collection, query: filter });
}

export function calculateMaxCleanupRounds(summary) {
  const records = Number(summary.profileMedia || 0) + Number(summary.profileMediaImports || 0);
  return Math.ceil(records / MEDIA_CLEANUP_BATCH_SIZE) + CLEANUP_STALL_ROUND_BUDGET;
}

export function createMutationCommands(expiredAt) {
  const due = { $date: expiredAt };
  return {
    prepare: [
      command('clubs', 'UPDATE', {
        update: 'clubs',
        updates: [
          {
            q: CLUB_MEDIA_FILTER,
            u: { $unset: { avatar_url: '', cover_file_id: '' } },
            multi: true,
          },
        ],
      }),
      command('club_applications', 'UPDATE', {
        update: 'club_applications',
        updates: [
          {
            q: APPLICATION_MEDIA_FILTER,
            u: { $unset: { avatar_file_id: '', cover_file_id: '' } },
            multi: true,
          },
        ],
      }),
      command('activities', 'UPDATE', {
        update: 'activities',
        updates: [
          {
            q: ACTIVITY_MEDIA_FILTER,
            u: {
              $unset: {
                images: '',
                cover_image: '',
                group_qr_code: '',
                group_qr_code_uploaded_at: '',
                'club_identity.avatar_url': '',
                'route.generated_preview_file_id': '',
                'route.public_route_preview_id': '',
              },
            },
            multi: true,
          },
        ],
      }),
      command('route_previews', 'DELETE', {
        delete: 'route_previews',
        deletes: [{ q: {}, limit: 0 }],
      }),
      command('profiles', 'DELETE', {
        delete: 'profiles',
        deletes: [{ q: {}, limit: 0 }],
      }),
      command('profile_media', 'UPDATE', {
        update: 'profile_media',
        updates: [
          {
            q: {},
            u: {
              $set: {
                status: 'unreferenced',
                cleanup_after: due,
                delete_lease_id: '',
                delete_lease_expires_at: null,
                retry_at: due,
              },
            },
            multi: true,
          },
        ],
      }),
      command('profile_media_imports', 'UPDATE', {
        update: 'profile_media_imports',
        updates: [
          {
            q: {},
            u: {
              $set: {
                status: 'uploaded',
                cleanup_after: due,
                delete_lease_id: '',
                delete_lease_expires_at: null,
                retry_at: due,
              },
            },
            multi: true,
          },
        ],
      }),
    ],
    finalize: [
      command('profile_media', 'DELETE', {
        delete: 'profile_media',
        deletes: [{ q: { status: { $in: MEDIA_TERMINAL_STATUSES } }, limit: 0 }],
      }),
      command('profile_media_imports', 'DELETE', {
        delete: 'profile_media_imports',
        deletes: [{ q: { status: { $in: IMPORT_TERMINAL_STATUSES } }, limit: 0 }],
      }),
    ],
  };
}

export function assertApplyGate({ apply, envId, confirmEnvId, confirmation, configuredEnvId }) {
  if (!apply) return;
  if (!envId || envId !== configuredEnvId || envId !== confirmEnvId) {
    throw new Error('拒绝清理：--env-id、--confirm-env-id 与 cloudbaserc.json 环境 ID 必须一致');
  }
  if (confirmation !== CONFIRMATION_PHRASE) {
    throw new Error(`拒绝清理：--confirmation 必须精确等于 ${CONFIRMATION_PHRASE}`);
  }
}

function cliArgs(envId, ...args) {
  return ['--yes', '--package', CLI_PACKAGE, 'tcb', '-e', envId, ...args];
}

export function storageRemoveArgs(envId, prefix, apply) {
  if (!STORAGE_PREFIXES.includes(prefix)) throw new Error('拒绝使用未授权的存储前缀');
  return cliArgs(
    envId,
    'storage',
    'rm',
    prefix,
    ...(apply ? ['--force'] : ['--dry-run']),
    '--json',
  );
}

function parseJson(output, source) {
  try {
    return JSON.parse(String(output));
  } catch {
    throw new Error(`${source} 未返回有效 JSON`);
  }
}

function collectDocumentArrays(value, results = [], seen = new Set()) {
  if (typeof value === 'string') {
    try {
      return collectDocumentArrays(JSON.parse(value), results, seen);
    } catch {
      return results;
    }
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  if (Array.isArray(value)) {
    const wrappers = value.every(
      (item) => item && typeof item === 'object' && ('Result' in item || 'result' in item),
    );
    if (wrappers && value.length) {
      results.unshift(
        value.map((item) => {
          const nested = item.Result ?? item.result;
          return typeof nested === 'string' ? JSON.parse(nested) : nested;
        }),
      );
    } else if (value.every((item) => item && typeof item === 'object')) results.push(value);
    value.forEach((item) => collectDocumentArrays(item, results, seen));
    return results;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (['firstBatch', 'documents', 'Docs', 'docs', 'list'].includes(key) && Array.isArray(nested))
      results.unshift(nested);
    collectDocumentArrays(nested, results, seen);
  }
  return results;
}

function parseNosqlDocuments(output) {
  const arrays = collectDocumentArrays(parseJson(output, 'CloudBase 数据库命令'));
  return arrays.find((items) => items.every((item) => item && typeof item === 'object')) || [];
}

function collectCounts(value, results = [], seen = new Set()) {
  if (typeof value === 'string') {
    try {
      return collectCounts(JSON.parse(value), results, seen);
    } catch {
      return results;
    }
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (/^(?:n|count|total)$/i.test(key)) {
      const normalized =
        nested && typeof nested === 'object'
          ? Number(nested.$numberLong ?? nested.$numberInt ?? nested.$numberDouble)
          : Number(nested);
      if (Number.isSafeInteger(normalized) && normalized >= 0) results.push(normalized);
    }
    collectCounts(nested, results, seen);
  }
  return results;
}

function parseNosqlCount(output) {
  const counts = collectCounts(parseJson(output, 'CloudBase COUNT 命令'));
  if (counts.length === 0) throw new Error('CloudBase COUNT 命令缺少计数结果');
  return counts[0];
}

function nosqlArgs(envId, commands) {
  return cliArgs(envId, 'db', 'nosql', 'execute', '--command', JSON.stringify(commands), '--json');
}

function findCleanupResult(value, seen = new Set()) {
  if (typeof value === 'string') {
    try {
      return findCleanupResult(JSON.parse(value), seen);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (
    typeof value.ok === 'boolean' &&
    ((value.data && typeof value.data === 'object' && Object.hasOwn(value.data, 'processed')) ||
      (value.error && typeof value.error === 'object'))
  ) {
    const data = value.data && typeof value.data === 'object' ? value.data : {};
    return {
      ok: value.ok,
      processed: Number(data.processed || 0),
      failed: Number(data.failed || 0),
    };
  }
  for (const nested of Object.values(value)) {
    const found = findCleanupResult(nested, seen);
    if (found) return found;
  }
  return null;
}

function collectStoragePaths(value, results = [], seen = new Set()) {
  if (typeof value === 'string') {
    results.push(value);
    return results;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectStoragePaths(item, results, seen));
    return results;
  }
  for (const nested of Object.values(value)) collectStoragePaths(nested, results, seen);
  return results;
}

function prefixRoot(pattern) {
  return pattern.slice(0, -2);
}

export function createCliAdapter({ envId, cwd = process.cwd(), execute = execFileSync }) {
  const invoke = (args) =>
    execute('npx', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const query = (collection, filter = {}) =>
    parseNosqlDocuments(invoke(nosqlArgs(envId, [queryCommand(collection, filter)])));
  const count = (collection, filter = {}) =>
    parseNosqlCount(invoke(nosqlArgs(envId, [countCommand(collection, filter)])));
  const storageCount = (prefix, output) => {
    const root = prefixRoot(prefix);
    return collectStoragePaths(parseJson(output, 'CloudBase 存储命令')).filter(
      (path) => path.startsWith(root) && path !== root,
    ).length;
  };
  const summary = async () => ({
    profiles: count('profiles'),
    clubsWithMedia: count('clubs', CLUB_MEDIA_FILTER),
    applicationsWithMedia: count('club_applications', APPLICATION_MEDIA_FILTER),
    activitiesWithMedia: count('activities', ACTIVITY_MEDIA_FILTER),
    routePreviews: count('route_previews'),
    profileMedia: count('profile_media'),
    profileMediaImports: count('profile_media_imports'),
  });
  return {
    summary,
    async previewStorage(prefix) {
      return storageCount(prefix, invoke(storageRemoveArgs(envId, prefix, false)));
    },
    async mutate(commands) {
      invoke(nosqlArgs(envId, commands));
    },
    async invokeCleanup() {
      const output = invoke(
        cliArgs(
          envId,
          'fn',
          'invoke',
          'profile-media-cleanup',
          '--params',
          JSON.stringify({ Type: 'Timer', TriggerName: 'profile-media-cleanup-worker' }),
          '--json',
        ),
      );
      const result = findCleanupResult(parseJson(output, 'profile-media-cleanup 调用'));
      if (!result) throw new Error('profile-media-cleanup 未返回可识别结果');
      return result;
    },
    async terminalCounts() {
      return {
        mediaRemaining: query('profile_media', {
          status: { $nin: MEDIA_TERMINAL_STATUSES },
        }).length,
        importsRemaining: query('profile_media_imports', {
          status: { $nin: IMPORT_TERMINAL_STATUSES },
        }).length,
      };
    },
    async waitForCleanupWindow() {
      await new Promise((resolveWait) => setTimeout(resolveWait, CLEANUP_WAIT_MS));
    },
    async removeStorage(prefix) {
      invoke(storageRemoveArgs(envId, prefix, true));
    },
    async removeTerminalRecords(commands) {
      invoke(nosqlArgs(envId, commands));
    },
    async assertions() {
      const result = await summary();
      const storage = {};
      for (const prefix of STORAGE_PREFIXES) {
        storage[prefix] = storageCount(prefix, invoke(storageRemoveArgs(envId, prefix, false)));
      }
      return { ...result, storage };
    },
  };
}

function assertCompleted(result) {
  const databaseKeys = [
    'profiles',
    'profileMedia',
    'profileMediaImports',
    'clubsWithMedia',
    'applicationsWithMedia',
    'activitiesWithMedia',
    'routePreviews',
  ];
  if (databaseKeys.some((key) => result[key] !== 0)) throw new Error('清理后数据库回读断言失败');
  if (STORAGE_PREFIXES.some((prefix) => result.storage?.[prefix] !== 0))
    throw new Error('清理后存储前缀仍有文件');
}

export async function purgePrelaunchMediaData(options, adapter) {
  assertApplyGate(options);
  const summary = await adapter.summary();
  const storage = {};
  for (const prefix of STORAGE_PREFIXES) storage[prefix] = await adapter.previewStorage(prefix);
  console.log(
    `预发布媒体清理摘要：profiles=${summary.profiles} clubs_media=${summary.clubsWithMedia} applications_media=${summary.applicationsWithMedia} activities_media=${summary.activitiesWithMedia} route_previews=${summary.routePreviews} profile_media=${summary.profileMedia} imports=${summary.profileMediaImports} storage_profiles=${storage['profiles/**']} storage_canonical=${storage['profile-canonical/**']}`,
  );
  if (!options.apply) return { applied: false, summary, storage };

  const expiredAt = new Date(Date.now() - 60_000).toISOString();
  const mutations = createMutationCommands(expiredAt);
  const maxCleanupRounds = calculateMaxCleanupRounds(summary);
  await adapter.mutate(mutations.prepare);
  let drained = false;
  for (let round = 1; round <= maxCleanupRounds; round += 1) {
    const result = await adapter.invokeCleanup();
    if (!result.ok || result.failed > 0) throw new Error('profile-media-cleanup 清理函数报告失败');
    const remaining = await adapter.terminalCounts();
    if (remaining.mediaRemaining === 0 && remaining.importsRemaining === 0) {
      drained = true;
      break;
    }
    if (result.processed === 0) {
      console.log(`清理暂未推进，等待存储一致性窗口后重试（第 ${round} 轮）`);
      await adapter.waitForCleanupWindow();
    }
  }
  if (!drained) throw new Error('profile-media-cleanup 超过最大轮数，拒绝继续');

  for (const prefix of STORAGE_PREFIXES) await adapter.removeStorage(prefix);
  await adapter.removeTerminalRecords(mutations.finalize);
  const assertions = await adapter.assertions();
  assertCompleted(assertions);
  console.log('预发布媒体数据清理完成，数据库与两个存储前缀回读断言通过');
  return { applied: true, summary, storage };
}

function parseArgs(argv) {
  const options = { apply: false, envId: '', confirmEnvId: '', confirmation: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--apply') {
      options.apply = true;
      continue;
    }
    if (!['--env-id', '--confirm-env-id', '--confirmation'].includes(flag))
      throw new Error(`未知参数：${flag}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${flag} 缺少值`);
    const key =
      flag === '--env-id' ? 'envId' : flag === '--confirm-env-id' ? 'confirmEnvId' : 'confirmation';
    options[key] = value;
    index += 1;
  }
  if (!options.envId) throw new Error('缺少 --env-id');
  return options;
}

export async function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  const config = JSON.parse(readFileSync(resolve(cwd, 'cloudbaserc.json'), 'utf8'));
  const complete = { ...options, configuredEnvId: config.envId };
  return purgePrelaunchMediaData(complete, createCliAdapter({ envId: options.envId, cwd }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
