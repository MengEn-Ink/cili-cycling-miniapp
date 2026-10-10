import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  CloudBaseCliRunner,
  COLLECTIONS,
  DENY_RULE,
  INDEXES,
  applyPlan,
  buildPlan,
  resolveTarget,
  runBootstrap,
  verifyState,
} from './bootstrap-cloudbase.mjs';

const require = createRequire(import.meta.url);
const {
  RECOVERY_LEASE_MS,
  RECOVERY_CONFIRMATION_MS,
  STORAGE_SETTLE_MARGIN_MS,
} = require('../cloudfunctions/profile-media-cleanup/core');
const { IMPORT_LEASE_MS } = require('../cloudfunctions/profile/avatar-import');

const PUBLIC_EVENT_START = {
  collection: 'activities',
  name: 'activities_public_event_start',
  keys: [
    ['status', 1],
    ['event_start', 1],
    ['_id', 1],
    ['event_end', 1],
  ],
  unique: false,
};
const PUBLIC_EVENT_END = {
  collection: 'activities',
  name: 'activities_public_event_end',
  keys: [
    ['status', 1],
    ['event_end', -1],
    ['_id', -1],
    ['event_start', -1],
  ],
  unique: false,
};

function completeState() {
  return {
    tables: new Set(COLLECTIONS),
    indexes: new Map(
      COLLECTIONS.map((collection) => [
        collection,
        INDEXES.filter((index) => index.collection === collection).map((index) => ({ ...index })),
      ]),
    ),
    rules: new Map(
      COLLECTIONS.map((collection) => [
        collection,
        { AclTag: 'CUSTOM', Rule: JSON.stringify(DENY_RULE) },
      ]),
    ),
  };
}

class RecordingRunner {
  constructor(handler) {
    this.calls = [];
    this.handler = handler;
  }

  async api(action, body) {
    this.calls.push({ action, body });
    return this.handler?.(action, body, this.calls) ?? {};
  }
}

test('默认 plan 只读取，不执行写动作', async () => {
  const runner = new RecordingRunner((action) => {
    if (action === 'ListTables') return { Tables: [] };
    throw new Error(`unexpected action ${action}`);
  });
  const lines = [];
  await runBootstrap({
    runner,
    target: { envId: 'env-test', region: 'ap-shanghai' },
    mode: 'plan',
    output: (line) => lines.push(line),
  });
  assert.deepEqual(
    runner.calls.map((call) => call.action),
    ['ListTables'],
  );
  assert.match(lines[0], /"只读": true/);
});

test('缺失集合计划创建并以 ADMINONLY 创建', async () => {
  const state = completeState();
  state.tables.delete('profiles');
  state.indexes.delete('profiles');
  state.rules.delete('profiles');
  const plan = buildPlan(state);
  assert.ok(
    plan.actions.some(
      (action) => action.type === 'create_collection' && action.collection === 'profiles',
    ),
  );
  assert.ok(
    plan.actions.some((action) => action.type === 'set_rule' && action.collection === 'profiles'),
  );

  const runner = new RecordingRunner((action) => {
    if (action === 'CreateTable' || action === 'ModifySafeRule') {
      return { RequestId: `request-${action}` };
    }
    if (action === 'ListTables') return { Tables: [{ TableName: 'profiles' }] };
    if (action === 'DescribeSafeRule') {
      return { AclTag: 'CUSTOM', Rule: JSON.stringify(DENY_RULE), RequestId: 'request-rule-read' };
    }
    throw new Error(`unexpected action ${action}`);
  });
  const applied = await applyPlan(
    runner,
    { envId: 'env-test', region: 'ap-shanghai', wxAppId: 'wx-test' },
    plan,
    new Date(),
    { timeoutMs: 10, intervalMs: 0, wait: async () => {} },
  );
  const create = runner.calls.find((call) => call.action === 'CreateTable');
  assert.deepEqual(create.body.PermissionInfo, { EnvId: 'env-test', AclTag: 'ADMINONLY' });
  assert.equal(applied[0].requestId, 'request-CreateTable');
});

