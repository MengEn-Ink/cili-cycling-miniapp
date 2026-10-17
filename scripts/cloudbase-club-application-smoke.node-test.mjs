import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertWriteGate,
  cleanupSmokeData,
  createCliStore,
  functionDetailProbeArgs,
  nosqlCommandArgs,
  parseFunctionDetailOutput,
  parseNosqlDocuments,
  probeClubApplicationDeployment,
  runClubApplicationSmoke,
} from './cloudbase-club-application-smoke.mjs';

function createMemoryStore({ failOnApprovedApplication = false } = {}) {
  const collections = Object.fromEntries(
    ['admins', 'club_applications', 'clubs', 'club_memberships', 'audit_logs'].map((name) => [
      name,
      new Map(),
    ]),
  );
  let audit = 0;
  const get = async (name, id) => collections[name].get(id);
  const put = async (name, id, value) => {
    if (failOnApprovedApplication && name === 'club_applications' && value.status === 'approved')
      throw new Error('injected write failure');
    collections[name].set(id, structuredClone(value));
  };
  const store = {
    collections,
    get,
    put,
    query: async (name, filter) =>
      [...collections[name].values()].filter((item) =>
        Object.entries(filter).every(([key, value]) => item[key] === value),
      ),
    removeMany: async (name, filter) => {
      for (const [id, item] of collections[name]) {
        if (Object.entries(filter).every(([key, value]) => item[key] === value))
          collections[name].delete(id);
      }
    },
    transaction: async (work) =>
      work({
        getAdmin: (id) => get('admins', id),
        getApplication: (id) => get('club_applications', id),
        putApplication: (id, value) => put('club_applications', id, value),
        putClub: (id, value) => put('clubs', id, value),
        putMembership: (id, value) => put('club_memberships', id, value),
        addAudit: (value) => {
          audit += 1;
          return put('audit_logs', `audit-${audit}`, { _id: `audit-${audit}`, ...value });
        },
      }),
  };
  return store;
}

function assertEmpty(store) {
  for (const collection of Object.values(store.collections)) assert.equal(collection.size, 0);
}

test('本地默认禁止误跑且要求环境 ID 四方一致', () => {
  const base = {
    envId: 'env-production',
    confirmEnvId: 'env-production',
    configuredEnvId: 'env-production',
  };
  assert.throws(() => assertWriteGate({ ...base, env: {} }), /拒绝真实写入/);
  assert.throws(
    () =>
      assertWriteGate({
        ...base,
        env: {
          CILI_ALLOW_PRODUCTION_SMOKE: 'club-application-write',
          CILI_SMOKE_ENV_ID: 'other-env',
        },
      }),
    /完全一致/,
  );
  assert.doesNotThrow(() =>
    assertWriteGate({
      ...base,
      env: {
        CILI_ALLOW_PRODUCTION_SMOKE: 'club-application-write',
        CILI_SMOKE_ENV_ID: 'env-production',
      },
    }),
  );
});

test('nosql execute 命令锁定 CLI、环境与 JSON 参数', () => {
  const commands = [{ TableName: 'clubs', CommandType: 'QUERY', Command: '{"find":"clubs"}' }];
  const args = nosqlCommandArgs('env-production', commands);
  assert.deepEqual(args.slice(0, 7), [
    '--yes',
    '--package',
    '@cloudbase/cli@3.8.4',
    'tcb',
    '-e',
    'env-production',
    'db',
  ]);
  assert.equal(args.at(-2), JSON.stringify(commands));
  assert.equal(args.at(-1), '--json');
});

test('部署探针使用 fn detail 并解析真实嵌套函数详情', () => {
  const response = JSON.stringify({
    Response: {
      Data: JSON.stringify({
        FunctionName: 'club-application',
        Status: 'Active',
        EnvironmentId: 'env-production',
      }),
    },
  });
  assert.deepEqual(parseFunctionDetailOutput(response, 'env-production'), {
    name: 'club-application',
    status: 'Active',
  });

  const calls = [];
  assert.deepEqual(
    probeClubApplicationDeployment({
      envId: 'env-production',
      execute: (file, args) => {
        calls.push([file, args]);
        return response;
      },
    }),
    { name: 'club-application', status: 'Active' },
  );
  assert.equal(calls[0][0], 'npx');
  assert.deepEqual(calls[0][1], functionDetailProbeArgs('env-production'));
  assert.deepEqual(calls[0][1].slice(-4), ['fn', 'detail', 'club-application', '--json']);
  assert.ok(!calls[0][1].includes('invoke'));
});

test('部署探针在函数名称错误时阻断', () => {
  assert.throws(
    () =>
      parseFunctionDetailOutput(
        JSON.stringify({ FunctionName: 'other-function', Status: 'Active' }),
        'env-production',
      ),
    /函数名不匹配/,
  );
});

test('部署探针仅接受大小写归一后的 Active 可服务终态', () => {
  assert.deepEqual(
    parseFunctionDetailOutput(
      JSON.stringify({ FunctionName: 'club-application', Status: 'ACTIVE' }),
      'env-production',
    ),
    { name: 'club-application', status: 'ACTIVE' },
  );

  for (const status of [
    'Creating',
    'Updating',
    'Inactive',
    'UnknownFutureStatus',
    'Failed',
    'Deleting',
  ]) {
    assert.throws(
      () =>
        parseFunctionDetailOutput(
          JSON.stringify({ FunctionName: 'club-application', Status: status }),
          'env-production',
        ),
      /可服务终态 Active/,
    );
  }
});

