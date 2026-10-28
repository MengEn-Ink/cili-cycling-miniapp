# 高优问题清单

> 活动详情头像/背景专项：PR #373 已 squash 合入 `main@a1b335c5`，PR/main CI、覆盖率、安全审计、CodeQL 与 Pages 通过；CloudBase `40294771478` 全量对账 12 个函数、数据库/存储基线、配置与媒体密钥回读以及 8 阶段俱乐部写 smoke/清理均通过，微信 `40294771444` 实际上传开发版 `0.0.380.1`。两端 receipt 的 artifact digest、Git 内容、同 SHA CI 与累计范围已核验。发布后干净主线完成 17 个注册路由、20 张运行截图和 30 项检查，0 失败/异常/blocker；内容 1273ms、完整刷新 2049ms。首次冷启动仍有一次首页未就绪失败，双真机与普通成员写链路继续独立阻塞。见 [专项报告](verification/2026-10-26-activity-media-response.md)。
> 缓存失效片：PR #378 已 squash 合入 `main@10375994`，PR/main CI、CodeQL 与 Pages 全部通过；CloudBase `40306046890` 确认无云资源影响并以 `SKIPPED`、`sideEffectsStarted=false` 安全结束，微信 `40306046868` 实际上传开发版 `0.0.382.1`。不可变 outcome/receipt 的目标 SHA、工具 SHA、同 SHA CI、Git tree、累计范围与 artifact digest 已核对。发布后干净主线首轮冷启动为 0 检查/1 个“目标页面未就绪”异常；显式打开同一工作树后复跑 30/30、17/17 路由、0 失败/异常/blocker，公开名片、头像和背景下载解码通过。普通成员写链路与双真机仍独立阻塞。见 [缓存失效报告](verification/2026-10-26-pr341-cache-invalidation.md)。
> Strava 非激活基础片：PR #380 已 squash 合入 `main@38643aae`，PR/main CI、覆盖率、安全审计、CodeQL 与 Pages 全部通过；CloudBase `40315246349` 以 `SKIPPED`、`sideEffectsStarted=false` 安全结束，微信 `40315246336` 实际上传开发版 `0.0.384.1`，target/tooling SHA、同 SHA CI、累计范围和不可变 receipt 已核对。当前云函数、小程序与 `cloud:prepare` 不引用该模块，真实 OAuth/GPX、R09、目标云运行回读和双真机仍独立阻塞。见 [Strava 基础片报告](verification/2026-10-26-pr341-strava-contract.md)。

> 最后更新：2026-10-28（CST）。方案 B v6 已由 PR #402 squash 合入 `main@927269cb`；PR 门禁、main CI `40678008992`、CodeQL `40678008968` 与 Pages `40678009132` 全部通过。CloudBase `40678300173` 确认无云资源影响并以 `SKIPPED`、`sideEffectsStarted=false` 安全结束；微信 `40678300380` 已实际上传同 SHA 开发版 `0.0.399.1`，不可变 receipt 的 target/tooling SHA、同 SHA CI、source tree、累计范围、上传回读与 artifact digest 已核对。尚未晋级体验版，也未执行公开骑友媒体完整验收、普通成员真实写链路或 iOS/Android 双物理真机 UAT。
> CI 第一批 #364、#365、#367、#368、#369 已 squash 合入 `main@93ad577f`，最终 CI / CodeQL、1297 项组合门禁通过。微信开发版 `0.0.372.1` 实际回执已核对，CloudBase `40274362993` 完整部署 12 函数、配置回读和数据库 smoke 通过；最终云 `40276863957` 与微信 `40276863918` 的同 SHA CI、真实基线、累计范围及无副作用 SKIPPED outcome 已核对。详见 [第一批交付报告](verification/2026-10-26-ci-first-batch-delivery.md)，独立 P0 保留。
> PR #341 已按 `superseded` 关闭，固定 source `0908a021` 与来源分支继续保留；关闭不表示完整功能已合并或验收。19 条 source 发现已映射到已合切片及开放 Issue：隐私权益 #382、Strava #383、内容审核 #384、运行资源与目标云 #385、当前 UI/正式材料/联合 UAT #386，依赖顺序为 `#382 + #383 + #384 → #385 → #386`。当前 main 未启用旧删除、新审核或 Strava 生产状态机；独立 P0/P1 不变。见 [#341 迁移映射](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/341#issuecomment-6415356352)、[关闭迁移报告](verification/2026-10-26-pr341-closure-migration.md)、[重新评估报告](verification/2026-10-26-pr341-reassessment.md) 与 [拆合设计](superpowers/specs/2026-10-26-pr341-latest-main-split.md)。
> 媒体兼容片 PR #372 已正常 squash 合入 `main@3fd6abfd` 并由 #373 的 `main@a1b335c5` 发布后真实运行复核；source/canonical 双通道反查、本人预览、名片弹层及图片解码均通过。合并前 26 PASS / 1 FAIL / 0 异常和后续冷启动失败均保留，不重写历史证据。普通成员写链路、双真机和体验版 UAT 仍独立未验。详见 [媒体片报告](verification/2026-10-26-pr341-media-compat.md) 和 [组合验证](verification/2026-10-26-activity-media-response.md)。
>
> 本文件只保留尚未完成的实际交付或验收。历史运行和详细口径见 [微信 E2E 与上线准备状态](verification/2026-10-21-wechat-e2e-and-launch-readiness.md)，GitHub Actions 实时状态以 GitHub 为唯一事实源。

