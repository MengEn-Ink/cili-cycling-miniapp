#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_PACKAGE = '@cloudbase/cli@3.8.4';
export const MEDIA_CLEANUP_BATCH_SIZE = 20;
export const NOSQL_QUERY_PAGE_SIZE = 1000;
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

function idPageCommand(collection, filter, lastId) {
  const pageFilter = lastId === undefined ? filter : { $and: [filter, { _id: { $gt: lastId } }] };
  return command(collection, 'QUERY', {
    find: collection,
    filter: pageFilter,
    projection: { _id: 1 },
    sort: { _id: 1 },
    limit: NOSQL_QUERY_PAGE_SIZE,
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
            upsert: false,
            multi: false,
          },
        ],
      }),
      command('club_applications', 'UPDATE', {
        update: 'club_applications',
        updates: [
          {
            q: APPLICATION_MEDIA_FILTER,
            u: { $unset: { avatar_file_id: '', cover_file_id: '' } },
            upsert: false,
            multi: false,
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
            upsert: false,
            multi: false,
          },
        ],
      }),
      command('route_previews', 'DELETE', {
        delete: 'route_previews',
        deletes: [{ q: {}, limit: 1 }],
      }),
      command('profiles', 'DELETE', {
        delete: 'profiles',
        deletes: [{ q: {}, limit: 1 }],
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
            upsert: false,
            multi: false,
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
            upsert: false,
            multi: false,
          },
        ],
      }),
    ],
    finalize: [
      command('profile_media', 'DELETE', {
        delete: 'profile_media',
        deletes: [{ q: { status: { $in: MEDIA_TERMINAL_STATUSES } }, limit: 1 }],
      }),
      command('profile_media_imports', 'DELETE', {
        delete: 'profile_media_imports',
        deletes: [{ q: { status: { $in: IMPORT_TERMINAL_STATUSES } }, limit: 1 }],
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

const DOCUMENT_ARRAY_KEYS = new Set(['firstBatch', 'documents', 'Docs', 'docs', 'list']);

function collectDocumentArrays(value, results = [], seen = new Set(), recognized = false) {
  if (typeof value === 'string') {
    try {
      return collectDocumentArrays(JSON.parse(value), results, seen, recognized);
    } catch {
      return results;
    }
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  if (Array.isArray(value)) {
    results.push({ items: value, recognized });
    value.forEach((item) => collectDocumentArrays(item, results, seen));
    return results;
  }
  for (const [key, nested] of Object.entries(value)) {
    collectDocumentArrays(
      nested,
      results,
      seen,
      key === 'Result' || key === 'result' || DOCUMENT_ARRAY_KEYS.has(key),
    );
  }
  return results;
}

export function parseNosqlDocuments(output) {
  const candidates = collectDocumentArrays(parseJson(output, 'CloudBase 数据库命令'));
  const recognized = candidates.filter((candidate) => candidate.recognized);
  const valid = recognized.find(
    ({ items }) =>
      items.length > 0 &&
      items.every((item) => item && typeof item === 'object' && Object.hasOwn(item, '_id')),
  );
  if (valid) return valid.items;
  if (recognized.some(({ items }) => items.length > 0) || recognized.length === 0)
    throw new Error('CloudBase QUERY 命令缺少有效文档结果');
  return [];
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

function safeStderrTail(error) {
  const raw = error && typeof error === 'object' && 'stderr' in error ? error.stderr : '';
  return String(raw || '').trim() ? '(present, redacted)' : '(empty)';
}

function mutationSpec(entry) {
  const parsed = JSON.parse(entry.Command);
  if (entry.CommandType === 'UPDATE') {
    const update = parsed.updates?.[0];
    if (!update) throw new Error('UPDATE 命令缺少 updates[0]');
    return { filter: update.q ?? {}, update: update.u };
  }
  if (entry.CommandType === 'DELETE') {
    const deletion = parsed.deletes?.[0];
    if (!deletion) throw new Error('DELETE 命令缺少 deletes[0]');
    return { filter: deletion.q ?? {} };
  }
  throw new Error(`不支持的 mutation 类型：${entry.CommandType}`);
}

function documentMutationCommand(entry, id, update) {
  if (entry.CommandType === 'UPDATE') {
    return command(entry.TableName, 'UPDATE', {
      update: entry.TableName,
      updates: [{ q: { _id: id }, u: update, upsert: false, multi: false }],
    });
  }
  return command(entry.TableName, 'DELETE', {
    delete: entry.TableName,
    deletes: [{ q: { _id: id }, limit: 1 }],
  });
}

function updateVerificationFilter(id, update) {
  const clauses = [{ _id: id }];
  for (const [field, value] of Object.entries(update?.$set || {})) clauses.push({ [field]: value });
  for (const field of Object.keys(update?.$unset || {}))
    clauses.push({ [field]: { $exists: false } });
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
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
  const invokeNosql = (entry, index = 1, context = {}) => {
    try {
      return invoke(nosqlArgs(envId, [entry]));
    } catch (error) {
      const operation = context.operation || entry.CommandType;
      const document = context.documentIndex ? ` document=${context.documentIndex}` : '';
      const stage = context.stage ? ` stage=${context.stage}` : '';
      throw new Error(
        `CloudBase NoSQL command ${index} 失败：collection=${entry.TableName} op=${operation}${document}${stage} stderr_tail=${safeStderrTail(error)}`,
        { cause: error },
      );
    }
  };
  const query = (collection, filter = {}) =>
    parseNosqlDocuments(invokeNosql(queryCommand(collection, filter)));
  const count = (collection, filter = {}, index = 1, operation) =>
    parseNosqlCount(
      invokeNosql(countCommand(collection, filter), index, {
        operation,
        stage: operation ? 'count' : undefined,
      }),
    );
  const collectMutationIds = (entry, filter, expected, index) => {
    const ids = [];
    const seenIds = new Set();
    let lastId;
    while (ids.length < expected) {
      const page = parseNosqlDocuments(
        invokeNosql(idPageCommand(entry.TableName, filter, lastId), index, {
          operation: entry.CommandType,
          stage: 'query_ids',
        }),
      );
      if (page.length === 0) break;
      for (const document of page) {
        if (!Object.hasOwn(document, '_id'))
          throw new Error(
            `CloudBase NoSQL ID 查询无效：command ${index} collection=${entry.TableName} op=${entry.CommandType}`,
          );
        const idKey = JSON.stringify(document._id);
        if (seenIds.has(idKey))
          throw new Error(
            `CloudBase NoSQL ID 分页重复：command ${index} collection=${entry.TableName} op=${entry.CommandType}`,
          );
        seenIds.add(idKey);
        ids.push(document._id);
      }
      const nextLastId = page.at(-1)._id;
      if (Object.is(nextLastId, lastId))
        throw new Error(
          `CloudBase NoSQL ID 分页未推进：command ${index} collection=${entry.TableName} op=${entry.CommandType}`,
        );
      lastId = nextLastId;
    }
    if (ids.length !== expected)
      throw new Error(
        `CloudBase NoSQL ID 数量校验失败：command ${index} collection=${entry.TableName} op=${entry.CommandType} expected=${expected} actual=${ids.length}`,
      );
    return ids;
  };
  const runMutationCommands = async (commands) => {
    for (let index = 0; index < commands.length; index += 1) {
      const entry = commands[index];
      const commandIndex = index + 1;
      const { filter, update } = mutationSpec(entry);
      const expected = count(entry.TableName, filter, commandIndex, entry.CommandType);
      if (expected === 0) continue;
      const ids = collectMutationIds(entry, filter, expected, commandIndex);
      for (let documentIndex = 0; documentIndex < ids.length; documentIndex += 1) {
        const id = ids[documentIndex];
        const context = {
          operation: entry.CommandType,
          documentIndex: documentIndex + 1,
        };
        invokeNosql(documentMutationCommand(entry, id, update), commandIndex, {
          ...context,
          stage: 'mutation',
        });
        const verificationFilter =
          entry.CommandType === 'UPDATE' ? updateVerificationFilter(id, update) : { _id: id };
        const found = parseNosqlDocuments(
          invokeNosql(queryCommand(entry.TableName, verificationFilter), commandIndex, {
            ...context,
            stage: 'verify',
          }),
        );
        const verified = entry.CommandType === 'UPDATE' ? found.length === 1 : found.length === 0;
        if (!verified)
          throw new Error(
            `CloudBase NoSQL 文档回读失败：command ${commandIndex} collection=${entry.TableName} op=${entry.CommandType} document=${documentIndex + 1}`,
          );
      }
    }
  };
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
      await runMutationCommands(commands);
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
      await runMutationCommands(commands);
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
