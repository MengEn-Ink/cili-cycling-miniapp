# 安全初始化 CloudBase（不含真实身份与密钥）

本目录只提供人工初始化步骤，**没有可执行插入脚本**，避免把真实 openid、云环境凭据或敏感资料写入 Git。不要把控制台导出数据提交到仓库。

## 前置

1. 确认微信开发者工具登录的是目标小程序开发成员，CloudBase CLI 登录的是目标腾讯云账号。
2. 部署并调用现有 `auth` 云函数，从小程序“我的”页面复制由 `cloud.getWXContext().OPENID` 返回的 openid。不要从客户端参数、Mock 或日志猜测。
3. 按 [`docs/cloudbase-schema.md`](../../docs/cloudbase-schema.md) 创建 `activities / registrations / profiles / admins / audit_logs`，配置仅云函数读写和索引。

## 创建首个管理员

在 CloudBase 控制台手工新增 `admins` 文档；将下面占位符替换为刚复制的真实值，但不要保存到仓库：

```json
{
  "_id": "<从已部署 auth 云函数取得的 openid>",
  "display_name": "<管理员显示名>",
  "is_super": true,
  "enabled": true,
  "created_at": "<控制台 Date 类型的当前时间>",
  "updated_at": "<控制台 Date 类型的当前时间>"
}
```

重新调用 `auth`，确认返回 `role=admin`。不要让小程序传入 role 来“升级”权限。

## 创建首个活动

在 `activities` 新增文档，`_id` 使用不含个人信息的稳定业务 ID。时间字段请在控制台选择 **Date** 类型，不要录成普通字符串：

```json
{
  "_id": "ride-YYYYMMDD-example",
  "title": "示例骑行活动",
  "cover_image": "",
  "description": "活动说明",
  "schedule": [],
  "route": {
    "start": "",
    "end": "",
    "distance_km": 0,
    "elevation_m": 0,
    "level": "",
    "gpx_file_id": ""
  },
  "notices": [],
  "equipment": [],
  "fee": { "included": [], "excluded": [], "remark": "无在线支付" },
  "capacity": 20,
  "occupied_count": 0,
  "signup_deadline": "<Date：报名截止时间>",
  "event_start": "<Date：活动开始时间>",
  "event_end": "<Date：活动结束时间>",
  "status": "draft",
  "is_deleted": false,
  "created_by": "<管理员 openid，仅控制台录入，不提交 Git>",
  "created_at": "<Date>",
  "updated_at": "<Date>"
}
```

先保持 `draft` 完成核对，再在控制台改为 `published`。发布前确认 `capacity > 0`、`occupied_count = 0`、截止时间晚于当前时间、活动时间和时区正确。

## 不要做

- 不要在仓库、Issue、PR、截图或 CI 日志中粘贴真实 openid、手机号、证件号、Strava token、密钥。
- 不要为绕过资料校验而在 `profiles` 写明文敏感字段；KMS/加密资料服务未完成前，只按契约准备脱敏值和状态，不进行真实报名联调。
- 不要直接修改报名 `status` 或 `occupied_count`；真实数据必须经云函数事务变化。
