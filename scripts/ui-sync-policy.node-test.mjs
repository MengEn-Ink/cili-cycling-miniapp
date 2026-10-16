import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyUiPath,
  digestFiles,
  evaluateUiSyncPolicy,
  routeIdFromPagePath,
  validateManifest,
  validatePng,
} from './ui-sync-policy.mjs';

test('页面、组件和视觉资源属于 UI 范围', () => {
  assert.deepEqual(classifyUiPath('miniprogram/pages/profile/index.ts'), {
    ui: true,
    immediate: false,
  });
  assert.deepEqual(classifyUiPath('miniprogram/components/activity-card/index.wxml'), {
    ui: true,
    immediate: false,
  });
  assert.deepEqual(classifyUiPath('miniprogram/assets/profile/hero-alpine.svg'), {
    ui: true,
    immediate: false,
  });
  assert.deepEqual(classifyUiPath('cloudfunctions/profile/index.js'), {
    ui: false,
    immediate: false,
  });
});

test('全局主题、路由和品牌资产必须立即同步', () => {
  for (const file of [
    'miniprogram/app.json',
    'miniprogram/app.wxss',
    'miniprogram/assets/brand/logo-circle-144.png',
    'miniprogram/components/brand-logo/index.wxss',
  ]) {
    assert.deepEqual(classifyUiPath(file), { ui: true, immediate: true }, file);
  }
});

test('最多允许四个未同步 UI 提交，第五个提交阻断', () => {
  assert.deepEqual(evaluateUiSyncPolicy({ uiCommits: 0, ageDays: 20 }), {
    ok: true,
    remaining: 4,
    reason: '当前没有未同步 UI 提交',
  });
  assert.deepEqual(evaluateUiSyncPolicy({ uiCommits: 4, ageDays: 3 }), {
    ok: true,
    remaining: 0,
    reason: 'UI 漂移仍在预算内',
  });
  assert.deepEqual(evaluateUiSyncPolicy({ uiCommits: 5, ageDays: 3 }), {
    ok: false,
    remaining: 0,
    reason: '已有 5 个未同步 UI 提交，超过最多 4 个的预算',
  });
});

test('存在 UI 漂移时，超过七天或命中即时文件会阻断', () => {
  assert.deepEqual(evaluateUiSyncPolicy({ uiCommits: 1, ageDays: 8 }), {
    ok: false,
    remaining: 3,
    reason: '距离上次同步已 8 天，超过 7 天上限',
  });
  assert.deepEqual(
    evaluateUiSyncPolicy({
      uiCommits: 1,
      ageDays: 1,
      immediateFiles: ['miniprogram/app.wxss'],
    }),
    {
      ok: false,
      remaining: 3,
      reason: '即时同步文件存在：miniprogram/app.wxss',
    },
  );
});

test('发布严格模式只接受零 UI 漂移', () => {
  assert.deepEqual(evaluateUiSyncPolicy({ uiCommits: 1, ageDays: 1, strict: true }), {
    ok: false,
    remaining: 3,
    reason: '发布严格模式要求 UI 零漂移',
  });
});

test('真实页面路径映射为原型路由 id', () => {
  assert.equal(routeIdFromPagePath('pages/activities/index'), 'activities');
  assert.equal(routeIdFromPagePath('pages/admin/activity-list/index'), 'admin-activity-list');
});

test('文件摘要不受调用方路径顺序影响', () => {
  const forward = new Map([
    ['b.txt', Buffer.from('B')],
    ['a.txt', Buffer.from('A')],
  ]);
  const reverse = new Map([...forward].reverse());

  assert.equal(digestFiles(forward), digestFiles(reverse));
  assert.match(digestFiles(forward), /^sha256:[0-9a-f]{64}$/);
});

test('PNG 证据必须包含有效签名和非零尺寸', () => {
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.writeUInt32BE(390, 16);
  png.writeUInt32BE(790, 20);

  assert.deepEqual(validatePng(png, 'activities-pages.png'), {
    width: 390,
    height: 790,
  });
  assert.throws(() => validatePng(Buffer.from('not png'), 'broken.png'), /无效 PNG：broken.png/);
});

test('同步清单必须逐一覆盖 app.json 页面且证据成对存在', () => {
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.writeUInt32BE(390, 16);
  png.writeUInt32BE(790, 20);
  const manifest = {
    schemaVersion: 1,
    syncedThrough: 'a'.repeat(40),
    syncedAt: '2026-10-13T06:00:00.000Z',
    policy: { maxUnsyncedUiCommits: 4, maxAgeDays: 7 },
    source: { digest: `sha256:${'b'.repeat(64)}` },
    prototype: { digest: `sha256:${'c'.repeat(64)}` },
    routes: [
      { id: 'activities', pagePath: 'pages/activities/index' },
      { id: 'admin-activity-list', pagePath: 'pages/admin/activity-list/index' },
    ],
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

  assert.doesNotThrow(() =>
    validateManifest(manifest, {
      appPages: ['pages/activities/index', 'pages/admin/activity-list/index'],
      readEvidence: () => png,
    }),
  );
  assert.throws(
    () =>
      validateManifest(
        { ...manifest, routes: manifest.routes.slice(0, 1) },
        {
          appPages: ['pages/activities/index', 'pages/admin/activity-list/index'],
          readEvidence: () => png,
        },
      ),
    /路由映射不完整/,
  );
  assert.throws(
    () =>
      validateManifest(manifest, {
        appPages: ['pages/activities/index', 'pages/admin/activity-list/index'],
        readEvidence: (file) => {
          if (file.endsWith('activities-pages.png')) throw new Error('ENOENT');
          return png;
        },
      }),
    /证据文件缺失/,
  );
});

test('v2 要求每个路由有双端证据、状态说明和相同 CSS 视口', () => {
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.writeUInt32BE(375, 16);
  png.writeUInt32BE(812, 20);
  const manifest = {
    schemaVersion: 2,
    syncedThrough: 'a'.repeat(40),
    syncedAt: '2026-10-16T06:00:00.000Z',
    source: { digest: `sha256:${'b'.repeat(64)}` },
    prototype: { digest: `sha256:${'c'.repeat(64)}` },
    routes: [{ id: 'activities', pagePath: 'pages/activities/index' }],
    evidence: {
      directory: 'docs/evidence/ui-sync/current',
      viewport: { width: 375, height: 812 },
      routes: [
        {
          id: 'activities',
          devtools: 'a.png',
          pages: 'b.png',
          state: 'loaded',
          data: 'sanitized-runtime',
          review: 'aligned',
          note: '使用不同活动样本，比较结构与控件',
        },
      ],
    },
  };
  const options = { appPages: ['pages/activities/index'], readEvidence: () => png };
  assert.doesNotThrow(() => validateManifest(manifest, options));
  for (const field of ['state', 'data', 'review', 'note']) {
    const bad = structuredClone(manifest);
    delete bad.evidence.routes[0][field];
    assert.throws(() => validateManifest(bad, options), /证据说明/);
  }
  const missing = structuredClone(manifest);
  missing.routes.push({ id: 'profile', pagePath: 'pages/profile/index' });
  assert.throws(
    () =>
      validateManifest(missing, {
        ...options,
        appPages: [...options.appPages, 'pages/profile/index'],
      }),
    /截图覆盖/,
  );
  const mismatch = structuredClone(manifest);
  mismatch.evidence.viewport.width = 365;
  assert.throws(() => validateManifest(mismatch, options), /视口/);
});
