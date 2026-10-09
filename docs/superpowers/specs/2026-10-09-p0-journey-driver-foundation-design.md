# P0 真实旅程驱动基础设计

## 背景

现有 P0 真实报名旅程已经具备现场验证手册、运行标识签发器和脱敏证据校验器，
但执行阶段仍依赖临时自动化：

- 页面跳转后需要同时等待目标路径和关键业务数据，不能只等待导航调用返回；
- 写操作超时后结果未知，必须先回读业务状态，不能直接重试；
- 审计回读需要把真实主体标识转换为本次运行的合成别名；
- 执行失败后需要取消仍占位的测试报名并结束隔离活动；
- 普通成员测试身份和稳定 Strava 路线夹具缺失时，旅程必须标记为“未执行”。

这些规则目前只存在于文档和人工操作中，无法由自动化代码强制执行。

## 目标

1. 提供不依赖微信开发者工具或 CloudBase SDK 的 E2E 驱动核心。
2. 在任何写操作前校验测试环境、普通成员账号、Strava 状态和路线夹具。
3. 统一页面路径与业务数据同时就绪的等待语义。
4. 统一写操作后的只读对账，确保未知结果不会触发自动重试。
5. 将真实审计记录转换为证据校验器接受的白名单结构和合成别名。
6. 统一失败补偿顺序：取消活跃报名、结束活动、确认活跃报名归零。
7. 所有 CLI 输出均为固定文案或固定状态码，不回显输入对象、真实标识或原始错误。

## 非目标

- 本轮不实现微信开发者工具连接、页面选择器或真实 CloudBase 查询适配器。
- 不创建、切换或保存测试账号、test ticket、Strava 凭证。
- 不创建 Strava 路线夹具，也不伪造 OAuth 或同步结果。
- 不删除数据库记录，不引入通用数据库写入或清理命令。
- 不改变现有证据签名格式和 `verify:journey-evidence` 校验规则。
- 不在 CI 中执行真实 E2E 旅程。

## 方案

新增 `scripts/p0-journey-driver.mjs`，导出可由现场适配器调用的纯 Node.js API，并提供
只读预检 CLI。核心只编排注入的函数，不持有平台凭证，也不直接访问远端环境。

### 预检

预检输入采用严格白名单结构：

```json
{
  "schemaVersion": 1,
  "environment": {
    "kind": "test",
    "deployed": true
  },
  "member": {
    "available": true,
    "role": "member",
    "profileReady": true,
    "stravaConnected": true,
    "stravaReady": true,
    "oauthFresh": true
  },
  "routeFixture": {
    "available": true,
    "ownedByMember": true,
    "previewReady": true,
    "gpxReady": true
  }
}
```

根节点及嵌套对象拒绝未知字段，避免调用方误把 `openid`、手机号、token、route ID
或其他敏感值写入预检文件。预检结果只包含：

- `outcome`: `ready` 或 `not_executed`；
- `blockers`: 固定枚举状态码，按稳定顺序输出。

阻塞项包括环境不是测试环境、部署未就绪、普通成员账号不可用、角色不是普通成员、
资料未就绪、Strava 未连接或未 ready、OAuth 非本次新鲜旅程、路线夹具缺失、归属
不匹配、预览缺失和 GPX 缺失。

CLI：

```bash
npm run check:journey-preflight -- --input /absolute/path/to/preflight.json
```

通过时退出码为 `0`，只输出 `P0 真实旅程预检通过`。阻塞时退出码为 `2`，只输出
固定前缀和 blocker 状态码；输入或 schema 非法时退出码为 `1`，不回显原始值。

### 页面就绪等待

`waitForPageReady` 接收以下注入项：

- `readPage()`：读取 `{ path, data }`；
- `expectedPath`：目标页面路径；
- `isDataReady(data)`：业务数据就绪断言；
- `timeoutMs`、`intervalMs`、`now()`、`wait()`：可控时钟与轮询参数。

只有路径和业务数据在同一次读取中同时满足时才成功。成功结果只返回尝试次数和耗时，
不返回页面数据。超时抛出固定错误码 `PAGE_NOT_READY`，不包含页面内容。

