# CI 微信开发版上传过滤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 纯文档等不影响小程序产物的 main push 通过 CI 后跳过微信开发版上传，同时升级 GitHub 官方 Action 到原生 Node.js 24 版本。

**Architecture:** CI 根据 push 的完整 `before..sha` 区间调用纯函数脚本生成带提交 SHA 的判定 artifact。部署工作流按触发它的 CI run-id 下载并校验 artifact，只有 `shouldUpload=true` 才继续安装依赖和上传；手动上传保持直通。

**Tech Stack:** Node.js 24、Node test runner、GitHub Actions、微信 `miniprogram-ci`

---

## 文件结构

| 操作 | 文件 | 责任 |
| --- | --- | --- |
| Create | `scripts/miniprogram-upload-decision.mjs` | 路径分类、判定 schema、CLI 创建与校验 |
| Create | `scripts/miniprogram-upload-decision.node-test.mjs` | 路径和 schema 单元测试 |
| Modify | `scripts/upload-miniprogram-ci.node-test.mjs` | 两个工作流的接线和 Action 版本契约 |
| Modify | `package.json` | 将新测试加入 `test:deploy` |
| Modify | `.github/workflows/ci.yml` | 生成并上传判定 artifact，升级 Action |
| Modify | `.github/workflows/deploy-miniprogram.yml` | 下载、校验和消费判定，升级 Action |

### Task 1: 路径判定与 schema

**Files:**
- Create: `scripts/miniprogram-upload-decision.node-test.mjs`
- Create: `scripts/miniprogram-upload-decision.mjs`

- [ ] **Step 1: 写路径判定失败测试**

测试必须断言下列行为：

```js
assert.equal(shouldUploadMiniProgram(['miniprogram/app.ts']), true);
assert.equal(shouldUploadMiniProgram(['cloudfunctions/profile/index.js']), true);
assert.equal(shouldUploadMiniProgram(['tools/miniprogram-ci/package-lock.json']), true);
assert.equal(shouldUploadMiniProgram(['scripts/upload-miniprogram-ci.mjs']), true);
assert.equal(shouldUploadMiniProgram(['package-lock.json']), true);
assert.equal(shouldUploadMiniProgram(['docs/verification/report.md']), false);
assert.equal(shouldUploadMiniProgram(['tests/profile-page.test.ts']), false);
assert.equal(shouldUploadMiniProgram(['.github/workflows/ci.yml']), false);
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
node --test scripts/miniprogram-upload-decision.node-test.mjs
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现最小路径判定**

导出精确文件和目录前缀，并统一移除开头的 `./`：

```js
const UPLOAD_PREFIXES = ['miniprogram/', 'cloudfunctions/', 'tools/miniprogram-ci/'];
const UPLOAD_FILES = new Set([
  'scripts/upload-miniprogram-ci.mjs',
  'scripts/miniprogram-upload-decision.mjs',
  'project.config.json',
  'project.private.config.json',
  'package.json',
  'package-lock.json',
]);

export function shouldUploadMiniProgram(paths) {
  return paths.some((value) => {
    const path = String(value).replace(/^\.\/+/, '');
    return UPLOAD_FILES.has(path) || UPLOAD_PREFIXES.some((prefix) => path.startsWith(prefix));
  });
}
```

- [ ] **Step 4: 写 schema 失败测试**

覆盖：

```js
const decision = buildUploadDecision({
  before: 'a'.repeat(40),
  sha: 'b'.repeat(40),
  paths: ['docs/readme.md', 'miniprogram/app.ts'],
});
assert.deepEqual(decision, {
  schemaVersion: 1,
  before: 'a'.repeat(40),
  sha: 'b'.repeat(40),
  shouldUpload: true,
  matchedPaths: ['miniprogram/app.ts'],
});
assert.deepEqual(validateUploadDecision(decision, 'b'.repeat(40)), decision);
assert.throws(() => validateUploadDecision({ ...decision, shouldUpload: 'true' }, decision.sha));
assert.throws(() => validateUploadDecision(decision, 'c'.repeat(40)), /SHA/);
```

- [ ] **Step 5: 运行测试确认 RED**

Expected: FAIL，`buildUploadDecision` 或 `validateUploadDecision` 未导出。

- [ ] **Step 6: 实现 schema**

要求：

- `before`、`sha` 必须为 40 位十六进制提交 SHA。
- `matchedPaths` 只包含触发上传的去重路径。
- `schemaVersion` 固定为 `1`。
- 校验失败抛出明确错误。

- [ ] **Step 7: 运行测试确认 GREEN**

Run:

```bash
node --test scripts/miniprogram-upload-decision.node-test.mjs
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add scripts/miniprogram-upload-decision.mjs scripts/miniprogram-upload-decision.node-test.mjs
git commit -m "feat(ci): classify miniprogram upload changes"
```

### Task 2: 判定 CLI

**Files:**
- Modify: `scripts/miniprogram-upload-decision.node-test.mjs`
- Modify: `scripts/miniprogram-upload-decision.mjs`

- [ ] **Step 1: 写 CLI 失败测试**

在临时 Git 仓库创建两个提交，分别执行：

```bash
node scripts/miniprogram-upload-decision.mjs create \
  --before <first-sha> \
  --sha <second-sha> \
  --output <decision.json>
```

断言 JSON 包含完整区间内的匹配路径。再执行：

```bash
node scripts/miniprogram-upload-decision.mjs verify \
  --input <decision.json> \
  --sha <second-sha>