test('写响应成功但资源不可见时超时且不记为已执行', async () => {
  const runner = new RecordingRunner((action) => {
    if (action === 'CreateTable') return { RequestId: 'request-create' };
    if (action === 'ListTables') return { Tables: [] };
    throw new Error(`unexpected action ${action}`);
  });
  await assert.rejects(
    () =>
      applyPlan(
        runner,
        { envId: 'env-test', region: 'ap-shanghai' },
        {
          conflicts: [],
          actions: [{ type: 'create_collection', collection: 'activities' }],
        },
        new Date(),
        { timeoutMs: 0, intervalMs: 0, wait: async () => {} },
      ),
    /仍不可见/,
  );
});

test('全部已存在且一致时跳过', () => {
  assert.deepEqual(buildPlan(completeState()), { actions: [], conflicts: [] });
});

test('成员活动列表组合索引纳入 plan 且完整状态可通过 verify 规划', () => {
  const expected = INDEXES.find((index) => index.name === 'activities_created_by_event_start');
  assert.deepEqual(expected?.keys, [
    ['created_by', 1],
    ['event_start', -1],
  ]);
  const state = completeState();
  state.indexes.set(
    'activities',
    state.indexes
      .get('activities')
      .filter((index) => index.name !== 'activities_created_by_event_start'),
  );
  assert.deepEqual(buildPlan(state).actions, [
    { type: 'create_index', collection: 'activities', index: expected },
  ]);
  assert.deepEqual(buildPlan(completeState()), { actions: [], conflicts: [] });
});

test('活动管理 keyset 分页索引按等值过滤前缀与稳定排序字段排列', () => {
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'activities_status_deleted_event_start_id')?.keys,
    [
      ['status', 1],
      ['is_deleted', 1],
      ['event_start', -1],
      ['_id', -1],
    ],
  );
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'activities_owner_status_deleted_event_start_id')?.keys,
    [
      ['created_by', 1],
      ['status', 1],
      ['is_deleted', 1],
      ['event_start', -1],
      ['_id', -1],
    ],
  );
  const schema = readFileSync(new URL('../docs/cloudbase-schema.md', import.meta.url), 'utf8');
  assert.match(schema, /activities \| status ASC, is_deleted ASC, event_start DESC, _id DESC/);
  assert.match(
    schema,
    /activities \| created_by ASC, status ASC, is_deleted ASC, event_start DESC, _id DESC/,
  );
});

test('活动首页未来和历史筛选具备显式复合索引', () => {
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'activities_status_event_end_event_start_asc')?.keys,
    [
      ['status', 1],
      ['event_end', 1],
      ['event_start', 1],
    ],
  );
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'activities_status_event_end_event_start_desc')?.keys,
    [
      ['status', 1],
      ['event_end', 1],
      ['event_start', -1],
    ],
  );
});

test('活动首页 planner 索引纳入 bootstrap exact plan 与 verify', () => {
  assert.deepEqual(
    INDEXES.filter((index) => index.name.startsWith('activities_public_event_')),
    [PUBLIC_EVENT_START, PUBLIC_EVENT_END],
  );
  assert.equal(INDEXES.length, 31);

  const missing = completeState();
  missing.indexes.set(
    'activities',
    missing.indexes
      .get('activities')
      .filter((index) => !index.name.startsWith('activities_public_event_')),
  );
  assert.deepEqual(
    buildPlan(missing).actions.filter((action) => action.type === 'create_index'),
    [
      { type: 'create_index', collection: 'activities', index: PUBLIC_EVENT_START },
      { type: 'create_index', collection: 'activities', index: PUBLIC_EVENT_END },
    ],
  );
  assert.deepEqual(verifyState(missing), [
    'activities.activities_public_event_start: 索引缺失',
    'activities.activities_public_event_end: 索引缺失',
  ]);

  const conflict = completeState();
  conflict.indexes
    .get('activities')
    .find((index) => index.name === 'activities_public_event_start').keys = [['status', -1]];
  assert.deepEqual(buildPlan(conflict).conflicts, [
    {
      collection: 'activities',
      index: 'activities_public_event_start',
      reason: '同名索引定义不一致',
    },
  ]);
  assert.deepEqual(buildPlan(completeState()), { actions: [], conflicts: [] });
  assert.deepEqual(verifyState(completeState()), []);
});

test('同名索引定义冲突会阻断', async () => {
  const state = completeState();
  state.indexes.get('activities')[0].keys = [['status', -1]];
  const plan = buildPlan(state);
  assert.equal(plan.conflicts[0].reason, '同名索引定义不一致');
  await assert.rejects(
    () => applyPlan(new RecordingRunner(), { envId: 'env-test' }, plan),
    /阻止 apply/,
  );
});

