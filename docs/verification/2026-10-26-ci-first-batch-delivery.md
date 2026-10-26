# CI 与发布链路 A 方案第一批交付

日期：2026-10-26 CST。范围：用户批准的第一批四项。状态：`IMPLEMENTED / PR_VERIFIED / REVIEW_READY / NOT_DEPLOYED`。

基线：研究样本固定在 `879ea813`；实现已同步 WXML 编译修复 `85cbc8f1` 和后继文档主线 `456081f1`。`0.0.366.1` 是另一会话对 `85cbc8f1` 的既有开发版上传证据，不是本批部署。本批产品、云函数和截图字节与主线一致；预检分支只迁移同一 UI 内容的二进制摘要算法。

## 四项交付

| 项目 | 草稿 PR | 行为 | 本地验证 | 最终远端 |
| --- | --- | --- | --- | --- |
| 最终 PR 预检 | [#364](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/364) | 干净状态、描述、报告、统计、版本与 UI 前置；工作树修改/删除立即影响摘要 | PASS；1297 Vitest、全量、覆盖率、high 审计、严格同步与最终预检 | PASS；[CI 40271472507](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40271472507)，CodeQL PASS |
| 上传阶段超时 | [#365](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/365) | upload 起算五分钟；终止卡住 worker；UNKNOWN 不发成功 receipt，不自动重传 | PASS；20 真实 worker 用例、1296 Vitest 和全量门禁；receipt 组合兼容已验证 | PASS；[CI 40271705628](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40271705628)，CodeQL PASS |
| 实际发布基线 | [#367](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/367) | 成功 receipt 绑定实际 SHA、环境、同 SHA CI；累计删除/移动，失败后完整补偿 | PASS；35 专门发布/决策用例、1296 Vitest、全量门禁和 actionlint | PASS；[CI 40271440687](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40271440687)，CodeQL PASS |
| PR 元数据复用 | [#368](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/368) | 同内容可信 source 证据才跳过 npm ci / affected；source 与 metadata 并发隔离 | PASS；真实 Git/zip、Harness 报告生成器及拒绝反例；1296 Vitest 和全量、最终预检 | PASS；[source 40271458646](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40271458646)、[edited 40271690906](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40271690906) 与 CodeQL |

各项报告已随对应 PR 提交。原始日志在私有临时路径，仅提交上表与有界结果；没有运行 UI 原图、资料或密钥进入本报告。

最终核对的四个 PR 均为 `OPEN / DRAFT`，base 为 `main`；下表固定实际检查的源码，不能把历史失败或不同 head 的成功算入本次结果。

| PR | 最终 head SHA |
| --- | --- |
| #364 | `c4782316bbfefb760dfe8b2c697f63ef11a8b819` |
| #365 | `edb54e27d5989e1a6026a00f9ae39666cf163202` |
| #367 | `2795c6805297728010189d89d3c1fd2ca7d36dcf` |
| #368 | `fd034e36806ab7d8ecdc92f645710778c095efa1` |

## 最终组合验证

本地 `test/ci-first-batch-combined-20261026@ed0ee57b18fa6e2a0101387ffff6097933744a40` 组合上述四个最终 head。两个发布工作流自动合并；文档冲突保留最新主线与各项状态；`package.json` 合并全部 CI 契约入口。

组合时必须保留：

- `test:ci-contract` 同时包含源码复用、affected、云包调度、CI 工作流、最终预检与描述生成器测试。
- 原体验版 receipt 接受 `uploaded` 或 `experience_eligible` 成功标志；实际发布 receipt 独立记录已经发生的上传。main 在上传后推进，不能抹掉实际上传，也不能让旧目标晋级体验版。
- manifest 保留当前主线截图和采集时间；新字节摘要为 `sha256:86725f7119c94a763d162dbc321f9dba6a47ec10b3d88b93d3dbc2a5202b2595`，Pages 摘要仍为 `sha256:89461e3d7e10123a6b78cce68bb929d4a43000574aa29c30e83fe220e50d4688`，同步祖先为 `85cbc8f1`。

组合 Harness affected（含全量 validate、coverage、audit）、严格同步、治理和 actionlint 1.7.12：PASS，最终退出码 0；Vitest 1297 项通过。模拟器与原型结果仍不能替代物理设备、真实成员写链路和云回读。

## 真实 GitHub 复用验证

首次 source run `40270728003` 的 Harness 实际通过，保存证据因 fixture 将 mode 写成 `run` 而失败；实际 Harness 的 mode 为 `github-actions`。已用 Harness 自身生成器重现三个失败断言，再修复并拒绝 `local` / `run` 报告。

PASS：修复后的 source `40271458646` attempt 1 实际执行 Harness，成功生成并存储 archive。仅编辑同一 PR 的描述后，`40271690906` 日志记录 `PR_ACTION: edited`，明确“复用成功源码检查：run 40271458646 attempt 1”；根依赖安装和 Harness affected 均 skipped，描述与 required validate 成功。

同一 head `fd034e36806ab7d8ecdc92f645710778c095efa1`、base `456081f11d5ec62d983e9f189cf53549f3328cd2` 下，`affected-pr` 从 source 的 133 秒降至 edited 的 14 秒，单次节省 119 秒。这个指标只比较源码 job，含各自 setup/checkout/证据读取，不是 PR 总耗时或长期中位数。

## 文档交付

设计、计划、高优清单与本报告独立提交，叠加在 #364 最终 head 上；diff 仅为这四份文档。文档已通过严格 UI 同步、治理、格式、相对链接及描述统计检查。该 base 不属于当前 CI 的 `main` PR 触发范围，未把无运行标成 CI PASS；#364 合入后需调整文档 PR base 至 `main`，重新生成统计并检查。

## 发布与剩余验收

本批没有合并四个 PR，没有触发 CloudBase 部署或微信上传。合入后须核对 main 的完整 CI、实际发布 receipt 或有证据的无副作用 SKIPPED outcome。UNKNOWN、取消、部分失败与缺失 outcome 均不能推进成功基线。

首次缺少新格式基线会完整对账；已有 receipt 后按累计范围决定部署。云函数部署、密钥对账、基础设施回读、全部 smoke 和串行副作用仍保留。本地 DevTools 证据免检、增量 smoke 与云并发部署属于第二、三批，本次未实施。2–4 分钟云部署目标尚未取得实测。

普通成员完整写链路、iOS/Android 物理真机、公开头像/背景、Strava/GPX 现场运行与体验版晋级/UAT 按高优清单独立验收；本批工程检查不关闭这些 P0/P1。

## 回滚

按四项逻辑分别 revert。摘要算法须连同 manifest 的摘要回滚；已经发生的上传或部分云部署须按实际 receipt、UNKNOWN 记录与环境回读处理，单纯回滚 YAML 不能恢复远端资源。