```

断言 stdout 为 `should_upload=true`。SHA 不匹配时断言退出码非零。

- [ ] **Step 2: 运行测试确认 RED**

Expected: FAIL，CLI 命令尚未实现。

- [ ] **Step 3: 实现 CLI**

`create` 使用：

```js
execFile('git', ['diff', '--name-only', '--diff-filter=ACMR', before, sha], ...)
```

生成 JSON 前调用 `buildUploadDecision`。`verify` 读取 JSON、调用
`validateUploadDecision`，并输出唯一一行：

```text
should_upload=true
```

或：

```text
should_upload=false
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
node --test scripts/miniprogram-upload-decision.node-test.mjs
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/miniprogram-upload-decision.mjs scripts/miniprogram-upload-decision.node-test.mjs
git commit -m "feat(ci): add upload decision CLI"
```

### Task 3: CI 生成判定 artifact

**Files:**
- Modify: `scripts/upload-miniprogram-ci.node-test.mjs`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 写工作流失败测试**

读取 `.github/workflows/ci.yml` 并断言：

```js
assert.match(ciWorkflow, /actions\/checkout@v7/);
assert.match(ciWorkflow, /actions\/setup-node@v7/);
assert.match(ciWorkflow, /miniprogram-upload-decision\.mjs create/);
assert.match(ciWorkflow, /github\.event\.before/);
assert.match(ciWorkflow, /github\.sha/);
assert.match(ciWorkflow, /actions\/upload-artifact@v7/);
assert.match(ciWorkflow, /name:\s*miniprogram-upload-decision/);
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
node --test scripts/upload-miniprogram-ci.node-test.mjs
```

Expected: FAIL，CI 尚无 artifact 步骤且 Action 仍为 v4。

- [ ] **Step 3: 修改 CI**

在 checkout 后增加仅 push 执行的 create 步骤，并把 JSON 写到
`${RUNNER_TEMP}/miniprogram-upload-decision.json`。随后使用
`actions/upload-artifact@v7` 上传固定名称 artifact，保留一天。

升级 `actions/checkout@v7`、`actions/setup-node@v7`。

- [ ] **Step 4: 运行测试确认 GREEN**

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add .github/workflows/ci.yml scripts/upload-miniprogram-ci.node-test.mjs
git commit -m "ci: publish miniprogram upload decision"
```

### Task 4: 部署工作流消费判定

**Files:**
- Modify: `scripts/upload-miniprogram-ci.node-test.mjs`
- Modify: `.github/workflows/deploy-miniprogram.yml`

- [ ] **Step 1: 写部署契约失败测试**

断言：

```js
assert.match(deployWorkflow, /actions:\s*read/);
assert.match(deployWorkflow, /actions\/checkout@v7/);
assert.match(deployWorkflow, /actions\/download-artifact@v8/);
assert.match(deployWorkflow, /run-id:.*workflow_run\.id/);
assert.match(deployWorkflow, /miniprogram-upload-decision\.mjs verify/);
assert.match(deployWorkflow, /steps\.decision\.outputs\.should_upload == 'true'/);
assert.match(deployWorkflow, /actions\/setup-node@v7/);
```

同时保留原有断言：`git rev-parse origin/main`、`git ls-remote`、锁定安装、
不使用 `GITHUB_ENV`。

- [ ] **Step 2: 运行测试确认 RED**

Expected: FAIL，部署工作流尚未下载判定。

- [ ] **Step 3: 修改部署工作流**

1. 权限增加 `actions: read`。
2. checkout 后，自动路径使用 `actions/download-artifact@v8`，传入
   `run-id: ${{ github.event.workflow_run.id }}` 和 `github-token`。
3. `id: decision` 步骤中：
   - 手动触发写 `should_upload=true`；
   - 自动触发调用 `verify`，期望 SHA 为 `CHECKOUT_SHA`。
4. main-tip、setup、install、test、credential、upload 均增加
   `steps.decision.outputs.should_upload == 'true'`。
5. 增加跳过日志步骤。
6. 升级 checkout 和 setup-node。

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
node --test scripts/upload-miniprogram-ci.node-test.mjs
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add .github/workflows/deploy-miniprogram.yml scripts/upload-miniprogram-ci.node-test.mjs
git commit -m "ci: skip unaffected miniprogram uploads"
```

### Task 5: 门禁接线、全量验证和发布

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 写 package script 失败测试**

在工作流契约测试中读取 `package.json`，断言 `test:deploy` 同时包含：

```text
scripts/miniprogram-upload-decision.node-test.mjs
scripts/upload-miniprogram-ci.node-test.mjs
```

- [ ] **Step 2: 运行测试确认 RED**

Expected: FAIL，新测试尚未接入。

- [ ] **Step 3: 更新 test:deploy**

```json
"test:deploy": "node --test scripts/miniprogram-upload-decision.node-test.mjs scripts/upload-miniprogram-ci.node-test.mjs"
```

- [ ] **Step 4: 运行局部和全量门禁**

```bash
npm run test:deploy
npm run validate
git diff --check
```

Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add package.json scripts/upload-miniprogram-ci.node-test.mjs
git commit -m "test(ci): gate upload decision workflow"
```

- [ ] **Step 6: 推送并观察远端**

```bash
git push origin main
gh run list --limit 4
```

Expected:

- `CI` 成功；
- 本次因修改判定脚本而生成 `shouldUpload=true`，微信开发版上传成功；
- 后续纯文档提交将得到 `shouldUpload=false` 并跳过上传。
