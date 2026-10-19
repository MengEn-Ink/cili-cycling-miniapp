import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';

import {
  CONFIRMATION_PHRASE,
  NOSQL_QUERY_PAGE_SIZE,
  STORAGE_PREFIXES,
  assertApplyGate,
  createCliAdapter,
  createMutationCommands,
  parseNosqlDocuments,
  purgePrelaunchMediaData,
  storageRemoveArgs,
} from './cloudbase-prelaunch-media-purge.mjs';

const ENV_ID = 'env-production';

function adapterFixture(overrides = {}) {
  const calls = [];
  const adapter = {
    async summary() {
      calls.push(['summary']);
      return {
        profiles: 2,
        clubsWithMedia: 1,
        applicationsWithMedia: 1,
        activitiesWithMedia: 2,
        routePreviews: 1,
        profileMedia: 2,
        profileMediaImports: 1,
      };
    },
    async previewStorage(prefix) {
      calls.push(['previewStorage', prefix]);
      return 1;
    },
    async mutate(commands) {
      calls.push(['mutate', commands]);
    },
    async removeStorage(prefix) {
      calls.push(['removeStorage', prefix]);
    },
    async removeRegistryRecords(commands) {
      calls.push(['removeRegistryRecords', commands]);
    },
    async assertions() {
      calls.push(['assertions']);
      return {
        profiles: 0,
        profileMedia: 0,
        profileMediaImports: 0,
        clubsWithMedia: 0,
        applicationsWithMedia: 0,
        activitiesWithMedia: 0,
        routePreviews: 0,
        storage: { 'profiles/**': 0, 'profile-canonical/**': 0 },
      };
    },
    ...overrides,
  };
  return { adapter, calls };
}

const applyOptions = {
  apply: true,
  envId: ENV_ID,
  confirmEnvId: ENV_ID,
  confirmation: CONFIRMATION_PHRASE,
  configuredEnvId: ENV_ID,
};

function valueAt(document, path) {
  return path.split('.').reduce((value, key) => value?.[key], document);
}

function matches(document, filter) {
  return Object.entries(filter).every(([field, expected]) => {
    if (field === '$and') return expected.every((condition) => matches(document, condition));
    if (field === '$or') return expected.some((condition) => matches(document, condition));
    const actual = valueAt(document, field);
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$exists' in expected) return (actual !== undefined) === expected.$exists;
      if ('$gt' in expected) return actual > expected.$gt;
      if ('$in' in expected) return expected.$in.includes(actual);
      if ('$nin' in expected) return !expected.$nin.includes(actual);
    }
    return isDeepStrictEqual(actual, expected);
  });
}

function setAt(document, path, value) {
  const parts = path.split('.');
  const field = parts.pop();
  const parent = parts.reduce((current, part) => (current[part] ||= {}), document);
  parent[field] = value;
}

function unsetAt(document, path) {
  const parts = path.split('.');
  const field = parts.pop();
  const parent = parts.reduce((current, part) => current?.[part], document);
  if (parent) delete parent[field];
}

function cloudbaseQueryOutput(documents, { stringifyDocuments = false } = {}) {
  return JSON.stringify({
    data: {
      results: [
        stringifyDocuments ? documents.map((document) => JSON.stringify(document)) : documents,
      ],
      requestId: 'fixture-request-id',
    },
  });
}

function legacyCloudbaseQueryOutput(documents, { outerArray = false, resultKey = 'Result' } = {}) {
  const result = JSON.stringify({
    wrappers: [{ command: 'QUERY', ok: true }],
    cursor: { firstBatch: documents },
  });
  const response = {
    RequestId: 'fixture-request-id',
    Data: [{ [resultKey]: result, CommandType: 'QUERY' }],
  };
  return JSON.stringify(outerArray ? [response] : response);
}