第三轮骑行影像志布局优化已通过 PR #348 合入 `main@3d492c77b0feb9d1c79894754a8777fd19c3ce82`：17 条路由收口统一 gutter 与 64rpx 主标题，个人/俱乐部/活动 Hero 统一 16:9；活动编辑改为扁平章节和单列长表单，仅上传入口保留虚线；个人与俱乐部资料减少嵌套卡片，管理卡将下架/驳回降为危险文字操作，红色只保留主操作、选中和明确危险动作。微信开发者工具在 366px 华为模拟设备完成 17/17 真实云只读路由截图、活动编辑长页底部和四个重点 WXSS 编译复核，Console/Network 错误筛选为空；16 页 × 340/375/430 三宽度全部通过，1276 项测试通过。当前 UI 摘要为 `sha256:5fc9f6ac10cfd8fff76e2098067e3bf7e0344ba95132f4d3c0238a22b26efc9b`；主包 458760 字节，距硬限额 555 字节。GitHub Actions 已上传开发版 `0.0.350.1` 并生成同 SHA receipt；首次 candidate 仅因 squash 后同步基线 SHA 不可解析而失败，源 UI 与 Pages 摘要未漂移。截图原图含真实资料，仅私有留存，未冒充脱敏公开证据；以上仍属于模拟器和开发版证据，不替代公开媒体、普通成员写链路或 iOS/Android 物理真机验收。

2026-10-23 视觉细节收口工作树（`main@601a483a` + 未提交改动）继续优化短文本单行、自然换行、圆形头像、个人背景遮罩和活动二维码双层承托。最终微信开发者工具真实云只读运行覆盖 17/17 注册路由，26 项通过、1 项因缺公开骑友头像/背景样本失败、0 异常；活动编辑与成员详情二维码均已滚动到实际区域核对。Pages 375px 的 17 路由无横向溢出或脚本错误，16 页 × 340/375/430 三宽度复核通过；全量 `validate` 通过，1279 项 Vitest 通过，严格 UI 同步、治理、云函数包与构建均通过。当前 UI 摘要为 `sha256:87e3f0f1a5ef24192aa38b2bc3bed8c4ce11b910dfe1c004e1b335c1c14e6519`，Pages 摘要为 `sha256:c542706c63eaf0fef5ea09b4e5c76b54ba9e59909ae55e31f60bc8d05474dd09`；主包 459259 字节，距硬限额仅 56 字节。本轮未部署、未上传，截图原图仍只在私有临时路径；公开媒体、普通成员写链路与双物理真机继续阻塞。