### 写操作与未知结果对账

`runReconciledWrite` 接收：

- `execute()`：真实写操作；
- `reconcile()`：只读回读，返回 `committed`、`not_committed` 或 `unknown`；
- 可控的轮询参数。

规则：

1. 每次调用最多执行一次 `execute()`。
2. 无论写调用返回成功还是抛出错误，都必须执行只读对账。
3. 对账为 `committed` 时返回成功，并标记是否经历写调用错误。
4. 对账持续为 `not_committed` 时返回 `not_committed`，由上层决定停止或人工处理。
5. 对账为 `unknown` 或对账自身失败时抛出固定错误码 `WRITE_OUTCOME_UNKNOWN`。
6. 核心绝不自动重试 `execute()`，也不输出原始错误。

业务拒绝（例如重复报名）由适配器体现在对账结果和上层断言中，核心不猜测平台错误
消息。

### 审计脱敏

`sanitizeJourneyAudits` 接收真实审计数组以及仅存在于进程内的真实主体 ID 映射。
它只接受旅程所需动作：

- `strava.sync.succeeded`
- `registration.submitted`
- `registration.approved`
- `registration.cancelled`
- `registration.resubmitted`

输出字段固定为 `action`、`target_id`、`created_at`。主体 ID 分别替换为签发器提供的
`subjectAlias` 和 `registrationId`，其他目标、字段或非法时间戳直接拒绝。函数不会
修改、记录或返回真实 ID。

### 失败补偿

`compensateJourney` 只调用注入的业务动作：

1. 读取隔离活动和报名状态；
2. 对 `waiting`、`pending`、`approved` 报名调用一次取消；
3. 对尚未结束的活动调用一次结束；
4. 最终回读并要求活跃报名数为 `0` 且活动已结束。

`cancelled` 报名跳过取消，`checked_in` 不尝试非法取消但仍结束活动；最终存在任何活跃
报名时返回固定失败码 `COMPENSATION_INCOMPLETE`。补偿不执行数据库删除，也不自动
重复任何写动作。

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `scripts/p0-journey-driver.mjs` | 严格预检、页面等待、写后对账、审计脱敏和补偿编排 |
| `scripts/p0-journey-driver.node-test.mjs` | 驱动核心和 CLI 的 Node 单元测试 |
| `package.json` | 增加预检命令，并将测试纳入旅程证据测试门禁 |
| `docs/verification/p0-real-registration-journey.md` | 记录驱动 API 和预检执行顺序 |

## 错误与输出约束

- 对外错误使用 `JourneyDriverError`，只包含固定 `code` 和固定中文消息。
- 不把输入 JSON、页面数据、真实主体 ID 或原始异常消息拼进错误。
- CLI 不打印堆栈。
- 预检 blocker 使用代码枚举，便于验证报告记录“未执行”原因。
- 注入适配器负责凭证和真实连接；核心 API 不接受 token、cookie 或账号密码字段。

## 测试

按 TDD 覆盖：

1. 完整预检通过和每类阻塞项；
2. 未知字段及敏感字段被 schema 拒绝；
3. CLI 的 `0`、`1`、`2` 退出码和固定输出；
4. 页面路径与数据必须同时就绪，空 page meta 和旧页面不会误判；
5. 页面等待超时不泄露页面数据；
6. 写调用成功、写调用超时但已提交、未提交和未知结果；
7. 任一场景 `execute()` 都只调用一次；
8. 审计动作、目标映射、字段白名单、时间戳及排序；
9. 补偿顺序、跳过已取消报名、不取消 `checked_in`、最终活跃报名校验；
10. `npm run test:journey-evidence` 和 `npm run validate` 全量门禁。

## 交付顺序

1. 设计和实施计划独立提交。
2. 驱动核心按 RED-GREEN 小步实现并提交。
3. 文档与门禁接线独立提交。
4. 推送 `main` 后检查 GitHub CI；本轮只改脚本、测试和文档，不应触发微信开发版上传。
