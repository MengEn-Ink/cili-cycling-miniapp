# 初始化管理员白名单（仅控制台操作）

此目录只提供操作说明，不接收、读取或提交真实 openid。不要把 openid 写入脚本、Git、Issue 或 CI 日志。

1. 先按根 README 执行 `npm run cloudbase:plan`，经审核后执行 `npm run cloudbase:apply` 和 `npm run cloudbase:verify`，确认 `admins` 已创建且客户端规则为全拒绝。
2. 部署 `auth` 云函数后，在微信开发者工具中打开“我的”。
3. 在开发者工具 Sources 中给 `AppStore.ensureIdentity` 的认证成功分支设置断点，刷新页面后只在本地调试器中读取内存里的 `identity.openid`。当前页面没有“复制 openid”按钮；不要用 `console.log`、截图或持久化文件记录该值。
4. 在目标 CloudBase 环境的数据库控制台打开 `admins` 集合，新建文档：

```text
_id          = <从本地调试器读取的 openid>
display_name = <管理员显示名>
is_super     = true
enabled      = true
created_at   = <控制台选择服务端时间>
```

5. 完全关闭并重新打开小程序以清除本次进程内的身份缓存，再进入“我的”，确认管理员入口出现。若不重启，则等待 5 分钟身份缓存失效后重新进入。

安全约束：管理员权限只由云函数查询 `admins` 得出；客户端传值、本地 storage 和 Mock 角色切换均不能授予真实管理员权限。当前没有管理员白名单维护界面，新增、停用或变更管理员都必须由环境负责人在控制台操作并复核。
