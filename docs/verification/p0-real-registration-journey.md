# P0 真实报名旅程现场验证手册

本手册用于在测试环境完成一次真实的 Strava 就绪、报名、审核、凭证、取消和重新报名旅程，并导出不含敏感数据的离线证据。它不授权部署、修改凭证或操作生产数据。

## 现场验证前置条件

开始前，由环境负责人确认以下条件已经满足：

- 本次待验证提交对应的 CloudBase 函数、OAuth 路由和小程序构建均已部署到隔离测试环境。
- 测试环境中有可创建、发布、审核和停用活动的管理员账号，以及一个未参加目标活动的新测试用户。
- OAuth 回调地址已由环境负责人配置并验证可访问；执行记录只记“有查询参数”，不得复制查询参数的名称或值。
- 测试用户可完成安全资料，并可使用手工填写且未核验的手机号路径。
- 执行人已记录构建版本、环境名称、开始时间和负责人，但不得把手机号、证件号、OAuth code/state、token 或密文写入证据文件。

如果任一前置条件缺失，停止现场验证并记录为“未执行”。不得用 mock、手工同步按钮或本地伪造数据代替真实旅程。

## 执行步骤与通过标准

1. 创建并发布一个隔离活动。活动标记必须唯一，以 `E2E_RESULT:` 开头，并至少保留两个空余名额。记录提交前的 `occupied` 基线值。
2. 使用一个新的测试用户进入活动。通过“手工填写、未核验手机号”的路径完成安全资料；不要截取、导出或粘贴手机号和证件内容。
3. 完成 OAuth。仅现场确认初始回调请求带有查询参数；随后确认用户可见结果页为 `/strava/success` 且地址不带查询参数。证据中不得记录初始回调 URL 或查询参数。
4. 返回小程序，等待自动同步达到 ready。不得点击或调用手工同步动作；记录 `strava.sync.succeeded` 审计动作及其时间戳。导出证据时把该测试用户稳定映射为 `user_test_*` 合成别名，不保留真实 openid。
5. 单击提交一次。确认报名状态为 `pending`、`occupied` 相对基线增加 1，并出现 `registration.submitted` 审计动作。
6. 在相同初始条件下快速双击提交。第二次提交可以被客户端进行中状态阻止，或由服务端返回稳定的 `REGISTRATION_EXISTS`；不得要求第二次请求成功。通过标准是系统仍只有一条报名记录、报名 ID 不变，且 `occupied` 仍只比基线增加 1。
7. 由管理员批准报名。确认报名状态为 `approved`、凭证页可正常展示，并出现 `registration.approved` 审计动作。不要把凭证中的个人信息复制到证据。
8. 经用户确认后取消报名。确认状态为 `cancelled`、`occupied` 回到基线，并出现 `registration.cancelled` 审计动作。
9. 重新提交报名。确认报名状态回到 `pending`，报名 ID 与首次提交相同，历史审计仍保留，`occupied` 再次比基线增加 1，并出现 `registration.resubmitted` 审计动作。
10. 导出只包含下述白名单结构的 JSON，并运行离线校验。只有校验命令退出码为 0 且打印 `P0 真实旅程证据校验通过` 时，证据才可交付。
11. 证据捕获后停用或删除隔离活动。把清理结果记入执行记录；如果 UI 清理失败，记录残留资源、失败原因和负责人并继续收尾。清理失败不改变已完成旅程的验证结论。

## 自动化执行约束

- 页面导航后必须等待目标页面路径和关键业务数据同时就绪，不能用导航调用已返回代替页面加载成功。
- 写操作出现自动化超时、连接中断或未知结果时，先按隔离活动标记回读活动和报名状态。不得在未对账前重试提交、审批、取消或重报。
- 自动化失败后仍需执行补偿清理：取消该活动下仍为 `waiting`、`pending` 或 `approved` 的测试报名，再停用活动，并最终确认活跃报名数为 0。
- 管理员自报名只能作为真实云函数和页面 smoke，不能替代新的非管理员测试用户、OAuth 和角色隔离验证，也不能签发完整 P0 通过证据。

## 脱敏证据格式

证据只保留旅程判断所需字段：

首次使用时在受控目录生成至少 32 字节的签发密钥，权限限制为仅当前用户可读：

