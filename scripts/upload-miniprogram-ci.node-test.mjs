import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
import * as uploadModule from './upload-miniprogram-ci.mjs';

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

test('锁定后的上传客户端可以被真实 Node 运行时加载', () => {
  const requireUploadTool = createRequire(
    new URL('../tools/miniprogram-ci/package.json', import.meta.url),
  );
  const ci = requireUploadTool('miniprogram-ci');
  assert.equal(typeof ci.Project, 'function');
  assert.equal(typeof ci.upload, 'function');
});

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
  if (process.platform !== 'win32') {
    // Windows 不支持 POSIX 文件权限位，密钥权限收紧仅在类 Unix 环境可断言。
    assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
  }
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

test('Dependabot 只为低风险更新开启 GitHub 原生自动合并', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/dependabot-auto-merge.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /github\.actor == 'dependabot\[bot\]'/);
  assert.match(workflow, /dependabot\/fetch-metadata@v3\.1\.0/);
  assert.match(workflow, /version-update:semver-patch/);
  assert.match(workflow, /version-update:semver-minor/);
  assert.match(workflow, /alert-state == 'OPEN'/);
  assert.match(workflow, /gh pr merge --auto --squash/);
  assert.doesNotMatch(workflow, /actions\/checkout/);
});

test('上传脚本不会读取或打印密钥正文', async () => {
  const source = await readFile(new URL('./upload-miniprogram-ci.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /readFile\(privateKeyPath/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*PRIVATE_KEY/);
});

async function workerFixture(t, code) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cili-upload-worker-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workerPath = path.join(root, 'worker.mjs');
  await writeFile(workerPath, code);
  return workerPath;
}

test('上传进度日志只保留阶段与状态，随机 ID 和 SDK 文本不外泄', async () => {
  const { root, keyPath } = await fixture();
  const messages = [];
  await uploadMiniProgram({
    cwd: root,
    env: { MINIPROGRAM_CI_PRIVATE_KEY_PATH: keyPath, MINIPROGRAM_VERSION: '1.0.1' },
    ci: {
      Project: class {},
      upload: async ({ onProgressUpdate }) => {
        onProgressUpdate({ id: 'random-private-id', message: 'upload', status: 'doing' });
        onProgressUpdate({
          id: 'another-private-id',
          message: 'token=secret-value',
          status: 'info',
        });
        return {};
      },
    },
    logger: { log: (value) => messages.push(value) },
  });
  const text = JSON.stringify(messages);
  assert.match(text, /upload.*doing/);
  assert.doesNotMatch(text, /private-id|secret-value/);
});

test('密钥符号链接在上传前拒绝，不改变目标文件', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX symlink fixture');
  const { root, keyPath } = await fixture();
  const link = path.join(root, 'link.key');
  await symlink(keyPath, link);
  await assert.rejects(
    loadUploadConfig({ MINIPROGRAM_CI_PRIVATE_KEY_PATH: link, MINIPROGRAM_VERSION: '1.0.1' }, root),
    /普通文件/,
  );
  assert.equal((await stat(keyPath)).mode & 0o777, 0o644);
});

test('编译准备耗时不消费五分钟上传阶段预算', async (t) => {
  assert.equal(
    typeof uploadModule.runUploadProcess,
    'function',
    'needs isolated upload supervisor',
  );
  const workerPath = await workerFixture(
    t,
    `
process.send({ type: 'progress', phase: 'prepare', status: 'doing' });
setTimeout(() => {
  process.send({ type: 'progress', phase: 'upload', status: 'doing' });
  process.send({ type: 'completed', outcome: 'UPLOADED' });
}, 250);
`,
  );
  const result = await uploadModule.runUploadProcess({
    workerPath,
    uploadTimeoutMs: 80,
    killGraceMs: 30,
    heartbeatMs: 20,
    logger: { log() {} },
  });
  assert.equal(result.outcome, 'UPLOADED');
});