function databaseExecutor(seed, { failMutation, maxQueryBatch = Infinity, queryOutput } = {}) {
  const state = Object.fromEntries(
    Object.entries(seed).map(([collection, documents]) => [
      collection,
      new Map(documents.map((document) => [document._id, structuredClone(document)])),
    ]),
  );
  const invocations = [];
  const mutationOrdinals = new Map();
  const execute = (_file, args) => {
    const index = args.indexOf('--command');
    const [entry] = JSON.parse(args[index + 1]);
    const body = JSON.parse(entry.Command);
    invocations.push(entry);
    const documents = [...(state[entry.TableName] || new Map()).values()];
    if (entry.CommandType === 'COMMAND') {
      return JSON.stringify({
        data: {
          results: [{ n: documents.filter((item) => matches(item, body.query)).length }],
        },
      });
    }
    if (entry.CommandType === 'QUERY') {
      const found = documents
        .filter((item) => matches(item, body.filter))
        .sort((left, right) => String(left._id).localeCompare(String(right._id)))
        .slice(0, Math.min(body.limit, maxQueryBatch))
        .map((item) => {
          const projected = { _id: item._id };
          if (body.projection?.status) projected.status = item.status;
          return projected;
        });
      return queryOutput ? queryOutput(found, { entry, body }) : cloudbaseQueryOutput(found);
    }
    const ordinal = (mutationOrdinals.get(entry.TableName) || 0) + 1;
    mutationOrdinals.set(entry.TableName, ordinal);
    if (failMutation?.collection === entry.TableName && failMutation.document === ordinal) {
      const error = new Error('failed');
      error.stderr = failMutation.stderr || '';
      throw error;
    }
    if (entry.CommandType === 'UPDATE') {
      const update = body.updates[0];
      assert.deepEqual(Object.keys(update.q), ['_id']);
      assert.equal(update.upsert, false);
      assert.equal(update.multi, false);
      const document = state[entry.TableName].get(update.q._id);
      for (const [path, value] of Object.entries(update.u.$set || {})) setAt(document, path, value);
      for (const path of Object.keys(update.u.$unset || {})) unsetAt(document, path);
      return JSON.stringify({ results: [] });
    }
    const deletion = body.deletes[0];
    assert.deepEqual(Object.keys(deletion.q), ['_id']);
    assert.equal(deletion.limit, 1);
    state[entry.TableName].delete(deletion.q._id);
    return JSON.stringify({ results: [] });
  };
  return { execute, state, invocations };
}

test('默认 dry-run 仅统计并对两个固定前缀执行 storage dry-run，不写数据库或存储', async () => {
  const { adapter, calls } = adapterFixture();
  const result = await purgePrelaunchMediaData(
    { ...applyOptions, apply: false, confirmEnvId: '', confirmation: '' },
    adapter,
  );
  assert.equal(result.applied, false);
  assert.deepEqual(calls, [
    ['summary'],
    ['previewStorage', 'profiles/**'],
    ['previewStorage', 'profile-canonical/**'],
  ]);
});

test('apply 要求 env-id、confirm-env-id、cloudbaserc 与固定短语四者完整匹配', () => {
  assert.doesNotThrow(() => assertApplyGate(applyOptions));
  for (const patch of [
    { envId: '' },
    { confirmEnvId: 'other' },
    { configuredEnvId: 'other' },
    { confirmation: 'DELETE' },
  ]) {
    assert.throws(() => assertApplyGate({ ...applyOptions, ...patch }), /拒绝清理/);
  }
});

test('目标环境不匹配时在任何读取或写入前阻断', async () => {
  const { adapter, calls } = adapterFixture();
  await assert.rejects(
    purgePrelaunchMediaData({ ...applyOptions, configuredEnvId: 'wrong-env' }, adapter),
    /环境 ID.*一致/,
  );
  assert.deepEqual(calls, []);
});

test('空库 apply 幂等，仍验证固定存储前缀并完成回读断言', async () => {
  const { adapter, calls } = adapterFixture({
    async summary() {
      calls.push(['summary']);
      return {
        profiles: 0,
        clubsWithMedia: 0,
        applicationsWithMedia: 0,
        activitiesWithMedia: 0,
        routePreviews: 0,
        profileMedia: 0,
        profileMediaImports: 0,
      };
    },
    async previewStorage(prefix) {
      calls.push(['previewStorage', prefix]);
      return 0;
    },
  });
  const result = await purgePrelaunchMediaData(applyOptions, adapter);
  assert.equal(result.applied, true);
  assert.ok(calls.some(([name]) => name === 'assertions'));
  assert.deepEqual(
    calls.filter(([name]) => name === 'removeStorage').map(([, prefix]) => prefix),
    [...STORAGE_PREFIXES],
  );
});

