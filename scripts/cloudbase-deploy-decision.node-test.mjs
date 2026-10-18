import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCloudBaseDeployDecision } from './cloudbase-deploy-decision.mjs';

const config = {
  functions: [
    { name: 'auth' },
    { name: 'activity-read' },
    { name: 'activity-admin' },
    { name: 'registration' },
    { name: 'admin-review' },
    { name: 'profile' },
  ],
};

test('仅前端或文档变更时不部署 CloudBase', () => {
  assert.deepEqual(createCloudBaseDeployDecision(['docs/app.js', 'miniprogram/app.ts'], config), {
    shouldDeploy: false,
    applyInfrastructure: false,
    functions: [],
  });
});

test('业务函数仅部署对应目录', () => {
  assert.deepEqual(
    createCloudBaseDeployDecision(
      ['cloudfunctions/profile/index.js', 'cloudfunctions/activity-admin/domain.js'],
      config,
    ),
    {
      shouldDeploy: true,
      applyInfrastructure: false,
      functions: ['activity-admin', 'profile'],
    },
  );
});

test('共享领域代码变更会部署全部实际消费者', () => {
  assert.deepEqual(createCloudBaseDeployDecision(['cloudfunctions/shared/domain.js'], config), {
    shouldDeploy: true,
    applyInfrastructure: false,
    functions: ['activity-read', 'registration', 'admin-review'],
  });
});

test('prepare 脚本变更与共享代码使用同一消费者边界', () => {
  assert.deepEqual(createCloudBaseDeployDecision(['scripts/prepare-cloudfunctions.mjs'], config), {
    shouldDeploy: true,
    applyInfrastructure: false,
    functions: ['activity-read', 'registration', 'admin-review'],
  });
});

test('bootstrap 变更执行基础设施 apply 但不扩大函数范围', () => {
  assert.deepEqual(createCloudBaseDeployDecision(['scripts/bootstrap-cloudbase.mjs'], config), {
    shouldDeploy: true,
    applyInfrastructure: true,
    functions: [],
  });
});

test('存储规则、部署工作流和验证脚本均触发基础设施对账', () => {
  for (const path of [
    'cloudstorage.rules.json',
    '.github/workflows/deploy-cloudbase.yml',
    'scripts/cloudbase-deploy-decision.mjs',
    'scripts/cloudbase-storage-rules.mjs',
    'scripts/cloudbase-storage-rules.node-test.mjs',
    'scripts/cloudbase-club-application-smoke.mjs',
    'scripts/cloudbase-club-application-smoke.node-test.mjs',
  ]) {
    assert.deepEqual(createCloudBaseDeployDecision([path], config), {
      shouldDeploy: true,
      applyInfrastructure: true,
      functions: [],
    });
  }
});

test('cloudbaserc 变更部署配置中的全部函数', () => {
  assert.deepEqual(createCloudBaseDeployDecision(['cloudbaserc.json'], config), {
    shouldDeploy: true,
    applyInfrastructure: false,
    functions: [
      'auth',
      'activity-read',
      'activity-admin',
      'registration',
      'admin-review',
      'profile',
    ],
  });
});

test('删除函数目录中的文件仍会触发对应函数重新部署', () => {
  assert.deepEqual(createCloudBaseDeployDecision(['cloudfunctions/profile/obsolete.js'], config), {
    shouldDeploy: true,
    applyInfrastructure: false,
    functions: ['profile'],
  });
});

test('GitHub 工作流仅在 main CI 成功后部署并使用环境级密钥', () => {
  const workflow = readFileSync('.github/workflows/deploy-cloudbase.yml', 'utf8');
  const decisionScript = readFileSync('scripts/cloudbase-deploy-decision.mjs', 'utf8');
  const mediaSecretConfig = readFileSync('scripts/cloudbase-media-secret-config.mjs', 'utf8');
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \[CI\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /environment: cloudbase-production/);
  assert.match(workflow, /secrets\.CLOUDBASE_API_KEY/);
  assert.match(workflow, /secrets\.PROFILE_MEDIA_PATH_SECRET/);
  assert.match(workflow, /vars\.CLOUDBASE_ENV_ID/);
  assert.match(workflow, /vars\.CLOUDBASE_REGION/);
  assert.match(workflow, /actions\/workflows\/deploy-cloudbase\.yml\/runs/);
  assert.match(workflow, /merge-base --is-ancestor/);
  assert.match(workflow, /login --cloudbase-api-key/);
  assert.match(workflow, /cloudbase:storage:reconcile/);
  assert.match(workflow, /cloudbase:smoke:club-application/);
  assert.ok(
    workflow.indexOf('name: Deploy affected cloud functions') <
      workflow.indexOf('name: Run production club application write smoke'),
  );
  assert.match(workflow, /CILI_ALLOW_PRODUCTION_SMOKE: club-application-write/);
  assert.match(workflow, /name: Prepare production media secret configuration/);
  assert.match(mediaSecretConfig, /cloudbase-production 缺少有效的 PROFILE_MEDIA_PATH_SECRET/);
  assert.match(workflow, /cloudbaserc\.deploy\.json/);
  assert.match(workflow, /cloudbase-media-secret-config\.mjs prepare/);
  assert.match(workflow, /config update fn "\$\{function_name\}" --all --json/);
  assert.match(workflow, /fn detail "\$\{function_name\}" --json/);
  assert.match(workflow, /cloudbase-media-secret-config\.mjs verify/);
  assert.match(mediaSecretConfig, /部署后函数缺少统一媒体密钥/);
  assert.match(workflow, /GITHUB_ENV/);
  assert.match(workflow, /decision\.applyInfrastructure = true/);
  assert.match(workflow, /@cloudbase\/cli@3\.8\.4/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(decisionScript, /--diff-filter=ACMRD/);
  assert.doesNotMatch(workflow, /TENCENTCLOUD_SECRET(?:ID|KEY)/);
});

test('忽略未知函数、删除路径与空路径', () => {
  assert.deepEqual(
    createCloudBaseDeployDecision(
      ['', 'cloudfunctions/shared', 'cloudfunctions/unknown/index.js'],
      config,
    ),
    {
      shouldDeploy: false,
      applyInfrastructure: false,
      functions: [],
    },
  );
});
