#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nosqlCommandArgs, parseNosqlDocuments } from './cloudbase-club-application-smoke.mjs';

const require = createRequire(import.meta.url);
const {
  createActivityId,
  saveActivity,
  deleteActivity,
} = require('../cloudfunctions/activity-admin/use-cases.js');
const {
  assertProfileReady,
  registrationId,
} = require('../cloudfunctions/registration/domain/domain.js');
const {
  submitRegistration,
  cancelRegistration,
} = require('../cloudfunctions/registration/domain/use-cases.js');

export const SMOKE_PREFIX = 'cili_activity_flow_smoke_';
export const WRITE_GATE = 'activity-flow-write';
export const CONFIRM_PHRASE = 'I_UNDERSTAND_ACTIVITY_FLOW_WRITES_REAL_DATA';
export const REQUIRED_FUNCTIONS = ['activity-admin', 'registration', 'admin-review'];
const OCCUPYING_STATUSES = new Set(['pending', 'approved', 'checked_in', 'waiting']);

const hash = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

function assert(condition, message) {
  if (!condition) throw new Error(`活动全流程 smoke 断言失败：${message}`);
}

function command(table, type, value) {
  return { TableName: table, CommandType: type, Command: JSON.stringify(value) };
}

export function activityFlowIds(runId, adminOpenid, registrantOpenid) {
  const suffix = hash(runId).slice(0, 20);
  const createRequestId = `${SMOKE_PREFIX}create_${suffix}`;
  const activityId = createActivityId(adminOpenid, createRequestId);
  return {
    suffix,
    createRequestId,
    activityId,
    registrationId: registrationId(activityId, registrantOpenid),
  };
}

export function assertWriteGate({ env = process.env, envId, configuredEnvId, confirm }) {
  if (env.CILI_ALLOW_PRODUCTION_SMOKE !== WRITE_GATE)
    throw new Error(`拒绝真实写入：必须显式设置 CILI_ALLOW_PRODUCTION_SMOKE=${WRITE_GATE}`);
  if (!envId || env.CILI_SMOKE_ENV_ID !== envId || configuredEnvId !== envId)
    throw new Error('拒绝真实写入：命令环境、CILI_SMOKE_ENV_ID 与 cloudbaserc 环境必须三方一致');
  if (confirm !== CONFIRM_PHRASE)
    throw new Error(`拒绝真实写入：确认短语必须精确为 ${CONFIRM_PHRASE}`);
}

export function functionDetailProbeArgs(envId, functionName) {
  return [
    '--yes',
    '--package',
    '@cloudbase/cli@3.8.4',
    'tcb',
    '-e',
    envId,
    'fn',
    'detail',
    functionName,
    '--json',
  ];
}