test('mutation 模板限制集合和字段，登记表只允许逐文档直接删除', () => {
  const { prepare, finalize } = createMutationCommands();
  assert.deepEqual(
    prepare.map(({ TableName, CommandType }) => [TableName, CommandType]),
    [
      ['clubs', 'UPDATE'],
      ['club_applications', 'UPDATE'],
      ['activities', 'UPDATE'],
      ['route_previews', 'DELETE'],
      ['profiles', 'DELETE'],
    ],
  );
  const updates = prepare.filter(({ CommandType }) => CommandType === 'UPDATE');
  assert.ok(
    updates.every(({ Command }) => {
      const update = JSON.parse(Command).updates[0];
      return update.multi === false && update.upsert === false;
    }),
  );
  const deletes = [...prepare, ...finalize].filter(({ CommandType }) => CommandType === 'DELETE');
  assert.ok(deletes.every(({ Command }) => JSON.parse(Command).deletes[0].limit === 1));
  const activities = JSON.parse(prepare[2].Command).updates[0];
  assert.equal(Object.hasOwn(activities.u.$unset, 'route.gpx_file_id'), false);
  assert.deepEqual(
    finalize.map(({ TableName, Command }) => [TableName, JSON.parse(Command).deletes[0].q]),
    [
      ['profile_media', {}],
      ['profile_media_imports', {}],
    ],
  );
});

test('CloudBase CLI --json results envelope 解析文档、字符串文档与 Extended JSON _id', () => {
  const extendedId = { $oid: '507f1f77bcf86cd799439011' };
  const documents = [{ _id: extendedId }, { _id: 'plain-id', status: 'uploaded' }];
  assert.deepEqual(parseNosqlDocuments(cloudbaseQueryOutput(documents)), documents);
  assert.deepEqual(
    parseNosqlDocuments(cloudbaseQueryOutput(documents, { stringifyDocuments: true })),
    documents,
  );
});

test('legacy Result/result、cursor.firstBatch 与 direct 文档数组保持兼容', () => {
  const documents = [{ _id: { $numberLong: '39198820328' } }];
  assert.deepEqual(
    parseNosqlDocuments(legacyCloudbaseQueryOutput(documents, { outerArray: true })),
    documents,
  );
  assert.deepEqual(
    parseNosqlDocuments(legacyCloudbaseQueryOutput(documents, { resultKey: 'result' })),
    documents,
  );
  for (const key of ['documents', 'Docs', 'docs', 'list']) {
    assert.deepEqual(parseNosqlDocuments(JSON.stringify({ [key]: documents })), documents);
  }
  assert.deepEqual(
    parseNosqlDocuments(JSON.stringify({ Result: JSON.stringify(documents) })),
    documents,
  );
});

test('results envelope 合法空查询返回空，缺失、空 envelope、多结果及非法 QUERY result 均 fail closed', () => {
  assert.deepEqual(parseNosqlDocuments(cloudbaseQueryOutput([])), []);
  for (const output of [
    {},
    { data: { results: [] } },
    { data: { results: [[], []] } },
    { data: { results: [{ n: 20 }], requestId: 'count-request-id' } },
    { data: { results: [[{ status: 'uploaded' }]], requestId: 'missing-id-request-id' } },
    { data: { results: [['not-json']], requestId: 'invalid-json-request-id' } },
  ]) {
    assert.throws(
      () => parseNosqlDocuments(JSON.stringify(output)),
      /CloudBase QUERY 命令缺少有效文档结果/,
    );
  }
});

test('legacy 空 firstBatch 识别为空查询，非法或缺失 supported array 均 fail closed', () => {
  assert.deepEqual(parseNosqlDocuments(legacyCloudbaseQueryOutput([], { outerArray: true })), []);
  for (const output of [
    {
      Data: [{ Result: JSON.stringify({ wrappers: [{ ok: true, command: 'QUERY' }] }) }],
    },
    { documents: [{ ok: true, command: 'QUERY' }] },
    [{ ok: true, command: 'QUERY' }],
  ]) {
    assert.throws(
      () => parseNosqlDocuments(JSON.stringify(output)),
      /CloudBase QUERY 命令缺少有效文档结果/,
    );
  }
});

