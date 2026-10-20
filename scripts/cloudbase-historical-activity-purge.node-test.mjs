import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  APPLY_GATE_VALUE,
  AUDIT_COLLECTION,
  CONFIRMATION_PHRASE,
  assertApplyGate,
  isHistoricalActivity,
  purgeHistoricalActivities,
  selectHistoricalActivities,
} from './cloudbase-historical-activity-purge.mjs';

const ENV_ID = 'env-production';
const CUTOFF = '2026-10-21T00:00:00.000Z';
const applyOptions = {
  apply: true,
  envId: ENV_ID,
  confirmEnvId: ENV_ID,
  configuredEnvId: ENV_ID,
  confirmation: CONFIRMATION_PHRASE,
  cutoff: CUTOFF,
  env: { CILI_ALLOW_HISTORICAL_ACTIVITY_PURGE: APPLY_GATE_VALUE },
  log() {},
};

function valueAt(document, path) {
  return path.split('.').reduce((value, key) => value?.[key], document);
}

function matches(document, filter) {
  return Object.entries(filter).every(([field, expected]) => {
    const actual = valueAt(document, field);
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.includes(actual);
    }
    return Object.is(actual, expected);
  });
}

function memoryStore(seed, { sticky = [], queryFailure } = {}) {
  const state = Object.fromEntries(
    Object.entries(seed).map(([collection, documents]) => [
      collection,
      documents.map((document) => structuredClone(document)),
    ]),
  );
  const calls = [];
  return {
    state,
    calls,
    async query(collection, filter, limit) {
      calls.push(['query', collection, structuredClone(filter), limit]);
      if (queryFailure?.(collection, filter, calls)) throw new Error('query failed');
      return (state[collection] || [])
        .filter((document) => matches(document, filter))
        .slice(0, limit);
    },
    async removeMany(collection, filter) {
      calls.push(['removeMany', collection, structuredClone(filter)]);
      const retained = [];
      for (const document of state[collection] || []) {
        if (!matches(document, filter) || sticky.includes(document._id)) retained.push(document);
      }
      state[collection] = retained;
    },
  };
}

function fixtureSeed() {
  return {
    activities: [
      { _id: 'past', event_end: '2026-10-20T23:59:59.999Z', is_deleted: false },
      { _id: 'future', event_end: '2026-10-21T00:00:00.001Z', is_deleted: false },
      { _id: 'other', event_end: '2026-10-23T00:00:00.000Z', is_deleted: false },
    ],
    registrations: [
      { _id: 'registration-past', activity_id: 'past' },
      { _id: 'registration-future', activity_id: 'future' },
    ],
    route_previews: [
      { _id: 'preview-past', attached_activity_id: 'past' },
      { _id: 'preview-unattached', attached_activity_id: '' },
      { _id: 'preview-future', attached_activity_id: 'future' },
    ],
    audit_logs: [
      { _id: 'audit-past', target_id: 'past' },
      { _id: 'audit-other', target_id: 'unrelated' },
    ],
    notification_outbox: [
      { _id: 'notice-past', payload: { activity_id: 'past' } },
      { _id: 'notice-future', payload: { activity_id: 'future' } },
    ],
    profiles: [{ _id: 'profile-1' }],
    clubs: [{ _id: 'club-1' }],
    club_memberships: [{ _id: 'member-1' }],
  };
}

test('默认 dry-run 只查询并输出集合计数与活动 id，不执行删除', async () => {
  const store = memoryStore(fixtureSeed());
  const logs = [];
  const result = await purgeHistoricalActivities(
    {
      ...applyOptions,
      apply: false,
      confirmEnvId: '',
      confirmation: '',
      env: {},
      log: (line) => logs.push(line),
    },
    store,
  );

  assert.equal(result.applied, false);
  assert.deepEqual(result.ids, ['past']);
  assert.deepEqual(result.counts, {
    activities: 1,
    registrations: 1,
    route_previews: 1,
    audit_logs: 1,
    notification_outbox: 1,
  });
  assert.equal(
    store.calls.some(([operation]) => operation === 'removeMany'),
    false,
  );
  assert.match(logs[0], /counts=.*activity_ids=\["past"\]/);
});