test('权限不一致时仅生成修复权限计划', () => {
  const state = completeState();
  state.rules.set('admins', { AclTag: 'ADMINONLY' });
  const plan = buildPlan(state);
  assert.deepEqual(plan.actions, [{ type: 'set_rule', collection: 'admins' }]);
});

test('demo 缺失时 bootstrap plan 保持零动作且 verify 不失败', () => {
  const state = completeState();
  state.demo = undefined;
  assert.deepEqual(buildPlan(state), { actions: [], conflicts: [] });
  assert.deepEqual(verifyState(state), []);
});

test('runner 错误令 bootstrap 拒绝并由入口设置非零退出码', async () => {
  const runner = new RecordingRunner(() => {
    throw new Error('read failed');
  });
  await assert.rejects(
    () =>
      runBootstrap({
        runner,
        target: { envId: 'env-test', region: 'ap-shanghai' },
        mode: 'plan',
        output: () => {},
      }),
    /read failed/,
  );
});

test('入口参数错误时以非零状态退出', () => {
  const result = spawnSync(process.execPath, ['scripts/bootstrap-cloudbase.mjs', '--unknown'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不支持的参数/);
});

test('CLI runner 解析 data envelope、使用无 shell 参数数组，并拒绝业务失败', () => {
  let invocation;
  const runner = new CloudBaseCliRunner({
    spawn(command, args, options) {
      invocation = { command, args, options };
      return {
        status: 0,
        stdout: 'ℹ → TCB.ListTables\n{"data":{"RequestId":"request-list","Tables":[]}}',
        stderr: '',
      };
    },
  });
  const response = runner.api(
    'ListTables',
    { EnvId: 'env-test', MgoLimit: 1000 },
    { envId: 'env-test', region: 'ap-shanghai' },
  );
  assert.deepEqual(response, { RequestId: 'request-list', Tables: [] });
  assert.equal(invocation.command, 'npx');
  assert.equal(invocation.options.shell, false);
  assert.deepEqual(invocation.args.slice(0, 10), [
    '--yes',
    '--package',
    '@cloudbase/cli@3.8.4',
    'tcb',
    '--json',
    '--env-id',
    'env-test',
    '--region',
    'ap-shanghai',
    'api',
  ]);

  const processFailed = new CloudBaseCliRunner({
    spawn: () => ({ status: 2, stdout: '', stderr: 'token=fixture-value request failed' }),
  });
  assert.throws(
    () => processFailed.api('ListTables', {}, { envId: 'env-test', region: 'ap-shanghai' }),
    /ListTables 失败: token=<已隐藏> request failed/,
  );

  const stdoutFailed = new CloudBaseCliRunner({
    spawn: () => ({
      status: 1,
      stdout:
        'ℹ → TCB.UpdateTable\n{"error":{"code":"UnknownParameter","message":"ExpireAfterSeconds is not recognized","requestId":"request-ttl"}}',
      stderr: '',
    }),
  });
  assert.throws(
    () => stdoutFailed.api('UpdateTable', {}, { envId: 'env-test', region: 'ap-shanghai' }),
    /UnknownParameter: ExpireAfterSeconds is not recognized \(RequestId: request-ttl\)/,
  );

  const businessFailed = new CloudBaseCliRunner({
    spawn: () => ({
      status: 0,
      stdout:
        '{"data":{"RequestId":"request-failed","Error":{"Code":"InvalidParameter","Message":"bad body"}}}',
      stderr: '',
    }),
  });
  assert.throws(
    () => businessFailed.api('CreateTable', {}, { envId: 'env-test', region: 'ap-shanghai' }),
    /CreateTable 失败: InvalidParameter: bad body/,
  );

  const ambiguous = new CloudBaseCliRunner({
    spawn: () => ({ status: 0, stdout: '{"data":{}}', stderr: '' }),
  });
  assert.throws(
    () => ambiguous.api('CreateTable', {}, { envId: 'env-test', region: 'ap-shanghai' }),
    /缺少 RequestId/,
  );
});

test('环境覆盖必须与显式确认完全一致', () => {
  const config = { envId: 'allowed' };
  assert.deepEqual(resolveTarget(config, { region: 'ap-shanghai' }), {
    envId: 'allowed',
    region: 'ap-shanghai',
  });
  assert.throws(() => resolveTarget(config, { envId: 'other', region: 'ap-shanghai' }), /追加/);
  assert.equal(
    resolveTarget(config, {
      envId: 'other',
      confirmedEnvId: 'other',
      region: 'ap-shanghai',
    }).envId,
    'other',
  );
});

test('OAuth 与 Strava 集合包含 attempt fencing、唯一、普通过期时间和同步索引', () => {
  assert.equal(COLLECTIONS.includes('oauth_states'), true);
  assert.equal(COLLECTIONS.includes('oauth_attempts'), true);
  assert.equal(COLLECTIONS.includes('strava_credentials'), true);
  assert.equal(COLLECTIONS.includes('strava_snapshots'), true);
  assert.equal(COLLECTIONS.includes('strava_route_previews'), true);
  assert.deepEqual(
    INDEXES.find((item) => item.name === 'oauth_states_expires_at'),
    {
      collection: 'oauth_states',
      name: 'oauth_states_expires_at',
      keys: [['expires_at', 1]],
      unique: false,
    },
  );
  const activeStateIndex = INDEXES.find((item) => item.name === 'oauth_states_openid_expires_at');
  assert.deepEqual(activeStateIndex, {
    collection: 'oauth_states',
    name: 'oauth_states_openid_expires_at',
    keys: [
      ['openid', 1],
      ['expires_at', -1],
    ],
    unique: false,
  });
  assert.equal(COLLECTIONS.length, 13);
  assert.equal(INDEXES.length, 31);
  assert.equal(
    INDEXES.some((item) => item.collection === 'oauth_attempts'),
    false,
  );
  const complete = completeState();
  assert.deepEqual(complete.rules.get('oauth_attempts'), {
    AclTag: 'CUSTOM',
    Rule: JSON.stringify(DENY_RULE),
  });
  assert.equal(INDEXES.find((item) => item.name === 'oauth_states_state_hash')?.unique, true);
  assert.equal(
    INDEXES.some((item) => item.name === 'strava_snapshots_synced_at'),
    true,
  );
  const schema = readFileSync(new URL('../docs/cloudbase-schema.md', import.meta.url), 'utf8');
  assert.match(schema, /### `oauth_attempts`/);
  assert.match(schema, /attempt_generation/);
  assert.match(schema, /不添加额外业务索引/);
  assert.match(schema, /客户端全拒绝 ACL/);
});

test('候补 FIFO 与队伍邀请查询使用显式复合索引', () => {
  assert.deepEqual(
    INDEXES.find((item) => item.name === 'registrations_activity_waiting_mode_created_at')?.keys,
    [
      ['activity_id', 1],
      ['status', 1],
      ['options.gathering_mode', 1],
      ['created_at', 1],
    ],
  );
  assert.deepEqual(
    INDEXES.find((item) => item.name === 'registrations_activity_team_leader')?.keys,
    [
      ['activity_id', 1],
      ['team_id', 1],
      ['is_team_leader', 1],
    ],
  );
});

test('notification_outbox 使用租约扫描索引并保持客户端全拒绝', () => {
  assert.ok(COLLECTIONS.includes('notification_outbox'));
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'notification_outbox_status_attempts_lease')?.keys,
    [
      ['status', 1],
      ['attempts', 1],
      ['lease_expires_at', 1],
    ],
  );
  assert.deepEqual(DENY_RULE, { read: false, write: false });
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'notification_outbox_status_attempts_retry')?.keys,
    [
      ['status', 1],
      ['attempts', 1],
      ['next_retry_at', 1],
    ],
  );
});