2026-10-28 方案 B v6 在 `d81e2d93` 基线上完成 17 路由暖纸底、砖红动作色、双行标题、紧凑筛选与连续章节收敛，并由 PR #402 squash 合入 `main@927269cb`；保留真实数据、权限、隐私和业务动作。完整 `validate`、Vitest 91/91 文件与 1386/1386 用例通过，16 页 × 3 宽度与 Pages 17/17 路由无溢出/脚本错误，官方 wechatide CLI 完成 17/17 真实云只读截图，公开证据已脱敏；严格 UI 同步、设计、治理和主包门禁通过。UI/Pages 摘要分别为 `sha256:cb0c04705f59847c350d7029d5efcb6f82ed412b84a654277cf29de72451bb8d` / `sha256:6652f7607ce97bcffc37aa6e050ab7fa2858f9fe104dbf09f57f98c2859e663c`，主包 458503 字节、余 812 字节。PR/main CI、CodeQL 与 Pages 全部通过；CloudBase `40678300173` 的安全跳过 outcome artifact digest 为 `sha256:f9a8004fad0df54c24810788d0dbe365b24d6956a23d153241c80c7f76d2821c`，微信 `40678300380` 实际上传开发版 `0.0.399.1`，release receipt artifact digest 为 `sha256:6bbdad2c88e90b3eb137888e70dd1c6e466e513b59532eb4a6565cf57c7e3410`。独立 automator 全量断言驱动启动连接超时且未生成报告；体验版晋级与回读、公开骑友媒体完整验收、普通成员写链路和双物理真机继续阻塞。详见 [本地验收记录](verification/2026-10-28-scheme-b-v6-local-acceptance.md)。

## 口径

- `*.test.ts` / `*.node-test.*` 是 Mock 或契约测试，不是真实 E2E。
- Pages 与 UI sync 是原型和同步证据，不是 IDE、云端写链路或真机证据。
- DevTools 只能证明对应 SHA、账号和环境的只读运行，不能当作物理真机。
- 未在当前 SHA 执行的事项必须记为 `BLOCKED` 或 `NOT_EXECUTED`；历史真实运行不得重标为当前版本。

## 当前待办