```bash
umask 077
openssl rand 32 > /absolute/secure/path/journey-run.key
chmod 600 /absolute/secure/path/journey-run.key
```

每次执行前由签发器自行生成 128-bit 随机 nonce 和上海时区日期；不接受外部传入的 `RUN_ID`：

```bash
npm run issue:journey-run -- --key-file /absolute/secure/path/journey-run.key \
  > /absolute/secure/path/journey-run-template.json
```

`RUN_ID` 必须严格匹配 `^P0_\d{8}_[A-F0-9]{32}$`。签发器输出 `marker`、`issuedAt`、`subjectAlias`、`registrationId` 和 `runSignature`；将这五个字段原样合并到现场证据，不得手工改写。下方示例使用固定的测试值。

```json
{
  "marker": "E2E_RESULT:P0_20260929_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6",
  "issuedAt": "2026-09-29T04:00:00.000Z",
  "subjectAlias": "user_test_P0_20260929_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6",
  "registrationId": "reg_test_P0_20260929_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6",
  "runSignature": "F2303BB578C5ADA9B3A564A187078B66DAF220125955A334E2C2A078F3B9EABD",
  "statuses": ["pending", "approved", "cancelled", "pending"],
  "occupiedCounts": [3, 4, 4, 3, 4],
  "audits": [
    {
      "action": "strava.sync.succeeded",
      "target_id": "user_test_P0_20260929_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6",
      "created_at": "2026-09-29T04:00:00.000Z"
    },
    {
      "action": "registration.submitted",
      "target_id": "reg_test_P0_20260929_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6",
      "created_at": "2026-09-29T04:01:00.000Z"
    },
    {
      "action": "registration.approved",
      "target_id": "reg_test_P0_20260929_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6",
      "created_at": "2026-09-29T04:02:00.000Z"
    },
    {
      "action": "registration.cancelled",
      "target_id": "reg_test_P0_20260929_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6",
      "created_at": "2026-09-29T04:03:00.000Z"
    },
    {
      "action": "registration.resubmitted",
      "target_id": "reg_test_P0_20260929_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6",
      "created_at": "2026-09-29T04:04:00.000Z"
    }
  ]
}
```

`marker` 冒号后的完整内容是本次执行的 `RUN_ID`。其日期段必须是真实日期且与 `issuedAt` 在 `Asia/Shanghai` 时区下的日期一致。`subjectAlias` 必须等于 `user_test_<RUN_ID>`，`registrationId` 必须等于 `reg_test_<RUN_ID>`。`strava.sync.succeeded` 的 `target_id` 必须等于 `subjectAlias`，四条报名审计的 `target_id` 必须等于 `registrationId`。`runSignature` 是大写十六进制 HMAC-SHA256，签名输入按顺序为固定域 `ride-event:p0-journey-run:v1`、NUL 分隔符、`RUN_ID`、NUL 分隔符和 `issuedAt`。

`occupiedCounts` 依次表示提交前、首次提交后、双击提交后、取消后、重新提交后。五条必要审计必须按旅程顺序出现，时间戳使用规范的 ISO 8601 UTC 格式。

校验器会在解析前拒绝根节点或嵌套对象中的重复 JSON 键，并递归检查规范化后的键名。手机号、OpenID、证件号、访问或刷新 token、密文、OAuth code/state 相关字段都会令校验失败。值不使用子串猜测；真实平台标识、原始哈希、包装或串用的其他执行别名会被上述精确派生关系拒绝。失败输出只包含固定的有限原因，不会回显证据对象或敏感值。

## 离线校验

在仓库根目录运行：

```bash
npm run verify:journey-evidence -- \
  --key-file /absolute/secure/path/journey-run.key \
  /absolute/path/to/sanitized-evidence.json
```

成功标准：命令退出码为 `0`，校验器输出且只输出：

```text
P0 真实旅程证据校验通过
```

失败时不要把原始证据粘贴到工单、聊天或日志。先在受控环境内删除敏感字段或修正旅程证据，再重新运行校验。

## 收尾记录

现场执行记录应包含构建版本、环境、开始/结束时间、验证人、证据文件校验结果，以及隔离活动的停用/删除结果。不得包含被校验器禁止的数据。只有在全部前置部署完成后才能开始本手册的现场步骤；本仓库的离线校验通过不代表现场旅程已经执行。
