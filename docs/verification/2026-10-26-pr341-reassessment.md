# PR #341 最新主线重新评估与拆合记录

日期：2026-10-26。用户要求根据最新版本处理 PR #341、考虑拆分合并；评估范围为原 source `0908a0214f02b0817fcaefbe188e928905535d5b` 与最新 `main@93ad577f1390321e04a2e515a92ffc1dec19f562`。原增量共同祖先 `64f756c027b72befa26d328240d652ed83b6feaf`。

## 结论与边界

原 PR 不整包合并，保持 Draft 并保全来源。先提取未接运行入口的内容审核协议和原七项测试；业务隐私、媒体、Strava、UI 与部署配置按 [拆合设计](../superpowers/specs/2026-10-26-pr341-latest-main-split.md) 的完整链路继续迁移。基础协议通过不代表内容审核已上线。

原 PR 172 文件、+22023/-617、单提交；原 CI/CodeQL 曾通过，且无 review/comments/threads，但不能证明对最新主线兼容。`git merge-tree` 确认 15 个文本冲突，涉及已更新 UI、旧截图、头像兼容、版本、package、部署与审计。

使用 bits-code-guard 按隐私、内容、Strava、工程、媒体、客户端/文档六组审查及两轮跨组补核。共保留 19 条高置信度功能缺陷：18 P1、1 P2，无确认 P0；不把独立现场 P0 并入此计数。source 行号均核对文件长度与变更方向；R02/R11 位于存续直接消费者、超出 diff ±3 行，因此只进入拆合台账，不进入技能规定的最终 diff Top5。其余 17 条符合 diff 范围；最终 HTML/Markdown 按严重度、置信度与相同等级下的影响选 5 条，完整台账如下。

## 完整缺陷台账

所有位置是旧 source 的代码，不是当前主线运行状态。链接固定 source SHA，避免后续文件更新造成行号错位。

