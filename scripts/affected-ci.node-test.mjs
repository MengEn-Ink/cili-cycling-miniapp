import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createAffectedPlan } from './affected-ci.mjs';

test('纯 Pages 文档只执行文档与设计契约', () => {
  const plan = createAffectedPlan([
    'docs/articles/agile-delivery.html',
    'docs/delivery-center.js',
    'docs/ui-design-system.html',
  ]);

  assert.equal(plan.mode, 'docs');
  assert.equal(plan.design, true);
  assert.equal(plan.prototype, true);
});

test('小程序源码和显式测试进入影响面模式', () => {
  const plan = createAffectedPlan([
    'miniprogram/pages/activity-detail/index.ts',
    'tests/activity-detail-design.test.ts',
  ]);

  assert.equal(plan.mode, 'targeted');
  assert.deepEqual(plan.relatedSources, ['miniprogram/pages/activity-detail/index.ts']);
  assert.deepEqual(plan.vitestFiles, ['tests/activity-detail-design.test.ts']);
});

test('单个云函数只安装并测试对应包', () => {
  const plan = createAffectedPlan([
    'cloudfunctions/profile/index.js',
    'cloudfunctions/profile/index.node-test.js',
  ]);

  assert.equal(plan.mode, 'targeted');
  assert.deepEqual(plan.cloudFunctions, ['profile']);
});

test('共享包、依赖、工作流和选择器自身变更必须升级全量', () => {
  for (const file of [
    'cloudfunctions/shared/index.js',
    'package-lock.json',
    'cloudfunctions/profile/package-lock.json',
    'tools/miniprogram-ci/package.json',
    '.github/workflows/ci.yml',
    'scripts/affected-ci.mjs',
  ]) {
    const plan = createAffectedPlan([file]);
    assert.equal(plan.mode, 'full', file);
    assert.match(plan.reason, /全局|共享|工作流/);
  }
});

test('未知路径、未知云函数、空差异和超大变更 fail-safe 回退全量', () => {
  assert.equal(createAffectedPlan([]).mode, 'full');
  assert.equal(createAffectedPlan(['unknown/file.txt']).mode, 'full');
  assert.equal(createAffectedPlan(['cloudfunctions/new-api/index.js']).mode, 'full');
  assert.equal(createAffectedPlan(['tests/helpers/app-routes.ts']).mode, 'full');
  assert.equal(createAffectedPlan(['scripts/example-without-test.mjs']).mode, 'full');
  assert.equal(
    createAffectedPlan(Array.from({ length: 31 }, (_, index) => `tests/case-${index}.test.ts`))
      .mode,
    'full',
  );
});

test('脚本变更自动选择同名 Node 测试并识别部署和基础设施门禁', () => {
  const plan = createAffectedPlan([
    'scripts/cloudbase-deploy-decision.mjs',
    'scripts/miniprogram-upload-decision.mjs',
  ]);

  assert.equal(plan.mode, 'targeted');
  assert.deepEqual(plan.scriptTests, [
    'scripts/cloudbase-deploy-decision.node-test.mjs',
    'scripts/miniprogram-upload-decision.node-test.mjs',
  ]);
  assert.equal(plan.deployment, true);
  assert.equal(plan.bootstrap, true);
});

test('直接修改 Node 测试时不会被误当作 Vitest 或跳过', () => {
  const plan = createAffectedPlan([
    'scripts/check-release-notes.node-test.mjs',
    'tests/verify-journey-evidence.node-test.mjs',
  ]);

  assert.equal(plan.mode, 'targeted');
  assert.deepEqual(plan.vitestFiles, []);
  assert.deepEqual(plan.scriptTests, [
    'scripts/check-release-notes.node-test.mjs',
    'tests/verify-journey-evidence.node-test.mjs',
  ]);
});

test('PR 只跑影响面，main 与夜间任务保留全量门禁', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const nightly = readFileSync('.github/workflows/daily-full-audit.yml', 'utf8');

  assert.match(ci, /Run affected pull request checks/);
  assert.match(ci, /AFFECTED_BASE/);
  assert.match(ci, /if: github\.event_name == 'push'[\s\S]*npm run validate/);
  assert.match(ci, /if: github\.event_name == 'push'[\s\S]*npm run coverage/);
  assert.match(ci, /if: github\.event_name == 'push'[\s\S]*npm run audit:all/);

  assert.match(nightly, /cron: '0 16 \* \* \*'/);
  assert.match(nightly, /concurrency:[\s\S]*group: daily-full-audit/);
  assert.match(nightly, /npm run validate/);
  assert.match(nightly, /npm run coverage/);
  assert.match(nightly, /npm run audit:all/);
  assert.ok(nightly.includes("grep -Ev '^(docs/.*\\.(md|html|css|json)|README\\.md"));
  assert.doesNotMatch(nightly, /ya\?ml/);
  assert.match(nightly, /NIGHTLY_PR_TOKEN/);
  assert.match(nightly, /CAN_TRIGGER_PR_CI/);
  assert.match(nightly, /gh pr merge --auto --squash/);
});
