import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CONFIRMATION_PHRASE,
  CLEANUP_STALL_ROUND_BUDGET,
  MEDIA_CLEANUP_BATCH_SIZE,
  STORAGE_PREFIXES,
  assertApplyGate,
  calculateMaxCleanupRounds,
  createCliAdapter,
  createMutationCommands,
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

test('更新与删除命令严格限制集合、字段和终态状态', () => {
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
  const clubs = JSON.parse(prepare[0].Command);
  const applications = JSON.parse(prepare[1].Command);
  const activities = JSON.parse(prepare[2].Command);
  const routePreviews = JSON.parse(prepare[3].Command);
  assert.deepEqual(Object.keys(clubs.updates[0].u.$unset).sort(), ['avatar_url', 'cover_file_id']);
  assert.deepEqual(Object.keys(applications.updates[0].u.$unset).sort(), [
    'avatar_file_id',
    'cover_file_id',
  ]);
  assert.deepEqual(Object.keys(activities.updates[0].u.$unset).sort(), [
    'club_identity.avatar_url',
    'cover_image',
    'group_qr_code',
    'group_qr_code_uploaded_at',
    'images',
    'route.generated_preview_file_id',
    'route.public_route_preview_id',
  ]);
  assert.equal(
    activities.updates[0].q.$or.some(
      (condition) => condition['club_identity.avatar_url']?.$exists === true,
    ),
    true,
  );
  assert.deepEqual(routePreviews.deletes, [{ q: {}, limit: 0 }]);
  assert.equal(Object.hasOwn(activities.updates[0].u.$unset, 'route.gpx_file_id'), false);
  assert.deepEqual(
    finalize.map(({ TableName, CommandType }) => [TableName, CommandType]),
    [
      ['profile_media', 'DELETE'],
      ['profile_media_imports', 'DELETE'],
    ],
  );
  assert.deepEqual(JSON.parse(finalize[0].Command).deletes[0].q.status.$in, [
    'deleted',
    'delete_failed_terminal',
  ]);
  assert.deepEqual(JSON.parse(finalize[1].Command).deletes[0].q.status.$in, [
    'deleted',
    'completed',
    'invalid',
    'aborted',
    'delete_failed_terminal',
  ]);
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
      return JSON.stringify({ Data: [{ Result: JSON.stringify({ n: 2, ok: 1 }) }] });
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
  assert.match(source, /limit: 1/);
  assert.doesNotMatch(source, /limit:\s*(?:1000|10000|100000)/);
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
      return JSON.stringify({ Data: [] });
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