test('真实删除必须同时通过固定 gate、环境三方一致和精确确认短语', () => {
  assert.doesNotThrow(() => assertApplyGate(applyOptions));
  for (const patch of [
    { env: {} },
    { env: { CILI_ALLOW_HISTORICAL_ACTIVITY_PURGE: 'yes' } },
    { envId: '' },
    { confirmEnvId: 'other' },
    { configuredEnvId: 'other' },
    { confirmation: 'DELETE' },
  ]) {
    assert.throws(() => assertApplyGate({ ...applyOptions, ...patch }), /拒绝清理/);
  }
  assert.doesNotThrow(() =>
    assertApplyGate({ ...applyOptions, apply: false, env: {}, confirmation: '' }),
  );
});

test('门禁失败发生在任何数据库读取之前', async () => {
  const store = memoryStore(fixtureSeed());
  await assert.rejects(
    purgeHistoricalActivities({ ...applyOptions, confirmEnvId: 'wrong' }, store),
    /三方一致/,
  );
  assert.deepEqual(store.calls, []);
});

test('边界时间严格使用 event_end < cutoff，等于 cutoff 不删除', () => {
  const activities = [
    { _id: 'before', event_end: '2026-10-20T23:59:59.999Z' },
    { _id: 'equal', event_end: CUTOFF },
    { _id: 'after', event_end: '2026-10-21T00:00:00.001Z' },
    { _id: 'deleted-old', event_end: '2026-10-20T00:00:00.000Z', is_deleted: true },
  ];
  assert.deepEqual(
    selectHistoricalActivities(activities, CUTOFF).map(({ _id }) => _id),
    ['before', 'deleted-old'],
  );
  assert.equal(isHistoricalActivity(activities[1], CUTOFF), false);
});

test('未来和进行中活动受到硬保护，包括 is_deleted=true 的未来活动', () => {
  for (const activity of [
    { _id: 'ongoing', event_end: CUTOFF, is_deleted: false },
    { _id: 'future', event_end: '2999-01-01T00:00:00.000Z', is_deleted: false },
    { _id: 'deleted-future', event_end: '2999-01-01T00:00:00.000Z', is_deleted: true },
  ]) {
    assert.equal(isHistoricalActivity(activity, CUTOFF), false);
  }
  assert.equal(
    isHistoricalActivity(
      { _id: 'soft-deleted-past', event_end: '2020-01-01T00:00:00.000Z', is_deleted: true },
      CUTOFF,
    ),
    true,
  );
});

test('关联过滤只按约定字段命中，媒体只删明确绑定活动的 route preview', async () => {
  const store = memoryStore(fixtureSeed());
  await purgeHistoricalActivities(applyOptions, store);

  assert.deepEqual(
    store.state.registrations.map(({ _id }) => _id),
    ['registration-future'],
  );
  assert.deepEqual(
    store.state.route_previews.map(({ _id }) => _id),
    ['preview-unattached', 'preview-future'],
  );
  assert.deepEqual(
    store.state.audit_logs.map(({ _id }) => _id),
    ['audit-other'],
  );
  assert.deepEqual(
    store.state.notification_outbox.map(({ _id }) => _id),
    ['notice-future'],
  );
  assert.deepEqual(
    store.state.activities.map(({ _id }) => _id),
    ['future', 'other'],
  );
  assert.deepEqual(store.state.profiles, [{ _id: 'profile-1' }]);
  assert.deepEqual(store.state.clubs, [{ _id: 'club-1' }]);
  assert.deepEqual(store.state.club_memberships, [{ _id: 'member-1' }]);
});

