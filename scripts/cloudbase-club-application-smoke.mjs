#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  applicationId,
  saveDraft,
  submitApplication,
  reviewApplication,
  joinPublicClub,
  getSoleClub: adminGetSoleClub,
  createSoleClub: adminCreateSoleClub,
  updateSoleClub: adminUpdateSoleClub,
  SOLE_CLUB_ID,
} = require('../cloudfunctions/club-application/core.js');
const CLI_PACKAGE = '@cloudbase/cli@3.8.4';
const GATE_VALUE = 'club-application-write';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const membershipIdFor = (clubId, openid) => `clubmem_${hash(`${clubId}\0${openid}`)}`;

export async function checkIsolatedClubSmokeText(request) {
  let fields;
  try {
    fields = JSON.parse(request?.content);
  } catch {
    throw new Error('俱乐部 smoke 内容审核请求无效');
  }
  const values =
    fields && typeof fields === 'object' && !Array.isArray(fields) ? Object.values(fields) : [];
  if (
    typeof request?.openid !== 'string' ||
    !request.openid.startsWith('smoke_applicant_') ||
    request.scene !== 4 ||
    request.version !== 2 ||
    !values.length ||
    values.some((value) => typeof value !== 'string') ||
    !values.some((value) => value.includes('CI 骑行测试') || value.includes('冒烟测试'))
  )
    throw new Error('俱乐部 smoke 内容审核请求越界');
  return {
    errCode: 0,
    result: { suggest: 'pass' },
    traceId: 'isolated-club-smoke',
  };
}

function parseJson(output) {
  if (output && typeof output === 'object') return output;
  try {
    return JSON.parse(String(output));
  } catch {
    throw new Error('CloudBase 数据库命令未返回有效 JSON');
  }
}

function collectParsed(value, results = [], seen = new Set()) {
  if (typeof value === 'string') {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      // 普通字段不是嵌套 JSON。
      return results;
    }
    return collectParsed(parsed, results, seen);
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  if (Array.isArray(value)) {
    const isMgoResultWrapper =
      value.length > 0 &&
      value.every(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          (Object.hasOwn(entry, 'Result') || Object.hasOwn(entry, 'result')),
      );
    if (isMgoResultWrapper) {
      try {
        const documents = value.map((entry) => {
          const nested = entry.Result ?? entry.result;
          return typeof nested === 'string' ? JSON.parse(nested) : nested;
        });
        if (documents.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)))
          results.unshift(documents);
      } catch {
        throw new Error('CloudBase QUERY 的 Mgo Result 包含无效 JSON');
      }
    }
    if (
      !isMgoResultWrapper &&
      value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    )
      results.push(value);
    value.forEach((entry) => collectParsed(entry, results, seen));
    return results;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (['firstBatch', 'documents', 'Docs', 'docs', 'list'].includes(key) && Array.isArray(nested))
      results.unshift(nested);
    collectParsed(nested, results, seen);
  }
  return results;
}

function normalizeExtendedJson(value) {
  if (Array.isArray(value)) return value.map(normalizeExtendedJson);
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length === 1) {
    const numberKey = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'].find((key) =>
      Object.hasOwn(value, key),
    );
    if (numberKey) {
      if (numberKey === '$numberDecimal') return String(value[numberKey]);
      const normalized = Number(value[numberKey]);
      const requiresSafeInteger = numberKey === '$numberInt' || numberKey === '$numberLong';
      if (
        !Number.isFinite(normalized) ||
        (requiresSafeInteger && !Number.isSafeInteger(normalized))
      )
        throw new Error('CloudBase QUERY 返回无法安全归一的 Extended JSON 数字');
      return normalized;
    }
    if (Object.hasOwn(value, '$date')) {
      const rawDate = normalizeExtendedJson(value.$date);
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime()))
        throw new Error('CloudBase QUERY 返回无效的 Extended JSON 日期');
      return date.toISOString();
    }
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, normalizeExtendedJson(nested)]),
  );
}

