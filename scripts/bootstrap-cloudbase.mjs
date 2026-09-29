#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CLI_PACKAGE = '@cloudbase/cli@3.8.4';
export const API_VERSION = '2018-06-08';
export const DEFAULT_REGION = 'ap-shanghai';
export const DENY_RULE = { read: false, write: false };
export const DEMO_ID = 'demo_activity_001';
export const COLLECTIONS = Object.freeze([
  'activities',
  'registrations',
  'profiles',
  'admins',
  'audit_logs',
  'oauth_states',
  'strava_credentials',
  'strava_snapshots',
]);

export const INDEXES = Object.freeze([
  {
    collection: 'activities',
    name: 'activities_status_event_start',
    keys: [
      ['status', 1],
      ['event_start', 1],
    ],
    unique: false,
  },
  {
    collection: 'registrations',
    name: 'registrations_activity_id_openid',
    keys: [
      ['activity_id', 1],
      ['openid', 1],
    ],
    unique: true,
  },
  {
    collection: 'registrations',
    name: 'registrations_activity_status_created_at',
    keys: [
      ['activity_id', 1],
      ['status', 1],
      ['created_at', -1],
    ],
    unique: false,
  },
  {
    collection: 'registrations',
    name: 'registrations_openid_created_at',
    keys: [
      ['openid', 1],
      ['created_at', -1],
    ],
    unique: false,
  },
  {
    collection: 'oauth_states',
    name: 'oauth_states_state_hash',
    keys: [['state_hash', 1]],
    unique: true,
  },
  {
    collection: 'oauth_states',
    name: 'oauth_states_expires_at',
    keys: [['expires_at', 1]],
    unique: false,
  },
  {
    collection: 'oauth_states',
    name: 'oauth_states_openid_expires_at',
    keys: [
      ['openid', 1],
      ['expires_at', -1],
    ],
    unique: false,
  },
  {
    collection: 'strava_credentials',
    name: 'strava_credentials_openid',
    keys: [['openid', 1]],
    unique: true,
  },
  {
    collection: 'strava_snapshots',
    name: 'strava_snapshots_openid',
    keys: [['openid', 1]],
    unique: true,
  },
  {
    collection: 'strava_snapshots',
    name: 'strava_snapshots_synced_at',
    keys: [['synced_at', -1]],
    unique: false,
  },
  {
    collection: 'audit_logs',
    name: 'audit_logs_actor_created_at',
    keys: [
      ['actor_openid', 1],
      ['created_at', -1],
    ],
    unique: false,
  },
]);

function usage() {
  return `用法: node scripts/bootstrap-cloudbase.mjs [--apply | --verify] [--env-id ID] [--confirm-env-id ID] [--region REGION]\n\n默认仅生成 plan。覆盖 cloudbaserc.json 的环境时，如果值不同，必须同时传入完全相同的 --confirm-env-id。`;
}