test('CloudBase schema 文档列出 notification_outbox 和活动时间线索引并与 31 条总数一致', () => {
  const schema = readFileSync(new URL('../docs/cloudbase-schema.md', import.meta.url), 'utf8');
  assert.match(schema, /notification_outbox \| status ASC, attempts ASC, lease_expires_at ASC/);
  assert.match(schema, /notification_outbox \| target_openid ASC, created_at DESC/);
  assert.match(schema, /notification_outbox \| status ASC, attempts ASC, next_retry_at ASC/);
  assert.match(schema, /activities \| status ASC, event_start ASC, _id ASC, event_end ASC/);
  assert.match(schema, /activities \| status ASC, event_end DESC, _id DESC, event_start DESC/);
  assert.match(schema, /全拒绝规则与 31 索引/);
});

test('profile_media 使用 owner/status、Strava 断开分页与过期清理索引并保持客户端全拒绝', () => {
  assert.ok(COLLECTIONS.includes('profile_media'));
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'profile_media_owner_status_created_at')?.keys,
    [
      ['owner_openid', 1],
      ['status', 1],
      ['created_at', -1],
    ],
  );
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'profile_media_owner_origin_status_id')?.keys,
    [
      ['owner_openid', 1],
      ['origin', 1],
      ['status', 1],
      ['_id', 1],
    ],
  );
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'profile_media_status_cleanup_after')?.keys,
    [
      ['status', 1],
      ['cleanup_after', 1],
    ],
  );
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'profile_media_status_delete_lease_expires_at')?.keys,
    [
      ['status', 1],
      ['delete_lease_expires_at', 1],
    ],
  );
  assert.deepEqual(INDEXES.find((index) => index.name === 'profile_media_status_retry_at')?.keys, [
    ['status', 1],
    ['retry_at', 1],
  ]);
  assert.equal(COLLECTIONS.length, 13);
  assert.equal(INDEXES.length, 31);
  assert.deepEqual(DENY_RULE, { read: false, write: false });
});

