# Strava 授权导入 GPX 验收记录

## 目标

活动管理员连接本人 Strava 后，可粘贴标准路线地址，由云函数下载 GPX 并复用现有可信解析器生成路线预览；原手动上传 GPX 继续作为降级入口。

## 变更范围

- 新增 `strava-bridge` 与 `strava-callback` 云函数，覆盖授权发起、回调、状态查询、token 刷新和 GPX 下载。
- `access_token`、`refresh_token` 使用 AES-256-GCM 加密并按可信 `OPENID` 隔离保存。
- OAuth state 仅保存 SHA-256，10 分钟过期，并在事务中单次消费。
- Strava GPX Buffer 直接复用 `activity-admin/gpx.js`，继续生成可由活动保存流程消费的 `route_previews`。
- 活动编辑页新增连接 Strava 与路线地址导入入口，保留手动上传、失败重试和移除路线能力。

## 自动化验证

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 全量质量门禁 | `npm run validate` | 通过 |
| 覆盖率门禁 | `npm run coverage` | 通过；`cloud.ts` lines 91.15%、branches 89.07%、functions 96.58%、statements 90.17% |
| 依赖安全审计 | `npm run audit:all` | 通过；根项目及云函数无高危漏洞，微信上传工具仅保留已有评估例外 |
| 差异检查 | `git diff --check` | 通过 |
| 发布说明 | `npm run check:release-notes` | 通过 |
| UI 同步契约 | `npm run check:ui-sync` | 通过；DevTools 真实 OAuth 证据保持 blocked |
| 项目治理 | `npm run check:governance` | 通过 |

关键自动化场景：

- 标准 Strava route URL 与 route ID 严格解析。
- OAuth state 随机生成、哈希持久化、过期拒绝和单次消费。
- token 加密、失效映射、自动刷新和密文轮换。
- 可信 `OPENID` 隔离，管理员权限在云函数入口校验。
- GPX 下载错误映射、4 MiB 上限与现有解析器复用。
- repository 成功映射、业务错误透传和异常响应拒绝。
- 活动编辑页授权、轮询、导入与手动 GPX 降级交互。
- CloudBase 集合、索引、环境变量、部署范围与包完整性。

## 端到端验收

云端真实 OAuth 验收当前为 **阻塞**，原因是目标环境尚未配置 Strava App 与受保护变量。代码合并后须完成：

1. 在 Strava App 后台登记与 CloudBase 网关一致的 HTTPS callback。
2. 在 `cloudbase-production` 配置 `STRAVA_CLIENT_ID`、`STRAVA_CLIENT_SECRET`、`STRAVA_TOKEN_ENCRYPTION_KEY`、`STRAVA_CALLBACK_URL`。
3. 应用 CloudBase bootstrap，创建 `strava_credentials`、`oauth_states` 及索引和全拒绝 ACL。
4. 部署 `strava-bridge`、`strava-callback` 与 `/strava/callback` 网关。
5. 用真实管理员完成连接、路线导入、活动保存及手动 GPX 降级 smoke。
6. 重采微信开发者工具证据，并将 UI 同步清单从 blocked 更新为已验收。

在上述配置完成前，不宣称真实 Strava OAuth 已在生产环境可用。

## 回滚

回滚对应提交并重新部署受影响的小程序与云函数；移除 Strava 入口不会影响既有手动 GPX 上传及已保存活动路线。凭据集合若需清理，应在确认不再回滚后单独执行受控数据操作，不随代码回滚自动删除。
