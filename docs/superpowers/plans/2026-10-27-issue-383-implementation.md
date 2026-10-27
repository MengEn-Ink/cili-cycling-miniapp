# Issue #383：Strava 撤销运行时与 CloudBase 资源交付方案

**日期：** 2026-10-27
**固定基线：** `ca5affe`
**分支：** `fix/strava-revocation-poison-row`
**范围：** #383 撤销队列复审修复；不修改小程序和 content-callback 协议实现。

## 1. 目标与边界

本阶段完成后端可部署闭环：

- 按 Strava 官方兼容接口 `POST https://www.strava.com/oauth/deauthorize` 撤销授权；
- 撤销账本保存 access token 密文，而不是 refresh token 优先；
- 使用 CloudBase timer 持续消费持久撤销积压，无需用户再次打开小程序；
- 对旧客户端保持 `state=connected|disconnected`，通过 `state_v2` 保留详细状态；
- bootstrap 正式管理 #383/#384 已实际读写的六个新集合、全拒绝 ACL 和必要复合索引；
- 只修改 plan/bootstrap、运行代码和测试，不执行真实 CloudBase apply/deploy。

## 2. 撤销协议与材料

Strava 官方 `/oauth/deauthorize` 要求表单字段 `access_token`。因此：

1. callback/refresh mint 成功后，为可能的迟到结算单独加密新 access token 作为撤销材料；
2. disconnect 从 `strava_credentials.access_token_cipher` 建立材料记录并立即删除 credential；
3. worker 解密材料后只向 `/oauth/deauthorize` 发送 `access_token`，不发送 Basic 应用认证；
4. HTTP 200 记为完成，400/401 进入 `manual_review`，网络错误、429、5xx 按持久退避继续重试；
5. 明文 token、密文、owner 均不得进入日志。

`strava_revocations` 使用 `attempts/retry_at/lease_id/lease_expires_at` 消耗尝试预算，单轮最多 2 条、最多 8 次。callback/refresh 迟到结果仍受 OAuth/profile generation 和 operation fence 隔离，不能复活旧 credential。

## 3. 持久消费者与可观测性

新增 `strava-revocation-worker`：

- CloudBase timer：每分钟执行；
- 只接受固定 `Timer + TriggerName` 服务身份，拒绝用户 OPENID 调用；
- 调用无 owner 限定的有界 `drainRevocations`，持续处理跨用户积压；
- 返回并记录 `attempted/completed/uncertain`；
- 额外返回 `backlog_pending_visible/manual_review_visible` 与对应截断标记，最多暴露 100 条可见计数，避免把饱和扫描误报为精确总量。

`strava-bridge` 的用户 disconnect 仍可做一次低延迟 drain，但可靠性不依赖该用户动作。

### 3.1 毒记录隔离与扫描前进

worker 将领取结果分为三类：

- **可领取**：原子写入 lease 后调用 Strava，实际外呼仍受单轮 2 条上限约束；
- **并发跳过**：记录已被其他 worker 领取、已转态或尚未到期，不修改记录并继续扫描；
- **不可恢复**：撤销材料结构非法、授权账本缺失、owner/generation 不匹配、授权状态非法或账本不一致时，在同一事务内把记录转为 `manual`，清除 lease/retry，并写入固定脱敏 reason code。

数据库读取、查询、事务提交等可恢复基础设施错误不降级为 `manual`，而是继续抛出，由 timer 重试。每轮分别读取最多 20 条到期候选和 20 条 pending 结构审计候选并去重，但实际外呼预算仍为 2 条；隔离和并发跳过不消耗外呼预算，因此队首毒记录不会永久阻塞后续合法记录。连续 timer 可有界清理超过单轮审计窗口的毒记录积压。

`isolated` 指标与 pending/manual 可见计数一起输出；reason code 仅使用固定枚举，不包含 owner、token、密文或上游错误文本。`status=manual` 使重复执行天然幂等，不会重复增加人工复核计数。