test('部署探针在响应环境漂移时阻断', () => {
  assert.throws(
    () =>
      parseFunctionDetailOutput(
        JSON.stringify({
          envId: 'other-env',
          Response: {
            FunctionName: 'club-application',
            Status: 'Active',
          },
        }),
        'env-production',
      ),
    /环境不匹配/,
  );
});

test('部署探针缺少函数名或状态时阻断', () => {
  assert.throws(() => parseFunctionDetailOutput('{}', 'env-production'), /函数详情/);
  assert.throws(
    () =>
      parseFunctionDetailOutput(
        JSON.stringify({ FunctionName: 'club-application' }),
        'env-production',
      ),
    /缺少函数名或状态/,
  );
});

test('解析 nosql execute 嵌套查询文档', () => {
  const output = JSON.stringify({
    Response: { Data: JSON.stringify([{ Result: { cursor: { firstBatch: [{ _id: 'one' }] } } }]) },
  });
  assert.deepEqual(parseNosqlDocuments(output), [{ _id: 'one' }]);
});

test('CLI store 编排 QUERY/UPDATE/DELETE 且不经 shell', async () => {
  const calls = [];
  const execute = (file, args) => {
    calls.push({ file, args, commands: JSON.parse(args.at(-2)) });
    return JSON.stringify({ firstBatch: [] });
  };
  const store = createCliStore({ envId: 'env-production', execute });
  await store.get('clubs', 'club-1');
  await store.put('clubs', 'club-1', { _id: 'club-1', status: 'active' });
  await store.removeMany('clubs', { _id: 'club-1' });
  assert.deepEqual(
    calls.map(({ commands }) => commands[0].CommandType),
    ['QUERY', 'UPDATE', 'DELETE'],
  );
  assert.ok(calls.every(({ file }) => file === 'npx'));
  assert.equal(JSON.parse(calls[1].commands[0].Command).updates[0].upsert, true);
  assert.equal(JSON.parse(calls[2].commands[0].Command).deletes[0].limit, 0);
});

const cleanupIds = {
  applicationId: 'application-secret-id',
  membershipId: 'membership-secret-id',
  clubId: 'club-secret-id',
  adminOpenid: 'admin-secret-openid',
};

function seedCleanupData(store) {
  store.collections.audit_logs.set('audit-secret-id', {
    _id: 'audit-secret-id',
    target_id: cleanupIds.applicationId,
  });
  store.collections.club_memberships.set(cleanupIds.membershipId, {
    _id: cleanupIds.membershipId,
  });
  store.collections.clubs.set(cleanupIds.clubId, { _id: cleanupIds.clubId });
  store.collections.club_applications.set(cleanupIds.applicationId, {
    _id: cleanupIds.applicationId,
  });
  store.collections.admins.set(cleanupIds.adminOpenid, {
    _id: cleanupIds.adminOpenid,
    smoke_test: true,
  });
}

test('单项删除失败仍继续清理并只按集合名报告残留', async () => {
  const store = createMemoryStore();
  seedCleanupData(store);
  const remove = store.removeMany;
  const attempted = [];
  store.removeMany = async (collection, filter) => {
    attempted.push(collection);
    if (collection === 'audit_logs') throw new Error('injected delete failure');
    return remove(collection, filter);
  };
  await assert.rejects(cleanupSmokeData(store, cleanupIds), (error) => {
    assert.match(error.message, /audit_logs/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  assert.deepEqual(attempted, [
    'audit_logs',
    'club_memberships',
    'clubs',
    'club_applications',
    'admins',
  ]);
  assert.equal(store.collections.club_memberships.size, 0);
  assert.equal(store.collections.clubs.size, 0);
  assert.equal(store.collections.club_applications.size, 0);
  assert.equal(store.collections.admins.size, 0);
});

test('删除静默成功但回读仍有残留时阻断', async () => {
  const store = createMemoryStore();
  seedCleanupData(store);
  const remove = store.removeMany;
  store.removeMany = async (collection, filter) => {
    if (collection === 'clubs') return;
    return remove(collection, filter);
  };
  await assert.rejects(cleanupSmokeData(store, cleanupIds), (error) => {
    assert.match(error.message, /clubs/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
});

test('完整状态机持久化验证成功后回读清理全部测试记录', async () => {
  const store = createMemoryStore();
  const result = await runClubApplicationSmoke({
    store,
    runId: 'github-12345-attempt-1',
    now: () => new Date('2026-10-17T12:00:00.000Z'),
  });
  assert.deepEqual(result, { stages: 6, auditCount: 4 });
  assertEmpty(store);
});

test('中途写入失败也执行 finally 全量清理和回读', async () => {
  const store = createMemoryStore({ failOnApprovedApplication: true });
  await assert.rejects(
    runClubApplicationSmoke({ store, runId: 'github-12345-failure' }),
    /injected write failure/,
  );
  assertEmpty(store);
});
