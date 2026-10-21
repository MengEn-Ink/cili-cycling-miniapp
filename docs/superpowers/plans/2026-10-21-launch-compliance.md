# 正式上线用户权益与内容治理 Implementation Plan

> **For agentic workers:** 使用 `subagent-driven-development` 逐任务实施和审查；当前会话已获用户“继续完善后台办理和产品闭环”授权，不再重复设计确认。每项先复现失败再实现。

**Goal:** 完成本人资料删除、公开同意与撤回、Strava 撤销、内容安全检查和官方反馈，核验微信后台材料并保留真实办理及验收状态。

**Architecture:** 保留 17 条路由，设置及资料页承载权益交互。新增仅服务器可访问的权益记录和后台定时任务，通过 profile generation、媒体绑定和事务 fencing 避免迟到请求恢复被删资料。内容审核在业务写入前和媒体激活前检查，微信异步结果只从经过验签的 HTTP 回调接受。

**Tech Stack:** 原生微信 TypeScript/WXML/WXSS、CloudBase Nodejs20.19、wx-server-sdk 4.0.2、Node 24 宿主测试、Vitest。

## 工作区与约束

- 实施区：`/tmp/cili-compliance-20261021`，分支 `feat/launch-compliance-20261021`，从 `origin/main` `dd87949dbcf0069b5ba427c49f360948cf7ddcf2` 建立。原工作区 E2E、材料 WIP 保留。
- 设计：`docs/superpowers/specs/2026-10-21-launch-compliance-design.md`，用户已授权推荐方案；后台联系渠道尚未通过工具读取，不能猜值。
- 每项提交本地阶段提交，交付时按仓库要求压为一个中文语义提交；只通过 GitHub Actions 部署，禁止直接应用生产资源。
- 所有可信用户身份来源为 WXContext，不接受客户端 owner、管理员标志、数据库集合或待删对象列表。
- 普通骑友不返回实名电话，司机电话继续按规则完整展示且补齐司机本人同意记录；照片可选公开，拒绝不阻止基本浏览和必要报名。
- 删除、撤回、内容审核与外部调用失败均不能返回假成功；已签发 URL、备份和他人下载副本有实际边界，必须说明。
- 新增技术字段/集合只用于明确用户权益及内容安全；不新增业务路由、支付、聊天或工单产品。
- 修改 UI 前读 DESIGN.md、design-system/design-contract、Pages 对应路由；保持至少 44px 触控与浅色对比度。
- 测试、日志和公开文档不记录生产身份、电话、媒体 URL、token 或密钥。私有联系渠道只从用户提供的真实值读取；纯模板不作为完成。

## Task 1: 持久资料删除、锁与分批补偿

**Files:** 新建 `cloudfunctions/profile/privacy.js`、`privacy.node-test.js`，新建 `cloudfunctions/privacy-maintenance/{index,core,store}.js` 与 Node 测试、package/lock；修改 profile index/store/media-upload/core、shared/use-cases、相关消费者读取、profile-media-cleanup、bootstrap、cloudbaserc、云包驱动/部署包校验。

- [ ] 写纯领域及有状态数据库测试：可信本人、禁传字段、幂等、实际删除范围、活跃报名受限处理、快照不回退、失败重试和租约 fencing。测试采用现有内存 DB 模式，验证存储结果而非只看 mock 调用。

```js
test('删除任务重复处理不清除新 generation 的资料', async () => {
  const fixture = createPrivacyFixture({ generation: 2, status: 'requested' });
  await fixture.request();
  await fixture.complete();
  await fixture.explicitRecreate();
  await fixture.retryOriginalRequest();
  assert.equal(fixture.profile.generation, 3);
  assert.equal(fixture.profile.nickname, '新资料');
});
```

