# 开发、CI 与发布部署链路优化方案

状态：**FIRST_BATCH_MERGED / DEVELOPMENT_UPLOADED / CLOUDBASE_VERIFIED**。A 方案第一批 #364、#365、#367、#368 已全部合入 `main@6fe556e7`；最终 PR CI / CodeQL、组合 1297 项测试与该主线完整 CI / CodeQL 通过。微信开发版 `0.0.372.1` 的实际回执已核对，绑定同 SHA CI 与上一实际成功基线。云 `40274362993` 完整部署 12 个函数、基础设施与关键配置回读、数据库 smoke 和清理通过，真实 receipt 核对通过；后继 `40274682171` 使用真实基线安全跳过，目标、同 SHA CI、artifact 摘要与无副作用 outcome 核对通过。文档 #369 合入后继续核对最终主线，第二、三批尚未实施。日期：2026-10-26（CST）。实施步骤见 [第一批计划](../plans/2026-10-26-ci-release-first-batch.md)，实际交付状态见 [交付报告](../../verification/2026-10-26-ci-first-batch-delivery.md)。

建议采用“前置失败检查、复用可信证据、按实际影响部署”的分层方案。优先处理微信上传远端卡住、PR 描述返工和无关云端 smoke，再优化安装、并行与本地证据复用。真机、普通成员写链路和目标云环境回读继续独立验收。

## 1. 调研范围与统计口径

- 仓库：`MengEn-Ink/cili-cycling-miniapp`。产品与工作流基线：`main@879ea813`；当前本地工程分支另含已推送的卫生提交 `4340b83a`。
- Actions 样本：812 个 run，创建时间覆盖 **2026-10-19 08:03:56 至 2026-10-26 11:19:53 CST**；近期 PR 90 个，其中 61 个在此窗口内合并。
- 深读 251 个 run 的 jobs/steps：全部 61 个 main CI、76 个 CloudBase、66 个微信开发版上传、7 个每日审计、2 个体验门禁，以及 39 个 PR CI 样本。PR CI 深读样本为近期 15 个成功/失败 run 加分层历史样本，合计 19 个成功、20 个失败；不是随机抽样。
- 阅读 17 份关键 job 日志，下载并逐字段核对 #348、#351、#357 对应的 3 份上传 receipt。其余上传按“receipt 存储步骤成功”统计，未逐一下载全部 receipt。
- 排队代理值 = run 创建至首个实际 job 开始，包含调度、runner、并发和环境等待，不能进一步归因为某一种等待。
- 有完整 jobs 的首次运行，阶段耗时取 run 创建至最后 job 完成；PR CI 全量统计及 Pages/CodeQL 使用 API `created_at → updated_at`，可能包含状态更新或重试间隔。P90 使用最近秩法。
- 成功耗时单独统计；取消、失败、未结束和安全跳过不混入“实际发布成功”。“PR 创建到合并”包含修改、审核和人的等待，不能称为纯审核时间。
- 原始 API、日志和中间计算只在私有分析目录保存；本文只保留公开提交/run 标识、统计与有边界的摘录。汇总数据见 [分析摘要](../../verification/2026-10-26-ci-release-analysis-summary.json)。

## 2. 哪个环节最慢

| 环节 | 样本数 | 中位数 | P90 | 解释 |
| --- | ---: | ---: | ---: | --- |
| PR 创建 → 合并 | 61 | 13 分 16 秒 | 2 小时 41 分 52 秒 | 含修改、审核与人工等待，长尾最明显 |
| PR CI 成功 | 77 | 68 秒 | 143 秒 | 全窗口 API 口径，包含最终成功的重试 run |
| main CI 成功 | 59 | 92 秒 | 124 秒 | 当前 Harness 路径子样本 21 个：100 秒 / 129 秒 |
| CloudBase 实际自动部署成功 | 13 | **10 分 06 秒** | **17 分 02 秒** | 最大 24 分 54 秒；自动化关键瓶颈 |
| 微信实际自动上传且存储 receipt | 31 | 36 秒 | 41 秒 | 最大 4 分 27 秒；另有 5 个取消 run |
| Pages 成功 | 61 | 49 秒 | 82 秒 | 并行的原型发布 |
| CodeQL main 成功 | 61 | 141 秒 | 338 秒 | 独立工作流，当前不是 required `validate` 的依赖 |

