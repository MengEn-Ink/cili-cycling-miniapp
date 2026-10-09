import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';

import {
  PROBE_AS_OF,
  PROBE_COLLECTION,
  assertTemporaryCollection,
  buildExplainCommands,
  buildFixtures,
  createCliExecutor,
  runProbe,
  unwrapMgoQueryDocuments,
  unwrapSingleMgoDocument,
} from './activity-home-timeline-planner-probe.mjs';

function validExplainPlan(indexName) {
  return {
    queryPlanner: {
      winningPlan: {
        stage: 'LIMIT',
        inputStage: {
          stage: 'FETCH',
          inputStage: { stage: 'IXSCAN', indexName },
        },
      },
    },
    executionStats: { nReturned: 20, totalKeysExamined: 21, totalDocsExamined: 21 },
  };
}

function bsonDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  assert.equal(Number.isFinite(date.getTime()), true, `invalid test date: ${value}`);
  return { $date: { $numberLong: String(date.getTime()) } };
}

function isBsonDate(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.$date === 'object' &&
    /^-?\d+$/.test(value.$date.$numberLong)
  );
}

function dateReadbackItems() {
  return ['finished-000', 'ongoing-000', 'past-published-000', 'scheduled-000'].map((id) => ({
    _id: id,
    event_start: bsonDate(PROBE_AS_OF),
    event_end: bsonDate(new Date(PROBE_AS_OF.getTime() + 60_000)),
  }));
}

test('只允许任务专属临时集合，拒绝业务集合和相似前缀', () => {
  assert.throws(() => assertTemporaryCollection('activities'), /只允许临时集合/);
  assert.throws(
    () => assertTemporaryCollection('tmp_activity_home_timeline_f8d1d2e2_extra'),
    /只允许临时集合/,
  );
  assert.throws(
    () => assertTemporaryCollection('tmp_activity_home_timeline_../../activities'),
    /只允许临时集合/,
  );
  assert.doesNotThrow(() => assertTemporaryCollection(PROBE_COLLECTION));
});

test('fixture 精确 108 条并覆盖四流、删除、legacy 和非法数据', () => {
  const fixtures = buildFixtures(PROBE_AS_OF);
  const ids = new Set(fixtures.map((item) => item._id));

  assert.equal(fixtures.length, 108);
  assert.equal(ids.size, fixtures.length);
  assert.ok(fixtures.some((item) => item.kind === 'ongoing'));
  assert.ok(fixtures.some((item) => item.kind === 'scheduled'));
  assert.ok(fixtures.some((item) => item.kind === 'finished'));
  assert.ok(fixtures.some((item) => item.kind === 'past-published'));
  assert.ok(fixtures.some((item) => item.is_deleted === true));
  assert.ok(fixtures.some((item) => !Object.hasOwn(item, 'is_deleted')));
  assert.ok(fixtures.some((item) => item.status === 'draft'));
  assert.ok(fixtures.some((item) => item.status === 'archived'));
  assert.equal(fixtures.find((item) => item._id === 'invalid-end')?.event_end, 'invalid-time');
  assert.equal(
    Object.hasOwn(
      fixtures.find((item) => item._id === 'missing-start'),
      'event_start',
    ),
    false,
  );
  assert.equal(
    Object.hasOwn(
      fixtures.find((item) => item._id === 'missing-end'),
      'event_end',
    ),
    false,
  );
  for (const fixture of fixtures) {
    if (Object.hasOwn(fixture, 'event_start') && fixture._id !== 'invalid-start')
      assert.equal(
        isBsonDate(fixture.event_start),
        true,
        `${fixture._id}.event_start 必须是 BSON Date`,
      );
    if (Object.hasOwn(fixture, 'event_end') && fixture._id !== 'invalid-end')
      assert.equal(
        isBsonDate(fixture.event_end),
        true,
        `${fixture._id}.event_end 必须是 BSON Date`,
      );
  }
});