test('profile_media 20 条与 imports 41 条逐文档删除，重复执行保持幂等', async () => {
  const profileMedia = Array.from({ length: 20 }, (_, index) => ({
    _id: `media-${String(index).padStart(4, '0')}`,
    status: 'referenced',
  }));
  const imports = Array.from({ length: 41 }, (_, index) => ({
    _id: `import-${String(index).padStart(4, '0')}`,
    status: 'prepared',
  }));
  const fixture = databaseExecutor(
    {
      profile_media: profileMedia,
      profile_media_imports: imports,
    },
    {
      maxQueryBatch: 7,
      queryOutput(documents, { entry }) {
        return cloudbaseQueryOutput(documents, {
          stringifyDocuments: entry.TableName === 'profile_media_imports',
        });
      },
    },
  );
  const adapter = createCliAdapter({ envId: ENV_ID, execute: fixture.execute });
  const { finalize } = createMutationCommands();
  await adapter.removeRegistryRecords(finalize);
  await adapter.removeRegistryRecords(finalize);
  assert.equal(fixture.state.profile_media.size, 0);
  assert.equal(fixture.state.profile_media_imports.size, 0);
  const mutations = fixture.invocations.filter(({ CommandType }) => CommandType === 'DELETE');
  assert.equal(mutations.length, 61);
  assert.ok(mutations.every(({ Command }) => JSON.parse(Command).deletes[0].limit === 1));
  const idQueries = fixture.invocations.filter(
    ({ CommandType, Command }) =>
      CommandType === 'QUERY' && JSON.parse(Command).limit === NOSQL_QUERY_PAGE_SIZE,
  );
  assert.ok(
    idQueries.every(({ Command }) => isDeepStrictEqual(JSON.parse(Command).projection, { _id: 1 })),
  );
  assert.equal(idQueries.filter(({ TableName }) => TableName === 'profile_media').length, 3);
  assert.equal(
    idQueries.filter(({ TableName }) => TableName === 'profile_media_imports').length,
    6,
  );
});

test('第 N 文档失败准确定位原 command/collection/op 且不泄露 ID 或 payload', async () => {
  const documents = Array.from({ length: 20 }, (_, index) => ({
    _id: `private-media-id-${String(index).padStart(4, '0')}`,
    status: 'referenced',
  }));
  const fixture = databaseExecutor(
    { profile_media: documents },
    {
      failMutation: {
        collection: 'profile_media',
        document: 6,
        stderr: 'payload private-media-id-0005 account=user@example.com',
      },
    },
  );
  const adapter = createCliAdapter({ envId: ENV_ID, execute: fixture.execute });
  const { finalize } = createMutationCommands();
  const mediaDelete = finalize.find(({ TableName }) => TableName === 'profile_media');
  await assert.rejects(adapter.mutate([mediaDelete]), (error) => {
    assert.match(error.message, /command 1.*collection=profile_media op=DELETE document=6/);
    assert.match(error.message, /stderr_tail=\(present, redacted\)/);
    assert.doesNotMatch(
      error.message,
      /private-media-id|user@example\.com|cleanup_after|unreferenced/,
    );
    return true;
  });
});

test('超过单页时按 _id 稳定分页，且 ID 总数必须匹配 COUNT', async () => {
  const documents = Array.from({ length: NOSQL_QUERY_PAGE_SIZE + 1 }, (_, index) => ({
    _id: `media-${String(index).padStart(6, '0')}`,
    status: 'referenced',
  }));
  const fixture = databaseExecutor({ profile_media: documents });
  const adapter = createCliAdapter({ envId: ENV_ID, execute: fixture.execute });
  const { finalize } = createMutationCommands();
  const mediaDelete = finalize.find(({ TableName }) => TableName === 'profile_media');
  await adapter.mutate([mediaDelete]);
  const pageQueries = fixture.invocations.filter(({ CommandType, Command }) => {
    const body = JSON.parse(Command);
    return CommandType === 'QUERY' && body.limit === NOSQL_QUERY_PAGE_SIZE;
  });
  assert.equal(pageQueries.length, 2);
  assert.deepEqual(JSON.parse(pageQueries[0].Command).sort, { _id: 1 });
  assert.deepEqual(JSON.parse(pageQueries[1].Command).filter.$and[1], {
    _id: { $gt: `media-${String(NOSQL_QUERY_PAGE_SIZE - 1).padStart(6, '0')}` },
  });
});

test('分页重复且 lastId 不推进时 fail closed', async () => {
  const adapter = createCliAdapter({
    envId: ENV_ID,
    execute(_file, args) {
      const [entry] = JSON.parse(args[args.indexOf('--command') + 1]);
      if (entry.CommandType === 'COMMAND') return JSON.stringify({ results: [{ n: 2 }] });
      if (entry.CommandType === 'QUERY') return JSON.stringify({ documents: [{ _id: 'same-id' }] });
      throw new Error('不应执行 mutation');
    },
  });
  const { finalize } = createMutationCommands();
  const mediaDelete = finalize.find(({ TableName }) => TableName === 'profile_media');
  await assert.rejects(adapter.mutate([mediaDelete]), /ID 分页重复|ID 分页未推进/);
});

