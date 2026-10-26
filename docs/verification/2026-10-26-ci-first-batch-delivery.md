# CI 与发布链路 A 方案第一批交付

日期：2026-10-26 CST。范围：用户批准的第一批四项及明确授权的 PR 合并、推送部署。实现状态：`MERGED / DEVELOPMENT_UPLOADED / CLOUDBASE_VERIFIED`；文档 PR #369 收口中，合入后仍须核对最终主线 CI 与发布 outcome。

基线：研究样本固定在 `879ea813`；实现已同步 WXML 编译修复 `85cbc8f1` 和后继文档主线 `456081f1`。`0.0.366.1` 是另一会话对 `85cbc8f1` 的既有开发版上传证据，不是本批部署。本批产品、云函数和截图字节与主线一致；预检分支只迁移同一 UI 内容的二进制摘要算法。

## 四项交付

| 项目 | PR | 行为 | 本地验证 | 合并前远端 |
| --- | --- | --- | --- | --- |
| 最终 PR 预检 | [#364](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/364) | 干净状态、描述、报告、统计、版本与 UI 前置；工作树修改/删除立即影响摘要 | PASS；1297 Vitest、全量、覆盖率、high 审计、严格同步与最终预检 | PASS；[CI 40271472507](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40271472507)，CodeQL PASS |
| 上传阶段超时 | [#365](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/365) | upload 起算五分钟；终止卡住 worker；UNKNOWN 不发成功 receipt，不自动重传 | PASS；20 真实 worker 用例、1296 Vitest 和全量门禁；receipt 组合兼容已验证 | PASS；[CI 40271705628](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40271705628)，CodeQL PASS |
| 实际发布基线 | [#367](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/367) | 成功 receipt 绑定实际 SHA、环境、同 SHA CI；累计删除/移动，失败后完整补偿 | PASS；35 专门发布/决策用例、1296 Vitest、全量门禁和 actionlint | PASS；[CI 40271440687](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40271440687)，CodeQL PASS |
| PR 元数据复用 | [#368](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/368) | 同内容可信 source 证据才跳过 npm ci / affected；source 与 metadata 并发隔离 | PASS；真实 Git/zip、Harness 报告生成器及拒绝反例；1296 Vitest 和全量、最终预检 | PASS；[source 40271458646](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40271458646)、[edited 40271690906](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40271690906) 与 CodeQL |

各项报告已随对应 PR 提交。原始日志在私有临时路径，仅提交上表与有界结果；没有运行 UI 原图、资料或密钥进入本报告。

四个实现 PR 均已通过当前 head 的 CI / CodeQL 并 squash 合入 `main`。下表固定合并前实际检查源码和合并提交；历史失败或不同 head 的成功不计入最终结果。

| PR | 最终 head SHA | squash 提交 | 最终 CI |
| --- | --- | --- | --- |
| #364 | `c4782316bbfefb760dfe8b2c697f63ef11a8b819` | `ef48e307eb601902d711df545b7b40e34985284c` | `40272705672` PASS |
| #365 | `7197c0909cd71bf91d4cc72a0373e5a17ce6d593` | `c665c329a8075e2391851ec9aa4c4ca22e68c65e` | `40273355173` PASS |
| #367 | `ce48a57d0dba3d24f11c5b59ec3e610bbcb16497` | `d0ea0b5a750ece1117bc24604730cb329bdf9902` | `40273753758` PASS |
| #368 | `7468a32bce5cd3b0c9c40bc68d36c3919e5a6526` | `6fe556e7cd319e7d186e2f8eda37dc1923982a76` | `40274242589` PASS |

## 最终组合验证

本地 `test/ci-first-batch-combined-20261026@ed0ee57b18fa6e2a0101387ffff6097933744a40` 组合上述四个最终 head。两个发布工作流自动合并；文档冲突保留最新主线与各项状态；`package.json` 合并全部 CI 契约入口。

组合时必须保留：

- `test:ci-contract` 同时包含源码复用、affected、云包调度、CI 工作流、最终预检与描述生成器测试。
- 原体验版 receipt 接受 `uploaded` 或 `experience_eligible` 成功标志；实际发布 receipt 独立记录已经发生的上传。main 在上传后推进，不能抹掉实际上传，也不能让旧目标晋级体验版。
- manifest 保留当前主线截图和采集时间；新字节摘要为 `sha256:86725f7119c94a763d162dbc321f9dba6a47ec10b3d88b93d3dbc2a5202b2595`，Pages 摘要仍为 `sha256:89461e3d7e10123a6b78cce68bb929d4a43000574aa29c30e83fe220e50d4688`，同步祖先为 `85cbc8f1`。

组合 Harness affected（含全量 validate、coverage、audit）、严格同步、治理和 actionlint 1.7.12：PASS，最终退出码 0；Vitest 1297 项通过。模拟器与原型结果仍不能替代物理设备、真实成员写链路和云回读。

合并依次同步最新主线并推送，保留产品和既有文档；没有强推、直接提交 main 或绕过 required checks。#365 在 `ef48e307` 上重新执行最终预检、全量、覆盖率与审计通过。#367 合并后 62 项发布契约、#368 合并后 12 项源码证据/工作流契约通过；严格同步、治理、格式和 actionlint 通过。最终 `6fe556e7` 的全部产品源码、工程脚本、工作流、package / lock 和同步清单，与已通过全量门禁的组合逐文件一致；仅交付状态文档不同。

## 真实 GitHub 复用验证

首次 source run `40270728003` 的 Harness 实际通过，保存证据因 fixture 将 mode 写成 `run` 而失败；实际 Harness 的 mode 为 `github-actions`。已用 Harness 自身生成器重现三个失败断言，再修复并拒绝 `local` / `run` 报告。

PASS：修复后的 source `40271458646` attempt 1 实际执行 Harness，成功生成并存储 archive。仅编辑同一 PR 的描述后，`40271690906` 日志记录 `PR_ACTION: edited`，明确“复用成功源码检查：run 40271458646 attempt 1”；根依赖安装和 Harness affected 均 skipped，描述与 required validate 成功。

同一 head `fd034e36806ab7d8ecdc92f645710778c095efa1`、base `456081f11d5ec62d983e9f189cf53549f3328cd2` 下，`affected-pr` 从 source 的 133 秒降至 edited 的 14 秒，单次节省 119 秒。这个指标只比较源码 job，含各自 setup/checkout/证据读取，不是 PR 总耗时或长期中位数。

## 文档交付

设计、计划、高优清单与本报告通过独立文档 PR #369 交付。分支已同步四项最终实现与主线，base 已调整至 `main`，最终 diff 仅为这四份文档；重新生成统计，并通过文档适用检查和远端 required validate 后合并。

## 发布与剩余验收

最终实现主线 `6fe556e7` 的 [完整 CI 40274522431](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40274522431) PASS：全量、覆盖率、high 审计和上传判定均成功。四个最终 PR 的 CodeQL PASS；该主线的 [CodeQL 40274522446](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40274522446) 和 Pages 均 PASS。

| 目标 | 发布工作流 | 结果与证据 |
| --- | --- | --- |
| `c665c329` | 微信 `40273900004` | 开发版 `0.0.370.1`，同 SHA legacy receipt；诊断 `UPLOADED / sdk-confirmed`、workerStarts 1、uploadElapsedMs 4608 |
| `d0ea0b5a` | 微信 `40274362963` | `SUCCEEDED`，实际 release receipt；`0.0.371.1`，同 SHA CI `40274160376`，首次 baseline null / full true。上传后 main 推进，未生成可晋级的体验版 receipt，实际上传仍正确留证 |
| `6fe556e7` | 微信 `40274682162` | `SUCCEEDED`，开发版 `0.0.372.1`，实际与体验候选用 receipt；绑定同 SHA CI `40274522431`，baseline `d0ea0b5a`、full false |
| `d0ea0b5a` | 云 `40274362993` | `SUCCEEDED`，首次完整部署 12 个函数、数据库基线与存储规则，关键密钥对账、环境回读、数据库 smoke 和清理全部通过；实际 receipt 已核对 |
| `6fe556e7` | 云 `40274682171` | `SKIPPED / success`；使用 `d0ea0b5a` 真实成功基线累计比较，无云影响；有界 outcome 的来源、摘要、目标、同 SHA CI 与 `sideEffectsStarted=false` 全部核对通过 |

两份新微信 release receipt 与云 `40274362993` 的实际 release receipt 已从 GitHub 下载并由仓库验证器回读：artifact SHA256、实际 run attempt、同目标 main CI、源码 Git tree、基础设施摘要和环境一致，均 PASS。云环境为 `cloudbase-d0gizacy77a1ab017` / `ap-shanghai`，云回执绑定同 SHA CI `40274160376`，首次 baseline null / full true。原始产物仅留私有 `/tmp`，公开报告只记录有界结果。UNKNOWN、取消、部分失败或缺失 outcome 不推进成功基线；没有自动重传。

首次完整云发布从 run 创建到 job 完成为 1134 秒（18 分 54 秒），不是增量部署提速样本。函数部署 427 秒、数据库基线 263 秒、数据库 smoke 275 秒、配置准备 40 秒、密钥对账与部署后回读各 18 秒；本批保留所有实际检查。后继基于成功 receipt 的跳过，不能计为一次实际发布或混入实际部署耗时。

`6fe556e7` 的云安全跳过已独立验证累计 diff、12 个已部署函数的真实基线 receipt、目标 CI `40274522431` 和 outcome artifact；没有生成冒充新部署的成功 receipt。文档 #369 合入后，核对该文档主线的 CI / CodeQL 与云、微信发布 outcome；这些运行链接将附在 PR 交付记录，避免为了追记每一个文档提交再次产生无限文档回填。

首次缺少新格式基线会完整对账；已有 receipt 后按累计范围决定部署。云函数部署、密钥对账、基础设施回读、全部 smoke 和串行副作用仍保留。本地 DevTools 证据免检、增量 smoke 与云并发部署属于第二、三批，本次未实施。2–4 分钟云部署目标尚未取得实测。

普通成员完整写链路、iOS/Android 物理真机、公开头像/背景、Strava/GPX 现场运行与体验版晋级/UAT 按高优清单独立验收；本批工程检查不关闭这些 P0/P1。

## 回滚

按四项逻辑分别 revert。摘要算法须连同 manifest 的摘要回滚；已经发生的上传或部分云部署须按实际 receipt、UNKNOWN 记录与环境回读处理，单纯回滚 YAML 不能恢复远端资源。