test('首屏四条与 cursor 八个物理段固定为十二条受保护查询', () => {
  const commands = buildExplainCommands(PROBE_COLLECTION, PROBE_AS_OF);

  assert.deepEqual(
    commands.map((item) => item.name),
    [
      'ongoing',
      'scheduled',
      'finished',
      'past-published',
      'ongoing-cursor-same-time',
      'ongoing-cursor-cross-time',
      'scheduled-cursor-same-time',
      'scheduled-cursor-cross-time',
      'finished-cursor-same-time',
      'finished-cursor-cross-time',
      'past-published-cursor-same-time',
      'past-published-cursor-cross-time',
    ],
  );
  assert.equal(
    commands.every((item) => item.collection === PROBE_COLLECTION),
    true,
  );
  assert.equal(
    commands.every((item) => item.limit === 21),
    true,
  );
  assert.equal(
    commands.every((item) => item.command?.explain),
    true,
  );
  assert.equal(JSON.stringify(commands).includes('activities"'), false);
});

test('cursor 物理段按 same-time 再 cross-time 生成且禁止 $or', () => {
  const cursorCommands = buildExplainCommands(PROBE_COLLECTION, PROBE_AS_OF).filter((item) =>
    item.name.includes('-cursor'),
  );
  const sameTimeSortMismatches = [];

  assert.equal(
    cursorCommands.every((item) => !JSON.stringify(item.command.explain.filter).includes('"$or"')),
    true,
  );
  for (let index = 0; index < cursorCommands.length; index += 2) {
    const sameTime = cursorCommands[index];
    const crossTime = cursorCommands[index + 1];
    assert.match(sameTime.name, /-same-time$/);
    assert.match(crossTime.name, /-cross-time$/);
    const field =
      sameTime.name.startsWith('ongoing') || sameTime.name.startsWith('scheduled')
        ? 'event_start'
        : 'event_end';
    const direction = field === 'event_start' ? 1 : -1;
    assert.deepEqual(crossTime.command.explain.sort, { [field]: direction, _id: direction });
    const expectedSameTimeSort = { _id: direction };
    if (!isDeepStrictEqual(sameTime.command.explain.sort, expectedSameTimeSort))
      sameTimeSortMismatches.push({
        name: sameTime.name,
        actual: sameTime.command.explain.sort,
        expected: expectedSameTimeSort,
      });
    assert.equal(isBsonDate(sameTime.command.explain.filter[field]), true);
    assert.equal(typeof sameTime.command.explain.filter._id, 'object');
    assert.equal(
      isBsonDate(crossTime.command.explain.filter[field][direction === 1 ? '$gt' : '$lt']),
      true,
    );
    assert.equal(Object.hasOwn(crossTime.command.explain.filter, '_id'), false);
  }
  assert.deepEqual(sameTimeSortMismatches, []);
});

test('INSERT command 保留严格 EJSON BSON Date，不降级为 ISO string', async () => {
  let insertCommand;
  const execute = createCliExecutor({
    envId: 'cloudbase-d0gizacy77a1ab017',
    runner: {
      execute(action, args) {
        assert.equal(action, 'probe-insert');
        const commandIndex = args.indexOf('--command');
        const envelope = JSON.parse(args[commandIndex + 1]);
        assert.equal(envelope[0].CommandType, 'INSERT');
        insertCommand = JSON.parse(envelope[0].Command);
        return { requestId: 'request-insert', data: [{ insertedCount: 108 }] };
      },
    },
  });

  await execute({
    kind: 'insert',
    collection: PROBE_COLLECTION,
    documents: buildFixtures(PROBE_AS_OF),
  });

  assert.equal(insertCommand.documents.length, 108);
  assert.equal(isBsonDate(insertCommand.documents[0].event_start), true);
  assert.equal(isBsonDate(insertCommand.documents[0].event_end), true);
  assert.equal(JSON.stringify(insertCommand).includes(PROBE_AS_OF.toISOString()), false);
});