| 优先级 | 待办 | 当前状态 | 关闭条件 |
| --- | --- | --- | --- |
| P0 | 普通成员完整写链路 | `BLOCKED`；缺普通成员与隔离环境现场证据 | 创建→发布→报名→人工审批/自动通过→凭证→取消→重报，回读人数、状态、审计、幂等和补偿 |
| P0 | iOS / Android 双真机 | `BLOCKED`；IDE 设备模拟值不是真机 | 两端完成权限、相册、定位、二维码、Canvas、保存分享、Strava/GPX、弱网和安全区验收 |
| P0 | 当前云环境一致性与媒体 | `DEPLOYED / CLIENT_RELEASED / DEVICE_UAT_BLOCKED`；`main@a1b335c5` 的云 `40294771478` 已全量对账，`main@38643aae` 的云 `40315246349` 确认无云资源影响并安全跳过；微信 `40315246336` 已实际上传开发版 `0.0.384.1`。目标环境配置、媒体密钥、生产写 smoke/清理和发布后公开媒体解码通过。新审核/删除与 Strava 基础片未启用，双真机与普通成员写链路未验 | 以同候选版本在真机确认授权媒体、活动图、二维码与路线图，独立写链路回读通过 |
| P0 | Strava OAuth / GPX 导入 | `BLOCKED`；代码与契约测试不能替代现场运行 | 配置 callback 后完成授权同意/拒绝、刷新/撤销、导入预览、活动保存消费及手动 GPX 降级 |
| 上架前 | 主体、备案、类目、隐私与提审材料 | `BLOCKED`；无平台侧完整证据 | 后台核验主体/备案/类目，完成隐私声明、用户权益、内容治理、联系渠道和审核材料 |
| P1 | 活动详情客户端响应优化交付 | `DEPLOYED / DEVICE_UAT_BLOCKED / RUNNER_MERGED / MAIN_WARM_SMOKE_RECOVERED`；先显摘要、完整回源、云端并行读取与写后失效已发布，`main@10375994` 最终模拟器内容 1197ms、完整刷新 2785ms；历史首页未就绪失败均保留。`main@75f124a7` 的同工作树冷态对照为 1 次 automator 阻塞、1 次手动自恢复、2 次 automator 成功，定性为未能稳定复现的冷态抖动，不归因产品性能。[runner 方案 C](superpowers/specs/2026-10-26-devtools-cold-start-recovery-design.md) 已按 TDD 实现两阶段就绪、一次受限 fresh session、三态报告与相邻恢复 batch gate；候选分支同 SHA 冷 2 轮、暖 2 轮均为 `PASS`、30/30、17/17、0 异常/阻塞且未触发恢复，四份有序报告 batch gate 为 `PASS`。审判侧独立复算补丁、RED、63/63、journey gate 130/130 与全量 `validate` 围栏后最终放行，PR #389 已 squash 合入 `main@22ab5a5b`，PR/main CI 与 CodeQL 通过。合入后干净主线标准 warm 烟测为 `PASS_WITH_STARTUP_RECOVERY`、`productVerdict=PASS`、2 attempts、30/30、17/17、0 异常/阻塞，单报告 batch gate 以 `recoveryStreak=1` 退出 0；该恢复态保持可见，仅证明 runner 恢复后主线可用，不代表产品性能或真机稳定 | 以 `main@22ab5a5b` 完成真机、弱网与普通成员验收；后续 runner 批次继续执行相邻恢复 streak 门禁；产品性能另按稳定口径分段计时 |
| P1 | 体验版晋级与 UAT | `DEVELOPMENT_UPLOADED / UAT_PENDING`；`main@38643aae` 的 CI 与开发版 `0.0.384.1` 实际上传 receipt 通过；candidate、平台选版、verified 与 UAT 未执行。历史候选不重标为本版本 | 以 `main@38643aae` / `0.0.384.1` 同 SHA receipt 执行 candidate、平台人工选为体验版及 verified 回读，再执行体验版 UAT |
| P1 | 单俱乐部模式真机核销 | `BLOCKED` | 双端验证普通成员只读、OWNER/ADMIN 无编辑入口、平台管理员编辑、空库创建、多存量失败和弱网迟到响应 |
| P1 | 个人背景图移除与资料保存口径冲突 | `DEPLOYED / UAT_BLOCKED`；背景选填已部署，保留性别、头像与媒体门槛；资料核心 42 项通过；真实 UI 写入和真机验收未执行 | 回读无背景首次保存、移除后保存、头像独立即时保存；真机验收 |
| P1 | #382 隐私权益与代际完整迁移 | `FOUNDATION_DELIVERED / CACHE_DELIVERED / MIGRATION_BLOCKED`；无生产引用的隐私资格与精确删除目标账本协议已由 #375 合入；缓存片 #378 完成 C1-C8 RED/GREEN、缓存与身份聚焦 4 文件 119/119、全量 Vitest 89 文件 1376/1376，并随 `main@10375994` / 开发版 `0.0.382.1` 发布。发布后只读 30/30、17/17 路由与最终复审通过。完整删除事务、generation 消费者和显式同意仍未激活 | 同事务目标移交、所有写/读消费者、显式同意/撤回和缓存闭合；隔离删除/重建写旅程与目标云回读通过 |
| P1 | #384 完整内容审核迁移 | `MEDIA_DELIVERED / CALLBACK_CONTRACT_DELIVERED / MIGRATION_BLOCKED`；#372 媒体链路与 #376 无生产引用的认证回调协议均已进入 `a1b335c5`，真实发布 receipt 通过；完整运行回调、预占/预算、数据库 ACK、risky 例外和审批重核仍未接线，平台配置与原生转换未验 | 完整链路闭合 upload→pending→回调→pass→保存→active→read，验签、乱序/故障、配置回读和双真机通过 |
| P1 | #383 Strava 撤销增量状态机 | `FOUNDATION_DELIVERED / MIGRATION_BLOCKED`；无生产引用的基础契约已由 #380 合入 `main@38643aae`，完成 R07/R08、operation/ledger fence、严格数据库缺失分类、revoke ACK 8 次预算、`read` scope、路线 401 恢复及损坏 ledger/时间元数据 fail-closed RED/GREEN，Strava 76/76、定向组合 193/193 和 PR/main 门禁通过。CloudBase 安全跳过，微信仅上传同 SHA 开发版；当前云函数、客户端和 prepare 未引用该模块，R09 可信手动 GPX 来源、运行消费者、目标配置与现场故障回读仍未实现 | 持久材料/未知操作闭合、旧回调不复活凭证、可恢复授权和可信手动降级；目标配置及现场故障回读通过 |
| P1 | #385 合规运行资源与目标云回读 | `DEPENDENCY_BLOCKED`；依赖 #382/#383/#384 的生产消费者，旧 workflow、版本和审计放宽不迁移 | 按当前发布基线接入函数、集合、索引、Timer、网关及累计影响映射；同候选 SHA 完成配置、基础设施、数据库和存储回读 |
| P1 | #386 当前设置、正式材料与联合 UAT | `DEPENDENCY_BLOCKED`；依赖 #382–#385，旧 UI、Pages、截图、版本和示例材料不迁移 | 在当前设计接入权益/审核/Strava 状态，平台核验正式材料并完成体验版、普通成员写链路及 iOS/Android 双真机联合 UAT |
| P1 | UI 改版 V1 | `DESIGN_APPROVED / SCHEME_B_V6_IMPLEMENTED / LOCAL_VISUAL_GATES_PASS / MERGED / MAIN_CI_PASS / DEVELOPMENT_UPLOADED / EXPERIENCE_UAT_BLOCKED`；方案 B v6 已把 17 路由收敛到暖纸底、砖红动作、紧凑编辑标题、胶囊筛选和连续章节，并保留真实数据、权限、隐私与业务动作；PR #402 已 squash 合入 `main@927269cb`。53 色 + 1 字体三层主题契约继续生效；Vitest 1386/1386、16 页 × 3 宽度、Pages 17/17、wechatide 17/17 只读截图、严格 UI-sync、设计、治理和主包门禁通过，公开截图已脱敏。PR/main CI、coverage、audit、CodeQL 与 Pages 通过；CloudBase `40678300173` 无副作用安全跳过，微信 `40678300380` 已实际上传同 SHA 开发版 `0.0.399.1` 且 receipt 核验通过。当前 UI/Pages 摘要为 `sha256:cb0c04705f59847c350d7029d5efcb6f82ed412b84a654277cf29de72451bb8d` / `sha256:6652f7607ce97bcffc37aa6e050ab7fa2858f9fe104dbf09f57f98c2859e663c`；独立 automator 全量断言驱动启动连接超时且未生成报告。代码合并与开发版上传不能替代剩余验收 | 晋级并回读同 SHA 体验版；完成公开媒体完整验收、普通成员写链路和 iOS/Android 真机 UAT；全部通过后移除 |
| P1 | 工程治理与源码卫生 V2 | `PR_A_IMPLEMENTED / REVIEW_PENDING / PR_B_IMPLEMENTED / LOCAL_GATES_PASS`；PR A 已实现显式执行位白名单、模式门禁和 68 个 blob 等价降权，独立复审与 PR checks 仍待执行。共享 PR B 已在 `main@c0bd3b56` 之上完成 53 色 + 1 字体契约、`check:design` 接入、共享保值分类器与 ui-sync 单条谱系，候选 `84ae8a7e` 的 RED/GREEN、48/48 像素证据、全量 `validate`、coverage 与 `audit:all` 均在 clean 围栏下通过，待审判侧独立复核和 PR/main checks。PR C Task 0 负责日落谱系并冻结目标主机基线；PR C 的 Ruleset 与 PR D 的活跃文档/分支收尾仍待实施 | 按[治理设计](superpowers/specs/2026-10-26-governance-hygiene-v2-design.md)完成四个独立治理片；各片 PR/main 门禁通过，外部 Ruleset 回读与分支删除证据齐全 |

## 已完成且不再列为阻塞

- 17 条运行路由、Pages 原型和同步清单已进入主线；这不改变真实运行与真机的独立门禁。
- 微信上传工具 `fast-glob` / `request` 已进入锁定、有期限的 allowlist 门禁，当前门禁通过；旧 audit 失败不再作为现存阻塞。例外过期、新 advisory、可修复版本或清单漂移会使门禁重新失败。
- 当前旅程离线签发器输出 v2；当前上线验收校验器拒绝无版本的历史 v1，避免绕过公开路线/GPX、双平台及九类 UAT 要求。

## 分支与交付约束

- 所有工作从最新 `origin/main` 创建 `feat/`、`fix/`、`chore/` 或 `docs/` 分支，禁止直接提交 `main`。
- 同一需求优先复用开放 PR；PR checks、main CI、按 diff 触发的部署或安全跳过全部成功后才算自动化交付完成。
- 真机、普通成员写链路和目标环境回读必须独立留证；代码、Pages、Mock、部署计划和上传成功均不能替代。