function collectDetails(value, output = [], seen = new Set()) {
  if (typeof value === 'string') {
    try {
      collectDetails(JSON.parse(value), output, seen);
    } catch {
      // 普通字符串不是嵌套 JSON。
    }
    return output;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  const name = value.FunctionName ?? value.functionName ?? value.name;
  const status = value.Status ?? value.status;
  if (name !== undefined) output.push({ name, status });
  for (const nested of Object.values(value)) collectDetails(nested, output, seen);
  return output;
}

function collectEnvIds(value, output = [], seen = new Set()) {
  if (typeof value === 'string') {
    try {
      collectEnvIds(JSON.parse(value), output, seen);
    } catch {
      // 普通字符串不是嵌套 JSON。
    }
    return output;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  const envId = value.EnvironmentId ?? value.environmentId ?? value.EnvId ?? value.envId;
  if (envId !== undefined) output.push(envId);
  for (const nested of Object.values(value)) collectEnvIds(nested, output, seen);
  return output;
}

export function parseFunctionDetailOutput(output, expectedName, expectedEnvId) {
  let parsed;
  try {
    parsed = typeof output === 'string' ? JSON.parse(output) : output;
  } catch {
    throw new Error(`${expectedName} detail 未返回有效 JSON`);
  }
  const details = collectDetails(parsed);
  if (details.length !== 1) throw new Error(`${expectedName} detail 未返回唯一函数详情`);
  const [detail] = details;
  if (detail.name !== expectedName) throw new Error(`${expectedName} detail 函数名不匹配`);
  if (typeof detail.status !== 'string' || detail.status.toLowerCase() !== 'active')
    throw new Error(`${expectedName} detail 状态不是可服务终态 Active`);
  if (collectEnvIds(parsed).some((envId) => envId !== expectedEnvId))
    throw new Error(`${expectedName} detail 环境不匹配`);
  return detail;
}

export function probeRequiredFunctions({ envId, cwd = process.cwd(), execute = execFileSync }) {
  return REQUIRED_FUNCTIONS.map((functionName) => {
    let output;
    try {
      output = execute('npx', functionDetailProbeArgs(envId, functionName), {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      throw new Error(`${functionName} detail 命令执行失败`);
    }
    return parseFunctionDetailOutput(output, functionName, envId);
  });
}

export function createCliStore({ envId, cwd = process.cwd(), execute = execFileSync }) {
  const invoke = (commands) =>
    execute('npx', nosqlCommandArgs(envId, commands), {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const query = async (collection, filter = {}, limit = 1000) =>
    parseNosqlDocuments(
      invoke([command(collection, 'QUERY', { find: collection, filter, limit })]),
    );
  const get = async (collection, id) =>
    (await query(collection, { _id: id }, 1)).find((item) => item._id === id);
  const put = async (collection, id, value) => {
    const { _id, ...data } = value;
    invoke([
      command(collection, 'UPDATE', {
        update: collection,
        updates: [{ q: { _id: id }, u: { $set: data, $setOnInsert: { _id: id } }, upsert: true }],
      }),
    ]);
  };
  const patch = async (collection, id, data) => {
    invoke([
      command(collection, 'UPDATE', {
        update: collection,
        updates: [{ q: { _id: id }, u: { $set: data }, upsert: false }],
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
    get,
    put,
    query,
    removeMany,
    transaction: async (work) => {
      const overlay = new Map();
      const key = (collection, id) => `${collection}\0${id}`;
      const txGet = async (collection, id) =>
        overlay.has(key(collection, id))
          ? clone(overlay.get(key(collection, id)))
          : get(collection, id);
      const txPut = async (collection, id, value) => {
        await put(collection, id, value);
        overlay.set(key(collection, id), clone(value));
      };
      const byActivity = async (status, activityId) =>
        (await query('registrations', { activity_id: activityId, status })).map(clone);
      return work({
        getAdmin: (id) => txGet('admins', id),
        getProfile: (id) => txGet('profiles', id),
        getActivity: (id) => txGet('activities', id),
        getRegistration: (id) => txGet('registrations', id),
        getClub: (id) => txGet('clubs', id),
        getActiveClubMembership: async (clubId, openid) =>
          (await query('club_memberships', { club_id: clubId, openid, status: 'active' }, 1))[0],
        listActiveRegistrations: async (activityId) =>
          (
            await Promise.all(
              [...OCCUPYING_STATUSES].map((status) => byActivity(status, activityId)),
            )
          ).flat(),
        getOccupyingRegistrations: async (activityId) =>
          (
            await Promise.all(
              [...OCCUPYING_STATUSES].map((status) => byActivity(status, activityId)),
            )
          ).flat(),
        getTeamLeader: async (activityId, teamId) =>
          (
            await query(
              'registrations',
              { activity_id: activityId, team_id: teamId, is_team_leader: true },
              1,
            )
          )[0],
        listWaiting: (activityId) => byActivity('waiting', activityId),
        getRoutePreviewById: (id) => txGet('route_previews', id),
        consumeRoutePreview: (id, activityId, consumedAt) =>
          patch('route_previews', id, {
            attached_activity_id: activityId,
            consumed_at: consumedAt,
            updated_at: consumedAt,
          }),
        getProfileMediaByCanonical: async (fileId, ownerOpenid, category) =>
          (
            await query(
              'profile_media',
              { canonical_file_id: fileId, owner_openid: ownerOpenid, category },
              2,
            )
          )[0],
        activateProfileMedia: (id, referencedAt) =>
          patch('profile_media', id, {
            status: 'active',
            referenced_at: referencedAt,
            cleanup_after: null,
          }),
        createActivityId: async () => {
          throw new Error('smoke 创建活动必须使用确定性 createRequestId');
        },
        putActivity: (id, value) => txPut('activities', id, value),
        updateActivity: async (id, data) => {
          const current = await txGet('activities', id);
          await txPut('activities', id, { ...current, ...data, _id: id });
        },
        putRegistration: (id, value) => txPut('registrations', id, value),
        deleteRegistration: (id) => removeMany('registrations', { _id: id }),
        putNotification: (id, value) => txPut('notification_outbox', id, value),
        setOccupied: async (id, occupied, supportVehicleOccupied, selfDriveOccupied) => {
          const current = await txGet('activities', id);
          await txPut('activities', id, {
            ...current,
            occupied_count: occupied,
            ...(supportVehicleOccupied === undefined
              ? {}
              : { support_vehicle_occupied_count: supportVehicleOccupied }),
            ...(selfDriveOccupied === undefined
              ? {}
              : { self_drive_occupied_count: selfDriveOccupied }),
            updated_at: new Date(),
          });
        },
        addAudit: async (value) => {
          auditSequence += 1;
          const id = `${SMOKE_PREFIX}audit_${hash(`${value.target_id}\0${value.action}\0${auditSequence}`).slice(0, 32)}`;
          await txPut('audit_logs', id, { _id: id, ...value, smoke_test: true });
        },
      });
    },
  };
}

function profileIsReady(profile) {
  try {
    assertProfileReady(profile);
    return true;
  } catch {
    return false;
  }
}

export async function selectSmokeIdentities(store) {
  const admins = (await store.query('admins', {}, 1000))
    .filter(
      (admin) => admin && typeof admin._id === 'string' && admin._id && admin.enabled !== false,
    )
    .sort((left, right) => left._id.localeCompare(right._id));
  if (!admins.length) throw new Error('拒绝执行：没有可用的已启用管理员身份');
  const profiles = (await store.query('profiles', {}, 1000))
    .filter((profile) => profile && typeof profile._id === 'string' && profileIsReady(profile))
    .sort((left, right) => left._id.localeCompare(right._id));
  const adminIds = new Set(admins.map((admin) => admin._id));
  const admin = admins.find((candidate) =>
    profiles.some((profile) => profile._id === candidate._id),
  );
  if (!admin) throw new Error('拒绝执行：没有同时具备完整 profile 的已启用管理员身份');
  const registrant =
    profiles.find((profile) => profile._id === admin._id) ||
    profiles.find((profile) => !adminIds.has(profile._id));
  if (!registrant) throw new Error('拒绝执行：没有可用于报名的完整 profile 身份');
  return { adminOpenid: admin._id, registrantOpenid: registrant._id };
}

function activityInput({ title, status, now }) {
  const deadline = new Date(now.getTime() + 7 * 86400000);
  const start = new Date(now.getTime() + 8 * 86400000);
  const end = new Date(start.getTime() + 4 * 3600000);
  return {
    title,
    images: [],
    cover_image: '',
    description: '真实 CloudBase 活动全流程 smoke 隔离数据，可按固定标题前缀识别。',
    schedule: [{ time: '08:00', title: '集合', location: 'smoke 起点' }],
    route: { start: 'smoke 起点', end: '', distance_km: 12, elevation_m: 120, level: '入门' },
    notices: ['仅供自动化 smoke 验证'],
    equipment: ['头盔'],
    fee: '免费 smoke',
    capacity: 2,
    registration_unlimited: false,
    registration_mode: 'open',
    support_vehicle_capacity: 0,
    self_drive_capacity: 2,
    signup_deadline: deadline.toISOString(),
    event_start: start.toISOString(),
    event_end: end.toISOString(),
    status,
  };
}

export async function cleanupFailedSmoke(store, ids) {
  const failures = new Set();
  const targets = [
    ['notification_outbox', { aggregate_id: ids.registrationId }],
    ['audit_logs', { target_id: ids.registrationId }],
    ['audit_logs', { target_id: ids.activityId }],
    ['registrations', { _id: ids.registrationId }],
    ['activities', { _id: ids.activityId }],
  ];
  for (const [collection, filter] of targets) {
    try {
      await store.removeMany(collection, filter);
    } catch {
      failures.add(collection);
    }
  }
  for (const [collection, filter] of targets) {
    try {
      if ((await store.query(collection, filter, 10)).length) failures.add(collection);
    } catch {
      failures.add(collection);
    }
  }
  if (failures.size)
    throw new Error(`补偿未完成，残留或无法回读集合：${[...failures].sort().join(', ')}`);
}

function assertAuditComplete(audits, registrationAction) {
  const actions = new Set(audits.map((item) => item.action));
  for (const action of [
    'activity.create',
    'activity.publish',
    registrationAction,
    'registration.cancelled',
    'activity.unpublish',
    'activity.delete',
  ])
    assert(actions.has(action), `缺少审计 ${action}`);
}

export async function runActivityFlowSmoke({
  store,
  runId,
  now = () => new Date(),
  onStage = () => {},
}) {
  const identities = await selectSmokeIdentities(store);
  const ids = {
    ...activityFlowIds(runId, identities.adminOpenid, identities.registrantOpenid),
    ...identities,
  };
  const title = `${SMOKE_PREFIX}${ids.suffix}`;
  await cleanupFailedSmoke(store, ids);
  try {
    const draftInput = activityInput({ title, status: 'draft', now: now() });
    const draft = await saveActivity(
      store,
      {
        openid: ids.adminOpenid,
        createRequestId: ids.createRequestId,
        activity: draftInput,
      },
      now(),
    );
    assert(
      draft.status === 'draft' && draft.route.start && draft.route.end === '',
      '隔离 draft 与仅起点路线',
    );
    onStage('draft');

    const published = await saveActivity(
      store,
      {
        openid: ids.adminOpenid,
        activityId: ids.activityId,
        expectedVersion: draft.version,
        activity: { ...draftInput, status: 'published' },
      },
      now(),
    );
    assert(published.status === 'published', '发布阶段');
    onStage('published');

    const readback = await store.get('activities', ids.activityId);
    assert(readback?.status === 'published' && readback?.title === title, '发布后真实回读');
    onStage('readback');

    const registration = await submitRegistration(
      store,
      {
        openid: ids.registrantOpenid,
        activityId: ids.activityId,
        options: {
          gathering_mode: 'self_drive',
          experience: 'regular',
          remark: `${SMOKE_PREFIX}registration`,
        },
        team: {},
      },
      now(),
    );
    assert(['pending', 'approved'].includes(registration.status), '报名提交');
    const registrationAction =
      registration.status === 'approved'
        ? 'registration.open_auto_approved'
        : 'registration.submitted';
    onStage('registered');

    const cancelled = await cancelRegistration(
      store,
      {
        openid: ids.registrantOpenid,
        registrationId: ids.registrationId,
      },
      now(),
    );
    assert(cancelled.status === 'cancelled', '取消报名');
    onStage('cancelled');

    const current = await store.get('activities', ids.activityId);
    const draftAgain = await saveActivity(
      store,
      {
        openid: ids.adminOpenid,
        activityId: ids.activityId,
        expectedVersion: current.version,
        reason: '活动全流程 smoke 完成，准备逻辑删除',
        activity: { ...draftInput, status: 'draft' },
      },
      now(),
    );
    assert(draftAgain.status === 'draft', '删除前按领域规则下架');
    await deleteActivity(
      store,
      {
        openid: ids.adminOpenid,
        activityId: ids.activityId,
        reason: '活动全流程 smoke 逻辑删除验证',
      },
      now(),
    );
    onStage('deleted');

    const [finalActivity, finalRegistration, occupying, activityAudits, registrationAudits] =
      await Promise.all([
        store.get('activities', ids.activityId),
        store.get('registrations', ids.registrationId),
        Promise.all(
          [...OCCUPYING_STATUSES].map((status) =>
            store.query('registrations', { activity_id: ids.activityId, status }, 10),
          ),
        ).then((pages) => pages.flat()),
        store.query('audit_logs', { target_id: ids.activityId }, 100),
        store.query('audit_logs', { target_id: ids.registrationId }, 100),
      ]);
    assert(
      finalActivity?.is_deleted === true && finalActivity?.status === 'draft',
      '最终活动逻辑删除回读',
    );
    assert(finalRegistration?.status === 'cancelled', '最终报名取消回读');
    assert(occupying.length === 0, '最终无占位报名');
    assertAuditComplete([...activityAudits, ...registrationAudits], registrationAction);
    onStage('verified');
    const auditCount = activityAudits.length + registrationAudits.length;
    await cleanupFailedSmoke(store, ids);
    onStage('cleaned');

    return { stages: 8, auditCount, ids, cleaned: true };
  } catch (error) {
    try {
      await cleanupFailedSmoke(store, ids);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], '活动全流程 smoke 失败且补偿未完成', {
        cause: cleanupError,
      });
    }
    throw error;
  }
}

function parseArgs(argv) {
  const options = { envId: '', runId: '', confirm: '' };
  const mapping = { '--env-id': 'envId', '--run-id': 'runId', '--confirm': 'confirm' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = mapping[argv[index]];
    if (!key) throw new Error(`未知参数：${argv[index]}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${argv[index]} 缺少值`);
    options[key] = value;
    index += 1;
  }
  if (!/^[A-Za-z0-9._-]{6,128}$/.test(options.runId)) throw new Error('run id 无效');
  return options;
}

export async function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  const configuredEnvId = require(resolve(cwd, 'cloudbaserc.json')).envId;
  assertWriteGate({ ...options, configuredEnvId });
  probeRequiredFunctions({ envId: options.envId, cwd });
  const result = await runActivityFlowSmoke({
    store: createCliStore({ envId: options.envId, cwd }),
    runId: options.runId,
  });
  console.log(
    `活动全流程真实 CloudBase smoke 通过：${result.stages} 个阶段，${result.auditCount} 条审计，隔离数据已清理`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch((error) => {
    console.error(
      error instanceof AggregateError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error),
    );
    process.exitCode = 1;
  });
}