59 个 CloudBase 自动成功 run 中，**46 个实际跳过、13 个执行部署步骤**；54 个微信自动成功 run 中，**23 个实际跳过、31 个存储 receipt**。直接用所有 success 计算部署耗时，会把安全跳过当成发布，得到误导结论。

主线合并后，34 个有 receipt 的自动/手动上传样本完成时间中位数为 136 秒；13 个自动云部署样本为 723 秒。二者目前并行，不能把两个耗时相加。工作流可能改签部署目标，云部署的这些关联时间先按元数据关联，不能代替实际目标 SHA 的回读证明。

### CloudBase 的时间花在哪里

| 自动实际部署的步骤 | n | 中位数 | P90 |
| --- | ---: | ---: | ---: |
| 俱乐部数据库写入 smoke | 13 | **313 秒** | 367 秒 |
| 部署受影响函数并逐项验证 | 13 | 75 秒 | 327 秒 |
| 读取全部已有函数并准备运行配置 | 13 | 39 秒 | 45 秒 |
| 关键函数密钥对账 | 12 | 20.5 秒 | 23 秒 |
| 再读关键函数验证一致性 | 13 | 20 秒 | 23 秒 |
| 安装并验证全部云函数包 | 13 | 22 秒 | 32 秒 |
| 数据库基线 plan/apply/verify | 4 | 243.5 秒 | 368 秒 |

各行是独立分布的中位数，**不能直接求和**。9 个未执行基础设施 apply 的 run，总耗时中位数仍为 509 秒。作为上限测算，在这 9 个 run 上逐一扣除俱乐部 smoke 后，中位数为 178 秒；其中实际涉及俱乐部的变更仍应保留对应测试，不能把这个测算当作已实现提速。

正常首 job 等待中位数仅 2–3 秒。样本不支持优先购买更大 runner 来解决总体瓶颈。

### 当前微信上传异常必须单独处理

- `40255383603` attempt 2、`40260710167` 均在上传步骤持续约 29 分 54 秒后被取消；安装、自测、编译和打包已完成。
- 日志最后进度分别停在 **2026-10-26 10:14:41、10:46:24 CST 的 `upload / doing`**，编译和资源打包约 6 秒。可以定位到远端传输/响应阶段，不能仅凭这些日志认定是白名单、网络、代理或微信服务中的哪一个根因。
- 同窗口还有 `40214737392`、`39417432722` 在上传阶段约 30 分钟后取消；5 个取消 run 中 4 个属于这种长尾。最新手动重试 `40263538407` 查询时仍为 `in_progress`，无有效 receipt。
- 缩短 CI 的几十秒不能解决这类 30 分钟等待。先增加上传阶段超时与进度诊断，超时后核对平台版本/receipt，再决定重试，避免重复副作用。

## 3. 当前链路与已有优化

```text
本地修改
  → pr:preflight（部分本地检查）
  → PR：pr-submission ∥ affected-pr → required validate
  → 合并 main：main-validate ∥ main-coverage ∥ main-audit ∥ upload-decision
  → 整个 CI 成功
      ├─ CloudBase：范围判定 → 安装/测试 → 配置 → deploy/回读 → 俱乐部 smoke
      └─ 微信：上传判定 → 锁定工具安装/自测 → 上传 → receipt
  → candidate → 微信公众平台人工选版 → verified → 体验版 UAT

Pages、CodeQL：独立并行工作流
```

已经具备 affected、Harness、npm 下载缓存、主线检查并行、云函数安装并发上限 3、开发版上传判定和 receipt，以及体验版两阶段门禁。应复用这些机制，不再搭一套 runner 或发布体系。

仍有六个缺口：

1. `edited/labeled` 会重跑 `affected-pr`。223 个 PR CI run 只有 124 个不同 head SHA，存在 99 次同 head 重复 run；其中有基线变化、合法重试或失败后的重跑，**99 次是重复现象的上限，不是全部可删除次数**。
2. 20 个深读失败 PR 样本中，14 个提交描述失败、10 个 affected 失败，4 个两者同时失败。元数据和源码检查并行，描述不合格时仍消耗源码检查。
3. `pr:preflight` 固定检查 settings-page，未完整复用 affected；工作区脏、PR 描述缺失或占位只告警，不适合作为可复用发布证据的最终门禁。
4. CI、云部署和上传分别重复准备依赖；部署再次测试所有云函数。main CI 安装树步骤约 25 秒，audit 本身约 7 秒，优先去除重复安装比删除安全审计更合理。
5. CloudBase 实际部署无条件跑俱乐部 smoke。该脚本在 runner 导入业务 core，经 CLI 直接读写云数据库，并使用 overlay 模拟读己之写；它不覆盖微信普通成员身份、已部署云函数入口或真实数据库回调事务。
6. candidate 中名为 `smoke_run_id` 的证据，目前仅要求同 SHA、名称为 CI、结论 success，然后写 `smoke-outcome passed`。应明确为 CI/契约证据，另接真实旅程结果，不能让这项命名代替 P0 验收。