- [ ] 在新增实现前运行 `npm --prefix cloudfunctions/profile test` 与新增 worker 的 `node --test`，保存 RED 原因。
- [ ] 实现 `profile/requestDeletion`、`deletionStatus` 和显式重建握手；`privacy_requests` 客户端全拒绝，确定性 ID、状态、generation、阶段游标、非敏感错误、retry/lease。profile sentinel 保留删除状态，普通 get 不建资料；新写入/报名/审批/候补均检查同一事务锁。进行中不可简单取消的报名受理为 restricted，停非必要公开而保留有依据的必要联络，状态不可当 complete。
- [ ] 精确清理 profile 可删除字段及报名快照；个人图片与业务图片按 category、owner/canonical、实际跨业务引用区分。复用媒体 worker，登记未删完不得 complete；存量孤儿 intent、失败对象、引用异常转受控人工处理，不能丢失目标。本人删后新上传必须绑定 generation，旧 finalize/late setAvatar 不得恢复。审计及必要业务关联受限保留，政策如实说明。
- [ ] 新 worker 仅配置 Timer 可调用，分批稳定游标、租约 fencing、有限重试；补齐 bootstrap 集合/索引/ACL、cloudbaserc、全量云包命令与包自包含。提供受控备份恢复删除重放入口，不能在恢复时公开旧 snapshot。
- [ ] 运行 profile/shared/registration/admin-review/activity-read/profile-media-cleanup 与 worker 定向测试、云包准备及 schema 测试，GREEN 后自检，提交 `feat(privacy): 补齐资料删除与持久补偿`。

## Task 2: 公开披露同意与撤回

**Files:** profile privacy/core/store/capability-card、activity-read/public-avatar 与投影、shared/domain/use-cases、activity-admin/domain/use-cases、club 响应媒体及对应 Node 测试；TypeScript models/repository 留给 Task 5。

- [ ] 先测试默认未同意、昵称/媒体版本变化使旧同意失效、撤回拒发 URL、本人/审核资料可见、拒绝可选公开照片仍可报名、司机公开字段更改必须重新确认。
- [ ] 运行覆盖测试观察 RED；不修改断言来接受旧自动 public。
- [ ] profile 增加 `setPublicConsent` / `publicConsentStatus`；可信身份、policy version、当前 nickname/media binding，明确独立用户动作，默认 false；不把普通保存、选头像作为同意。头像可以本人使用，不必公开；共享报名门禁不得以公开照片为必填。公开投影无同意使用“匿名骑友”和无图片，不回退旧快照。本人名片导出对外公开动作受同意限制。
- [ ] 活动保存支持司机公开字段确认与受控记录引用；仅明确组织者确认已经取得司机本人同意且绑定实际字段版本后发布，不能称组织者勾选为司机签名。不输出内部证据或私人值到日志。
- [ ] 运行 profile/shared/activity-read/activity-admin/club 包及跨端契约测试，自检后提交 `feat(privacy): 补齐公开同意与撤回`。

## Task 3: Strava 可信本人撤销与迟到响应 fencing

**Files:** `cloudfunctions/strava-bridge/{core,index}.js`、新增 store 与 Node 测试、callback index 与 copied core、route-maintenance、部署 env 及 bootstrap 测试（实际需要时）。

- [ ] 先测试管理员资格失效仍能撤回、外部失败不恢复导入、不丢唯一撤销材料、旧 callback/refresh/import 不复活 token、重复 disconnect 幂等、活动 GPX不误删。

```js
test('撤销 generation 后旧授权回调不得保存凭证', async () => {
  const fixture = createStravaFixture();
  const state = await fixture.start();
  await fixture.disconnect();
  await assert.rejects(fixture.callback(state), { code: 'AUTHORIZATION_REVOKED' });
  assert.equal(fixture.credentials.size, 0);
});
```

- [ ] 运行 Strava tests 保存 RED。
- [ ] `disconnect` 的可信本人权限在 admin check 前判定；锁/generation 在 start/state/callback/refresh/import 保存事务共用。外部撤销及本地清除分开状态，超时保留仅完成撤销所需的受限加密材料和 retry intent，不允许正常导入/刷新。令牌失效等可判完成仅依官方错误语义。配置任务继续重试，不要求用户反复点击；不在 get/status 静默重授权。
- [ ] OAuth state单次消费同时查 generation，token 保存 fence，刷新不能覆盖撤销；已绑定活动 route 不批量删除。`prepare-cloudfunctions` 同步两函数 shared core。
- [ ] 运行 Strava/callback/维护与 deploy env 测试，记录 GREEN，提交 `feat(strava): 补齐授权撤销与并发保护`。

## Task 4: 统一文本审核、图片异步审核及可信回调

**Files:** 新建 `cloudfunctions/compliance-shared/{content,callback}.js` 及测试，profile/media-upload/store、activity-admin/use-cases、club-application/core、公开媒体投影及各 Node 测试；新建 `content-callback` 云包、cloudbaserc 网关/ACL/index、部署 env、云包 prepare/verify。

