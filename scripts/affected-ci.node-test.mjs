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

test('共享包、根依赖、工作流和选择器自身变更必须升级全量', () => {
  for (const file of [
    'cloudfunctions/shared/index.js',
    'package-lock.json',
    'tools/miniprogram-ci/package.json',
    '.github/workflows/ci.yml',
    'scripts/affected-ci.mjs',
  ]) {
    const plan = createAffectedPlan([file]);
    assert.equal(plan.mode, 'full', file);
    assert.match(plan.reason, /全局|根依赖|共享|工作流/);
  }

  const cloudPackage = createAffectedPlan(['cloudfunctions/profile/package-lock.json']);
  assert.equal(cloudPackage.mode, 'targeted');
  assert.deepEqual(cloudPackage.cloudFunctions, ['profile']);
});

test('未知路径、未知云函数和空差异 fail-safe 回退全量，但大量已知测试不误判', () => {
  assert.equal(createAffectedPlan([]).mode, 'full');
  assert.equal(createAffectedPlan(['unknown/file.txt']).mode, 'full');
  assert.equal(createAffectedPlan(['cloudfunctions/new-api/index.js']).mode, 'full');
  assert.equal(createAffectedPlan(['tests/helpers/app-routes.ts']).mode, 'full');
  assert.equal(createAffectedPlan(['scripts/example-without-test.mjs']).mode, 'full');
  const largeKnownChange = createAffectedPlan(
    Array.from({ length: 31 }, (_, index) => `tests/case-${index}.test.ts`),
  );
  assert.equal(largeKnownChange.mode, 'targeted');
  assert.equal(largeKnownChange.vitestFiles.length, 31);
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

test('PR 与 main 检查拆分并保留每日全量门禁', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const nightly = readFileSync('.github/workflows/daily-full-audit.yml', 'utf8');

  assert.match(ci, /Run affected pull request checks/);
  assert.match(ci, /AFFECTED_BASE/);
  assert.match(ci, /main-validate:[\s\S]*npm run validate/);
  assert.match(ci, /main-coverage:[\s\S]*npm run coverage/);
  assert.match(ci, /main-audit:[\s\S]*npm run audit:all/);

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

test('部署影响面测试先安装独立上传工具依赖', () => {
  const source = readFileSync('scripts/affected-ci.mjs', 'utf8');
  const deploymentBlock = source.match(/if \(plan\.deployment\) \{([\s\S]*?)\n[ ]{2}\}/)?.[1] ?? '';

  assert.match(deploymentBlock, /runNpm\('tool:install'\)/);
  assert.match(deploymentBlock, /runNpm\('test:deploy'\)/);
  assert.ok(
    deploymentBlock.indexOf("runNpm('tool:install')") <
      deploymentBlock.indexOf("runNpm('test:deploy')"),
  );
});

test('云函数影响面仅安装 shared 与具体目标包，并保持 prepare 前置', () => {
  const source = readFileSync('scripts/affected-ci.mjs', 'utf8');
  const cloudBlock =
    source.match(/if \(plan\.cloudFunctions\.length > 0\) \{([\s\S]*?)\n[ ]{2}\}/)?.[1] ?? '';

  assert.match(cloudBlock, /runNpm\('cloud:prepare'\)/);
  assert.match(cloudBlock, /scripts\/run-cloud-packages\.mjs/);
  assert.match(cloudBlock, /--packages=/);
  assert.doesNotMatch(cloudBlock, /runNpm\('cloud:install'\)/);
  assert.ok(
    cloudBlock.indexOf("runNpm('cloud:prepare')") <
      cloudBlock.indexOf("'scripts/run-cloud-packages.mjs'"),
  );
});
