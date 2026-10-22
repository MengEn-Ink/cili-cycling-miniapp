import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CONFIRM_PHRASE,
  REQUIRED_FUNCTIONS,
  SMOKE_PREFIX,
  WRITE_GATE,
  activityFlowIds,
  assertWriteGate,
  checkIsolatedSmokeText,
  cleanupFailedSmoke,
  functionDetailProbeArgs,
  parseFunctionDetailOutput,
  probeRequiredFunctions,
  runActivityFlowSmoke,
  selectSmokeIdentities,
} from './cloudbase-activity-flow-smoke.mjs';

function readyProfile(id) {
  return {
    _id: id,
    nickname: `骑友-${id}`,
    gender: '男',
    avatar_file_id: `cloud://test/profile/${id}.jpg`,
    emergency_name: '紧急联系人',
    sensitive_status: { real_name: true, phone_verified: true, emergency_phone: true },
    real_name_masked: '测*',
    phone_masked: '138****0000',
    phone_verified: true,
    emergency_phone_masked: '139****0000',
  };
}

function matches(item, filter) {
  return Object.entries(filter).every(([key, value]) => item?.[key] === value);
}

function createMemoryStore({ withAdminProfile = true, withNormalProfile = true } = {}) {
  const collections = Object.fromEntries(
    [
      'admins',
      'profiles',
      'activities',
      'registrations',
      'audit_logs',
      'notification_outbox',
      'clubs',
      'club_memberships',
      'route_previews',
      'profile_media',
    ].map((name) => [name, new Map()]),
  );
  collections.admins.set('admin-ready', { _id: 'admin-ready', enabled: true });
  if (withAdminProfile) collections.profiles.set('admin-ready', readyProfile('admin-ready'));
  if (withNormalProfile) collections.profiles.set('rider-ready', readyProfile('rider-ready'));
  let auditSequence = 0;
  const get = async (name, id) => structuredClone(collections[name].get(id));
  const put = async (name, id, value) => collections[name].set(id, structuredClone(value));
  const query = async (name, filter = {}) =>
    [...collections[name].values()]
      .filter((item) => matches(item, filter))
      .map((item) => structuredClone(item));
  const removeMany = async (name, filter) => {
    for (const [id, item] of collections[name])
      if (matches(item, filter)) collections[name].delete(id);
  };
  const store = {
    collections,
    msgSecCheck: checkIsolatedSmokeText,
    get,
    put,
    query,
    removeMany,
    transaction: async (work) =>
      work({
        getAdmin: (id) => get('admins', id),
        getProfile: (id) => get('profiles', id),
        getActivity: (id) => get('activities', id),
        getRegistration: (id) => get('registrations', id),
        getClub: (id) => get('clubs', id),
        getActiveClubMembership: async () => undefined,
        listActiveRegistrations: async (activityId) =>
          (await query('registrations', { activity_id: activityId })).filter((item) =>
            ['pending', 'approved', 'checked_in', 'waiting'].includes(item.status),
          ),
        getOccupyingRegistrations: async (activityId) =>
          (await query('registrations', { activity_id: activityId })).filter((item) =>
            ['pending', 'approved', 'checked_in', 'waiting'].includes(item.status),
          ),
        getTeamLeader: async () => undefined,
        listWaiting: (activityId) =>
          query('registrations', { activity_id: activityId, status: 'waiting' }),
        getRoutePreviewById: async () => undefined,
        consumeRoutePreview: async () => {},
        getProfileMediaByCanonical: async () => undefined,
        activateProfileMedia: async () => {},
        createActivityId: async () => {
          throw new Error('unexpected random activity id');
        },
        putActivity: (id, value) => put('activities', id, value),
        updateActivity: async (id, data) =>
          put('activities', id, { ...(await get('activities', id)), ...data, _id: id }),
        putRegistration: (id, value) => put('registrations', id, value),
        deleteRegistration: (id) => collections.registrations.delete(id),
        putNotification: (id, value) => put('notification_outbox', id, value),
        setOccupied: async (id, occupied, supportVehicleOccupied, selfDriveOccupied) => {
          const current = await get('activities', id);
          await put('activities', id, {
            ...current,
            occupied_count: occupied,
            ...(supportVehicleOccupied === undefined
              ? {}
              : { support_vehicle_occupied_count: supportVehicleOccupied }),
            ...(selfDriveOccupied === undefined
              ? {}
              : { self_drive_occupied_count: selfDriveOccupied }),
          });
        },
        addAudit: async (audit) => {
          auditSequence += 1;
          const id = `${SMOKE_PREFIX}audit_${auditSequence}`;
          await put('audit_logs', id, { _id: id, ...audit, smoke_test: true });
        },
      }),
  };
  return store;
}

const fixedNow = () => new Date('2026-10-21T00:00:00.000Z');

function smokeRecords(store) {
  return ['activities', 'registrations', 'audit_logs', 'notification_outbox'].flatMap((name) => [
    ...store.collections[name].values(),
  ]);
}

test('真实写入三重门禁：固定 gate、环境三方一致、确认短语均不可省略', () => {
  const base = { envId: 'env-prod', configuredEnvId: 'env-prod', confirm: CONFIRM_PHRASE };
  const env = { CILI_ALLOW_PRODUCTION_SMOKE: WRITE_GATE, CILI_SMOKE_ENV_ID: 'env-prod' };
  assert.throws(() => assertWriteGate({ ...base, env: {} }), /必须显式设置/);
  assert.throws(
    () => assertWriteGate({ ...base, env: { ...env, CILI_SMOKE_ENV_ID: 'other' } }),
    /三方一致/,
  );
  assert.throws(() => assertWriteGate({ ...base, env, confirm: 'yes' }), /确认短语/);
  assert.doesNotThrow(() => assertWriteGate({ ...base, env }));
});