test('删除顺序固定为四个关联集合后 activities，审计使用仓库事实 audit_logs', async () => {
  const store = memoryStore(fixtureSeed());
  await purgeHistoricalActivities(applyOptions, store);
  assert.deepEqual(
    store.calls
      .filter(([operation]) => operation === 'removeMany')
      .map(([, collection]) => collection),
    ['registrations', 'route_previews', 'audit_logs', 'notification_outbox', 'activities'],
  );
  assert.equal(AUDIT_COLLECTION, 'audit_logs');
});

test('删除前重新回读资格，活动变为未来时 fail closed 且不删除', async () => {
  const seed = fixtureSeed();
  let activityQueries = 0;
  const base = memoryStore(seed);
  const originalQuery = base.query.bind(base);
  base.query = async (collection, filter, limit) => {
    if (collection === 'activities') {
      activityQueries += 1;
      if (activityQueries === 2) {
        base.state.activities.find(({ _id }) => _id === 'past').event_end =
          '2999-01-01T00:00:00.000Z';
      }
    }
    return originalQuery(collection, filter, limit);
  };

  await assert.rejects(purgeHistoricalActivities(applyOptions, base), /资格回读失败/);
  assert.equal(
    base.calls.some(([operation]) => operation === 'removeMany'),
    false,
  );
});

test('删除后逐集合回读必须全部为 0，残留时失败', async () => {
  const store = memoryStore(fixtureSeed(), { sticky: ['notice-past'] });
  await assert.rejects(
    purgeHistoricalActivities(applyOptions, store),
    /清理后回读失败.*notification_outbox=1/,
  );
});

test('空结果和重复执行均幂等，第二次不发出删除', async () => {
  const store = memoryStore(fixtureSeed());
  const first = await purgeHistoricalActivities(applyOptions, store);
  const deletionCount = store.calls.filter(([operation]) => operation === 'removeMany').length;
  const second = await purgeHistoricalActivities(applyOptions, store);
  assert.equal(first.applied, true);
  assert.deepEqual(second.ids, []);
  assert.equal(
    store.calls.filter(([operation]) => operation === 'removeMany').length,
    deletionCount,
  );
});

test('任一步查询失败会直接拒绝且不继续删除', async () => {
  const store = memoryStore(fixtureSeed(), {
    queryFailure: (collection) => collection === 'route_previews',
  });
  await assert.rejects(purgeHistoricalActivities(applyOptions, store), /query failed/);
  assert.equal(
    store.calls.some(([operation]) => operation === 'removeMany'),
    false,
  );
});

test('实现复用 smoke 的三项 CLI 导出且不触碰禁止集合', () => {
  const source = readFileSync('scripts/cloudbase-historical-activity-purge.mjs', 'utf8');
  assert.match(
    source,
    /import\s*\{[\s\S]*createCliStore,[\s\S]*nosqlCommandArgs,[\s\S]*parseNosqlDocuments,[\s\S]*\}\s*from '\.\/cloudbase-club-application-smoke\.mjs'/,
  );
  assert.doesNotMatch(source, /removeMany\(['"](?:profiles|clubs|club_memberships)['"]/);
  assert.doesNotMatch(source, /activity_audits/);
});

test('CloudBase workflow 仅在手动触发和精确确认后执行历史活动清理', () => {
  const workflow = readFileSync('.github/workflows/deploy-cloudbase.yml', 'utf8');
  assert.match(workflow, /purge_historical_activities:/);
  assert.match(workflow, /historical_activity_confirmation:/);
  assert.match(workflow, /inputs\.purge_historical_activities == true/);
  assert.match(
    workflow,
    /inputs\.historical_activity_confirmation == 'DELETE_HISTORICAL_ACTIVITY_DATA'/,
  );
  assert.match(workflow, /CILI_ALLOW_HISTORICAL_ACTIVITY_PURGE: historical-activity-purge/);
  assert.match(workflow, /cloudbase:purge:historical-activities/);
});