| ID | 级别 / 置信度 | source 位置 | 触发与最小修复 |
| --- | --- | --- | --- |
| R01 | P1 / 10 | [profile/privacy.js:144–154](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/profile/privacy.js#L144-L154) | 删除请求后、worker 扫描前物理删已取消报名，唯一快照媒体目标消失、账本错误 completed；删除报名同事务移交目标 |
| R02 | P1 / 10 | [activity-read/index.js:604–611](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/activity-read/index.js#L604-L611) | 删除后重建并重新同意，旧 attendeeId 可签新代际头像；签名前统一报名删除/代际资格 |
| R03 | P1 / 10 | [compliance-shared/callback.js:111–119](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/compliance-shared/callback.js#L111-L119) | 已认证的下载失败 errcode=-1008 被 HTTP 400 拒绝，媒体永久 pending；失败决策持久化为可恢复状态后应答 |
| R04 | P1 / 10 | [profile/store.js:406–423](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/profile/store.js#L406-L423) | 并发重试迟到失败覆盖较新 pending，合法回调成功应答却 ignored；外部调用前预占 operation ID，完成与失败 CAS |
| R05 | P1 / 10 | [profile/store.js:453–459](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/profile/store.js#L453-L459) | API 失败不计 attempts，无 trace 时可无限重提；调用前原子消耗预算 |
| R06 | P1 / 9 | [content-callback/store.js:3–6](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/content-callback/store.js#L3-L6) | 通用 -502001 数据库失败被当不存在、HTTP success 丢结果；仅明确 not-found 可吞，其余 5xx |
| R07 | P1 / 10 | [strava-bridge/store.js:340–346](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/strava-bridge/store.js#L340-L346) | disconnect 后 refresh 400/401 迟到，pending 撤销材料仍在却 completion=true；按 generation 结算操作且保留撤销屏障 |
| R08 | P1 / 10 | [strava-bridge/store.js:238–243](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/strava-bridge/store.js#L238-L243) | 拒绝、缺 code 或过期回调留下 authorizing，设置页与 Timer 均不能恢复；原子结束匹配尝试并提供重授权 |
| R09 | P1 / 9 | [strava-bridge/store.js:270–274](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/strava-bridge/store.js#L270-L274) | 撤销后同字节手动 GPX 重传仍撞旧 OAuth 来源标记；建立可信手动来源，保持旧文件围栏 |
| R10 | P1 / 10 | [audit-miniprogram-ci.mjs:35–40](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/scripts/audit-miniprogram-ci.mjs#L35-L40) | 预演仍 fixAvailable 的漏洞可错误放行；不移植旧审计放宽，保留当前 main 拒绝语义 |
| R11 | P1 / 9 | [cloudbase-deploy-decision.mjs:51–60](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/scripts/cloudbase-deploy-decision.mjs#L51-L60) | 只改新增 gateway 校验器时云选择器无影响、跳过回读；增量接入 verifier-only 影响映射 |
| R12 | P1 / 10 | [shared/use-cases.js:149–162](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/shared/use-cases.js#L149-L162) | 重建后的报名 DTO/请求丢 generation，管理员上传也漏传；页面捕获当前版本、仓储明确透传，旧请求仍拒绝 |
| R13 | P1 / 10 | [profile/capability-card.js:49–59](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/profile/capability-card.js#L49-L59) | 启用新公共同意门槛，但客户端无读取/同意/撤回协议入口；完整贯通明确同意与全部相关缓存 |
| R14 | P2 / 10 | [docs/templates.js:740–751](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/docs/templates.js#L740-L751) | 三个新 Strava 原型状态被当骑友、同步行隐藏；在当前原型区分角色与授权状态 |
| R15 | P1 / 10 | [club-application/media.js:62–80](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/club-application/media.js#L62-L80) | 活动/俱乐部保存激活旧媒体不读真实 owner 资料围栏；同事务核对删除状态与 generation |
| R16 | P1 / 10 | [profile/core.js:737–749](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/profile/core.js#L737-L749) | 当前引用/legacy photos 例外放行显式 risky/review 背景，公开出口也不消费状态；精确限定无状态旧绑定，显式判险拒绝 |
| R17 | P1 / 9 | [activity-admin/use-cases.js:1024–1025](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/activity-admin/use-cases.js#L1024-L1025) | 人工审批发布不读取媒体或补激活，投稿后判险/旧 pending 可发布；approve 同事务重核原作者媒体 |
| R18 | P1 / 10 | [activity-read/public-avatar.js:98–102](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/activity-read/public-avatar.js#L98-L102) | 现代业务 category 错推路径版本，隐藏 #358 已支持的旧 canonical 头像；分别校验用途与明确路径版本 |
| R19 | P1 / 10 | [profile/capability-card.js:58–72](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/0908a0214f02b0817fcaefbe188e928905535d5b/cloudfunctions/profile/capability-card.js#L58-L72) | 本人编辑页复用公共名片 DTO，撤回/未同意公开即丢私人头像预览；私人预览与公共导出分开授权 |

R13 与 R19 已最终跨组核对为两个根因：缺少可达同意写入口，与私人读取误用公开门槛；修复一条不会自动修复另一条。应同包交付，保留两条计数。

## 证据与限制

- 使用真实源函数和合成内存事务复现删除账本、历史报名签名、重试竞态/预算、数据库失败应答、撤销状态、手动 GPX 来源、generation 漏传、同意门槛和原型状态。全部 probe 无真实云写入。
- 媒体组 124 项局部原测试、客户端同意协议 12 项原测试通过，但新增触发条件仍失败；不把这些通过称为完整旧 PR 门禁。
- 旧 PR 临时源码扩展测试因未安装 `fast-xml-parser`、wx SDK、sharp 等无法完整启动；这属于测试环境限制，不计为代码缺陷。
- 微信回调配置、目标网关、原生转换、公开媒体、普通成员写旅程和双真机均未在本次执行，不改变现有 P0。GitHub 仅查 secret/variable 名称，未读取或输出值。
- 不移植旧同步清单、旧 BLOCKED 截图、旧客户端版本及旧审计豁免。新 UI/业务交付需重新固定实际摘要和版本，原图仅私有留存。
- 当前 main 和旧 source 的单俱乐部创建者 OWNER 归属、遗留 RPC 权限存在存量规则核验点；未认定为本 PR 新引入缺陷，不混入 19 条。本轮不扩展产品范围。

## 本轮交付与后续

基础协议 [PR #370](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/370) 已正常 squash 合入 `main@0c7463e3`，PR CI / CodeQL、主线 CI / CodeQL / Pages 全部通过。微信 `40281488762` 实际上传 `0.0.374.1`，同 SHA 真实 receipt 验证通过；云 `40281488773` 按可信基线与累计范围安全跳过、无副作用。本文档片的最终状态在 PR 描述收口，详细基础证据见 [协议拆分报告](2026-10-26-content-contract-foundation.md)。

文档 PR 独立于基础协议，包含本报告、拆合设计、高优清单三个领域待办及基础片收口；不将已合基础片列为未完成业务。#341 描述已更新并保持 Draft/source 不变；只合有明确价值与闭合边界的增量。

后续先处理媒体兼容/本人预览，再闭合权益、Strava 和完整内容安全，最后在同一最终候选版本完成部署回读与 UAT。原 #341 继续保全所有未移植源码和已授权需求，不关闭、不删除来源分支，也不宣称“原 13 条审查全部闭环”仍可覆盖最新版本。