test('CloudBase CLI 单元素数组响应解包为唯一 Mongo 文档', () => {
  const explain = {
    queryPlanner: { winningPlan: { stage: 'IXSCAN', indexName: 'public_event_start' } },
  };

  assert.deepEqual(unwrapSingleMgoDocument([explain], 'explain'), explain);
  assert.throws(() => unwrapSingleMgoDocument([], 'explain'), /未返回唯一 Mongo 结果/);
  assert.throws(
    () => unwrapSingleMgoDocument([explain, explain], 'explain'),
    /未返回唯一 Mongo 结果/,
  );
});

test('QUERY 多文档解包完整保留两条记录并接受空数组', () => {
  const samples = [
    { _id: 'first', title: '第一条', nested: { value: 1 } },
    { _id: 'second', title: '第二条', nested: { value: 2 } },
  ];

  assert.deepEqual(unwrapMgoQueryDocuments({ requestId: 'request-two', data: samples }), samples);
  assert.deepEqual(unwrapMgoQueryDocuments({ requestId: 'request-empty', data: [] }), []);
});

test('smoke QUERY 接受 CLI 多文档数组响应并完成四流分页', async () => {
  const pad = (value) => String(value).padStart(3, '0');
  const at = (offsetMinutes) => bsonDate(new Date(PROBE_AS_OF.getTime() + offsetMinutes * 60_000));
  const rows = {
    ongoing: Array.from({ length: 25 }, (_, index) => ({
      _id: `ongoing-${pad(index)}`,
      status: 'published',
      event_start: at(-1000 + index),
      event_end: at(100 + index),
    })),
    scheduled: Array.from({ length: 25 }, (_, index) => ({
      _id: `scheduled-${pad(index)}`,
      status: 'published',
      event_start: at(100 + index),
      event_end: at(500 + index),
    })),
    finished: Array.from({ length: 25 }, (_, index) => ({
      _id: `finished-${pad(index)}`,
      status: 'finished',
      event_start: at(-500 - index),
      event_end: at(-100 - index),
    })),
    'past-published': Array.from({ length: 25 }, (_, index) => ({
      _id: `past-published-${pad(index)}`,
      status: 'published',
      event_start: at(-1500 - index),
      event_end: at(-1000 - index),
    })),
  };
  const sameTimeSortMismatches = [];
  const runner = {
    execute(action, args) {
      const match =
        /^smoke-(ongoing|scheduled|finished|past-published)-(\d+)(?:-(same-time|cross-time))?$/.exec(
          action,
        );
      assert.ok(match, `unexpected action: ${action}`);
      const [, stream, batch, segment] = match;
      const commandIndex = args.indexOf('--command');
      assert.notEqual(commandIndex, -1);
      const envelope = JSON.parse(args[commandIndex + 1]);
      assert.equal(envelope.length, 1);
      assert.equal(envelope[0].TableName, PROBE_COLLECTION);
      assert.equal(envelope[0].CommandType, 'QUERY');
      const query = JSON.parse(envelope[0].Command);
      const timeField =
        stream === 'ongoing' || stream === 'scheduled' ? 'event_start' : 'event_end';
      const direction = timeField === 'event_start' ? 1 : -1;
      const boundaryOperator = direction === 1 ? '$gt' : '$lt';
      assert.equal(query.find, PROBE_COLLECTION);
      assert.equal(query.limit, 21);
      assert.equal(JSON.stringify(query.filter).includes('"$or"'), false);
      assert.equal(query.filter.status, stream === 'finished' ? 'finished' : 'published');
      assert.deepEqual(query.filter.is_deleted, { $ne: true });
      if (stream === 'ongoing' || stream === 'scheduled')
        assert.deepEqual(query.filter.event_end, { $gt: bsonDate(PROBE_AS_OF) });
      if (segment === 'same-time') {
        assert.equal(isBsonDate(query.filter[timeField]), true);
        assert.deepEqual(query.filter._id, { [boundaryOperator]: `${stream}-020` });
      } else if (segment === 'cross-time') {
        assert.equal(typeof query.filter[timeField], 'object');
        assert.equal(Object.hasOwn(query.filter[timeField], boundaryOperator), true);
        assert.equal(isBsonDate(query.filter[timeField][boundaryOperator]), true);
        assert.equal(Object.hasOwn(query.filter, '_id'), false);
      } else {
        assert.equal(Object.hasOwn(query.filter, '_id'), false);
      }
      const expectedSort =
        segment === 'same-time' ? { _id: direction } : { [timeField]: direction, _id: direction };
      if (!isDeepStrictEqual(query.sort, expectedSort))
        sameTimeSortMismatches.push({ action, actual: query.sort, expected: expectedSort });
      let data;
      if (batch === '1') data = rows[stream].slice(0, 21);
      else if (segment === 'same-time') data = [];
      else data = rows[stream].slice(21);
      return { requestId: `request-${action}`, data };
    },
  };
  const execute = createCliExecutor({
    envId: 'cloudbase-d0gizacy77a1ab017',
    runner,
  });

  const result = await execute({
    kind: 'smoke',
    collection: PROBE_COLLECTION,
    asOf: PROBE_AS_OF,
  });

  assert.equal(result.future.count, 50);
  assert.deepEqual(
    result.future.pages.map((page) => page.length),
    [20, 20, 10],
  );
  assert.equal(new Set(result.future.ids).size, 50);
  assert.equal(result.history.count, 50);
  assert.deepEqual(
    result.history.pages.map((page) => page.length),
    [20, 20, 10],
  );
  assert.equal(new Set(result.history.ids).size, 50);
  assert.equal(result.requestIds[0], 'request-smoke-ongoing-1');
  assert.equal(result.requestIds.at(-1), 'request-smoke-past-published-2-cross-time');
  assert.deepEqual(sameTimeSortMismatches, []);
});