test('分页数量变少时 UPDATE 阻断，DELETE 允许并发删除后继续收敛', async () => {
  const adapter = createCliAdapter({
    envId: ENV_ID,
    execute(_file, args) {
      const [entry] = JSON.parse(args[args.indexOf('--command') + 1]);
      if (entry.CommandType === 'COMMAND') return JSON.stringify({ results: [{ n: 2 }] });
      if (entry.CommandType === 'QUERY') return JSON.stringify({ documents: [] });
      throw new Error('不应执行 mutation');
    },
  });
  const { prepare, finalize } = createMutationCommands();
  const clubUpdate = prepare.find(({ TableName }) => TableName === 'clubs');
  await assert.rejects(
    adapter.mutate([clubUpdate]),
    /ID 数量校验失败.*collection=clubs op=UPDATE expected=2 actual=0/,
  );
  const mediaDelete = finalize.find(({ TableName }) => TableName === 'profile_media');
  await assert.doesNotReject(adapter.mutate([mediaDelete]));
});

test('仅有无 _id 包装数组时 ID 查询直接 fail closed', async () => {
  const adapter = createCliAdapter({
    envId: ENV_ID,
    execute(_file, args) {
      const [entry] = JSON.parse(args[args.indexOf('--command') + 1]);
      if (entry.CommandType === 'COMMAND') return JSON.stringify({ results: [{ n: 1 }] });
      if (entry.CommandType === 'QUERY') {
        return JSON.stringify({
          Data: [{ Result: JSON.stringify({ wrappers: [{ ok: true, command: 'QUERY' }] }) }],
        });
      }
      throw new Error('不应执行 mutation');
    },
  });
  const { finalize } = createMutationCommands();
  const mediaDelete = finalize.find(({ TableName }) => TableName === 'profile_media');
  await assert.rejects(adapter.mutate([mediaDelete]), /CloudBase QUERY 命令缺少有效文档结果/);
});

test('空集合只执行 COUNT，跳过 QUERY 和 mutation', async () => {
  const fixture = databaseExecutor({
    route_previews: [],
    profiles: [],
    profile_media: [],
    profile_media_imports: [],
  });
  const adapter = createCliAdapter({ envId: ENV_ID, execute: fixture.execute });
  const { prepare, finalize } = createMutationCommands();
  await adapter.mutate(prepare.slice(3));
  await adapter.removeRegistryRecords(finalize);
  assert.deepEqual(
    fixture.invocations.map(({ TableName, CommandType }) => [TableName, CommandType]),
    [
      ['route_previews', 'COMMAND'],
      ['profiles', 'COMMAND'],
      ['profile_media', 'COMMAND'],
      ['profile_media_imports', 'COMMAND'],
    ],
  );
});

test('DELETE 逐文档使用 q:{_id},limit:1，空 firstBatch 回读确认后重复执行幂等', async () => {
  const fixture = databaseExecutor(
    {
      route_previews: Array.from({ length: 3 }, (_, index) => ({ _id: `route-${index}` })),
    },
    {
      queryOutput(documents) {
        return cloudbaseQueryOutput(documents);
      },
    },
  );
  const adapter = createCliAdapter({ envId: ENV_ID, execute: fixture.execute });
  const { prepare } = createMutationCommands();
  const routeDelete = prepare.find(({ TableName }) => TableName === 'route_previews');
  await adapter.mutate([routeDelete]);
  await adapter.mutate([routeDelete]);
  assert.equal(fixture.state.route_previews.size, 0);
  const deletions = fixture.invocations.filter(({ CommandType }) => CommandType === 'DELETE');
  assert.equal(deletions.length, 3);
  assert.ok(
    deletions.every(({ Command }) => {
      const deletion = JSON.parse(Command).deletes[0];
      return deletion.limit === 1 && Object.keys(deletion.q).length === 1 && '_id' in deletion.q;
    }),
  );
});

test('storage 删除参数只能使用两个固定前缀，apply 前始终先 dry-run', () => {
  for (const prefix of STORAGE_PREFIXES) {
    assert.match(prefix, /^(?:profiles|profile-canonical)\/\*\*$/);
    assert.ok(storageRemoveArgs(ENV_ID, prefix, false).includes('--dry-run'));
    assert.ok(storageRemoveArgs(ENV_ID, prefix, true).includes('--force'));
  }
  assert.throws(() => storageRemoveArgs(ENV_ID, 'clubs/**', true), /存储前缀/);
});