export function parseArgs(argv) {
  const options = {
    mode: 'plan',
    envId: undefined,
    confirmedEnvId: undefined,
    region: DEFAULT_REGION,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply' || arg === '--verify') {
      if (options.mode !== 'plan') throw new Error('--apply 与 --verify 不能同时使用');
      options.mode = arg.slice(2);
    } else if (arg === '--env-id' || arg === '--confirm-env-id' || arg === '--region') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 缺少参数`);
      index += 1;
      if (arg === '--env-id') options.envId = value;
      if (arg === '--confirm-env-id') options.confirmedEnvId = value;
      if (arg === '--region') options.region = value;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`不支持的参数: ${arg}`);
    }
  }
  return options;
}

export function resolveTarget(config, options) {
  const allowedEnvId = config.envId;
  if (!allowedEnvId || typeof allowedEnvId !== 'string') {
    throw new Error('cloudbaserc.json 缺少 envId');
  }
  const envId = options.envId ?? allowedEnvId;
  if (envId !== allowedEnvId && options.confirmedEnvId !== envId) {
    throw new Error(
      `环境 ${envId} 不在 cloudbaserc.json 允许范围；如确认跨环境操作，请追加 --confirm-env-id ${envId}`,
    );
  }
  return { envId, region: options.region };
}

export class CliError extends Error {
  constructor(action, message, status) {
    super(`${action} 失败: ${message}`);
    this.name = 'CliError';
    this.action = action;
    this.status = status;
  }
}

function errorSummary(value) {
  return String(value ?? '未知错误')
    .replace(
      /(secret(?:id|key)?|token|authorization|credential|password)["'\s:=]+[^\s,"']+/gi,
      '$1=<已隐藏>',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function parseCliJson(stdout, action) {
  const text = String(stdout ?? '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const starts = [text.lastIndexOf('\n{'), text.lastIndexOf('\n[')].filter((value) => value >= 0);
    const start = starts.length ? Math.max(...starts) + 1 : -1;
    if (start >= 0) {
      try {
        return JSON.parse(text.slice(start));
      } catch {
        // Report only a bounded parser error below.
      }
    }
    throw new CliError(action, 'CLI 未返回有效 JSON', 1);
  }
}

function cliFailureSummary(result, action) {
  try {
    const parsed = parseCliJson(result.stdout, action);
    const failure = parsed.error ?? parsed.Error ?? parsed.data?.Error ?? parsed.Response?.Error;
    if (failure) {
      const code = failure.code ?? failure.Code ?? failure.name ?? 'CloudApiError';
      const message = failure.message ?? failure.Message ?? '未知错误';
      const requestId = failure.requestId ?? failure.RequestId;
      return errorSummary(`${code}: ${message}${requestId ? ` (RequestId: ${requestId})` : ''}`);
    }
  } catch {
    // Fall through to bounded process output.
  }
  return errorSummary(
    result.error?.message ||
      result.stderr ||
      result.stdout ||
      `CLI 退出码 ${result.status ?? '未知'}`,
  );
}

export class CloudBaseCliRunner {
  constructor({ spawn = spawnSync, cwd = process.cwd() } = {}) {
    this.spawn = spawn;
    this.cwd = cwd;
  }

  execute(action, args, target) {
    const cliArgs = [
      '--yes',
      '--package',
      CLI_PACKAGE,
      'tcb',
      '--json',
      '--env-id',
      target.envId,
      '--region',
      target.region,
      ...args,
    ];
    const result = this.spawn('npx', cliArgs, {
      cwd: this.cwd,
      encoding: 'utf8',
      shell: false,
      maxBuffer: 2 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      throw new CliError(action, cliFailureSummary(result, action), result.status ?? 1);
    }
    return parseCliJson(result.stdout, action);
  }

  api(action, body, target) {
    const parsed = this.execute(
      action,
      ['api', 'tcb', action, '--api-version', API_VERSION, '--body', JSON.stringify(body)],
      target,
    );
    const envelopeError =
      parsed.Error ?? parsed.error ?? parsed.Response?.Error ?? parsed.data?.Error;
    if (envelopeError || parsed.success === false || parsed.data?.success === false) {
      const code = envelopeError?.Code ?? envelopeError?.code ?? parsed.code ?? 'CloudApiError';
      const message =
        envelopeError?.Message ??
        envelopeError?.message ??
        parsed.message ??
        'Cloud API 返回业务错误';
      throw new CliError(action, errorSummary(`${code}: ${message}`), 1);
    }
    const response = parsed.data ?? parsed.Response;
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      throw new CliError(action, 'CLI JSON 缺少 data/Response 业务响应', 1);
    }
    if (response.Error || response.error) {
      const error = response.Error ?? response.error;
      throw new CliError(
        action,
        errorSummary(
          `${error.Code ?? error.code ?? 'CloudApiError'}: ${error.Message ?? error.message ?? '未知错误'}`,
        ),
        1,
      );
    }
    if (typeof response.RequestId !== 'string' || response.RequestId.length === 0) {
      throw new CliError(action, '业务响应缺少 RequestId，不能判定成功', 1);
    }
    this.records ??= [];
    this.records.push({ action, requestId: response.RequestId });
    return response;
  }
}

function normalizeDirection(value) {
  const number = Number(value);
  return number === -1 ? -1 : number === 1 ? 1 : value;
}

function actualIndex(index) {
  return {
    name: index.Name,
    keys: (index.Keys ?? []).map((key) => [key.Name, normalizeDirection(key.Direction)]),
    unique: Boolean(index.Unique),
  };
}

function sameIndex(left, right) {
  return (
    left.name === right.name &&
    left.unique === right.unique &&
    JSON.stringify(left.keys) === JSON.stringify(right.keys)
  );
}

function normalizeRule(rule) {
  if (typeof rule === 'string') {
    try {
      return JSON.parse(rule);
    } catch {
      return rule;
    }
  }
  return rule;
}

function sameRule(response) {
  const rule = normalizeRule(response.Rule);
  return (
    response.AclTag === 'CUSTOM' &&
    rule !== null &&
    typeof rule === 'object' &&
    Object.keys(rule).sort().join(',') === 'read,write' &&
    rule.read === false &&
    rule.write === false
  );
}

function unwrapRunData(response) {
  const first = response.Data?.[0];
  if (first === undefined) return undefined;
  if (typeof first !== 'string') return first;
  try {
    return JSON.parse(first);
  } catch {
    throw new CliError('读取演示活动', 'RunCommands 返回了无法解析的数据', 1);
  }
}

function decodeExtendedJson(value) {
  if (Array.isArray(value)) return value.map(decodeExtendedJson);
  if (!value || typeof value !== 'object') return value;
  if ('$numberInt' in value || '$numberLong' in value || '$numberDouble' in value) {
    return Number(value.$numberInt ?? value.$numberLong ?? value.$numberDouble);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, decodeExtendedJson(child)]),
  );
}

function findDocuments(payload) {
  if (!payload) return [];
  const documents = Array.isArray(payload)
    ? payload
    : (payload.cursor?.firstBatch ?? payload.firstBatch ?? payload.documents ?? payload.data ?? []);
  return documents.map((document) => {
    if (typeof document !== 'string') return decodeExtendedJson(document);
    try {
      return decodeExtendedJson(JSON.parse(document));
    } catch {
      throw new CliError('读取演示活动', 'RunCommands 文档数据无法解析', 1);
    }
  });
}

export function extendedDate(date) {
  return { $date: { $numberLong: String(date.getTime()) } };
}

export function createDemoActivity(now = new Date()) {
  const signupDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const eventStart = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const eventEnd = new Date(eventStart.getTime() + 4 * 60 * 60 * 1000);
  const timestamp = extendedDate(now);
  return {
    _id: DEMO_ID,
    title: 'CloudBase Bootstrap 演示骑行活动',
    cover_image: '',
    description: '由可审计 bootstrap 创建的非敏感演示活动。',
    schedule: [],
    route: {
      start: '演示起点',
      end: '演示终点',
      distance_km: 20,
      elevation_m: 0,
      level: '休闲',
      gpx_file_id: '',
    },
    notices: ['请遵守交通规则'],
    equipment: ['头盔'],
    fee: { included: [], excluded: [], remark: '无在线支付' },
    capacity: 20,
    occupied_count: 0,
    signup_deadline: extendedDate(signupDeadline),
    event_start: extendedDate(eventStart),
    event_end: extendedDate(eventEnd),
    status: 'published',
    is_deleted: false,
    created_by: 'system:bootstrap',
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function dateMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? undefined : millis;
  }
  const raw = value?.$date?.$numberLong ?? value?.$date;
  const millis = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : undefined;
  return Number.isFinite(millis) ? millis : undefined;
}

export function validateDemo(document) {
  const errors = [];
  const exact = {
    _id: DEMO_ID,
    title: 'CloudBase Bootstrap 演示骑行活动',
    cover_image: '',
    description: '由可审计 bootstrap 创建的非敏感演示活动。',
    capacity: 20,
    occupied_count: 0,
    status: 'published',
    is_deleted: false,
    created_by: 'system:bootstrap',
  };
  const deepExact = {
    schedule: [],
    route: {
      start: '演示起点',
      end: '演示终点',
      distance_km: 20,
      elevation_m: 0,
      level: '休闲',
      gpx_file_id: '',
    },
    notices: ['请遵守交通规则'],
    equipment: ['头盔'],
    fee: { included: [], excluded: [], remark: '无在线支付' },
  };
  for (const [field, expected] of Object.entries(exact)) {
    if (document?.[field] !== expected) errors.push(`${field} 应为 ${JSON.stringify(expected)}`);
  }
  for (const [field, expected] of Object.entries(deepExact)) {
    if (JSON.stringify(document?.[field]) !== JSON.stringify(expected)) {
      errors.push(`${field} 与 bootstrap 定义不一致`);
    }
  }
  const deadline = dateMillis(document?.signup_deadline);
  const start = dateMillis(document?.event_start);
  const end = dateMillis(document?.event_end);
  if ([deadline, start, end].some((value) => value === undefined)) {
    errors.push('signup_deadline/event_start/event_end 必须为 Date/BSON Extended JSON');
  } else {
    if (start - deadline !== 7 * 24 * 60 * 60 * 1000) errors.push('开始时间必须比报名截止晚 7 天');
    if (end - start !== 4 * 60 * 60 * 1000) errors.push('结束时间必须比开始时间晚 4 小时');
  }
  const createdAt = dateMillis(document?.created_at);
  const updatedAt = dateMillis(document?.updated_at);
  if (createdAt === undefined || updatedAt === undefined)
    errors.push('created_at/updated_at 必须为 Date/BSON Extended JSON');
  return errors;
}

async function listTables(runner, target) {
  const names = [];
  let offset = 0;
  for (;;) {
    const response = await runner.api(
      'ListTables',
      { EnvId: target.envId, MgoLimit: 1000, MgoOffset: offset },
      target,
    );
    const tables = response.Tables ?? [];
    names.push(...tables.map((table) => table.TableName).filter(Boolean));
    if (tables.length < 1000) break;
    offset += tables.length;
  }
  return new Set(names);
}

async function readDemo(runner, target) {
  const command = {
    find: 'activities',
    filter: { _id: DEMO_ID },
    limit: 1,
  };
  const response = await runner.api(
    'RunCommands',
    {
      EnvId: target.envId,
      MgoCommands: [
        { TableName: 'activities', CommandType: 'QUERY', Command: JSON.stringify(command) },
      ],
    },
    target,
  );
  return findDocuments(unwrapRunData(response))[0];
}

export async function inspectState(runner, target) {
  const tables = await listTables(runner, target);
  const state = { tables, indexes: new Map(), rules: new Map(), demo: undefined };
  for (const collection of COLLECTIONS) {
    if (!tables.has(collection)) continue;
    const [table, rule] = await Promise.all([
      runner.api('DescribeTable', { EnvId: target.envId, TableName: collection }, target),
      runner.api(
        'DescribeSafeRule',
        { EnvId: target.envId, CollectionName: collection, WxAppId: target.wxAppId },
        target,
      ),
    ]);
    state.indexes.set(collection, (table.Indexes ?? []).map(actualIndex));
    state.rules.set(collection, rule);
  }
  if (tables.has('activities')) state.demo = await readDemo(runner, target);
  return state;
}

export function buildPlan(state) {
  const actions = [];
  const conflicts = [];
  for (const collection of COLLECTIONS) {
    if (!state.tables.has(collection)) {
      actions.push({ type: 'create_collection', collection });
    }
    const rule = state.rules.get(collection);
    if (!rule || !sameRule(rule)) actions.push({ type: 'set_rule', collection });
  }
  for (const expected of INDEXES) {
    const indexes = state.indexes.get(expected.collection) ?? [];
    const named = indexes.find((index) => index.name === expected.name);
    if (!named)
      actions.push({ type: 'create_index', collection: expected.collection, index: expected });
    else if (!sameIndex(named, expected)) {
      conflicts.push({
        collection: expected.collection,
        index: expected.name,
        reason: '同名索引定义不一致',
      });
    }
  }
  if (!state.tables.has('activities') || !state.demo) {
    actions.push({ type: 'insert_demo', collection: 'activities', id: DEMO_ID });
  } else {
    for (const reason of validateDemo(state.demo)) {
      conflicts.push({ collection: 'activities', id: DEMO_ID, reason });
    }
  }
  return { actions, conflicts };
}

function createIndexPayload(index) {
  return {
    IndexName: index.name,
    MgoKeySchema: {
      MgoIndexKeys: index.keys.map(([Name, direction]) => ({ Name, Direction: String(direction) })),
      MgoIsUnique: index.unique,
      MgoIsSparse: false,
    },
  };
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitUntilVisible(
  description,
  check,
  { timeoutMs = 30_000, intervalMs = 1_000, wait = sleep } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  for (;;) {
    try {
      if (await check()) return;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) {
      const detail = lastError ? `；最后错误：${errorSummary(lastError.message)}` : '';
      throw new CliError(description, `写后 ${timeoutMs}ms 内仍不可见${detail}`, 1);
    }
    await wait(intervalMs);
  }
}

export async function applyPlan(runner, target, plan, now = new Date(), polling = {}) {
  if (plan.conflicts.length) throw new Error('存在冲突，已阻止 apply');
  const applied = [];
  for (const action of plan.actions) {
    let response;
    if (action.type === 'create_collection') {
      response = await runner.api(
        'CreateTable',
        {
          EnvId: target.envId,
          TableName: action.collection,
          PermissionInfo: { EnvId: target.envId, AclTag: 'ADMINONLY' },
        },
        target,
      );
      await waitUntilVisible(
        `等待集合 ${action.collection}`,
        async () => (await listTables(runner, target)).has(action.collection),
        polling,
      );
    } else if (action.type === 'set_rule') {
      response = await runner.api(
        'ModifySafeRule',
        {
          EnvId: target.envId,
          CollectionName: action.collection,
          AclTag: 'CUSTOM',
          Rule: JSON.stringify(DENY_RULE),
        },
        target,
      );
      await waitUntilVisible(
        `等待权限 ${action.collection}`,
        async () =>
          sameRule(
            await runner.api(
              'DescribeSafeRule',
              {
                EnvId: target.envId,
                CollectionName: action.collection,
                WxAppId: target.wxAppId,
              },
              target,
            ),
          ),
        polling,
      );
    } else if (action.type === 'create_index') {
      response = await runner.api(
        'UpdateTable',
        {
          EnvId: target.envId,
          TableName: action.collection,
          CreateIndexes: [createIndexPayload(action.index)],
        },
        target,
      );
      await waitUntilVisible(
        `等待索引 ${action.collection}.${action.index.name}`,
        async () => {
          const table = await runner.api(
            'DescribeTable',
            { EnvId: target.envId, TableName: action.collection },
            target,
          );
          const named = (table.Indexes ?? [])
            .map(actualIndex)
            .find((index) => index.name === action.index.name);
          if (named && !sameIndex(named, action.index)) {
            throw new Error('同名索引在写后出现定义冲突');
          }
          return Boolean(named);
        },
        polling,
      );
    } else if (action.type === 'insert_demo') {
      const command = { insert: 'activities', documents: [createDemoActivity(now)], ordered: true };
      response = await runner.api(
        'RunCommands',
        {
          EnvId: target.envId,
          MgoCommands: [
            { TableName: 'activities', CommandType: 'INSERT', Command: JSON.stringify(command) },
          ],
        },
        target,
      );
      await waitUntilVisible(
        `等待演示活动 ${DEMO_ID}`,
        async () => {
          const document = await readDemo(runner, target);
          return Boolean(document) && validateDemo(document).length === 0;
        },
        polling,
      );
    }
    applied.push({ ...action, requestId: response.RequestId });
  }
  return applied;
}

export function verifyState(state) {
  const failures = [];
  for (const collection of COLLECTIONS) {
    if (!state.tables.has(collection)) failures.push(`${collection}: 集合缺失`);
    else if (!sameRule(state.rules.get(collection) ?? {}))
      failures.push(`${collection}: 客户端规则不是 CUSTOM 全拒绝`);
  }
  for (const expected of INDEXES) {
    const named = (state.indexes.get(expected.collection) ?? []).find(
      (index) => index.name === expected.name,
    );
    if (!named) failures.push(`${expected.collection}.${expected.name}: 索引缺失`);
    else if (!sameIndex(named, expected))
      failures.push(`${expected.collection}.${expected.name}: 索引定义不一致`);
  }
  if (!state.demo) failures.push(`activities.${DEMO_ID}: 演示活动缺失`);
  else
    failures.push(...validateDemo(state.demo).map((reason) => `activities.${DEMO_ID}: ${reason}`));
  return failures;
}

function publicAction(action) {
  const base = { action: action.type, collection: action.collection };
  if (action.index) base.index = action.index.name;
  if (action.id) base.id = action.id;
  if (action.requestId) base.requestId = action.requestId;
  return base;
}

export function printSummary(summary, output = console.log) {
  output(JSON.stringify(summary, null, 2));
}

export async function runBootstrap({
  runner,
  target,
  mode,
  now = new Date(),
  output = console.log,
}) {
  if (mode === 'verify') {
    const failures = verifyState(await inspectState(runner, target));
    const summary = {
      模式: 'verify',
      环境: target.envId,
      地域: target.region,
      通过: failures.length === 0,
      不符合项: failures,
    };
    printSummary(summary, output);
    if (failures.length) throw new Error(`verify 失败，共 ${failures.length} 项不符合`);
    return summary;
  }

  const plan = buildPlan(await inspectState(runner, target));
  const planSummary = {
    模式: 'plan',
    环境: target.envId,
    地域: target.region,
    只读: mode !== 'apply',
    动作: plan.actions.map(publicAction),
    冲突: plan.conflicts,
  };
  printSummary(planSummary, output);
  if (plan.conflicts.length) throw new Error(`plan 存在 ${plan.conflicts.length} 个冲突，禁止继续`);
  if (mode === 'plan') return planSummary;

  const applied = await applyPlan(runner, target, plan, now);
  printSummary({ 模式: 'apply', 环境: target.envId, 已执行: applied.map(publicAction) }, output);
  const failures = verifyState(await inspectState(runner, target));
  const verifySummary = {
    模式: 'verify',
    环境: target.envId,
    地域: target.region,
    通过: failures.length === 0,
    不符合项: failures,
  };
  printSummary(verifySummary, output);
  if (failures.length) throw new Error(`apply 后 verify 失败，共 ${failures.length} 项不符合`);
  return verifySummary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const config = JSON.parse(readFileSync(new URL('../cloudbaserc.json', import.meta.url), 'utf8'));
  const projectConfig = JSON.parse(
    readFileSync(new URL('../project.config.json', import.meta.url), 'utf8'),
  );
  const target = { ...resolveTarget(config, options), wxAppId: projectConfig.appid };
  await runBootstrap({ runner: new CloudBaseCliRunner(), target, mode: options.mode });
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        模式: 'error',
        动作: error.action ?? 'bootstrap',
        错误: errorSummary(error.message),
      }),
    );
    process.exitCode = 1;
  });
}
