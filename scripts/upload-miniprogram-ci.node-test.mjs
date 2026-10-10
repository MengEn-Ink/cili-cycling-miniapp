import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadUploadConfig,
  parseRobot,
  uploadMiniProgram,
  validateDescription,
  validateVersion,
} from './upload-miniprogram-ci.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cili-miniprogram-ci-'));
  const keyDir = path.join(root, 'secret');
  const keyPath = path.join(keyDir, 'private.key');
  await mkdir(keyDir);
  await writeFile(
    path.join(root, 'project.config.json'),
    JSON.stringify({ appid: 'wx-test-appid', setting: { es6: true, postcss: true } }),
  );
  await writeFile(keyPath, 'test-private-key', { mode: 0o644 });
  return { root, keyPath };
}

test('上传配置从 project.config.json 读取 appid 并收紧密钥权限', async () => {
  const { root, keyPath } = await fixture();
  const config = await loadUploadConfig(
    {
      MINIPROGRAM_CI_PRIVATE_KEY_PATH: keyPath,
      MINIPROGRAM_VERSION: '1.0.29-main.722052e',
      MINIPROGRAM_DESCRIPTION: '自动上传主分支 722052e',
      MINIPROGRAM_CI_ROBOT: '2',
    },
    root,
  );

  assert.equal(config.appid, 'wx-test-appid');
  assert.equal(config.projectPath, root);
  assert.equal(config.privateKeyPath, keyPath);
  assert.equal(config.robot, 2);
  assert.equal(config.setting.minify, true);
  assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
});

test('显式历史项目路径只切换上传源码目录', async () => {
  const { root, keyPath } = await fixture();
  const historicalPath = path.join(root, 'historical-source');
  await mkdir(historicalPath);
  await writeFile(
    path.join(historicalPath, 'project.config.json'),
    JSON.stringify({ appid: 'wx-historical-appid', setting: { es6: false } }),
  );
  const config = await loadUploadConfig(
    {
      MINIPROGRAM_PROJECT_PATH: historicalPath,
      MINIPROGRAM_CI_PRIVATE_KEY_PATH: keyPath,
      MINIPROGRAM_VERSION: '0.0.85.1',
    },
    root,
  );
  assert.equal(config.projectPath, historicalPath);
  assert.equal(config.appid, 'wx-historical-appid');
});

test('非法历史项目路径和 project.config.json 在上传前被拒绝', async () => {
  const { root, keyPath } = await fixture();
  const env = {
    MINIPROGRAM_CI_PRIVATE_KEY_PATH: keyPath,
    MINIPROGRAM_VERSION: '0.0.85.1',
  };
  await assert.rejects(
    loadUploadConfig({ ...env, MINIPROGRAM_PROJECT_PATH: path.join(root, 'missing') }, root),
    /不存在或不是目录/,
  );
  const invalidPath = path.join(root, 'invalid-source');
  await mkdir(invalidPath);
  await writeFile(path.join(invalidPath, 'project.config.json'), '{invalid');
  await assert.rejects(
    loadUploadConfig({ ...env, MINIPROGRAM_PROJECT_PATH: invalidPath }, root),
    /不存在或不是合法 JSON/,
  );
});

test('上传只把经过校验的配置传给 miniprogram-ci', async () => {
  const { root, keyPath } = await fixture();
  let projectOptions;
  let uploadOptions;
  class Project {
    constructor(options) {
      projectOptions = options;
    }
  }
  const ci = {
    Project,
    async upload(options) {
      uploadOptions = options;
      return { subPackageInfo: [{ name: '__APP__', size: 123 }] };
    },
  };
  const messages = [];

  const result = await uploadMiniProgram({
    ci,
    cwd: root,
    env: {
      MINIPROGRAM_CI_PRIVATE_KEY_PATH: keyPath,
      MINIPROGRAM_VERSION: '1.0.29',
      MINIPROGRAM_DESCRIPTION: '自动上传最新主分支',
      MINIPROGRAM_CI_ROBOT: '3',
    },
    logger: { log: (message) => messages.push(message) },
  });

  assert.equal(projectOptions.appid, 'wx-test-appid');
  assert.equal(projectOptions.privateKeyPath, keyPath);
  assert.deepEqual(projectOptions.ignores, ['node_modules/**/*', 'coverage/**/*', 'dist/**/*']);
  assert.equal(uploadOptions.version, '1.0.29');
  assert.equal(uploadOptions.desc, '自动上传最新主分支');
  assert.equal(uploadOptions.robot, 3);
  assert.equal(typeof uploadOptions.onProgressUpdate, 'function');
  assert.equal(result.subPackageInfo[0].size, 123);
  assert.match(messages.at(-1), /上传成功/);
});

