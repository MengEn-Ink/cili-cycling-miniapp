#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  applicationId,
  saveDraft,
  submitApplication,
  reviewApplication,
} = require('../cloudfunctions/club-application/core.js');
const CLI_PACKAGE = '@cloudbase/cli@3.8.4';
const GATE_VALUE = 'club-application-write';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const clubIdFor = (id) => `club_${hash(id)}`;
const membershipIdFor = (clubId, openid) => `clubmem_${hash(`${clubId}\0${openid}`)}`;

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
    try {
      collectParsed(JSON.parse(value), results, seen);
    } catch {
      // 普通字段不是嵌套 JSON。
    }
    return results;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)))
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

export function parseNosqlDocuments(output) {
  const candidates = collectParsed(parseJson(output));
  return candidates.find((items) => items.every((item) => item && typeof item === 'object')) || [];
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

export function handlerProbeArgs(envId) {
  return [
    '--yes',
    '--package',
    CLI_PACKAGE,
    'tcb',
    '-e',
    envId,
    'fn',
    'invoke',
    'club-application',
    '--params',
    JSON.stringify({ action: 'mine' }),
    '--json',
  ];
}

function collectBusinessEnvelopes(value, results = [], seen = new Set()) {
  if (typeof value === 'string') {
    try {
      collectBusinessEnvelopes(JSON.parse(value), results, seen);
    } catch {
      // 普通字段不是嵌套 JSON。
    }
    return results;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  if (
    value.ok === false &&
    value.error &&
    typeof value.error === 'object' &&
    typeof value.error.code === 'string'
  )
    results.push(value);
  for (const nested of Object.values(value)) collectBusinessEnvelopes(nested, results, seen);
  return results;
}

function parseBusinessEnvelopes(output) {
  try {
    return collectBusinessEnvelopes(parseJson(output));
  } catch {
    return [];
  }
}

function assertExpectedProbeEnvelopes(envelopes) {
  if (envelopes.length !== 1) throw new Error('已部署 club-application 未返回唯一可识别的业务信封');
  if (envelopes[0].error.code !== 'UNAUTHENTICATED')
    throw new Error('已部署 club-application 未保持无微信上下文鉴权边界');
  return { ok: false, error: { code: 'UNAUTHENTICATED' } };
}

export function parseHandlerProbeOutput(output) {
  return assertExpectedProbeEnvelopes(parseBusinessEnvelopes(output));
}

export function probeClubApplicationHandler({
  envId,
  cwd = process.cwd(),
  execute = execFileSync,
}) {
  let output;
  try {
    output = execute('npx', handlerProbeArgs(envId), {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const isExpectedBusinessExit =
      error?.status === 1 && error?.signal == null && error?.code == null;
    if (!isExpectedBusinessExit) {
      // 原始 CLI 异常可能含凭证或响应正文，安全边界要求不挂载为 cause。
      // eslint-disable-next-line preserve-caught-error
      throw new Error('已部署 club-application 探针命令发生非业务执行失败');
    }

    const outputs = [error.stdout, error.stderr].filter(
      (output) =>
        (typeof output === 'string' || Buffer.isBuffer(output)) && String(output).trim().length > 0,
    );
    const envelopes = outputs.flatMap((output) => parseBusinessEnvelopes(output));
    try {
      return assertExpectedProbeEnvelopes(envelopes);
    } catch {
      // 不回显可能含凭证的原始 stdout、stderr 或系统错误内容。
      throw new Error('已部署 club-application 探针命令失败且未返回唯一预期鉴权业务信封');
    }
  }
  return parseHandlerProbeOutput(output);
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
  return {
    // db nosql execute 没有暴露与 wx-server-sdk runTransaction 等价的回调事务；这里逐步真实写入。
    transaction: async (work) =>
      work({
        getAdmin: (id) => get('admins', id),
        getApplication: (id) => get('club_applications', id),
        putApplication: (id, value) => put('club_applications', id, value),
        putClub: (id, value) => put('clubs', id, value),
        putMembership: (id, value) => put('club_memberships', id, value),
        addAudit: (value) => {
          auditSequence += 1;
          const id = `smoke_audit_${hash(`${value.target_id}:${value.action}:${auditSequence}`).slice(0, 40)}`;
          return put('audit_logs', id, { _id: id, ...value, smoke_test: true });
        },
      }),
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

export async function runClubApplicationSmoke({ store, runId, now = () => new Date() }) {
  const suffix = hash(runId).slice(0, 24);
  const applicantOpenid = `smoke_applicant_${suffix}`;
  const adminOpenid = `smoke_admin_${suffix}`;
  const appId = applicationId(applicantOpenid);
  const clubId = clubIdFor(appId);
  const membershipId = membershipIdFor(clubId, applicantOpenid);
  const ids = { applicantOpenid, adminOpenid, applicationId: appId, clubId, membershipId };
  const input = {
    club_name: `CI 骑行测试 ${suffix.slice(0, 6)}`,
    city: '测试城市',
    introduction: '这是由部署后真实写入冒烟测试创建的隔离俱乐部申请资料，仅用于校验持久化闭环。',
    applicant_contact: `ci-${suffix}`,
    join_mode: 'admin_invite',
    expected_size: 2,
    activity_types: '自动化骑行测试',
    rules_summary: '仅用于自动化验证，执行完成后必须清理全部记录。',
    cover_file_id: `cloud://smoke/club-applications/${applicantOpenid}/cover.jpg`,
  };

  await cleanupSmokeData(store, ids);
  try {
    await store.put('admins', adminOpenid, {
      _id: adminOpenid,
      enabled: true,
      smoke_test: true,
      created_at: now().toISOString(),
    });

    const draft = await saveDraft(store, { openid: applicantOpenid, input }, now());
    assert(draft.status === 'draft', '草稿状态');
    assert((await store.get('club_applications', appId))?.status === 'draft', '草稿持久化');

    const firstSubmit = await submitApplication(
      store,
      { openid: applicantOpenid, input, requestId: `submit_1_${suffix}` },
      now(),
    );
    assert(firstSubmit.status === 'pending_review' && firstSubmit.review_version === 1, '首次提交');

    const rejected = await reviewApplication(
      store,
      {
        adminOpenid,
        applicationId: appId,
        decision: 'rejected',
        reason: '自动化驳回后重提验证',
        requestId: `reject_1_${suffix}`,
      },
      now(),
    );
    assert(rejected.status === 'rejected', '管理员驳回');

    const revisedInput = { ...input, introduction: `${input.introduction} 已按驳回意见完成修改。` };
    await saveDraft(store, { openid: applicantOpenid, input: revisedInput }, now());
    const secondSubmit = await submitApplication(
      store,
      { openid: applicantOpenid, input: revisedInput, requestId: `submit_2_${suffix}` },
      now(),
    );
    assert(
      secondSubmit.status === 'pending_review' && secondSubmit.review_version === 2,
      '修改重提',
    );

    const approved = await reviewApplication(
      store,
      {
        adminOpenid,
        applicationId: appId,
        decision: 'approved',
        reason: '',
        requestId: `approve_2_${suffix}`,
      },
      now(),
    );
    assert(approved.status === 'approved' && approved.club_id === clubId, '管理员批准');

    const [persistedApplication, persistedClub, persistedMembership, audits] = await Promise.all([
      store.get('club_applications', appId),
      store.get('clubs', clubId),
      store.get('club_memberships', membershipId),
      store.query('audit_logs', { target_id: appId }),
    ]);
    assert(persistedApplication?.status === 'approved', '批准状态持久化');
    assert(
      persistedClub?.source_application_id === appId && persistedClub?.status === 'active',
      'clubs 持久化',
    );
    assert(
      persistedMembership?.club_id === clubId &&
        persistedMembership?.openid === applicantOpenid &&
        persistedMembership?.role === 'OWNER' &&
        persistedMembership?.status === 'active',
      'OWNER membership 持久化',
    );
    const actions = new Set(audits.map((item) => item.action));
    assert(audits.length === 4, 'audit 数量');
    for (const action of [
      'club_application_submitted',
      'club_application_rejected',
      'club_application_approved',
    ])
      assert(actions.has(action), `audit ${action}`);
    return { stages: 6, auditCount: audits.length };
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
  probeClubApplicationHandler({ envId: options.envId, cwd });
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