- [ ] 先测试文本 pass/review/risky/权限/配额/畸形响应、审核内容与写入摘要一致、管理员不能绕过；图片受理不当 pass、trace/generation/摘要绑定、pending/review/risky 不签发/不激活；回调 bad signature/AppID、重放、late deleted 无写；WebP 可信转换绑定最终字节。
- [ ] 运行新测试观察 RED。
- [ ] `msgSecCheck` v2 仅发送公开字段白名单，scene 1/4 和可信 openid，按2500字字段边界处理；校验权限在先，归一化摘要在事务内重验，只有明确 errcode=0/pass 放行，安全中文错误不泄露原文。
- [ ] `mediaCheckAsync` v2 在现有 canonical 上传协议内，持久 pending 和trace，调用失败可重试而不放行；最终格式 JPEG/PNG，通过可信受限解码处理不支持 WebP。callback HTTP 安全模式用官方 AES/签名算法及AppID校验，不接受普通客户端伪造 event。当前图片保持直到新图 pass，接口可查询实际待审状态，所有消费者在激活/URL投影时检查同一审核事实。
- [ ] 新 callback、Timer 重试策略及后台 msgSecCheck/mediaCheckAsync 云调用 permissions 自包含；Secret env 不打印、prepare/verify 回读；无消息配置/Secret时服务明确失败不可默认为 pass。存量素材需要盘点/审核/停展，提供可验收迁移而不把缺安全字段当通过。
- [ ] 运行消费者包、回调 crypto 向量/异常、媒体协议和部署契约测试、dependency audit，提交 `feat(content): 补齐内容审核与可信回调`。

## Task 5: 客户端、Pages、材料与交付验收

**Files:** models、repositories/types/cloud/cached、settings、profile-edit、admin/activity-edit、media-upload 工具与对应 Vitest；docs/templates/schema/app/ui-sync-manifest、release.ts、部署/验证/高优文档及合规材料。

- [ ] 先写客户端行为测试：授权与反馈 native open-type、删除取消不写、状态不缓存、重复请求使用同一 ID、完成清缓存/处理中不显示成功、明示重建、独立同意拒绝、司机确认、图片 pending轮询有限且旧图保留。验证 strict server DTO，未知状态/字段拒绝。
- [ ] 测试观察 RED，然后补齐 repository 的请求/status/consent/disconnect 接口和缓存失效。客户端不接受任意字段，不展示内部 error/token/fileID；加载/失败/受限状态可理解。
- [ ] 复用设置列表 native authorization/feedback 和删除/公开设置，真实 contact/主体/编号从核验配置载入，未配置给明确可用的官方说明/反馈路径，不能虚构联系电话。隐私联系信息只有工具核验或用户提供后写入。单独同意不预勾；默认私有照片可本人使用。司机确认展示真实字段目的，不显示证据内部标识。
- [ ] 同步 Pages 路由和版本说明，收集17路由含状态的实际截图及内容摘要，保留 blocked/differences而不伪造真机。完成可公开脱敏材料，隐私声明仍不承诺未经落实期限。
- [ ] 全量 validate、coverage、strict UI、设计/治理、适用审计；旧上传工具告警单列不扩例外。独立task review后全分支review，合并产品阶段提交为一个中文语义提交。原工作区已有 E2E 工程补丁单独交付，不能被覆盖。
- [ ] 实际后台办理：登录正确AppID，核对主体/备案/类目/隐私contact；补充真实采集映射、msg callback和云调用配置。核身/短信由本人完成；发送反馈和真实删除需明确针对该行为授权，不自动操作真实数据。
- [ ] GitHub Actions 部署并回读同 SHA，普通成员双真机验证资料删除/授权拒绝/反馈收件、审核 callback/媒体与报名完整链。未具備的现场条件写入高优阻塞，交付reviewable代码/材料与明确剩余实际办结条件。

## 任务接口与预检

Task 1 的 `requestDeletion/deletionStatus`、generation 写锁为后续同意、媒体审核和Strava撤销共用边界；Task 2不能绕过锁，Task 4不能在pass回调恢复删除generation。Task 3独立授权 generation 需与删除请求编排而不批量删路线。Task 5只消费严格状态 DTO，不自行推断completed或pass。

执行过程记录到本计划专属私有 ledger；各任务完整测试结果、设计修正、审查及待现场验证项在ledger与对应报告中留证，公开报告只保存脱敏结论。