test('插入后先回读 BSON Date 类型，再运行任何 explain', async () => {
  const operations = [];
  let listCalls = 0;
  const execute = async (operation) => {
    operations.push(operation);
    if (operation.kind === 'list-collections') {
      listCalls += 1;
      return { requestId: `request-list-${listCalls}`, collections: [] };
    }
    if (operation.kind === 'verify-date-types')
      return {
        requestId: 'request-date-readback',
        items: dateReadbackItems(),
      };
    if (operation.kind === 'explain')
      return {
        requestId: `request-${operation.name}`,
        plan: validExplainPlan(
          operation.name.includes('finished') || operation.name.includes('past-published')
            ? 'public_event_end'
            : 'public_event_start',
        ),
      };
    if (operation.kind === 'smoke') return { requestIds: [], future: {}, history: {} };
    return { requestId: `request-${operation.kind}` };
  };

  const summary = await runProbe({
    envId: 'cloudbase-d0gizacy77a1ab017',
    collection: PROBE_COLLECTION,
    execute,
  });

  const readbackIndex = operations.findIndex((item) => item.kind === 'verify-date-types');
  assert.notEqual(readbackIndex, -1);
  assert.equal(operations[readbackIndex - 1].kind, 'insert');
  assert.equal(operations[readbackIndex + 1].kind, 'explain');
  assert.deepEqual(summary.dateReadback, {
    requestId: 'request-date-readback',
    ids: ['finished-000', 'ongoing-000', 'past-published-000', 'scheduled-000'],
    bsonDateVerified: true,
  });
});

test('smoke QUERY 拒绝 malformed 多文档 entry', async () => {
  const execute = createCliExecutor({
    envId: 'cloudbase-d0gizacy77a1ab017',
    runner: {
      execute(action) {
        return {
          requestId: `request-${action}`,
          data: [
            {
              _id: 'valid',
              event_start: '2026-10-09T06:00:00.000Z',
              event_end: '2026-10-09T10:00:00.000Z',
            },
            null,
          ],
        };
      },
    },
  });

  await assert.rejects(
    () =>
      execute({
        kind: 'smoke',
        collection: PROBE_COLLECTION,
        asOf: PROBE_AS_OF,
      }),
    /QUERY 多文档响应包含非法 entry/,
  );
});

