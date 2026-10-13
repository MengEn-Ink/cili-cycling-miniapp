import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { assessUiSyncState, shouldSkipUiSync } from './check-ui-sync.mjs';

function png() {
  const buffer = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer);
  buffer.writeUInt32BE(390, 16);
  buffer.writeUInt32BE(790, 20);
  return buffer;
}

function manifest() {
  return {
    schemaVersion: 1,
    syncedThrough: 'a'.repeat(40),
    syncedAt: '2026-10-13T00:00:00.000Z',
    policy: { maxUnsyncedUiCommits: 4, maxAgeDays: 7 },
    source: { digest: `sha256:${'b'.repeat(64)}` },
    prototype: { digest: `sha256:${'c'.repeat(64)}` },
    routes: [{ id: 'activities', pagePath: 'pages/activities/index' }],
    evidence: {
      directory: 'docs/evidence/ui-sync/baseline',
      routes: [
        {
          id: 'activities',
          devtools: 'activities-devtools.png',
          pages: 'activities-pages.png',
        },
      ],
    },
  };
}

const baseState = {
  appPages: ['pages/activities/index'],
  baselineUiDigest: `sha256:${'b'.repeat(64)}`,
  currentPrototypeDigest: `sha256:${'c'.repeat(64)}`,
  readEvidence: () => png(),
  now: new Date('2026-10-14T00:00:00.000Z'),
};

test('零漂移清单在普通和发布严格模式均通过', () => {
  assert.deepEqual(
    assessUiSyncState({
      ...baseState,
      manifest: manifest(),
      uiCommitShas: [],
      changedFiles: [],
      strict: true,
    }),
    {
      ok: true,
      uiCommits: 0,
      ageDays: 1,
      remaining: 4,
      immediateFiles: [],
      reason: '当前没有未同步 UI 提交',
    },
  );
});

test('普通模式允许四个页面 UI 提交并报告剩余额度', () => {
  assert.deepEqual(
    assessUiSyncState({
      ...baseState,
      manifest: manifest(),
      uiCommitShas: ['1', '2', '3', '4'],
      changedFiles: ['miniprogram/pages/profile/index.wxml'],
    }),
    {
      ok: true,
      uiCommits: 4,
      ageDays: 1,
      remaining: 0,
      immediateFiles: [],
      reason: 'UI 漂移仍在预算内',
    },
  );
});

test('摘要不匹配在漂移预算计算前失败', () => {
  assert.throws(
    () =>
      assessUiSyncState({
        ...baseState,
        manifest: manifest(),
        baselineUiDigest: `sha256:${'d'.repeat(64)}`,
        currentPrototypeDigest: `sha256:${'e'.repeat(64)}`,
        uiCommitShas: [],
        changedFiles: [],
      }),
    /UI 基线摘要不匹配/,
  );
  assert.throws(
    () =>
      assessUiSyncState({
        ...baseState,
        manifest: manifest(),
        currentPrototypeDigest: `sha256:${'e'.repeat(64)}`,
        uiCommitShas: [],
        changedFiles: [],
      }),
    /Pages 原型摘要不匹配/,
  );
});

test('即时文件变化和发布严格模式阻断未同步 UI', () => {
  const immediate = assessUiSyncState({
    ...baseState,
    manifest: manifest(),
    uiCommitShas: ['1'],
    changedFiles: ['miniprogram/app.wxss'],
  });
  assert.equal(immediate.ok, false);
  assert.deepEqual(immediate.immediateFiles, ['miniprogram/app.wxss']);

  const strict = assessUiSyncState({
    ...baseState,
    manifest: manifest(),
    uiCommitShas: ['1'],
    changedFiles: ['miniprogram/pages/profile/index.wxml'],
    strict: true,
  });
  assert.equal(strict.ok, false);
  assert.match(strict.reason, /零漂移/);
});

test('普通 CI 和体验版晋级分别执行预算与零漂移门禁', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const promotion = readFileSync('.github/workflows/promote-miniprogram-experience.yml', 'utf8');

  assert.equal(
    packageJson.scripts['test:ui-sync'],
    'node --test scripts/ui-sync-policy.node-test.mjs scripts/check-ui-sync.node-test.mjs',
  );
  assert.equal(packageJson.scripts['check:ui-sync'], 'node scripts/check-ui-sync.mjs');
  assert.match(packageJson.scripts.validate, /npm run test:ui-sync/);
  assert.match(packageJson.scripts.validate, /npm run check:ui-sync/);
  assert.match(ci, /npm run validate/);
  assert.match(promotion, /npm run check:ui-sync -- --strict/);
});

test('受控标签只跳过普通模式，严格发布模式仍执行视觉同步门禁', () => {
  const env = { CILI_SKIP_UI_SYNC: '1' };
  const labeledEvent = {
    pull_request: { labels: [{ name: 'sandbox-skip-ui-sync' }] },
  };
  assert.equal(shouldSkipUiSync({ strict: false, env }), true);
  assert.equal(shouldSkipUiSync({ strict: true, env }), false);
  assert.equal(shouldSkipUiSync({ strict: false, env: {}, event: labeledEvent }), true);
  assert.equal(shouldSkipUiSync({ strict: true, env: {}, event: labeledEvent }), false);
  assert.equal(
    shouldSkipUiSync({
      strict: false,
      env: { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' },
    }),
    true,
  );
  assert.equal(
    shouldSkipUiSync({
      strict: true,
      env: { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' },
    }),
    false,
  );
  assert.equal(
    shouldSkipUiSync({ strict: false, env: {}, event: { pull_request: { labels: [] } } }),
    false,
  );
});
