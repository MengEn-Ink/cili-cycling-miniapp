# 初始化管理员白名单（仅控制台操作）

此目录只提供操作说明，不接收、读取或提交真实 openid。不要把 openid 写入脚本、Git、Issue 或 CI 日志。

1. 部署 `auth` 云函数后，在微信开发者工具或真机打开“我的”。
2. 身份状态变为“已验证”后点击“复制 openid”。
3. 在 CloudBase 环境 `cloudbase-d0gizacy77a1ab017` 的数据库控制台创建 `admins` 集合（若尚不存在）。
4. 新建文档，建议字段如下：

```text
_id        = <从个人中心复制的 openid>
name       = 曹蒙恩
is_super   = true
enabled    = true
created_at = <控制台选择服务端时间>
```

5. 回到个人中心点击重试（或重新进入页面），确认角色变为管理员。

安全约束：管理员权限只由云函数查询 `admins` 得出；客户端传值、本地 storage 和 Mock 角色切换均不能授予真实管理员权限。管理员白名单 UI 仍后置。
