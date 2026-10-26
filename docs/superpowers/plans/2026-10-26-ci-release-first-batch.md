# CI 与发布第一批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 减少 PR 返工，限制微信上传长尾，并让发布与源码复用绑定真实、同内容的成功证据。

**Architecture:** 使用现有 affected、Harness、上传工具与两条发布工作流。四个逻辑独立验证和提交；发布基线消费受信 main 工作流产物，PR 元数据复用仅用于无密钥的源码检查。第二批条件 smoke/并发和第三批 IDE 免检不在本次范围。

**Tech Stack:** Node.js 24、Node test、Vitest、Git、GitHub Actions、miniprogram-ci、CloudBase CLI。

用户已批准 A 第一批；本会话直接按任务执行，无需再次确认。可用技能未包含上述伴随技能，按已读取的 writing-plans 与 TDD 工作流逐项实施。

2026-10-26：用户已追加授权“处理PR合并，推送部署”。四项 #364、#365、#367、#368 已合入 `main@6fe556e7`，合并后保留全部测试入口；最终 PR CI / CodeQL、1297 项组合全量门禁与该主线完整 CI / CodeQL 通过。微信 `0.0.372.1` 的实际回执通过 artifact 摘要、run attempt、同 SHA CI 和 Git 内容验证。云 `40274362993` 完整部署 12 个函数、基础设施与密钥回读、数据库 smoke 和清理通过，实际 receipt 核对通过；`6fe556e7` 云 `40274682171` 使用真实基线安全跳过，outcome 核对通过。状态 `MERGED / DEVELOPMENT_UPLOADED / CLOUDBASE_VERIFIED`。文档 #369 合入后继续核对最终主线 CI 与发布 outcome；真机验收保持独立，详见 [第一批交付报告](../../verification/2026-10-26-ci-first-batch-delivery.md)。

---

## 文件与交付边界

1. 预检分支 `fix/ci-preflight-20261026`：`scripts/pr-preflight.mjs`、`pr-body.mjs`、`check-pr-description.mjs`、`check-ui-sync.mjs`、对应 Node/Vitest 测试、`package.json`、`docs/ui-sync-manifest.json`。
2. 上传超时分支：`scripts/upload-miniprogram-ci.mjs`、对应 Node 测试、`.github/workflows/deploy-miniprogram.yml`。
3. 发布基线分支：`scripts/release-baseline.mjs` 与 Node 测试、两个 deploy decision 脚本与测试、两条 deploy workflow、`ci.yml` 的上传决策 checkout。
4. 元数据复用分支：`scripts/pr-source-evidence.mjs` 与 Node 测试、`ci.yml`、workflow 契约测试。

每个分支附 `docs/verification/2026-10-26-<scope>.md`；提交/远端 checks 后同步 `docs/high-priority-issues.md`。不更改业务页面，不改写或提交真实运行原图。

### Task 1: 工作树 UI 摘要与最终提交预检

- [x] 写真实临时 Git 仓库反例：已跟踪 UI 和 Pages 修改、新增、删除、CRLF、提交前后内容摘要。

```js
writeFileSync(join(repo, 'miniprogram/app.wxss'), 'changed\n');
assert.notEqual(currentUiDigest(repo), baselineDigest);
rmSync(join(repo, 'miniprogram/app.wxss'));
assert.notEqual(currentUiDigest(repo), baselineDigest);
```

- [x] 运行 `node --test scripts/check-ui-sync.node-test.mjs`，确认修改/删除无法正确检测而失败。
- [x] 从实际工作树读取 Buffer；仅文本规范 CRLF，二进制保持字节。`ls-files -z` 去重并过滤已删除文件；基线仍读取指定 Git tree。

```js
const bytes = readFileSync(file);
return bytes.includes(0) ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
```

- [x] 写描述与预检反例：占位符、dirty、无报告/标题/body、过期统计、多个新增报告、无 origin/main、UI 变更要求 strict+validate、产品变更的版本用例。

```js
assert.match(validatePullRequest({ title, body: body.replace('结果', '【请补充】'), stats }).join('\n'), /占位/);
assert.equal(runPreflight({ cwd: dirtyRepo, execute: record }), 1);
assert.deepEqual(record, []);
```

- [x] 运行 `node --test scripts/pr-preflight.node-test.mjs scripts/pr-body.node-test.mjs` 和 `npx vitest run tests/pr-description-gate.test.ts`，确认新增约束未实现而失败。
- [x] 生成器复用 `parseDiffStats`；最终 diff 为 `merge-base(origin/main,HEAD)..HEAD`。报告只自动选本 diff 唯一新增/修改报告；其他情况要求 `--report`。写入时保持草稿，最终预检拒绝草稿占位。
- [x] 预检优先执行干净状态与描述校验；失败不跑耗时检查。成功后通过 Harness affected，再执行 release-notes、版本/settings 测试；UI 相关变更追加 strict sync、governance、全量 validate。使用 argv 数组，Windows npm 调用兼容现有 Harness。
- [x] 运行最小测试，修复失效 syncedThrough 为已核对可达 main SHA，保留截图/摘要/采集时间。
- [x] 格式、strict sync、governance、validate、coverage、audit 全部通过后提交 `fix(ci): 前置最终 PR 与工作树校验`。

### Task 2: 上传阶段超时与未知结果

- [x] 真实子进程测试：模拟编译后进入 upload 卡住，父进程仅从 upload doing 起计时；超时杀子进程并返回失败。另测编译阶段不计入五分钟、成功、非超时错误和诊断脱敏。

```js
const result = await runUploadProcess({ workerPath, uploadTimeoutMs: 100 });
assert.equal(result.outcome, 'UNKNOWN');
assert.equal(result.reason, 'upload-timeout');
assert.equal(result.receipt, undefined);
```

