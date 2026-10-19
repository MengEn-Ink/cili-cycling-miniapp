import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';

import {
  CONFIRMATION_PHRASE,
  CLEANUP_STALL_ROUND_BUDGET,
  MEDIA_CLEANUP_BATCH_SIZE,
  NOSQL_QUERY_PAGE_SIZE,
  STORAGE_PREFIXES,
  assertApplyGate,
  calculateMaxCleanupRounds,
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
    async invokeCleanup() {
      calls.push(['invokeCleanup']);
      return { ok: true, processed: 3, failed: 0 };
    },
    async terminalCounts() {
      calls.push(['terminalCounts']);
      return { mediaRemaining: 0, importsRemaining: 0 };
    },
    async waitForCleanupWindow() {
      calls.push(['waitForCleanupWindow']);
    },
    async removeStorage(prefix) {
      calls.push(['removeStorage', prefix]);
    },
    async removeTerminalRecords(commands) {
      calls.push(['removeTerminalRecords', commands]);
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

test('mutation 模板限制集合和字段，且只允许逐文档 UPDATE / DELETE 形态', () => {
  const { prepare, finalize } = createMutationCommands('2026-10-19T00:00:00.000Z');
  assert.deepEqual(
    prepare.map(({ TableName, CommandType }) => [TableName, CommandType]),
    [
      ['clubs', 'UPDATE'],
      ['club_applications', 'UPDATE'],
      ['activities', 'UPDATE'],
      ['route_previews', 'DELETE'],
      ['profiles', 'DELETE'],
      ['profile_media', 'UPDATE'],
      ['profile_media_imports', 'UPDATE'],
    ],
  );
  const updates = [...prepare, ...finalize].filter(({ CommandType }) => CommandType === 'UPDATE');
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
    finalize.map(({ TableName }) => TableName),
    ['profile_media', 'profile_media_imports'],
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

test('profile_media 20 条与 imports 41 条逐文档更新，重复执行保持幂等', async () => {
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
  const { prepare } = createMutationCommands('2026-10-19T00:00:00.000Z');
  await adapter.mutate(prepare.slice(5));
  await adapter.mutate(prepare.slice(5));
  assert.ok(
    [...fixture.state.profile_media.values()].every(({ status }) => status === 'unreferenced'),
  );
  assert.ok(
    [...fixture.state.profile_media_imports.values()].every(({ status }) => status === 'uploaded'),
  );
  const mutations = fixture.invocations.filter(({ CommandType }) => CommandType === 'UPDATE');
  assert.equal(mutations.length, 122);
  assert.ok(mutations.every(({ Command }) => JSON.parse(Command).updates[0].multi === false));
  const idQueries = fixture.invocations.filter(
    ({ CommandType, Command }) =>
      CommandType === 'QUERY' && JSON.parse(Command).limit === NOSQL_QUERY_PAGE_SIZE,
  );
  assert.ok(
    idQueries.every(({ Command }) => isDeepStrictEqual(JSON.parse(Command).projection, { _id: 1 })),
  );
  assert.equal(idQueries.filter(({ TableName }) => TableName === 'profile_media').length, 6);
  assert.equal(
    idQueries.filter(({ TableName }) => TableName === 'profile_media_imports').length,
    12,
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
  const { prepare } = createMutationCommands('2026-10-19T00:00:00.000Z');
  const mediaUpdate = prepare.find(({ TableName }) => TableName === 'profile_media');
  await assert.rejects(adapter.mutate([mediaUpdate]), (error) => {
    assert.match(error.message, /command 1.*collection=profile_media op=UPDATE document=6/);
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
  const { prepare } = createMutationCommands('2026-10-19T00:00:00.000Z');
  const mediaUpdate = prepare.find(({ TableName }) => TableName === 'profile_media');
  await adapter.mutate([mediaUpdate]);
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
  const { prepare } = createMutationCommands('2026-10-19T00:00:00.000Z');
  const mediaUpdate = prepare.find(({ TableName }) => TableName === 'profile_media');
  await assert.rejects(adapter.mutate([mediaUpdate]), /ID 分页重复|ID 分页未推进/);
});

test('分页返回数量少于预清理 COUNT 时 fail closed，不静默截断', async () => {
  const adapter = createCliAdapter({
    envId: ENV_ID,
    execute(_file, args) {
      const [entry] = JSON.parse(args[args.indexOf('--command') + 1]);
      if (entry.CommandType === 'COMMAND') return JSON.stringify({ results: [{ n: 2 }] });
      if (entry.CommandType === 'QUERY') return JSON.stringify({ documents: [] });
      throw new Error('不应执行 mutation');
    },
  });
  const { prepare } = createMutationCommands('2026-10-19T00:00:00.000Z');
  const mediaUpdate = prepare.find(({ TableName }) => TableName === 'profile_media');
  await assert.rejects(
    adapter.mutate([mediaUpdate]),
    /ID 数量校验失败.*collection=profile_media op=UPDATE expected=2 actual=0/,
  );
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
  const { prepare } = createMutationCommands('2026-10-19T00:00:00.000Z');
  const mediaUpdate = prepare.find(({ TableName }) => TableName === 'profile_media');
  await assert.rejects(adapter.mutate([mediaUpdate]), /CloudBase QUERY 命令缺少有效文档结果/);
});

test('terminalCounts 遇到无 supported 文档数组的非法 QUERY 响应时阻断', async () => {
  let queries = 0;
  const adapter = createCliAdapter({
    envId: ENV_ID,
    execute() {
      queries += 1;
      return JSON.stringify([{ ok: true, command: 'QUERY' }]);
    },
  });
  await assert.rejects(adapter.terminalCounts(), /CloudBase QUERY 命令缺少有效文档结果/);
  assert.equal(queries, 1);
});

test('空集合只执行 COUNT，跳过 QUERY 和 mutation', async () => {
  const fixture = databaseExecutor({ route_previews: [], profiles: [], profile_media: [] });
  const adapter = createCliAdapter({ envId: ENV_ID, execute: fixture.execute });
  const { prepare } = createMutationCommands('2026-10-19T00:00:00.000Z');
  await adapter.mutate(prepare.slice(3, 6));
  assert.deepEqual(
    fixture.invocations.map(({ TableName, CommandType }) => [TableName, CommandType]),
    [
      ['route_previews', 'COMMAND'],
      ['profiles', 'COMMAND'],
      ['profile_media', 'COMMAND'],
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
  const { prepare } = createMutationCommands('2026-10-19T00:00:00.000Z');
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

test('任一步骤失败立即阻断后续删除和成功断言', async () => {
  const { adapter, calls } = adapterFixture({
    async invokeCleanup() {
      calls.push(['invokeCleanup']);
      return { ok: true, processed: 1, failed: 1 };
    },
  });
  await assert.rejects(purgePrelaunchMediaData(applyOptions, adapter), /清理函数.*失败/);
  assert.equal(
    calls.some(([name]) => name === 'removeStorage'),
    false,
  );
  assert.equal(
    calls.some(([name]) => name === 'removeTerminalRecords'),
    false,
  );
  assert.equal(
    calls.some(([name]) => name === 'assertions'),
    false,
  );
});

test('cleanup processed=0 时等待一致性窗口并有界重试，而不是立即误判停滞', async () => {
  const { adapter, calls } = adapterFixture();
  let invocation = 0;
  adapter.invokeCleanup = async () => {
    calls.push(['invokeCleanup']);
    invocation += 1;
    return { ok: true, processed: invocation === 1 ? 0 : 1, failed: 0 };
  };
  adapter.terminalCounts = async () => {
    calls.push(['terminalCounts']);
    return invocation === 1
      ? { mediaRemaining: 1, importsRemaining: 0 }
      : { mediaRemaining: 0, importsRemaining: 0 };
  };
  await purgePrelaunchMediaData(applyOptions, adapter);
  assert.equal(calls.filter(([name]) => name === 'waitForCleanupWindow').length, 1);
  assert.equal(calls.filter(([name]) => name === 'invokeCleanup').length, 2);
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

test('cleanup 调用只接受函数业务结果并忽略外层 CLI 成功标记', async () => {
  const adapter = createCliAdapter({
    envId: ENV_ID,
    execute() {
      return JSON.stringify({
        ok: true,
        Response: {
          Result: JSON.stringify({ ok: true, data: { processed: 4, failed: 0 } }),
        },
      });
    },
  });
  assert.deepEqual(await adapter.invokeCleanup(), { ok: true, processed: 4, failed: 0 });
});

test('cleanup 轮数按清理前记录数扩展，并额外保留 24 轮无进展预算', () => {
  assert.equal(MEDIA_CLEANUP_BATCH_SIZE, 20);
  assert.equal(CLEANUP_STALL_ROUND_BUDGET, 24);
  assert.equal(calculateMaxCleanupRounds({ profileMedia: 0, profileMediaImports: 0 }), 24);
  assert.equal(calculateMaxCleanupRounds({ profileMedia: 501, profileMediaImports: 0 }), 50);
  assert.equal(calculateMaxCleanupRounds({ profileMedia: 501, profileMediaImports: 500 }), 75);
});

test('超过 480 条记录时仍可在按计数扩展的有界轮数内完成', async () => {
  const { adapter, calls } = adapterFixture({
    async summary() {
      calls.push(['summary']);
      return {
        profiles: 0,
        clubsWithMedia: 0,
        applicationsWithMedia: 0,
        activitiesWithMedia: 0,
        routePreviews: 0,
        profileMedia: 501,
        profileMediaImports: 0,
      };
    },
  });
  let invocation = 0;
  adapter.invokeCleanup = async () => {
    calls.push(['invokeCleanup']);
    invocation += 1;
    return { ok: true, processed: 20, failed: 0 };
  };
  adapter.terminalCounts = async () => ({
    mediaRemaining: invocation < 26 ? 1 : 0,
    importsRemaining: 0,
  });
  await purgePrelaunchMediaData(applyOptions, adapter);
  assert.equal(invocation, 26);
});

test('media 与 import 终态回读及删除覆盖 cleanup worker 的最终状态', async () => {
  const commands = [];
  const adapter = createCliAdapter({
    envId: ENV_ID,
    execute(_file, args) {
      const index = args.indexOf('--command');
      const [entry] = JSON.parse(args[index + 1]);
      commands.push(entry);
      return cloudbaseQueryOutput([]);
    },
  });
  assert.deepEqual(await adapter.terminalCounts(), { mediaRemaining: 0, importsRemaining: 0 });
  const mediaQuery = commands.find(({ TableName }) => TableName === 'profile_media');
  const importsQuery = commands.find(({ TableName }) => TableName === 'profile_media_imports');
  assert.deepEqual(JSON.parse(mediaQuery.Command).filter.status.$nin, [
    'deleted',
    'delete_failed_terminal',
  ]);
  assert.ok(JSON.parse(importsQuery.Command).filter.status.$nin.includes('deleted'));
  const { finalize } = createMutationCommands('2026-10-19T00:00:00.000Z');
  assert.deepEqual(JSON.parse(finalize[0].Command).deletes[0].q.status.$in, [
    'deleted',
    'delete_failed_terminal',
  ]);
  assert.ok(JSON.parse(finalize[1].Command).deletes[0].q.status.$in.includes('deleted'));
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