test('profile_media_imports 使用全拒绝 ACL 与完整 cleanup 扫描索引', () => {
  assert.ok(COLLECTIONS.includes('profile_media_imports'));
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'profile_media_imports_status_cleanup_after')?.keys,
    [
      ['status', 1],
      ['cleanup_after', 1],
    ],
  );
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'profile_media_imports_status_delete_lease_expires_at')
      ?.keys,
    [
      ['status', 1],
      ['delete_lease_expires_at', 1],
    ],
  );
  assert.deepEqual(
    INDEXES.find((index) => index.name === 'profile_media_imports_status_retry_at')?.keys,
    [
      ['status', 1],
      ['retry_at', 1],
    ],
  );
  assert.deepEqual(DENY_RULE, { read: false, write: false });
  const schema = readFileSync(new URL('../docs/cloudbase-schema.md', import.meta.url), 'utf8');
  assert.match(schema, /### `profile_media_imports`/);
  assert.match(schema, /profile_media_imports \| status ASC, cleanup_after ASC/);
  assert.match(schema, /profile_media_imports \| status ASC, delete_lease_expires_at ASC/);
  assert.match(schema, /profile_media_imports \| status ASC, retry_at ASC/);
  assert.match(schema, /13 集合、全拒绝规则与 31 索引/);
  assert.match(schema, /avatar_revision/);
  assert.match(schema, /origin: wechat\|strava\|custom/);
  assert.match(schema, /status: leased\|prepared\|uploaded/);
  assert.match(schema, /avatar_url_fingerprint/);
  assert.match(schema, /avatar_import_lease_expires_at/);
});

test('profile_media cleanup 配置真实且有界的定时执行器', () => {
  const config = JSON.parse(readFileSync(new URL('../cloudbaserc.json', import.meta.url), 'utf8'));
  const profile = config.functions.find((item) => item.name === 'profile');
  const cleanup = config.functions.find((item) => item.name === 'profile-media-cleanup');
  assert.ok(IMPORT_LEASE_MS > profile.timeout * 1000 + STORAGE_SETTLE_MARGIN_MS);
  assert.equal(cleanup?.handler, 'index.main');
  assert.equal(cleanup?.runtime, 'Nodejs20.19');
  assert.deepEqual(cleanup?.triggers, [
    {
      name: 'profile-media-cleanup-worker',
      type: 'timer',
      config: '0 */10 * * * * *',
    },
  ]);
  const runtimeUpperBoundMs = cleanup.timeout * 1000 + STORAGE_SETTLE_MARGIN_MS;
  assert.ok(RECOVERY_LEASE_MS > runtimeUpperBoundMs);
  assert.ok(RECOVERY_CONFIRMATION_MS > runtimeUpperBoundMs);
});