- [x] `node --test scripts/upload-miniprogram-ci.node-test.mjs`，观察新增超时用例失败。
- [x] 保持可注入 `ci` 的现有上传函数；CLI 以 fork 隔离 SDK，进度 IPC 只携带 phase/status。父进程从远端上传开始计时，每分钟输出经过时间和最后进度时间；到五分钟终止 worker，必要时 SIGKILL。日志不打印 SDK 原始对象或密钥。
- [x] 超时返回 UNKNOWN，不重传；workflow 只在上传成功时生成 receipt，always 清理密钥，保留有界诊断摘要。调大 job 总时限不替代阶段超时。
- [x] 成功、错误、真实挂起测试通过，再运行 deploy 契约、validate、coverage、audit；提交 `fix(deploy): 限制远端上传等待并记录未知结果`。

### Task 3: 实际发布 receipt 与累计范围

- [x] 构造 A/B/C Git 历史及发布 receipt；测试前序失败后的 docs 后继、删除、跨目录 rename、手动全量、过期/非祖先基线、缺失/篡改 artifact、partial、不匹配环境与实际改签目标。

```js
assert.equal(decide({ baseline: receiptA, target: C, changedPaths: ['miniprogram/deleted.ts'] }).shouldUpload, true);
assert.throws(() => validateReceipt({ ...receiptA, outcome: 'partial' }), /成功/);
assert.throws(() => verifyTargetCi({ head_sha: A, conclusion: 'success' }, C), /SHA/);
```

- [x] `node --test scripts/release-baseline.node-test.mjs scripts/miniprogram-upload-decision.node-test.mjs scripts/cloudbase-deploy-decision.node-test.mjs`，观察反例失败。
- [x] schema 绑定 kind、target SHA、run/attempt、环境、CI run/attempt、内容摘要、实际选中函数、基础设施摘要、部署/回读/清理。只有完整成功 receipt 可以更新基线；skip/partial/UNKNOWN 单独记录。
- [x] 从受信 main deploy runs 下载 artifact；校验仓库、workflow、push/dispatch、branch、run/attempt 与 receipt，使用实际 target SHA而非workflow head。缺失可信基线默认全量；损坏/伪造证据阻断，不静默沿用。
- [x] 累计 diff 使用最后实际成功 SHA到目标 SHA；删除与 rename 两端纳入（`git diff --name-status -z` 或 `--no-renames --name-only -z`）。上传 decision 只作 CI shadow 输入，发布最终范围重新计算。
- [x] main 推进不直接部署未经验证最新 SHA；目标锁定至同 SHA 的 main CI success，source 与目标均完整 fetch。串行副作用、现有所有 smoke 与回读继续保留。
- [x] workflow 真实成功后写 receipt artifact；本地 fixture 契约通过不宣称实际部署通过。全量验证后提交 `fix(release): 绑定实际发布基线与累计变更`。

### Task 4: PR 元数据可信源码复用

- [x] 测试成功源码 run 复用；同 head/base 但 merge tree或validator digest变化不复用；artifact缺失、失败/canceled、fork、不匹配run/attempt、旧schema不复用。

```js
assert.equal(canReuse({ expected, evidence: { ...expected, outcome: 'passed' } }), true);
assert.equal(canReuse({ expected, evidence: { ...expected, baseSha: differentBase } }), false);
```

- [x] `node --test scripts/pr-source-evidence.node-test.mjs scripts/ci-workflow-contract.node-test.mjs`，观察反例失败。
- [x] 源码 evidence 绑定 head/base、merge tree、validator与锁文件摘要、Harness结果、run/attempt。仅 edited/labeled 搜索可信成功源码 job；无符合证据立即回退正常 affected，不把任意 PR artifact送入带密钥job。
- [x] 将 workflow 并发域按 source/metadata 分离；源码 job在同head的元数据风暴不被取消。保留每次描述校验与required `validate`，aggregator只接受成功检查或已严格核对的复用，保留机器人例外。
- [x] 验证描述与 required 独立恢复、base 推进自动重跑、源码失败不复用的契约；真实 source `40271458646` 与仅 edited `40271690906` 成功，后者复用前者 attempt 1，required validate 通过。全量验证后提交 `ci(pr): 复用同内容源码检查并隔离元数据并发`。

### Task 5: 交付与验收状态

- [x] 四项分别执行适用全量检查，报告准确记录 PASS/BLOCKED/NOT_EXECUTED、源码测试数量及没有真实部署的边界；最终组合 1297 Vitest、全量、覆盖率、审计、严格同步、治理与 actionlint 通过。
- [x] 使用最终 commit diff 生成完整 PR body，运行最终 preflight；版本/统计固定后提交验收报告，重新生成统计。
- [x] 推送独立逻辑提交与 draft PR 供 review，四项最终远端 required validate / CodeQL 通过。无明确生产合并授权不合并/生产发布。
- [x] 第一批全部可审阅，交付报告记录四项状态、PR 链接与仍待合并验收的事项；第二/三批未实施，云部署 2–4 分钟目标未实测。

合入后的实际验收：

- [x] 合入四项并保留全部测试入口；`6fe556e7` 同 SHA main CI `40274522431` 全部成功。
- [x] 核对微信实际发布 receipt，`0.0.372.1` / `40274682162` 通过 artifact、run attempt、同 SHA CI、Git 内容与环境验证。
- [x] 核对 CloudBase 完整部署与回读 receipt，以及后继主线的安全跳过；UNKNOWN、取消、部分失败或缺失 outcome 不推进成功基线。
- [ ] 合入文档 #369 并核对最终主线 CI / CodeQL 与两条发布工作流的有界 outcome；最终记录附在 PR 交付信息，避免无限文档回填。
