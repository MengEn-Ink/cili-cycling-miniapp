# 工程治理与源码卫生 V2 设计

日期：2026-10-26。冻结基线：`origin/main@4e69367f21139c8d9dab068fea5ed67926ef872b`。用户已确认由 TraeX 执行者独占治理写入，TraeX 审判者保持只读审核。远端 `chore/source-hygiene-20261026@4340b83a` 冻结为历史证据，不直接合并或继续写入。

## 目标

把当前“自动化全绿但仍允许治理漂移”的状态收敛为四个可独立合并、独立回滚的交付片：

1. 文件模式与仓库源码卫生可由门禁自动证明；
2. 主题令牌、原生配置和文档命令由同一份可机器校验的契约约束；
3. Pages 视觉检查与真实微信开发者工具校准明确分层，主分支保护要求稳定且完整；
4. 活跃文档只描述当前状态，历史方案和完成流水通过 Git 与不可变 verification 记录追溯。

本治理不改变产品业务、CloudBase 数据、云函数运行逻辑、客户端版本或发布目标。代码合并、CI、开发版上传、CloudBase 与物理真机继续独立判定。

## 已确认问题

- 主分支 Ruleset 只要求 `validate`，`strict_required_status_checks_policy=false`，审批数为 0，CodeQL 不是 required check。
- README 与现行微信验收手册要求 `npm run check:design`，但 `package.json` 没有该脚本；现有 CI 不会因此失败。
- 26 个 WXSS 文件都消费 CSS 变量，但主题值同时存在于 `app.wxss`、`config/theme.ts`、`app.json` 与 17 个页面 JSON；11 个页面 WXSS 仍有 50 处颜色字面量，其中 4 处 hex（含 1 处 CSS variable fallback）和 46 处 rgba。
- main 跟踪 83 个可执行文件，其中 68 个没有 shebang；当前 `check:governance` 不检查 Git 文件模式，仍返回 PASS。
- `docs/` 有 452 个文件，其中 `docs/verification/` 有 88 个文件（87 份 Markdown 与 1 份 JSON）、26 份 plans、15 份 specs；高优清单包含已完成流水和“已完成”区块，与 `AGENTS.md` 的活跃清单规则冲突。
- 本地主工作树干净但落后远端 262 个提交，另有一个目录已不存在的 prunable worktree 登记。远端保留分支都含非 main 唯一提交，不能批量删除。

## 方案比较

### 方案 A：在旧 hygiene 分支继续修补

优点是已有 39 个执行位改动和一份整理报告。缺点是分支已落后当前 main 20 个提交，清单引用旧基线，只覆盖 68 个异常执行位中的一部分，继续 rebase 容易把陈旧状态与当前治理混合。

### 方案 B：从最新 main 重建最小治理片（采用）

每个治理面独立 PR，先写失败测试，再迁移必要事实；旧分支只用于核对遗漏，不复制其状态结论。优点是 diff 可审、回滚清晰、不会覆盖最新主线；代价是需要重新验证和拆分四次交付。

### 方案 C：一次性全仓清理

可最快减少文件数和分支数，但会把文件模式、主题行为、GitHub 外部设置和历史删除耦合在一起，难以证明回归边界，也不符合当前单项稳定化原则，因此拒绝。

## 交付架构

### PR A：源码模式与治理门禁

新增纯策略模块 `scripts/project-governance-policy.mjs`，只负责把 Git index 条目和文件首行转换为稳定问题清单；新增 `scripts/check-source-modes.mjs` 负责 Git 读取与退出码，`check:governance` 依次运行现有治理 CLI 和文件模式 CLI。这使本身也属于 68 个待降权文件的 `scripts/check-project-governance.mjs` 仅改 mode、blob 保持不变。策略要求：

- `100755` 文件必须是允许执行的脚本，并以受支持 shebang 开头；
- workflow、JSON、Markdown、HTML、WXML、WXSS、TypeScript、测试和普通模块必须为 `100644`；
- 依赖发布影响面的门禁按 old/new blob ID 区分内容变更与纯执行位变更，不得为 mode-only 治理伪造客户端发布说明；
- 现有敏感文件、产物、最小 Actions 权限等检查保持不变；
- 错误输出列出精确路径并以非零状态退出。

测试先构造包含正常脚本、无 shebang 可执行文件和错误扩展模式的 index 样本，确认当前实现失败，再加入最小策略实现。随后只修改 Git mode，不改 68 个文件内容。prunable worktree 登记属于本机元数据，在确认无存活进程引用后单独执行 `git worktree prune`，不写入 PR。

### PR B：主题契约与 `check:design`

新增机器可读的 `miniprogram/config/theme-contract.json`，分别记录 `wxss` 语义令牌、`native` 导航/背景/tabBar 值、允许的媒体叠层令牌，以及显式的跨端等价映射。运行时代码仍使用适合微信构建链的 TS/WXSS/JSON，不在运行时读取治理 JSON。

裁决规则不是把 TS/WXSS/JSON 的所有颜色按数值强行相等：只有进入 `equivalentRoles` 的同语义角色才必须同值；仅属于 native 或仅属于页面视觉的角色不做跨命名空间相等断言，但仍必须与各自契约值一致。冻结基线实际复核为 `theme.ts.brand=#e13b2b` 对 `app.wxss.--color-brand=#e13b2b`、`theme.ts.background=#fbf5ea` 对 `app.wxss.--color-bg=#fbf5ea`，不存在 `#e85b32` 或 `#f2f3ef`；`navigationFront` 等 native 专属角色没有 WXSS 等价项。任何后续有意分层必须先在契约中声明角色与理由，PR B 不归一或改变现有视觉值。