test('云存储规则只允许客户端写 staging，canonical 前缀保持 server-only', () => {
  const rules = JSON.parse(
    readFileSync(new URL('../cloudstorage.rules.json', import.meta.url), 'utf8'),
  );
  assert.equal(rules.read, false);
  assert.equal(
    rules.write,
    'auth != null && /^profiles\\//.test(resource.path) && resource.openid == auth.openid',
  );
  assert.equal(rules.write.includes('profile-canonical'), false);
});

test('README 与部署包断言包含 profile_media_imports 和头像导入入口', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const verifier = readFileSync(new URL('./verify-cloud-packages.mjs', import.meta.url), 'utf8');
  assert.match(readme, /13 个集合、31 个业务索引/);
  assert.match(verifier, /pack\('profile',[\s\S]*?'avatar-import\.js'/);
});

function assertClosedDocumentationGaps({ readme, requirements, seedGuide }) {
  assert.match(readme, /公开骑手头像默认展示[^。]*canonical 媒体签发临时地址/);
  assert.doesNotMatch(readme, /显式公开授权|授权 revision 与当前头像 revision 一致/);
  assert.match(requirements, /新设置头像会同步写入 `avatar_visibility=public` 及当前 revision/);
  assert.match(requirements, /活动详情不再以历史可见性字段作为展示门槛/);
  assert.doesNotMatch(requirements, /存量资料默认按私有处理|必须由用户主动公开/);
  assert.doesNotMatch(
    requirements,
    /strava_route_previews[^。]{0,50}(?:尚未|仍未|并不|没有|未纳入|手工创建)[^。]{0,50}(?:bootstrap|管理)/,
  );
  assert.match(
    seedGuide,
    new RegExp(`${COLLECTIONS.length} 个核心集合、${INDEXES.length} 个业务索引`),
  );
  assert.match(
    seedGuide,
    /`strava_route_previews` 已由 bootstrap[^。]*管理，并纳入[^。]*`cloudbase:verify`/,
  );
  assert.doesNotMatch(
    seedGuide,
    /strava_route_previews[^。]*(?:尚未|仍未|并不|没有)[^。]*(?:bootstrap|管理)/,
  );
}

test('项目与初始化文档不再保留已关闭的头像和 route preview 缺口', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const requirements = readFileSync(
    new URL('../docs/requirements-design.md', import.meta.url),
    'utf8',
  );
  const seedGuide = readFileSync(new URL('./seed-cloudbase/README.md', import.meta.url), 'utf8');

  assertClosedDocumentationGaps({ readme, requirements, seedGuide });
});

test('文档契约测试拒绝已关闭缺口的同义否定表述', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const requirements = readFileSync(
    new URL('../docs/requirements-design.md', import.meta.url),
    'utf8',
  );
  const seedGuide = readFileSync(new URL('./seed-cloudbase/README.md', import.meta.url), 'utf8');

  assert.throws(() =>
    assertClosedDocumentationGaps({
      readme: readme.replace('公开骑手头像默认展示', '公开骑手头像仍未默认展示'),
      requirements,
      seedGuide,
    }),
  );
  assert.throws(() =>
    assertClosedDocumentationGaps({
      readme,
      requirements: requirements.replace('新设置头像会同步写入', '新设置头像仍未同步写入'),
      seedGuide,
    }),
  );
  assert.throws(() =>
    assertClosedDocumentationGaps({
      readme,
      requirements: `${requirements}\n\`strava_route_previews\` 目前仍未纳入 bootstrap，需手工创建。`,
      seedGuide,
    }),
  );
  assert.throws(() =>
    assertClosedDocumentationGaps({
      readme,
      requirements,
      seedGuide: seedGuide.replace(
        '`strava_route_previews` 已由 bootstrap 与其他服务端可信集合一并管理，并纳入',
        '`strava_route_previews` 目前 bootstrap 并不管理，应手工创建；未来纳入',
      ),
    }),
  );
});

test('媒体滚动部署先发布 fail-closed admin-review 再发布 canonical profile', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const sequence = readme.match(/再依次部署 ([^。]+)。/)?.[1] || '';
  const order = [...sequence.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  assert.deepEqual(order.slice(0, 3), ['auth', 'profile-media-cleanup', 'admin-review']);
  assert.ok(order.indexOf('admin-review') < order.indexOf('profile'));
  assert.match(readme, /旧 `admin-review`[^。]*source[^。]*禁止进入 `profile` 部署/);
});