test('真实远端挂起超时终止忽略 SIGTERM 的 worker，结果未知且不重试', async (t) => {
  assert.equal(
    typeof uploadModule.runUploadProcess,
    'function',
    'needs isolated upload supervisor',
  );
  const workerPath = await workerFixture(
    t,
    `
process.on('SIGTERM', () => {});
process.send({ type: 'progress', phase: 'upload', status: 'doing' });
setInterval(() => {}, 1000);
`,
  );
  const messages = [];
  const result = await uploadModule.runUploadProcess({
    workerPath,
    uploadTimeoutMs: 80,
    killGraceMs: 30,
    heartbeatMs: 20,
    logger: { log: (message) => messages.push(message) },
  });
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.reason, 'upload-timeout');
  assert.equal(result.receipt, undefined);
  assert.equal(result.workerStarts, 1);
  assert.equal(result.exitSignal, 'SIGKILL');
  assert.match(messages.join('\n'), /lastProgressAt/);
  assert.ok(result.uploadElapsedMs >= 80);
});

test('进度更新不重置绝对上传预算，异常退出仍不得冒充成功', async (t) => {
  assert.equal(
    typeof uploadModule.runUploadProcess,
    'function',
    'needs isolated upload supervisor',
  );
  const workerPath = await workerFixture(
    t,
    `
process.send({ type: 'progress', phase: 'upload', status: 'doing' });
setInterval(() => process.send({ type: 'progress', phase: 'upload', status: 'doing' }), 10);
`,
  );
  const result = await uploadModule.runUploadProcess({
    workerPath,
    uploadTimeoutMs: 80,
    killGraceMs: 30,
    heartbeatMs: 20,
    logger: { log() {} },
  });
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.reason, 'upload-timeout');
  const failedPath = await workerFixture(t, 'process.exit(7);');
  const failed = await uploadModule.runUploadProcess({
    workerPath: failedPath,
    logger: { log() {} },
  });
  assert.equal(failed.outcome, 'FAILED');
  assert.equal(failed.exitCode, 7);
});

test('SDK 远端错误返回 UNKNOWN，原始 stdout 与错误正文不进入诊断', async (t) => {
  const workerPath = await workerFixture(
    t,
    `
console.log('token=private-value');
console.error('https://private.example/key');
process.send({ type: 'progress', phase: 'upload', status: 'doing' });
process.send({ type: 'failed', errorCode: 42, message: 'secret-error' });
setInterval(() => {}, 1000);
`,
  );
  const messages = [];
  const result = await uploadModule.runUploadProcess({
    workerPath,
    logger: { log: (message) => messages.push(message) },
  });
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.errorCode, 42);
  assert.equal(result.reason, 'sdk-error');
  assert.doesNotMatch(JSON.stringify({ messages, result }), /private|secret/);
  assert.equal(result.receipt, undefined);
});

test('取消信号终止正在上传的子进程并保留 UNKNOWN', async (t) => {
  const workerPath = await workerFixture(
    t,
    `
process.send({ type: 'progress', phase: 'upload', status: 'doing' });
setInterval(() => {}, 1000);
`,
  );
  let cancelled = false;
  const result = await uploadModule.runUploadProcess({
    workerPath,
    logger: {
      log: (message) => {
        if (!cancelled && JSON.parse(message).phase === 'upload') {
          cancelled = true;
          process.emit('SIGTERM');
        }
      },
    },
  });
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.reason, 'cancelled');
  assert.equal(result.receipt, undefined);
});

test('workflow 上传五分钟阶段诊断独立保存，失败只清理且不签发 receipt', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/deploy-miniprogram.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /MINIPROGRAM_UPLOAD_TIMEOUT_MS:\s*'300000'/);
  assert.match(workflow, /MINIPROGRAM_UPLOAD_DIAGNOSTICS_PATH:/);
  assert.match(workflow, /name: Store upload diagnostics[\s\S]*?if: always\(\)/);
  assert.match(
    workflow,
    /Generate immutable development upload receipt[\s\S]*?if: steps\.upload\.outputs\.(?:uploaded|experience_eligible) == 'true'/,
  );
  assert.match(workflow, /Remove temporary private key[\s\S]*?if: always\(\)/);
  assert.doesNotMatch(workflow, /retry.*deploy:miniprogram/);
});