新增 `scripts/check-design.mjs` 与 Node 契约测试，校验：

- `app.wxss` 的共享令牌与契约一致；
- `config/theme.ts` 的原生颜色映射与契约一致；
- `app.json` 和全部注册页面 JSON 的原生外观值与契约一致；
- 页面 WXSS 不新增契约外的语义颜色字面量；媒体渐变、透明叠层等特例必须转成命名令牌，不能靠路径级永久豁免；
- README 和运行手册出现的 `npm run <script>` 都能在 `package.json` 解析。

恢复 `check:design` 与 `test:design` 脚本，并把 `check:design` 接入 `validate`。第一阶段目标是消除现有 50 处页面颜色字面量；不改变视觉值，只把它们映射为全局或组件语义令牌。

### PR C：视觉校准与主分支保护

Pages 三宽度 Playwright 检查继续作为跨平台布局门禁；真实微信视觉校准作为单独的 macOS/DevTools 门禁，不互相冒充。

从旧视觉分支重新移植最小 Task 0 契约，而不是合并分叉历史：固定目标主机与工具版本、使用 `SHA256("cili-visual-host-v1\\0" + normalized_uuid)` 指纹、读取 PNG header 实测尺寸，并在开始/结束记录 HEAD 与 porcelain。缺少 Accessibility、主机不符、版本不符、工作树漂移或未执行都返回 BLOCKED，不能映射为 PASS。

GitHub CodeQL workflow 增加稳定聚合 check 名称，Ruleset 再切换为：

- required checks 包含 `validate` 与稳定 CodeQL 聚合项；
- strict required status checks 开启；
- 至少 1 个审批，且最后一次推送不能由同一提交者自批；
- 继续要求评论线程解决、禁止删除与非快进更新。

外部 Ruleset 变更只在代码侧聚合 check 已在真实 PR 事件成功后应用。若仓库没有第二位可审批协作者，则审批要求保持 PENDING，不先制造无法合并的死锁。

### PR D：文档治理与分支收尾

文档分三类：

- 活跃事实：README、需求、数据契约、GitHub 治理、高优清单和运行手册；只写当前状态；
- 不可变证据：`docs/verification/` 与必要的脱敏 evidence；允许保留历史 SHA/Run，但必须明确绑定版本；
- 临时设计与实施计划：`docs/superpowers/specs/`、`docs/superpowers/plans/`；交付完成或被替代后从当前树删除，Git 历史即归档。

高优清单删除完成流水、历史 UI 摘要和“已完成且不再列为阻塞”区块，只保留基线、未关闭事项、关闭条件和分支约束。文档门禁同时校验 README/运行手册命令存在，避免再次出现已删除脚本仍被文档引用。

分支与 worktree 按证据处理：

- PR #360 的 Dependabot 分支保持；
- PR #341 source、隐私阶段、未来路线、微信 E2E 与两条视觉分叉在等价迁移完成前保持；
- 旧 hygiene 分支只在 V2 全部合并、patch 已覆盖且审判者确认后删除；
- 本地技术债分支有唯一提交，不因落后 main 自动删除；
- 只删除 PR 已合并/关闭且 unique patch 已等价进入 main 的分支。

## 状态口径

高优清单中的治理项在规格获批后保持 `DESIGN_APPROVED / IMPLEMENTATION_PENDING`。单片只有代码和本地门禁时记为 `IMPLEMENTED / REVIEW_PENDING`；PR checks 全绿但未合并时记为 `PR_VERIFIED / MERGE_PENDING`；合并后仍需 main CI、适用的部署或安全跳过回读。四片全部完成且外部 Ruleset 与分支清理证据齐全前，不得使用 `DONE`、`PASS` 或从清单删除。

## 验证与证据

每个 PR 都执行与影响面匹配的 TDD 红绿循环、`format:check`、定向测试、`check:governance`、`git diff --check` 和 PR preflight。涉及 package、脚本或 CI 的 PR 还执行 `validate`、`coverage` 与 `audit:all`。UI/主题 PR 额外执行 `test:design`、`check:design`、严格 UI sync 和三宽度检查。

Task 0 只能在目标 macOS 主机执行；本地非目标主机结果必须是 BLOCKED。Ruleset 通过 GitHub API 回读最终配置，并用真实 PR 验证 required checks 和审批路径。文档/分支清理前后记录 `git for-each-ref`、worktree 清单、open PR 和 patch 等价证据。

## 回滚与失败处理

- PR A 仅改文件模式与治理策略，可整体 revert；本机 worktree prune 不影响存在目录。
- PR B 只改契约、令牌表达和检查脚本；视觉值发生任何变化即停止，不以截图摘要更新掩盖漂移。
- PR C 的代码与 Ruleset 分两阶段；先回滚外部 Ruleset，再回滚聚合 check，避免主分支永久阻塞。
- PR D 的删除都可从 Git 历史恢复；含唯一实现的分支不得删除。
- 任一执行期间出现未知 HEAD 移动或重叠写入，立即恢复零写入冻结并报告。

## 完成标准

1. 当前 main 不再包含无 shebang 的异常 `100755` 文件，门禁可复现阻断回归；
2. `npm run check:design` 存在并进入 `validate`，跨端主题值与页面字面量受契约约束；
3. Pages 与真实 WeChat 视觉证据语义分离，Task 0 在目标机有不可伪造的环境与双快照证据；
4. Ruleset 回读与真实 PR 证明 required checks、strict 同步和独立审批生效；
5. 高优清单只含未关闭事项，完成计划从当前文档树移除；
6. 所有删除分支都有 merge/patch 等价证据，保留分支都有明确原因；
7. 每个 PR、main CI、部署/安全跳过和实际验收分别记录，不互相替代。