test('版本、描述、robot 和密钥缺失均在调用上传接口前失败', async () => {
  assert.throws(() => validateVersion('bad version'), /MINIPROGRAM_VERSION/);
  assert.throws(() => validateDescription('第一行\n第二行'), /单行文本/);
  assert.throws(() => parseRobot('31'), /1 到 30/);
  const { root } = await fixture();
  await assert.rejects(
    loadUploadConfig(
      {
        MINIPROGRAM_CI_PRIVATE_KEY_PATH: path.join(root, 'missing.key'),
        MINIPROGRAM_VERSION: '1.0.29',
      },
      root,
    ),
    /密钥文件不存在/,
  );
});

test('工作流锁定依赖、区分工具链与上传源码且不经 GITHUB_ENV 传递输入', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/deploy-miniprogram.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /git ls-remote origin refs\/heads\/main/);
  assert.match(workflow, /TOOLING_SHA/);
  assert.match(workflow, /target_sha/);
  assert.match(workflow, /git merge-base --is-ancestor "\$\{target_sha\}" origin\/main/);
  assert.match(workflow, /path: historical-source/);
  assert.match(workflow, /MINIPROGRAM_PROJECT_PATH:.*historical-source/);
  assert.match(workflow, /npm ci --ignore-scripts --prefix tools\/miniprogram-ci/);
  assert.match(workflow, /MINIPROGRAM_VERSION:.*steps\.release\.outputs\.version/);
  assert.match(workflow, /\{schemaVersion:1,/);
  assert.match(workflow, /\{schemaVersion:2,[^\n]*restoreReleaseId/);
  assert.match(
    workflow,
    /name: miniprogram-upload-receipt-\$\{\{ steps\.release\.outputs\.target_sha \}\}/,
  );
  assert.doesNotMatch(workflow, /GITHUB_ENV/);
  assert.doesNotMatch(workflow, /npm install --no-save/);
});

test('CI 用完整 push 区间生成小程序上传判定 artifact', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /miniprogram-upload-decision\.mjs create/);
  assert.match(workflow, /github\.event\.before/);
  assert.match(workflow, /github\.sha/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /name:\s*miniprogram-upload-decision/);
});

test('部署工作流校验 CI 判定后才上传且保留手动入口', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/deploy-miniprogram.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /actions:\s*read/);
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/download-artifact@v8/);
  assert.match(workflow, /run-id:.*workflow_run\.id/);
  assert.match(workflow, /miniprogram-upload-decision\.mjs verify/);
  assert.match(workflow, /steps\.decision\.outputs\.should_upload == 'true'/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /actions\/setup-node@v7/);
});

test('部署门禁同时运行上传判定和上传客户端测试', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.match(
    packageJson.scripts['test:deploy'],
    /scripts\/miniprogram-upload-decision\.node-test\.mjs/,
  );
  assert.match(
    packageJson.scripts['test:deploy'],
    /scripts\/upload-miniprogram-ci\.node-test\.mjs/,
  );
});

test('上传脚本不会读取或打印密钥正文', async () => {
  const source = await readFile(new URL('./upload-miniprogram-ci.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /readFile\(privateKeyPath/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*PRIVATE_KEY/);
});