export function parseNosqlDocuments(output) {
  const candidates = collectParsed(parseJson(output));
  const documents =
    candidates.find((items) => items.every((item) => item && typeof item === 'object')) || [];
  return normalizeExtendedJson(documents);
}

export function nosqlCommandArgs(envId, commands) {
  return [
    '--yes',
    '--package',
    CLI_PACKAGE,
    'tcb',
    '-e',
    envId,
    'db',
    'nosql',
    'execute',
    '--command',
    JSON.stringify(commands),
    '--json',
  ];
}

export function functionDetailProbeArgs(envId) {
  return [
    '--yes',
    '--package',
    CLI_PACKAGE,
    'tcb',
    '-e',
    envId,
    'fn',
    'detail',
    'club-application',
    '--json',
  ];
}

const firstOwnValue = (value, keys) => {
  for (const key of keys) {
    if (Object.hasOwn(value, key)) return value[key];
  }
  return undefined;
};

function collectFunctionDetails(value, results = [], seen = new Set()) {
  if (typeof value === 'string') {
    try {
      collectFunctionDetails(JSON.parse(value), results, seen);
    } catch {
      // 普通字段不是嵌套 JSON。
    }
    return results;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  const name = firstOwnValue(value, ['FunctionName', 'functionName', 'name']);
  const status = firstOwnValue(value, ['Status', 'status']);
  if (name !== undefined) {
    results.push({
      name,
      status,
    });
  }
  for (const nested of Object.values(value)) collectFunctionDetails(nested, results, seen);
  return results;
}

function collectEnvironmentIds(value, results = [], seen = new Set()) {
  if (typeof value === 'string') {
    try {
      collectEnvironmentIds(JSON.parse(value), results, seen);
    } catch {
      // 普通字段不是嵌套 JSON。
    }
    return results;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  const envId = firstOwnValue(value, ['EnvironmentId', 'environmentId', 'EnvId', 'envId']);
  if (envId !== undefined) results.push(envId);
  for (const nested of Object.values(value)) collectEnvironmentIds(nested, results, seen);
  return results;
}

export function parseFunctionDetailOutput(output, expectedEnvId) {
  const parsed = parseJson(output);
  const candidates = collectFunctionDetails(parsed);
  if (candidates.length !== 1) throw new Error('club-application detail 未返回唯一函数详情');
  const [detail] = candidates;
  if (
    typeof detail.name !== 'string' ||
    detail.name.length === 0 ||
    typeof detail.status !== 'string' ||
    detail.status.length === 0
  )
    throw new Error('club-application detail 缺少函数名或状态');
  if (detail.name !== 'club-application') throw new Error('club-application detail 函数名不匹配');
  if (detail.status.toLowerCase() !== 'active')
    throw new Error('club-application detail 状态不是可服务终态 Active');
  const providedEnvIds = collectEnvironmentIds(parsed);
  if (providedEnvIds.some((envId) => envId !== expectedEnvId))
    throw new Error('club-application detail 环境不匹配');
  return { name: detail.name, status: detail.status };
}

export function probeClubApplicationDeployment({
  envId,
  cwd = process.cwd(),
  execute = execFileSync,
}) {
  let output;
  try {
    output = execute('npx', functionDetailProbeArgs(envId), {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('club-application detail 命令执行失败');
  }
  return parseFunctionDetailOutput(output, envId);
}

function command(table, type, value) {
  return { TableName: table, CommandType: type, Command: JSON.stringify(value) };
}

export function createCliStore({ envId, cwd = process.cwd(), execute = execFileSync }) {
  const invoke = (commands) =>
    execute('npx', nosqlCommandArgs(envId, commands), {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const get = async (collection, id) => {
    const output = invoke([
      command(collection, 'QUERY', { find: collection, filter: { _id: id }, limit: 1 }),
    ]);
    return parseNosqlDocuments(output).find((item) => item._id === id);
  };
  const put = async (collection, id, value) => {
    const { _id, ...data } = value;
    invoke([
      command(collection, 'UPDATE', {
        update: collection,
        updates: [{ q: { _id: id }, u: { $set: data, $setOnInsert: { _id: id } }, upsert: true }],
      }),
    ]);
  };
  const removeMany = async (collection, filter) => {
    invoke([
      command(collection, 'DELETE', {
        delete: collection,
        deletes: [{ q: filter, limit: 0 }],
      }),
    ]);
  };
  let auditSequence = 0;
  const knownAudits = new Map();
  return {
    msgSecCheck: checkIsolatedClubSmokeText,
    // CLI 不提供回调事务：每次 put 先写真实数据库，并用事务内 overlay 保证读己之写；overlay 不跨事务。
    transaction: async (work) => {
      const overlay = new Map();
      const keyFor = (collection, id) => `${collection}\0${id}`;
      const txGet = async (collection, id) => {
        const key = keyFor(collection, id);
        return overlay.has(key) ? overlay.get(key) : get(collection, id);
      };
      const txPut = async (collection, id, value) => {
        await put(collection, id, value);
        overlay.set(keyFor(collection, id), structuredClone(value));
      };
      const txPutAudit = async (id, value) => {
        const document = { ...value, _id: id, smoke_test: true };
        await txPut('audit_logs', id, document);
        // CLI 的 UPDATE 与后续 QUERY 不具备事务读己之写；仅缓存本进程刚写入的确定性幂等审计。
        knownAudits.set(id, structuredClone(document));
      };
      return work({
        getAdmin: (id) => txGet('admins', id),
        getApplication: (id) => txGet('club_applications', id),
        getClub: (id) => txGet('clubs', id),
        getMembership: (id) => txGet('club_memberships', id),
        getProfileMediaByCanonical: async (fileId, ownerOpenid, category) => {
          const output = invoke([
            command('profile_media', 'QUERY', {
              find: 'profile_media',
              filter: {
                canonical_file_id: fileId,
                owner_openid: ownerOpenid,
                category,
              },
              limit: 2,
            }),
          ]);
          const records = parseNosqlDocuments(output);
          return records.length === 1 ? records[0] : undefined;
        },
        activateProfileMedia: async (id, referencedAt) => {
          const current = await txGet('profile_media', id);
          if (!current) throw new Error('真实写入 smoke 媒体登记不存在');
          await txPut('profile_media', id, {
            ...current,
            status: 'active',
            referenced_at: referencedAt,
            cleanup_after: null,
            delete_lease_id: '',
            delete_lease_at: null,
          });
        },
        countActiveMemberships: async (clubId) => {
          const output = invoke([
            command('club_memberships', 'QUERY', {
              find: 'club_memberships',
              filter: { club_id: clubId, status: 'active' },
              limit: 10000,
            }),
          ]);
          return parseNosqlDocuments(output).length;
        },
        getAudit: (id) =>
          knownAudits.has(id) ? structuredClone(knownAudits.get(id)) : txGet('audit_logs', id),
        putApplication: (id, value) => txPut('club_applications', id, value),
        putClub: (id, value) => txPut('clubs', id, value),
        putMembership: (id, value) => txPut('club_memberships', id, value),
        putAudit: txPutAudit,
        addAudit: (value) => {
          auditSequence += 1;
          const id = `smoke_audit_${hash(`${value.target_id}:${value.action}:${auditSequence}`).slice(0, 40)}`;
          return txPut('audit_logs', id, { _id: id, ...value, smoke_test: true });
        },
      });
    },
    get,
    put,
    query: async (collection, filter, limit = 100) => {
      const output = invoke([command(collection, 'QUERY', { find: collection, filter, limit })]);
      return parseNosqlDocuments(output);
    },
    removeMany,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`真实写入 smoke 断言失败：${message}`);
}

function assertPersistedStage(record, { stage, status, reviewVersion, requestField, requestId }) {
  const actualStatus = typeof record?.status === 'string' ? record.status : typeof record?.status;
  const actualVersion = record?.review_version;
  const statusMatches = actualStatus === status;
  const versionMatches = actualVersion === reviewVersion;
  const requestMatches = !requestField || record?.[requestField] === requestId;
  if (!statusMatches || !versionMatches || !requestMatches) {
    throw new Error(
      `真实写入 smoke 断言失败：stage=${stage} status=${actualStatus} review_version=${String(actualVersion)} request_id_type=${typeof (requestField ? record?.[requestField] : undefined)}`,
    );
  }
}

export function assertWriteGate({ env = process.env, envId, confirmEnvId, configuredEnvId }) {
  if (env.CILI_ALLOW_PRODUCTION_SMOKE !== GATE_VALUE)
    throw new Error(`拒绝真实写入：必须显式设置 CILI_ALLOW_PRODUCTION_SMOKE=${GATE_VALUE}`);
  if (
    !envId ||
    confirmEnvId !== envId ||
    env.CILI_SMOKE_ENV_ID !== envId ||
    configuredEnvId !== envId
  )
    throw new Error(
      '拒绝真实写入：命令参数、确认参数、CILI_SMOKE_ENV_ID 与 cloudbaserc 环境必须完全一致',
    );
}

export async function cleanupSmokeData(store, ids) {
  const targets = [
    {
      collection: 'audit_logs',
      filter: { target_id: ids.applicationId },
      verify: () => store.query('audit_logs', { target_id: ids.applicationId }),
    },
    {
      collection: 'audit_logs',
      filter: { target_id: ids.clubId },
      verify: () => store.query('audit_logs', { target_id: ids.clubId }),
    },
    {
      collection: 'club_memberships',
      filter: { _id: ids.joinerMembershipId },
      verify: async () =>
        (await store.get('club_memberships', ids.joinerMembershipId)) ? [{}] : [],
    },
    {
      collection: 'club_memberships',
      filter: { _id: ids.membershipId },
      verify: async () => ((await store.get('club_memberships', ids.membershipId)) ? [{}] : []),
    },
    {
      collection: 'clubs',
      filter: { _id: ids.clubId },
      verify: async () => ((await store.get('clubs', ids.clubId)) ? [{}] : []),
    },
    {
      collection: 'club_applications',
      filter: { _id: ids.applicationId },
      verify: async () => ((await store.get('club_applications', ids.applicationId)) ? [{}] : []),
    },
    {
      collection: 'profile_media',
      filter: { _id: ids.avatarMediaId },
      verify: async () => ((await store.get('profile_media', ids.avatarMediaId)) ? [{}] : []),
    },
    {
      collection: 'profile_media',
      filter: { _id: ids.coverMediaId },
      verify: async () => ((await store.get('profile_media', ids.coverMediaId)) ? [{}] : []),
    },
    {
      collection: 'admins',
      filter: { _id: ids.adminOpenid, smoke_test: true },
      verify: async () => ((await store.get('admins', ids.adminOpenid)) ? [{}] : []),
    },
  ];
  const failedCollections = new Set();
  for (const target of targets) {
    try {
      await store.removeMany(target.collection, target.filter);
    } catch {
      failedCollections.add(target.collection);
    }
  }
  for (const target of targets) {
    try {
      if ((await target.verify()).length > 0) failedCollections.add(target.collection);
    } catch {
      failedCollections.add(target.collection);
    }
  }
  if (failedCollections.size > 0) {
    throw new Error(
      `真实写入 smoke 清理未完成，残留或无法回读集合：${[...failedCollections].sort().join(', ')}`,
    );
  }
}

export async function runClubApplicationSmoke({
  store,
  runId,
  now = () => new Date(),
  mediaSecret = process.env.PROFILE_MEDIA_PATH_SECRET,
}) {
  const normalizedMediaSecret = typeof mediaSecret === 'string' ? mediaSecret.trim() : '';
  if (normalizedMediaSecret.length < 32)
    throw new Error('真实写入 smoke 缺少有效的 PROFILE_MEDIA_PATH_SECRET');
  const suffix = hash(runId).slice(0, 24);
  const applicantOpenid = `smoke_applicant_${suffix}`;
  const joinerOpenid = `smoke_joiner_${suffix}`;
  // 同一隔离账号兼任申请人和平台管理员，使 canonical 媒体可沿新建唯一俱乐部链路复用。
  const adminOpenid = applicantOpenid;
  const appId = applicationId(applicantOpenid);
  const clubId = SOLE_CLUB_ID;
  const membershipId = membershipIdFor(clubId, applicantOpenid);
  const joinerMembershipId = membershipIdFor(clubId, joinerOpenid);
  const ids = {
    applicantOpenid,
    joinerOpenid,
    adminOpenid,
    applicationId: appId,
    clubId,
    membershipId,
    joinerMembershipId,
  };
  const ownerAlias = createHmac('sha256', normalizedMediaSecret)
    .update(applicantOpenid)
    .digest('hex')
    .slice(0, 32);
  const input = {
    club_name: `CI 骑行测试 ${suffix.slice(0, 6)}`,
    city: '测试城市',
    introduction: '这是由部署后真实写入冒烟测试创建的隔离俱乐部申请资料，仅用于校验持久化闭环。',
    applicant_contact: `ci-${suffix}`,
    join_mode: 'public_apply',
    expected_size: 2,
    activity_types: '自动化骑行测试',
    rules_summary: '仅用于自动化验证，执行完成后必须清理全部记录。',
    avatar_file_id: `cloud://smoke/profile-canonical/${ownerAlias}/club-avatar/${'a'.repeat(64)}/${'b'.repeat(64)}.jpg`,
    cover_file_id: `cloud://smoke/profile-canonical/${ownerAlias}/club-cover/${'c'.repeat(64)}/${'d'.repeat(64)}.jpg`,
  };
  ids.avatarMediaId = `smoke_media_${hash(input.avatar_file_id).slice(0, 40)}`;
  ids.coverMediaId = `smoke_media_${hash(input.cover_file_id).slice(0, 40)}`;

  await cleanupSmokeData(store, ids);
  try {
    await store.put('profile_media', ids.avatarMediaId, {
      _id: ids.avatarMediaId,
      canonical_file_id: input.avatar_file_id,
      owner_openid: applicantOpenid,
      category: 'club-avatar',
      origin: 'custom',
      status: 'unreferenced',
      security_status: 'pass',
      smoke_test: true,
      created_at: now().toISOString(),
    });
    await store.put('profile_media', ids.coverMediaId, {
      _id: ids.coverMediaId,
      canonical_file_id: input.cover_file_id,
      owner_openid: applicantOpenid,
      category: 'club-cover',
      origin: 'custom',
      status: 'unreferenced',
      security_status: 'pass',
      smoke_test: true,
      created_at: now().toISOString(),
    });
    await store.put('admins', adminOpenid, {
      _id: adminOpenid,
      enabled: true,
      smoke_test: true,
      created_at: now().toISOString(),
    });

    const draft = await saveDraft(store, { openid: applicantOpenid, input }, now());
    assert(draft.status === 'draft' && draft.review_version === 0, '草稿返回值');
    assertPersistedStage(await store.get('club_applications', appId), {
      stage: 'draft',
      status: 'draft',
      reviewVersion: 0,
    });
    const [activeAvatar, activeCover] = await Promise.all([
      store.get('profile_media', ids.avatarMediaId),
      store.get('profile_media', ids.coverMediaId),
    ]);
    assert(
      activeAvatar?.status === 'active' && activeCover?.status === 'active',
      'canonical 媒体登记激活',
    );

    const firstSubmitRequestId = `submit_1_${suffix}`;
    const firstSubmit = await submitApplication(
      store,
      { openid: applicantOpenid, input, requestId: firstSubmitRequestId },
      now(),
    );
    assertPersistedStage(firstSubmit, {
      stage: 'first_submit_return',
      status: 'pending_review',
      reviewVersion: 1,
    });
    assertPersistedStage(await store.get('club_applications', appId), {
      stage: 'first_submit',
      status: 'pending_review',
      reviewVersion: 1,
      requestField: 'last_submit_request_id',
      requestId: firstSubmitRequestId,
    });

    const firstReviewRequestId = `reject_1_${suffix}`;
    const rejected = await reviewApplication(
      store,
      {
        adminOpenid,
        applicationId: appId,
        decision: 'rejected',
        reason: '自动化驳回后重提验证',
        requestId: firstReviewRequestId,
      },
      now(),
    );
    assert(rejected.status === 'rejected' && rejected.review_version === 1, '管理员驳回返回值');
    assertPersistedStage(await store.get('club_applications', appId), {
      stage: 'rejected',
      status: 'rejected',
      reviewVersion: 1,
      requestField: 'last_review_request_id',
      requestId: firstReviewRequestId,
    });

    const revisedInput = { ...input, introduction: `${input.introduction} 已按驳回意见完成修改。` };
    const revisedDraft = await saveDraft(
      store,
      { openid: applicantOpenid, input: revisedInput },
      now(),
    );
    assert(revisedDraft.status === 'draft' && revisedDraft.review_version === 1, '修改草稿返回值');
    assertPersistedStage(await store.get('club_applications', appId), {
      stage: 'revised_draft',
      status: 'draft',
      reviewVersion: 1,
      requestField: 'last_review_request_id',
      requestId: firstReviewRequestId,
    });

    const secondSubmitRequestId = `submit_2_${suffix}`;
    const secondSubmit = await submitApplication(
      store,
      { openid: applicantOpenid, input: revisedInput, requestId: secondSubmitRequestId },
      now(),
    );
    assert(
      secondSubmit.status === 'pending_review' && secondSubmit.review_version === 2,
      '修改重提返回值',
    );
    assertPersistedStage(await store.get('club_applications', appId), {
      stage: 'second_submit',
      status: 'pending_review',
      reviewVersion: 2,
      requestField: 'last_submit_request_id',
      requestId: secondSubmitRequestId,
    });

    const createRequestId = `sole_create_${suffix}`;
    const created = await adminCreateSoleClub(
      store,
      {
        adminOpenid,
        existingClubId: '',
        requestId: createRequestId,
        input: {
          name: revisedInput.club_name,
          city: revisedInput.city,
          introduction: revisedInput.introduction,
          avatar_file_id: revisedInput.avatar_file_id,
          cover_file_id: revisedInput.cover_file_id,
        },
      },
      now(),
    );
    assert(created.exists && created.club.id === clubId, '管理员创建唯一俱乐部返回值');
    assertPersistedStage(await store.get('club_applications', appId), {
      stage: 'sole_club_created',
      status: 'pending_review',
      reviewVersion: 2,
      requestField: 'last_submit_request_id',
      requestId: secondSubmitRequestId,
    });

    const [persistedApplication, persistedClub, persistedMembership, audits] = await Promise.all([
      store.get('club_applications', appId),
      store.get('clubs', clubId),
      store.get('club_memberships', membershipId),
      store.query('audit_logs', { target_id: appId }),
    ]);
    assert(persistedApplication?.status === 'pending_review', '申请状态不被创建链路篡改');
    assert(
      persistedClub?.source === 'admin_bootstrap' && persistedClub?.status === 'active',
      '唯一 clubs 持久化',
    );
    assert(persistedClub?.avatar_url === input.avatar_file_id, 'clubs 头像传播');
    assert(persistedClub?.cover_file_id === input.cover_file_id, 'clubs 背景传播');
    assert(
      persistedClub?.member_count === 0 && persistedClub?.max_members === 50,
      '唯一俱乐部容量使用服务端默认值',
    );
    assert(!persistedMembership, '管理员创建唯一俱乐部不伪造成员关系');
    const actions = new Set(audits.map((item) => item.action));
    assert(audits.length === 3, '申请 audit 数量');
    for (const action of ['club_application_submitted', 'club_application_rejected'])
      assert(actions.has(action), `audit ${action}`);

    const managedBefore = await adminGetSoleClub(store, { adminOpenid, clubId });
    assert(
      managedBefore.exists && managedBefore.club.name === input.club_name,
      '管理员读取唯一俱乐部资料',
    );
    const profileUpdateRequestId = `profile_update_${suffix}`;
    const updateInput = {
      name: input.club_name,
      city: input.city,
      introduction: `${revisedInput.introduction} 资料管理已验证。`,
      avatar_file_id: input.avatar_file_id,
      cover_file_id: input.cover_file_id,
    };
    const managedAfter = await adminUpdateSoleClub(
      store,
      {
        adminOpenid,
        clubId,
        requestId: profileUpdateRequestId,
        expectedUpdatedAt: managedBefore.club.updated_at,
        input: updateInput,
      },
      now(),
    );
    const repeatedManagedUpdate = await adminUpdateSoleClub(
      store,
      {
        adminOpenid,
        clubId,
        requestId: profileUpdateRequestId,
        expectedUpdatedAt: managedBefore.club.updated_at,
        input: updateInput,
      },
      now(),
    );
    assert(
      managedAfter.club.introduction === repeatedManagedUpdate.club.introduction &&
        managedAfter.club.introduction.endsWith('资料管理已验证。'),
      '管理员修改唯一俱乐部资料与重复请求幂等',
    );

    const joinRequestId = `join_public_${suffix}`;
    const firstJoin = await joinPublicClub(
      store,
      { openid: joinerOpenid, clubId, requestId: joinRequestId },
      now(),
    );
    const repeatedJoin = await joinPublicClub(
      store,
      { openid: joinerOpenid, clubId, requestId: joinRequestId },
      now(),
    );
    const [persistedJoinerMembership, persistedJoinedClub, joinAudits] = await Promise.all([
      store.get('club_memberships', joinerMembershipId),
      store.get('clubs', clubId),
      store.query('audit_logs', { target_id: clubId }),
    ]);
    assert(
      firstJoin.role === 'MEMBER' &&
        repeatedJoin.role === 'MEMBER' &&
        firstJoin.status === 'active' &&
        repeatedJoin.status === 'active',
      '公开加入返回值与重复请求幂等',
    );
    assert(
      persistedJoinerMembership?.club_id === clubId &&
        persistedJoinerMembership?.openid === joinerOpenid &&
        persistedJoinerMembership?.role === 'MEMBER' &&
        persistedJoinerMembership?.status === 'active',
      '第二用户 MEMBER membership 持久化',
    );
    assert(persistedJoinedClub?.member_count === 1, '公开加入只增加一次容量计数');
    assert(
      joinAudits.length === 3 &&
        joinAudits.some((item) => item.action === 'sole_club_created') &&
        joinAudits.some((item) => item.action === 'sole_club_profile_updated') &&
        joinAudits.some((item) => item.action === 'public_club_joined'),
      '唯一俱乐部创建、资料更新与公开加入 audit',
    );
    return { stages: 8, auditCount: audits.length + joinAudits.length };
  } finally {
    await cleanupSmokeData(store, ids);
  }
}

function parseArgs(argv) {
  const options = { envId: '', confirmEnvId: '', runId: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!['--env-id', '--confirm-env-id', '--run-id'].includes(arg))
      throw new Error(`未知参数：${arg}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${arg} 缺少值`);
    options[arg === '--env-id' ? 'envId' : arg === '--confirm-env-id' ? 'confirmEnvId' : 'runId'] =
      value;
    index += 1;
  }
  if (!options.runId || !/^[A-Za-z0-9._-]{6,128}$/.test(options.runId))
    throw new Error('run id 无效');
  return options;
}

export async function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  const configuredEnvId = require(resolve(cwd, 'cloudbaserc.json')).envId;
  assertWriteGate({ ...options, configuredEnvId });
  probeClubApplicationDeployment({ envId: options.envId, cwd });
  const result = await runClubApplicationSmoke({
    store: createCliStore({ envId: options.envId, cwd }),
    runId: options.runId,
  });
  console.log(`俱乐部申请真实写入 smoke 通过：${result.stages} 个阶段，测试数据已清理`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