## 4. DTO 兼容

内部详细状态保持：

```text
authorizing | connected | revocation_pending | disconnected | manual_review
```

公开 status/disconnect DTO：

```text
state: connected | disconnected        # 旧客户端兼容字段
state_v2: 详细状态                     # 新服务端状态
status_schema_version: 2
import_ready, revocation_complete, generation, athlete_name
```

仅当详细状态为 `connected` 且 `import_ready=true` 时兼容 `state` 才返回 `connected`；其余中间态和人工复核态均安全映射为 `disconnected`。旧客户端不会因未知枚举触发 invalid response，同时服务端不会丢失诊断信息。

## 5. CloudBase 资源

bootstrap 新增并统一设置 `{ read: false, write: false }`：

- #383：`strava_authorizations`、`strava_operations`、`strava_revocations`、`strava_route_sources`；
- #384：`content_media_check_operations`、`content_media_checks`。

必要索引：

- `strava_revocations(status, retry_at, _id)`；
- `strava_revocations(owner_openid, status, retry_at, _id)`；
- `strava_operations(status, expires_at, _id)`；
- `strava_operations(owner_openid, status, expires_at, _id)`；
- `strava_operations(owner_openid, status)`。

bootstrap 总契约更新为 20 个集合、41 个索引。plan/apply 的写后轮询和 verify 回读沿用既有机制；测试覆盖完整状态零动作、缺失资源计划、同名冲突阻断、ACL 与索引回读。此次禁止执行 `cloudbase:apply` 和真实部署。

## 6. 验收矩阵

| 场景 | 期望 |
| --- | --- |
| disconnect | credential 立即删除，access token 密文进入撤销账本 |
| callback/refresh 期间 disconnect | 迟到的新 access token 只入账本，不恢复 credential |
| `/oauth/deauthorize` 200 | 材料完成并清空密文 |
| 400/401 | `manual_review`，不虚报完成 |
| 网络/429/5xx | 按持久退避重试，timer 后续自动继续 |
| 尝试耗尽 | 进入 manual，积压与 manual_review 指标可见 |
| 队首账本缺失/代际或 owner 失配/结构非法 | 同事务隔离为 manual，固定脱敏 reason，继续扫描后续记录 |
| 并发领取 | 仅 lease 持有者结算，其他 worker 跳过且不消耗外呼预算 |
| manual 重跑 | 不重复隔离、不重复增加人工复核计数，指标保持可见 |
| 旧客户端读取中间态 | `state=disconnected`，不触发未知枚举错误 |
| 新诊断读取 | `state_v2` 保留完整服务状态 |
| bootstrap | 六个集合、全拒绝 ACL、五个复合索引可重复 plan/verify |
| 部署包 | worker 包含 core/store/privacy contract 且 timer 配置存在 |

本地验收：

```sh
npm run cloud:prepare
npm --prefix cloudfunctions/strava-bridge test
npm --prefix cloudfunctions/strava-revocation-worker test
npm run test:strava-contract
npm run test:bootstrap
npm run test:cloud
npm run verify:cloud-packages
npm run test:deploy
npm run format:check
npm run lint
git diff --check
```

## 7. 真实环境仍需验证

本提交不部署 CloudBase、不执行 apply、不使用真实 Strava 凭证。上线前仍需：

1. 在目标环境审核 plan 后 apply，并 verify 回读 20 个集合、41 个索引和全拒绝 ACL；
2. 部署并回读 `strava-revocation-worker` timer 与环境变量；
3. 用真实 Strava 测试应用验证 deauthorize 200、已失效 token、网络超时、429/5xx 和真实 401 行为；
4. 制造 callback/refresh 与 disconnect 竞争，回读 credential、operation、revocation、generation；
5. 观察 timer 连续运行、退避、租约接管、积压与 manual_review 告警；
6. 由 #384 followup 验证内容安全真实回调链路，本提交不改其协议实现。