当前 main 通过 active `protect-main` ruleset 要求 `validate`；基线严格策略为 false，允许 merge/squash/rebase。classic branch protection API 返回 404，但 **main 并非没有保护**。优化须保留 required check，并在复用时自行严格核对最新 base/合并内容。

## 4. 历史返工样本与应前置的工作

| 历史记录 | 核对结果 | 前置措施 |
| --- | --- | --- |
| [#362](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/362) | PR 20 分 51 秒；5 个 CI run，3 次描述失败；日志要求最终统计 `24 files changed, +248/-45` | 在最后一次修改/rebase 后生成并校验最终 PR body；描述修改不重跑同内容源码检查 |
| [#359](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/359) | 文档 PR 4 个 CI run，3 次失败；缺 `docs/verification/` 验收报告引用 | 纯文档提供适用范围和报告，生成器直接按分类填写，不反复人工修正文案 |
| [#357](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/357) | 11 个 CI run，7 次失败；抽查包括 UI sync、release notes、版本测试预期 `2026.10.25.1/2` 不一致 | 开工即确认页面/版本/同步范围；提交前把版本、发布说明、测试预期、UI digest 一次校准 |
| [#348](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/348) → [candidate 39942078355](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39942078355) → [#349](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/349) | 开发版 `0.0.350.1` receipt 已核对；candidate 因 squash 前 SHA 不可解析失败，需补同步基线 PR | 不把短命分支 SHA 当长期 UI 基线；合并后检查基线可达性和内容摘要，再上传/晋级 |
| [main 39458948380](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39458948380) | 浅克隆无法解析发布历史 diff；已有后续完整历史修复 | 对需历史的 job 保持 fetch-depth 0；不为几秒 checkout 收益再次裁掉必要历史 |
| [main 39352006406](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39352006406) | 硬编码测试日期过期，合法性校验拦截；已有未来时间夹具修复 | 时间敏感用例固定可控时钟或相对未来时间，测试时间边界而非日历寿命 |
| [#358 / 云部署 40214737276](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40214737276) | 只部署 activity-read：函数部署 37 秒，俱乐部 smoke 305 秒，总 474 秒 | 无俱乐部/共享/基础设施影响时省去无关 smoke，保留函数与媒体回读 |
| [上传 40260710167](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40260710167) | 打包完成后 upload 卡住近 30 分钟，无 receipt | 上传阶段独立超时、阶段诊断、平台回读后恢复 |

每个需求建议按以下顺序收口：

1. 开工先核对高优问题、现有能力与影响图；UI 读取对应 Pages 路由和骑行影像志设计资料；写链路先准备普通成员和隔离环境。
2. 实现过程中先跑最小相关反例，UI 同步检查浅色可读性、44px 实际触控范围及长标题/窄屏。
3. 提交前跑与 CI 共用的 affected；UI 另跑严格 sync、governance 和全量 validate。涉及微信 API/布局时通过既有 DevTools runner 核对运行态。
4. 最终内容固定后生成版本、release notes、PR diff 统计和验收报告；明确 PASS、BLOCKED、NOT_EXECUTED，禁止把待回填写成完成。
5. 合并前确认 base 未推进；合并后校验 squash 基线可达性、内容摘要和同目标 CI，再进入部署与晋级。

## 5. 哪些可以跳过，哪些可以复用

| 情形 | 可以减少的工作 | 仍需保留的工作 |
| --- | --- | --- |
| 只改 PR 标题、描述、标签 | 同 head、base、验证器版本及合并内容均不变时，复用已成功源码检查 | 描述检查和 required validate 聚合；证据不存在或基线变了就重跑 |
| 普通 Markdown 文案/验收报告 | 经分类后跳过无关业务测试、云部署与客户端上传 | 文档/链接/报告治理；设计、UI 清单、发布清单和 Pages 另行分类 |
| 只改小程序 UI | 云部署目前已经会跳过；可信本地证据可省重复截图采集与重复只读检查 | CI affected、严格 sync、governance、全量 validate、构建预算、实际上传 receipt |
| 只改单个云函数 | 安装/测试受影响包；客户端产物确实未变时跳过上传；无关领域 smoke 可跳过 | 服务端相关权限/幂等测试、依赖传播、部署和目标云回读 |
| 本地 DevTools 只读通过 | 复用对应内容、角色、环境的只读路由/截图证据；作为发布前 UI smoke 的证据输入 | 轻量证据校验、云环境变化后的回读；不能替代写链路或真机 |
| shared、依赖锁、构建配置、工作流、影响选择器变化 | 缓存下载和有界并行 | 全量门禁与受影响部署；未知范围默认全量 |
| 普通成员写链路、双真机、OAuth/GPX、隐私权限/媒体 | 预先备齐角色、设备、环境和测试数据；按失败领域重测 | 对最终版本的真实验收及证据，不接受 Mock 或模拟器替代 |

**当前 GitHub CI 没有 DevTools runtime job**；因此本地 IDE 通过，不能凭空再省掉一个本来不存在的 CI E2E。近期收益主要是避免上线前重复跑本地截图、提前发现运行问题，并减少提交后的返工。Linux 上的编译、测试和上传客户端自测仍有独立价值。

### 本地证据如何成为可复用输入

复用现有 Harness v2、`wechat-devtools-e2e.cjs` 和结果 schema。记录最终 SHA、规范化源码/产物摘要、锁文件与验证器摘要、Node/系统/DevTools/基础库版本、执行角色别名、环境和云部署 receipt、路由/场景、开始结束时间、dirty 状态、outcome 与 blocker。

- 开发中的 dirty 结果用于反馈；准入证据必须由最终干净内容采集。squash 后 SHA 变化，只能通过独立核对内容等价关联，不能人工改写原记录。
- 截图和真实运行结果继续私有保存；公共 artifact 只输出有边界的摘要与脱敏证据。
- 建议初始 TTL 为 24 小时，属可调整的策略值；源码、依赖、工具、账号权限或云部署版本变化立即失效，不等 TTL。
- 本地 JSON 自称“passed”或任意签名都不足以替代 CI。第一阶段本地证据仅作提前发现问题；第三阶段须使用受信采集机/受信签发器，CI 验证来源、摘要、schema、版本与有效期后才省重复运行。
- PR/fork 的可执行文件与自带 artifact 不进入有发布密钥的 job；受信 main 发布只消费已核对的不可变内容。

## 6. 先修正确性，再扩大跳过范围

1. **本地 UI digest 读取了旧 HEAD。** `check-ui-sync.mjs` 的 `readNormalized()` 优先 `git show HEAD:file`，已跟踪文件的未提交改动会被忽略。改为读取实际工作树并规范 CRLF；最终证据核对干净状态和内容。验证修改/新增/删除、CRLF、提交前后和 squash 场景，避免本地假通过。
2. **上传选择器漏掉删除。** 当前 `git diff --diff-filter=ACMR` 不含 D；删除客户端文件也影响产物。统一选择器覆盖删除、重命名、跨目录移动与配置传播，再谈减少上传。
3. **云部署目标可在 CI 后改签。** 检测 main 推进会直接 checkout 最新 main 并强制全量对账，代码未额外验证新目标对应 CI 成功。此为源码确认的路径风险；本次抽查日志未证明某次实际部署了未通过 CI 的新 SHA。
4. **成功工作流不是实际发布基线。** CloudBase 从 workflow `head_sha` 找成功基线，但其中包含 scope skip，也可能不等于改签后的实际目标。微信按紧邻提交 diff 决定上传，不能可靠补偿上一版本取消/过期跳过后的未上传变更。
5. **影响图存在多份清单。** affected 缺 strava-bridge/callback，目前以全量兜底；云选择器另有 GPX/Strava、shared 和密钥依赖。统一维护依赖图，但检查范围、云部署范围和客户端上传范围保持各自语义。

新增云部署 receipt 应绑定实际 target SHA、CI run/attempt、包摘要、环境、选中函数、基础设施摘要、部署结果、回读和清理结果。跳过记录带 `reason` 和沿用的真实部署基线，不能冒充新部署 receipt。

排队合并采用“最新且已通过 CI 的目标 + 从上次实际发布基线累计 diff”。main 推进时重新核验目标 CI；没有有效证据就等待/结束为 superseded。客户端包与云版本分别维护基线；纯文档提交也能触发判定，从而补偿前序尚未实际发布的运行内容。

保留正在产生副作用的部署互斥。当前 concurrency 未配置 `queue`，默认 single 会替换 pending，`cancel-in-progress: false` 只保留正在运行的任务，不保证每个提交都执行。GitHub 当前还支持 `queue: max`；本项目优先合并冗余待发布目标，基础设施迁移等必须逐项执行的操作则单独排队。

## 7. 推荐实施顺序与验收

### 第一批：减少返工、处理上传长尾、锁定证据

按逻辑拆 PR，避免一次同时更换选择器、跳过策略和发布协调器。

| 顺序 | 改动 | 主要文件/机制 | 通过条件 |
| --- | --- | --- | --- |
| 1 | 扩展提交预检；修复工作树 digest；最终 PR body、版本与报告校验 | `pr-preflight.mjs`、`pr-body.mjs`、`check-ui-sync.mjs`、Harness | 本地能拦截历史 #357/#359/#362 反例；改动文件不再被旧 HEAD 摘要掩盖 |
| 2 | 上传阶段加 5 分钟初始超时、无进度诊断和结果未确认状态 | `upload-miniprogram-ci.mjs`、`deploy-miniprogram.yml` | 打包成功但远端卡住时及时退出并清理；超时不生成 receipt，不自动重复上传 |
| 3 | 增加实际部署 receipt、累计 diff 和同目标 CI 核验；覆盖删除/重命名 | 两个 deploy workflow、两个 deploy decision 脚本 | A/B/C 连续 main 推进、前次失败、docs 后继、rerun、过期和部分部署均不遗漏或串 SHA |
| 4 | 元数据事件复用可信源码结果；保留稳定 required validate | `ci.yml`、affected/Harness 报告 | 改描述不取消正在执行的源码检查；同内容已有成功证据才复用；base/验证器变更自动重跑 |

第 4 项不得仅移除 `edited/labeled` 触发，否则描述失败后可能无法恢复 required check。元数据与源码使用独立并发域，聚合器核对 head、base、合并内容与检查版本。

实施时补充：产品与编译基线已同步至 `85cbc8f1`，后继 `456081f1` 只回填原上传验收。发布最终目标保持锁定，过期目标安全跳过，不直接改签新 main；只有后继同 SHA CI 成功才能部署它。上传五分钟从 SDK 的 upload 阶段起算，绝对截止不因进度刷新延长。所有 smoke、真机与普通成员写链路的独立门禁保留。

第一批实测：#368 在同 head/base 上完成真实 source `40271458646` 和仅编辑描述的 `40271690906`，后者复用前者 attempt 1，依赖安装与 Harness skipped，描述与 required validate 通过。`affected-pr` 单次耗时从 133 秒降至 14 秒，节省 119 秒；仅代表这一次源码 job 对照，未达到长期中位数统计要求。四个最终 head 组合的 1297 Vitest、全量、覆盖率、审计、严格同步、治理和 actionlint 通过，四项已合入并完成实际发布验收。首次完整云部署 18 分 54 秒，包含函数部署 427 秒、数据库基线 263 秒和数据库 smoke 275 秒；本批保留这些检查，不宣称已达到第二批 2–4 分钟目标。

### 第二批：压缩 CloudBase 实际部署时间

- 按统一影响图决定 smoke：俱乐部/admin/shared/基础设施或 smoke 自身变化运行对应集成测试；单独 activity-read 修复不无条件执行俱乐部写测试。未知影响、全量对账或证据缺失保留完整检查。
- 在现有包安装并发 3 的基础上，函数 detail 查询先采用上限 3，并复用同一部署周期已经核验的结果；保留需要部署后重新取值的回读。
- 函数部署先串行取得基线，再对确认独立的函数启用上限 2；依赖顺序、逐函数验证、失败传播、已完成清单与部分部署恢复保持明确。数据库/规则操作仍串行。
- CLI 固定版本一次准备；各任务共享 npm 下载缓存。同一 job 不重复安装相同锁文件；跨 job 不传递带密钥配置或 `node_modules`。
- 部署重跑源码测试只在缺少同内容 CI 包证据、版本/依赖变化或手动全量对账时执行；参数、凭证、运行配置、环境和真实回读每次校验。
- 将现有俱乐部脚本标注为数据库集成测试，保留其有效覆盖；后续隔离环境的真正云函数入口与成员旅程验收作为独立质量门禁。不得把管理员 CLI 直接写库当真实身份验收。

### 第三批：复用本地 IDE 证据，按风险精简 CI

先上线只验证、不跳过的 shadow 模式：对照正常运行，检查摘要、角色、云版本、TTL 和 blocker，确认拒绝伪造/过期证据后，再启用重复只读 smoke/截图复用。

纯 Markdown 可采用文档专用路径；Pages、UI、发布清单、工具配置分别映射。UI 的严格 sync、governance 和全量 validate 保留。根依赖/全局工具/共享/未知变更继续全量，CodeQL 与每日审计保留。暂不以本地 IDE 结果取消 main 的完整验证。

## 8. 优化目标、回退与待确认项

| 指标 | 当前观测 | 目标或评估方式 |
| --- | --- | --- |
| 本地可拦截的描述/同步/版本失败 | 深读失败样本 14/20 涉及描述 | 上线后按同分类比较，目标降低至少一半；不是已取得结果 |
| 仅元数据修改 | 仍可能重跑完整 affected | 有同内容可信成功结果时，只执行轻量描述与证据聚合 |
| 不涉及俱乐部/基础设施的单函数部署 | #358 实际 474 秒，其中无关 smoke 305 秒 | **预计 2–4 分钟/次云部署**；加 main CI 的整体时间另计 |
| 远端上传卡住 | 多次约 30 分钟后取消 | 5 分钟阶段超时及时反馈；不承诺网络/平台问题消失 |
| 正常上传 | 36 秒中位数 | 维持该量级，优先减少无效重传与长尾 |
| 基础设施/全量发布 | 长尾达 24 分 54 秒 | 单独比较函数数、infra、smoke 和部分失败，不能统一承诺 2–4 分钟 |

验收必须覆盖：删除/移动触发、无关变更跳过、shared/Strava 传播、dirty/CRLF、squash、base 推进、元数据风暴、缺失/篡改/过期证据、前序取消后 docs 后继、上传未知结果、云部署部分失败和配置清理。性能按同类变更对照，至少积累 10 个可比成功样本再报告中位数；P90 需要更多样本，不能用两次运行宣称稳定提升。

优化开关初始默认关闭，选择器先 shadow 对照。遇到范围不确定、摘要不符或异常率上升，退回完整检查/串行部署；已发生的发布副作用按 receipt 与回读恢复，不能只回滚 YAML。每次提交、部署、验收或阻塞变化更新高优清单，未完成的 P0 不移除。

可选方案：

- **A（推荐）：按上述三批推进。** 首先减少返工和上传长尾，再取得主要云部署提速，最后放开可信本地证据复用。
- B：只做预检、缓存和超时。改动较小，但约 5 分钟的无关 smoke 与发布基线问题仍存在。
- C：本地通过就跳过 main CI/云回读。当前证据与仓库验收约束不足以支持，不推荐。

用户已确认 **A 方案，以及先实施第一批**。第二、三批按前一批验收结果推进；5 分钟上传超时、并发 2/3 和证据 TTL 24 小时为初始参数，可随实测调整。

## 9. 可复核来源

- [CI 基线](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/879ea813b10e808f9a6a68184f8a8b5f312c978b/.github/workflows/ci.yml)、[CloudBase 工作流](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/879ea813b10e808f9a6a68184f8a8b5f312c978b/.github/workflows/deploy-cloudbase.yml)、[微信上传工作流](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/879ea813b10e808f9a6a68184f8a8b5f312c978b/.github/workflows/deploy-miniprogram.yml)。
- 源码：`scripts/affected-ci.mjs`、`harness-registry.mjs`、`pr-preflight.mjs`、`check-ui-sync.mjs`、`cloudbase-deploy-decision.mjs`、`miniprogram-upload-decision.mjs`、`cloudbase-club-application-smoke.mjs`、`upload-miniprogram-ci.mjs`。
- REST：`actions/runs`、`actions/runs/{id}/attempts/{attempt}/jobs`、`actions/jobs/{id}/logs`、`actions/runs/{id}/artifacts`、`rules/branches/main`、`rulesets`；PR 时间/合并 SHA 来自 `gh pr list`。
- 历史文档：[main 完整历史修复](../../verification/2026-10-21-main-validate-history-fix.md)、[时间夹具修复](../../verification/2026-10-20-member-activity-future-time-test.md)、[PR 前置工具](../../verification/2026-10-26-pr-preflight-tooling.md)、[体验版晋级说明](../../releases/experience/README.md)。
- GitHub 官方：[并发、pending 替换与 queue](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)、[workflow_run 与权限边界](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)。官方机制与仓库实际 YAML 分开核对。
