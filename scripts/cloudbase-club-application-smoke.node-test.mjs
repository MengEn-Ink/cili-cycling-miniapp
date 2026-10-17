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

function createMemoryStore({
  failOnApprovedApplication = false,
  corruptFirstSubmitReadback = false,
  persistedClubAvatar = 'expected',
} = {}) {
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
    let persisted =
      corruptFirstSubmitReadback &&
      name === 'club_applications' &&
      value.status === 'pending_review' &&
      value.review_version === 1
        ? { ...value, review_version: 0 }
        : value;
    if (name === 'clubs' && persistedClubAvatar !== 'expected') {
      persisted = { ...persisted };
      if (persistedClubAvatar === 'missing') delete persisted.avatar_url;
      else if (persistedClubAvatar === 'drifted')
        persisted.avatar_url = 'cloud://private/club-avatar-drift.jpg';
    }
    collections[name].set(id, structuredClone(persisted));
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
        getClub: (id) => get('clubs', id),
        getMembership: (id) => get('club_memberships', id),
        getAudit: (id) => get('audit_logs', id),
        putApplication: (id, value) => put('club_applications', id, value),
        putClub: (id, value) => put('clubs', id, value),
        putMembership: (id, value) => put('club_memberships', id, value),
        putAudit: (id, value) => put('audit_logs', id, value),
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

test('解析 TCB Mgo Data/Result 字符串数组真实响应形态', () => {
  const output = JSON.stringify({
    Response: {
      Data: JSON.stringify([
        {
          Result: JSON.stringify({
            _id: 'one',
            status: 'pending_review',
            review_version: { $numberInt: '1' },
          }),
        },
        {
          Result: JSON.stringify({
            _id: 'two',
            review_version: { $numberLong: '2' },
          }),
        },
      ]),
    },
  });
  assert.deepEqual(parseNosqlDocuments(output), [
    { _id: 'one', status: 'pending_review', review_version: 1 },
    { _id: 'two', review_version: 2 },
  ]);
});

test('解析 cursor firstBatch 并递归归一 Extended JSON 数字', () => {
  const output = JSON.stringify({
    Response: {
      Data: JSON.stringify([
        {
          Result: {
            cursor: {
              firstBatch: [
                {
                  _id: 'one',
                  review_version: { $numberInt: '1' },
                  updated_at: { $date: '2026-10-18T00:00:00.000Z' },
                  nested: { count: { $numberLong: '2' }, ratio: { $numberDouble: '1.5' } },
                },
              ],
            },
          },
        },
      ]),
    },
  });
  assert.deepEqual(parseNosqlDocuments(output), [
    {
      _id: 'one',
      review_version: 1,
      updated_at: '2026-10-18T00:00:00.000Z',
      nested: { count: 2, ratio: 1.5 },
    },
  ]);
});

test('损坏的 Mgo Result JSON 显式阻断而不是降级为空文档', () => {
  const output = JSON.stringify({
    Response: {
      Data: JSON.stringify([{ Result: '{"_id":' }]),
    },
  });
  assert.throws(() => parseNosqlDocuments(output), /Mgo Result 包含无效 JSON/);
});

test('高精度 Extended JSON Decimal 保留原始字符串而不经 Number 舍入', () => {
  const decimal = '12345678901234567890.12345678901234567890';
  const output = JSON.stringify({
    Response: {
      Data: JSON.stringify([
        {
          Result: JSON.stringify({
            _id: 'one',
            precise_value: { $numberDecimal: decimal },
          }),
        },
      ]),
    },
  });
  assert.deepEqual(parseNosqlDocuments(output), [{ _id: 'one', precise_value: decimal }]);
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

test('CLI transaction 写穿真实存储、事务内读己之写且 overlay 不跨事务', async () => {
  const database = new Map();
  let queryCount = 0;
  const execute = (_file, args) => {
    const [{ CommandType, Command }] = JSON.parse(args.at(-2));
    const payload = JSON.parse(Command);
    if (CommandType === 'UPDATE') {
      const update = payload.updates[0];
      const id = update.q._id;
      database.set(id, { ...(database.get(id) || { _id: id }), ...update.u.$set });
      return JSON.stringify({ Response: { Data: '[]' } });
    }
    if (CommandType === 'QUERY') {
      queryCount += 1;
      const document = database.get(payload.filter._id);
      const data = document ? [{ Result: JSON.stringify(document) }] : [];
      return JSON.stringify({ Response: { Data: JSON.stringify(data) } });
    }
    throw new Error(`unexpected command ${CommandType}`);
  };
  const store = createCliStore({ envId: 'env-production', execute });
  const value = { _id: 'application-one', status: 'draft', review_version: 0 };

  await store.transaction(async (tx) => {
    await tx.putApplication(value._id, value);
    assert.deepEqual(await tx.getApplication(value._id), value);
    assert.equal(queryCount, 0);
  });
  assert.deepEqual(database.get(value._id), value);

  await store.transaction(async (tx) => {
    assert.deepEqual(await tx.getApplication(value._id), value);
  });
  assert.equal(queryCount, 1);
});

const cleanupIds = {
  applicationId: 'application-secret-id',
  membershipId: 'membership-secret-id',
  joinerMembershipId: 'joiner-membership-secret-id',
  clubId: 'club-secret-id',
  adminOpenid: 'admin-secret-openid',
};

function seedCleanupData(store) {
  store.collections.audit_logs.set('audit-secret-id', {
    _id: 'audit-secret-id',
    target_id: cleanupIds.applicationId,
  });
  store.collections.audit_logs.set('audit-club-secret-id', {
    _id: 'audit-club-secret-id',
    target_id: cleanupIds.clubId,
  });
  store.collections.club_memberships.set(cleanupIds.joinerMembershipId, {
    _id: cleanupIds.joinerMembershipId,
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
    'audit_logs',
    'club_memberships',
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

test('完整状态机回读确认俱乐部头像传播后清理全部测试记录', async () => {
  const store = createMemoryStore();
  const result = await runClubApplicationSmoke({
    store,
    runId: 'github-12345-attempt-1',
    now: () => new Date('2026-10-17T12:00:00.000Z'),
  });
  assert.deepEqual(result, { stages: 8, auditCount: 6 });
  assertEmpty(store);
});

for (const persistedClubAvatar of ['missing', 'drifted']) {
  test(`俱乐部头像${persistedClubAvatar === 'missing' ? '缺失' : '漂移'}时真实回读阻断且不泄露 file id`, async () => {
    const store = createMemoryStore({ persistedClubAvatar });
    await assert.rejects(
      runClubApplicationSmoke({ store, runId: `github-12345-avatar-${persistedClubAvatar}` }),
      (error) => {
        assert.match(error.message, /clubs 头像传播/);
        assert.doesNotMatch(error.message, /cloud:\/\/|cover\.jpg|club-avatar-drift/);
        return true;
      },
    );
    assertEmpty(store);
  });
}

test('首次提交后必须以真实回读校验状态、版本和 request id', async () => {
  const store = createMemoryStore({ corruptFirstSubmitReadback: true });
  await assert.rejects(
    runClubApplicationSmoke({ store, runId: 'github-12345-readback' }),
    (error) => {
      assert.match(error.message, /stage=first_submit/);
      assert.match(error.message, /status=pending_review/);
      assert.doesNotMatch(error.message, /smoke_applicant|clubapp_|submit_1_|ci-/);
      return true;
    },
  );
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
