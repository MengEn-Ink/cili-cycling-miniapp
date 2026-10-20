#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createCliStore,
  nosqlCommandArgs,
  parseNosqlDocuments,
} from './cloudbase-club-application-smoke.mjs';

export { nosqlCommandArgs, parseNosqlDocuments };
export const APPLY_GATE_VALUE = 'historical-activity-purge';
export const CONFIRMATION_PHRASE = 'DELETE_HISTORICAL_ACTIVITY_DATA';
export const QUERY_LIMIT = 10_000;
export const AUDIT_COLLECTION = 'audit_logs';

const ASSOCIATIONS = Object.freeze([
  { collection: 'registrations', field: 'activity_id' },
  { collection: 'route_previews', field: 'attached_activity_id' },
  { collection: AUDIT_COLLECTION, field: 'target_id' },
  { collection: 'notification_outbox', field: 'payload.activity_id' },
]);

function parseCutoff(value) {
  const cutoff = new Date(value);
  if (typeof value !== 'string' || !value || Number.isNaN(cutoff.getTime())) {
    throw new Error('cutoff 必须是有效的 ISO 日期时间');
  }
  return cutoff;
}

export function isHistoricalActivity(activity, cutoffValue) {
  const cutoff = cutoffValue instanceof Date ? cutoffValue : parseCutoff(cutoffValue);
  // 仓库活动结束时间的事实字段是 event_end，而不是 end_at。
  const end = new Date(activity?.event_end).getTime();
  const hasValidEnd = !Number.isNaN(end);
  // 即使软删除，明确处于 cutoff 或之后的活动也受未来/进行中硬保护。
  if (hasValidEnd && end >= cutoff.getTime()) return false;
  return (hasValidEnd && end < cutoff.getTime()) || activity?.is_deleted === true;
}

export function selectHistoricalActivities(activities, cutoffValue) {
  const cutoff = cutoffValue instanceof Date ? cutoffValue : parseCutoff(cutoffValue);
  const selected = activities.filter((activity) => isHistoricalActivity(activity, cutoff));
  const ids = selected.map((activity) => activity?._id);
  if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error('待清理 activities 包含无效 _id');
  }
  if (new Set(ids).size !== ids.length) throw new Error('待清理 activities 包含重复 _id');
  return selected;
}

export function assertApplyGate({
  apply,
  envId,
  confirmEnvId,
  configuredEnvId,
  confirmation,
  env = process.env,
}) {
  if (!apply) return;
  if (env.CILI_ALLOW_HISTORICAL_ACTIVITY_PURGE !== APPLY_GATE_VALUE) {
    throw new Error(
      `拒绝清理：必须显式设置 CILI_ALLOW_HISTORICAL_ACTIVITY_PURGE=${APPLY_GATE_VALUE}`,
    );
  }
  if (!envId || envId !== confirmEnvId || envId !== configuredEnvId) {
    throw new Error(
      '拒绝清理：--env-id、--confirm-env-id 与 cloudbaserc.json 环境 ID 必须三方一致',
    );
  }
  if (confirmation !== CONFIRMATION_PHRASE) {
    throw new Error(`拒绝清理：--confirmation 必须精确等于 ${CONFIRMATION_PHRASE}`);
  }
}

async function queryBounded(store, collection, filter) {
  const documents = await store.query(collection, filter, QUERY_LIMIT);
  if (!Array.isArray(documents)) throw new Error(`${collection} 查询未返回数组`);
  if (documents.length >= QUERY_LIMIT) {
    throw new Error(`${collection} 查询达到安全上限 ${QUERY_LIMIT}，拒绝不完整清理`);
  }
  return documents;
}

async function queryAssociations(store, ids) {
  const entries = [];
  for (const association of ASSOCIATIONS) {
    const filter = { [association.field]: { $in: ids } };
    const documents = await queryBounded(store, association.collection, filter);
    entries.push({ ...association, documents });
  }
  return entries;
}

function assertZeroReadback(readback) {
  const remaining = Object.entries(readback).filter(([, count]) => count !== 0);
  if (remaining.length > 0) {
    throw new Error(
      `清理后回读失败，仍有关联记录：${remaining.map(([name, count]) => `${name}=${count}`).join(' ')}`,
    );
  }
}

export async function purgeHistoricalActivities(options, store) {
  assertApplyGate(options);
  const cutoff = parseCutoff(options.cutoff);
  // 先读取活动并在本地保守判断，避免数据库日期类型差异扩大删除范围。
  const activities = await queryBounded(store, 'activities', {});
  const selected = selectHistoricalActivities(activities, cutoff);
  const ids = selected.map(({ _id }) => _id).sort();
  const associations = ids.length === 0 ? [] : await queryAssociations(store, ids);
  const counts = Object.fromEntries([
    ['activities', selected.length],
    ...associations.map(({ collection, documents }) => [collection, documents.length]),
  ]);
  for (const { collection } of ASSOCIATIONS) counts[collection] ??= 0;

  (options.log || console.log)(
    `历史活动清理摘要 cutoff=${cutoff.toISOString()} counts=${JSON.stringify(counts)} activity_ids=${JSON.stringify(ids)}`,
  );
  if (!options.apply) return { applied: false, cutoff: cutoff.toISOString(), ids, counts };
  if (ids.length === 0) return { applied: true, cutoff: cutoff.toISOString(), ids, counts };

  // 删除前再次回读资格；记录缺失或变成未来/进行中时 fail closed。
  const current = await queryBounded(store, 'activities', { _id: { $in: ids } });
  const currentIds = new Set(current.map(({ _id }) => _id));
  if (
    current.length !== ids.length ||
    ids.some((id) => !currentIds.has(id)) ||
    current.some((activity) => !isHistoricalActivity(activity, cutoff))
  ) {
    throw new Error('删除前活动资格回读失败，拒绝清理');
  }

  // 先删依赖、最后删 activities；route preview 只按明确 attached_activity_id 删除。
  for (const association of ASSOCIATIONS) {
    await store.removeMany(association.collection, {
      [association.field]: { $in: ids },
    });
  }
  await store.removeMany('activities', { _id: { $in: ids } });

  const readback = {};
  for (const association of ASSOCIATIONS) {
    readback[association.collection] = (
      await queryBounded(store, association.collection, {
        [association.field]: { $in: ids },
      })
    ).length;
  }
  readback.activities = (await queryBounded(store, 'activities', { _id: { $in: ids } })).length;
  assertZeroReadback(readback);
  (options.log || console.log)(`历史活动清理完成，回读=${JSON.stringify(readback)}`);
  return { applied: true, cutoff: cutoff.toISOString(), ids, counts, readback };
}

function parseArgs(argv) {
  const options = {
    apply: false,
    envId: '',
    confirmEnvId: '',
    confirmation: '',
    cutoff: '',
  };
  const keys = {
    '--env-id': 'envId',
    '--confirm-env-id': 'confirmEnvId',
    '--confirmation': 'confirmation',
    '--cutoff': 'cutoff',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--apply') {
      options.apply = true;
      continue;
    }
    if (!Object.hasOwn(keys, flag)) throw new Error(`未知参数：${flag}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${flag} 缺少值`);
    options[keys[flag]] = value;
    index += 1;
  }
  if (!options.envId) throw new Error('缺少 --env-id');
  parseCutoff(options.cutoff);
  return options;
}

export async function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  const configuredEnvId = JSON.parse(readFileSync(resolve(cwd, 'cloudbaserc.json'), 'utf8')).envId;
  return purgeHistoricalActivities(
    { ...options, configuredEnvId },
    createCliStore({ envId: options.envId, cwd }),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