test('runner 失败也在 finally 精确 drop 并回读同名集合为零', async () => {
  const operations = [];
  const execute = async (operation) => {
    operations.push(operation);
    if (operation.kind === 'explain' && operation.name === 'scheduled')
      throw new Error('planner failed');
    if (operation.kind === 'explain')
      return {
        requestId: `request-${operation.name}`,
        plan: validExplainPlan(
          operation.name.includes('finished') ? 'public_event_end' : 'public_event_start',
        ),
      };
    if (operation.kind === 'verify-date-types')
      return { requestId: 'request-date-readback', items: dateReadbackItems() };
    if (operation.kind === 'list-collections') return { collections: [] };
    return { requestId: `request-${operation.kind}` };
  };

  let failure;
  try {
    await runProbe({
      envId: 'cloudbase-d0gizacy77a1ab017',
      collection: PROBE_COLLECTION,
      execute,
    });
  } catch (error) {
    failure = error;
  }

  assert.match(failure?.message ?? '', /planner failed/);
  assert.equal(failure?.probeSummary?.cleanup?.remaining, 0);
  assert.deepEqual(failure?.probeSummary?.explains?.at(-1), {
    name: 'scheduled',
    requestId: '',
    passed: false,
    error: 'planner failed',
  });

  const drop = operations.at(-2);
  const verify = operations.at(-1);
  assert.deepEqual(
    { kind: drop.kind, collection: drop.collection },
    { kind: 'drop', collection: PROBE_COLLECTION },
  );
  assert.deepEqual(
    { kind: verify.kind, collection: verify.collection },
    { kind: 'list-collections', collection: PROBE_COLLECTION },
  );
  assert.equal(
    operations.some((item) => item.collection === 'activities'),
    false,
  );
});

test('清理回读仍发现同名集合时 fail closed', async () => {
  let listCalls = 0;
  const execute = async (operation) => {
    if (operation.kind === 'explain')
      return {
        requestId: `request-${operation.name}`,
        plan: validExplainPlan(
          operation.name.includes('finished') || operation.name.includes('past-published')
            ? 'public_event_end'
            : 'public_event_start',
        ),
      };
    if (operation.kind === 'smoke') return { requestId: 'request-smoke', pages: [] };
    if (operation.kind === 'verify-date-types')
      return { requestId: 'request-date-readback', items: dateReadbackItems() };
    if (operation.kind === 'list-collections') {
      listCalls += 1;
      return listCalls === 1 ? { collections: [] } : { collections: [{ name: PROBE_COLLECTION }] };
    }
    return { requestId: `request-${operation.kind}` };
  };

  await assert.rejects(
    () =>
      runProbe({
        envId: 'cloudbase-d0gizacy77a1ab017',
        collection: PROBE_COLLECTION,
        execute,
      }),
    /临时集合清理未收敛/,
  );
});

test('explain 缺失或不可数值指标显式记录为 null', async () => {
  let listCalls = 0;
  const execute = async (operation) => {
    if (operation.kind === 'list-collections') {
      listCalls += 1;
      return { requestId: `request-list-${listCalls}`, collections: [] };
    }
    if (operation.kind === 'explain') {
      const expectedIndex =
        operation.name.includes('finished') || operation.name.includes('past-published')
          ? 'public_event_end'
          : 'public_event_start';
      return {
        requestId: `request-${operation.name}`,
        plan: {
          ...validExplainPlan(expectedIndex),
          executionStats: {
            nReturned: undefined,
            totalKeysExamined: {},
            totalDocsExamined: Number.NaN,
          },
        },
      };
    }
    if (operation.kind === 'smoke') return { requestIds: [], future: {}, history: {} };
    if (operation.kind === 'verify-date-types')
      return { requestId: 'request-date-readback', items: dateReadbackItems() };
    return { requestId: `request-${operation.kind}` };
  };

  const summary = await runProbe({
    envId: 'cloudbase-d0gizacy77a1ab017',
    collection: PROBE_COLLECTION,
    execute,
  });

  for (const explain of summary.explains) {
    assert.equal(explain.nReturned, null);
    assert.equal(explain.totalKeysExamined, null);
    assert.equal(explain.totalDocsExamined, null);
  }
});