test('部署探针逐一要求 activity-admin、registration、admin-review 为 Active', () => {
  const calls = [];
  const result = probeRequiredFunctions({
    envId: 'env-prod',
    execute: (file, args) => {
      calls.push([file, args]);
      const name = args.at(-2);
      return JSON.stringify({
        Response: {
          Data: JSON.stringify({ FunctionName: name, Status: 'Active', EnvironmentId: 'env-prod' }),
        },
      });
    },
  });
  assert.deepEqual(
    result.map((item) => item.name),
    REQUIRED_FUNCTIONS,
  );
  assert.deepEqual(
    calls.map(([, args]) => args),
    REQUIRED_FUNCTIONS.map((name) => functionDetailProbeArgs('env-prod', name)),
  );
  assert.throws(
    () =>
      parseFunctionDetailOutput(
        JSON.stringify({ FunctionName: 'registration', Status: 'Updating' }),
        'registration',
        'env-prod',
      ),
    /Active/,
  );
});

test('完整成功阶段：draft 仅 route.start，随后发布、回读、报名、取消、软删与最终回读', async () => {
  const store = createMemoryStore();
  const stages = [];
  const result = await runActivityFlowSmoke({
    store,
    runId: 'node-success-001',
    now: fixedNow,
    onStage: (stage) => stages.push(stage),
  });
  assert.deepEqual(stages, [
    'draft',
    'published',
    'readback',
    'registered',
    'cancelled',
    'deleted',
    'verified',
    'cleaned',
  ]);
  assert.equal(result.stages, 8);
  assert.equal(result.cleaned, true);
  assert.ok(result.auditCount >= 6);
  assert.equal(await store.get('activities', result.ids.activityId), undefined);
  assert.equal(await store.get('registrations', result.ids.registrationId), undefined);
  assert.equal(
    (await store.query('audit_logs', { target_id: result.ids.activityId }, 10)).length,
    0,
  );
  assert.equal(
    (await store.query('audit_logs', { target_id: result.ids.registrationId }, 10)).length,
    0,
  );
});

test('中途故障执行 best-effort 补偿，清理活动、报名、审计与通知', async () => {
  const store = createMemoryStore();
  await assert.rejects(
    runActivityFlowSmoke({
      store,
      runId: 'node-failure-001',
      now: fixedNow,
      onStage: (stage) => {
        if (stage === 'registered') throw new Error('injected stage failure');
      },
    }),
    /injected stage failure/,
  );
  assert.deepEqual(smokeRecords(store), []);
});

test('补偿单项失败仍继续尝试其他集合并报告残留集合', async () => {
  const store = createMemoryStore();
  const ids = activityFlowIds('node-cleanup-001', 'admin-ready', 'admin-ready');
  await store.put('activities', ids.activityId, {
    _id: ids.activityId,
    title: `${SMOKE_PREFIX}leftover`,
  });
  await store.put('registrations', ids.registrationId, {
    _id: ids.registrationId,
    activity_id: ids.activityId,
  });
  const original = store.removeMany;
  store.removeMany = async (name, filter) => {
    if (name === 'activities') throw new Error('injected cleanup failure');
    return original(name, filter);
  };
  await assert.rejects(cleanupFailedSmoke(store, ids), /activities/);
  assert.equal(store.collections.registrations.size, 0);
});

test('无完整管理员 profile 时拒绝，无完整报名身份时也拒绝', async () => {
  const noAdminProfile = createMemoryStore({ withAdminProfile: false });
  await assert.rejects(selectSmokeIdentities(noAdminProfile), /没有同时具备完整 profile/);

  const noRegistrant = createMemoryStore({ withNormalProfile: false });
  noRegistrant.collections.profiles.clear();
  noRegistrant.collections.profiles.set('admin-ready', { _id: 'admin-ready', nickname: '不完整' });
  await assert.rejects(selectSmokeIdentities(noRegistrant), /没有同时具备完整 profile/);
});

test('最终回读异常时阻断并补偿，不把写入成功误报为 smoke 成功', async () => {
  const store = createMemoryStore();
  const ids = activityFlowIds('node-readback-001', 'admin-ready', 'admin-ready');
  const originalGet = store.get;
  let corrupt = false;
  store.get = async (name, id) => {
    if (corrupt && name === 'registrations' && id === ids.registrationId) return undefined;
    return originalGet(name, id);
  };
  await assert.rejects(
    runActivityFlowSmoke({
      store,
      runId: 'node-readback-001',
      now: fixedNow,
      onStage: (stage) => {
        if (stage === 'deleted') corrupt = true;
      },
    }),
    /最终报名取消回读|补偿未完成/,
  );
  corrupt = false;
  assert.deepEqual(smokeRecords(store), []);
});

test('CloudBase workflow 仅在手动选择后执行活动全流程 smoke', () => {
  const workflow = readFileSync('.github/workflows/deploy-cloudbase.yml', 'utf8');
  assert.match(workflow, /run_activity_flow_smoke:/);
  assert.match(workflow, /inputs\.run_activity_flow_smoke == true/);
  assert.match(workflow, /CILI_ALLOW_PRODUCTION_SMOKE: activity-flow-write/);
  assert.match(workflow, /--confirm I_UNDERSTAND_ACTIVITY_FLOW_WRITES_REAL_DATA/);
  assert.match(workflow, /cloudbase:smoke:activity-flow/);
});