test('数据库准备失败立即阻断存储和登记删除', async () => {
  const { adapter, calls } = adapterFixture({
    async mutate(commands) {
      calls.push(['mutate', commands]);
      throw new Error('database unavailable');
    },
  });
  await assert.rejects(purgePrelaunchMediaData(applyOptions, adapter), /database unavailable/);
  assert.equal(
    calls.some(([name]) => name === 'removeStorage'),
    false,
  );
  assert.equal(
    calls.some(([name]) => name === 'removeRegistryRecords'),
    false,
  );
  assert.equal(
    calls.some(([name]) => name === 'assertions'),
    false,
  );
});

test('计数使用 CloudBase COMMAND count，存在性 QUERY 固定 limit 1', async () => {
  const commands = [];
  const adapter = createCliAdapter({
    envId: ENV_ID,
    execute(_file, args) {
      const index = args.indexOf('--command');
      assert.ok(index > 0);
      const [entry] = JSON.parse(args[index + 1]);
      commands.push(entry);
      return JSON.stringify({ results: [{ n: 2, ok: 1 }], requestId: 'count-request-id' });
    },
  });
  assert.deepEqual(await adapter.summary(), {
    profiles: 2,
    clubsWithMedia: 2,
    applicationsWithMedia: 2,
    activitiesWithMedia: 2,
    routePreviews: 2,
    profileMedia: 2,
    profileMediaImports: 2,
  });
  assert.equal(commands.length, 7);
  assert.ok(commands.every(({ CommandType }) => CommandType === 'COMMAND'));
  assert.ok(commands.every(({ Command }) => !Object.hasOwn(JSON.parse(Command), 'limit')));
  const source = readFileSync('scripts/cloudbase-prelaunch-media-purge.mjs', 'utf8');
  assert.match(source, /projection: \{ _id: 1, status: 1 \},\s*limit: 1/);
});

test('预发布清理不调用 cleanup worker，存储成功后才删除全部登记', async () => {
  const { adapter, calls } = adapterFixture();
  await purgePrelaunchMediaData(applyOptions, adapter);
  assert.deepEqual(
    calls
      .filter(([name]) =>
        ['mutate', 'removeStorage', 'removeRegistryRecords', 'assertions'].includes(name),
      )
      .map(([name, value]) => [name, typeof value === 'string' ? value : undefined]),
    [
      ['mutate', undefined],
      ['removeStorage', 'profiles/**'],
      ['removeStorage', 'profile-canonical/**'],
      ['removeRegistryRecords', undefined],
      ['assertions', undefined],
    ],
  );
  const source = readFileSync('scripts/cloudbase-prelaunch-media-purge.mjs', 'utf8');
  assert.doesNotMatch(source, /fn[',\s]+invoke[',\s]+profile-media-cleanup/);
  const { finalize } = createMutationCommands();
  assert.deepEqual(
    finalize.map(({ TableName, Command }) => [TableName, JSON.parse(Command).deletes[0].q]),
    [
      ['profile_media', {}],
      ['profile_media_imports', {}],
    ],
  );
});

test('存储删除失败时保留登记记录以便安全重试', async () => {
  const { adapter, calls } = adapterFixture({
    async removeStorage(prefix) {
      calls.push(['removeStorage', prefix]);
      throw new Error('storage unavailable');
    },
  });
  await assert.rejects(purgePrelaunchMediaData(applyOptions, adapter), /storage unavailable/);
  assert.equal(
    calls.some(([name]) => name === 'removeRegistryRecords'),
    false,
  );
  assert.equal(
    calls.some(([name]) => name === 'assertions'),
    false,
  );
});

test('workflow 在 purge 后运行 smoke，smoke 可重建 profile_media 与 club 数据并 finally 清理', () => {
  const workflow = readFileSync('.github/workflows/deploy-cloudbase.yml', 'utf8');
  const purge = workflow.indexOf('name: Purge explicitly confirmed prelaunch media data');
  const smoke = workflow.indexOf('name: Run production club application write smoke');
  assert.ok(purge >= 0 && purge < smoke);
  const smokeSource = readFileSync('scripts/cloudbase-club-application-smoke.mjs', 'utf8');
  assert.match(smokeSource, /store\.put\('profile_media'/);
  assert.match(smokeSource, /putClub:/);
  assert.match(smokeSource, /finally\s*\{[\s\S]*cleanupSmokeData/);
});
