import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyUiPath,
  evaluateUiSyncPolicy,
  routeIdFromPagePath,
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
