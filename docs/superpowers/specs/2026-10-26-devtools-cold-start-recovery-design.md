# 微信开发者工具冷启动可观测性与受限恢复设计

日期：2026-10-26。冻结基线：`origin/main@75f124a7045bdfe1696d449bea5d0ce9f1df2b4c`。TraeX 执行者独占本片写入，TraeX 审判者保持只读复核。

## 结论

采用“两阶段就绪 + 一次受限 fresh session 恢复”。开发者工具自动化先证明页面框架可读，再执行路由和业务数据等待；只有首次读到页面元数据之前出现两类已确认的冷启动瞬态错误，才允许在同一绝对启动预算内关闭当前 automator session 并新建一次 session。

本片是 runner 可观测性与恢复修复，不是产品页面性能优化。它不修改小程序产品逻辑、视觉值、主题令牌、UI 同步 manifest、CloudBase 资源或发布版本，也不把模拟器证据冒充真机证据。

## 已确认事实

所有有效实验均使用 auth 工作树的 Git toplevel 绝对路径，HEAD 为 `75f124a7`，运行前后 porcelain 为空。环境变量 `PWD` 残留指向治理工作树，但内核 `pwd -P` 与 `git rev-parse --show-toplevel` 均指向 auth 工作树；后续启动参数只允许来自 Git toplevel 或 Node `process.cwd()`，禁止使用环境 `$PWD`。

| 实验 | 关键时序 | 结果 |
| --- | --- | --- |
| automator 冷跑原失败 | project ready 21:31:02.926；connect 03.262；compile 04.884；launch failed 05.658/05.664；plugin timeout 05.696；约 60 秒无页面；reLaunch 9ms 被拒 | `BLOCKED` |
| 无 automator 手动冷开 | project ready 21:33:13.220；compile 14.627/15.196；launch failed 15.206；19ms 后 launch success；page ready 17.119 | 自恢复成功 |
| automator 冷跑重复 1 | project ready 21:36:14.879；connect 15.239；compile 16.304；launch success 16.706；page ready 18.719；首页数据约 21.128 就绪 | 成功，2 次短暂 page-meta 错误 |
| automator 冷跑重复 2 | project ready 21:36:55.985；connect 56.309；compile 57.465；launch success 58.083；page ready 59.795；首页数据约 21:37:09.505 就绪 | 成功，1 次约 13 秒 automator response timeout |

证据支持“一次未能稳定复现的冷态抖动”，不支持将问题归因于产品性能、稳定的 automator 竞争或稳定的本机工具链故障。原失败、手动对照和两轮成功都必须保留，不能用后续成功覆盖历史失败。

## 目标与非目标

### 目标

1. 把“页面框架可读”和“目标路由业务数据就绪”拆成两个可独立计时、独立失败的阶段。
2. 保留启动阶段的原始错误类别、关键事件和脱敏后的 console/exception，不再只输出“目标页面未就绪”。
3. 对严格限定的冷启动瞬态错误提供一次 fresh session 恢复，同时保持绝对总预算和 fail-closed 产品断言。
4. 让普通通过、发生过恢复的通过、runner 阻塞在报告与聚合门禁中不可混淆。

### 非目标

- 不改变任何页面、云函数、数据契约、视觉值或业务加载策略。
- 不在本片实现 reLaunch→onLoad→云请求→云返回→setData→onReady 的产品性能埋点；该工作只在 runner 稳定后以三轮同口径分布另行设计。
- 不修复 `validate` 中三宽视觉测试覆写 49 个已跟踪证据文件的问题；该问题仍归工程治理 PR C。本片验证只把视觉输出导向临时目录。
- 不加入运行时 SHA 标记。多 worktree 同 AppID 的运行时身份围栏作为可选加固另行评估，不是本片前置条件。
- 不停止或重启微信开发者工具 MCP 守护进程。

## 方案比较

### 方案 A：只补可观测性

保留现有启动流程，只记录最后路径、底层错误和阶段耗时。风险最小，但不能降低已观察到的冷态 runner 抖动。

### 方案 B：两阶段就绪

`automator.launch` 后先等待页面框架可读，成功后才发送路由命令，再等待业务数据。它能阻止过早 reLaunch 并改善归因，但模拟器整轮卡死时仍无法恢复。

### 方案 C：两阶段就绪 + 一次受限 fresh session 恢复（采用）

采用方案 B，并仅在框架首次就绪前出现已确认的启动瞬态错误且未在阶段预算内恢复时，关闭当前 automator session、新建一次 session。第二次尝试不清编译缓存、不调用全局 `quit`，不重启 MCP。该方案同时改善可观测性与偶发恢复能力，且通过状态分级避免把抖动隐藏成普通通过。

## 启动状态机

每次标准 E2E 运行只有一个绝对启动 deadline，并执行以下状态机：

1. `SPAWN`：在调用 `automator.launch` 前写入事件。
2. `CONNECT`：`automator.launch` 返回 miniProgram 后立即写入事件，并在任何页面读取前注册 console/exception 监听。
3. `FRAMEWORK_WAIT`：轮询 `currentPage()` 与 `page.data()`。两者均不抛错且 `page.path` 是非空字符串时，写入 `FRAMEWORK_READY`。此阶段不要求特定路由，也不检查业务 loading、列表数量或云数据。
4. `RELAUNCH`：只有 `FRAMEWORK_READY` 后才允许调用现有 `switchTab`/`reLaunch`。
5. `DATA_WAIT`：等待目标 path 与该路由的业务 predicate 同时满足，完成后写入 `DATA_READY`。
6. 后续路由继续使用现有业务断言，但底层读取错误不再被无痕吞掉。

`frameworkEverReady` 是单向锁存布尔值。一旦任一尝试首次写入 `FRAMEWORK_READY`，本次 E2E 后续所有错误都不再具备 fresh-session 恢复资格，即使错误文本与启动瞬态错误完全相同。

## 时间预算

- 两次尝试共享一个从第一次 `SPAWN` 开始计算的 **90 秒绝对启动预算**；它只覆盖 launch/connect、框架等待、失败 session 关闭和第二次框架等待，不覆盖进入 `DATA_WAIT` 后的业务路由预算。
- 每次 `FRAMEWORK_WAIT` 最多使用 **30 秒**，同时不得超过绝对 deadline 的剩余时间。
- `automator.launch` 的 timeout 必须使用绝对 deadline 的剩余毫秒数，不能给每次尝试重新分配完整 timeout。
- 第一次框架等待失败后，只有剩余预算大于 0 才可进入第二次尝试；第二次尝试用完剩余预算即 `BLOCKED`。
- fresh session 最多一次，因此 attempt 数只能是 1 或 2。

依据：有效重复运行中已观察到约 3 秒和约 13 秒的瞬态窗口；30 秒框架窗口覆盖当前 13 秒上限并保留超过一倍余量。原失败在 30 秒内未恢复，继续固定等待没有证据价值，因此转为 fresh session。90 秒总预算可容纳两次常见约 5 秒连接、两段各 30 秒框架等待和 session 关闭开销，同时比现有单次 180 秒 launch 上限更严格，保证 CI 不会无界等待。

## 错误分类与恢复边界

恢复匹配必须同时满足：

1. 当前处于 `FRAMEWORK_WAIT`；
2. `frameworkEverReady === false`；
3. 当前是第 1 次 attempt；
4. 错误规范化后的 message 只匹配以下两类之一：
   - 同时包含 `getPageMetaByWebviewId`、`rawPath` 和 `null`；
   - 包含精确短语 `timeout waiting for automator response`。

除这两类外的启动错误记录后直接 `BLOCKED`，不猜测恢复。下列错误无条件禁止 fresh-session 重试：

- 框架曾经就绪后的任何错误，包括文本看似上述两类的错误；
- 页面内容或 UI 断言失败；
- 云请求失败、空数据、权限或身份错误；
- 业务路由等待超时；
- 截图失败或截图期间路由变化；
- 任何现有产品 check 失败；
- 第二次 attempt 的任何失败。

禁止重试的错误继续按现有 fail-closed 规则退出。恢复机制不能修改、放宽或跳过任何业务 predicate。

## 结果模型与聚合门禁

报告把 runner 启动结果与产品检查结果分开：

- `startupOutcome=PASS`：第 1 次 session 框架就绪，未触发恢复；
- `startupOutcome=PASS_WITH_STARTUP_RECOVERY`：第 1 次 session 因合格启动瞬态失败，第 2 次 session 框架就绪，且后续产品检查全部执行；
- `startupOutcome=BLOCKED`：在允许的恢复后仍无法建立框架，或启动阶段遇到不可恢复的 runner/环境错误。此时 `productVerdict=NOT_EXECUTED`，不增加产品失败数，但进程必须非零退出。

产品检查独立使用 `productVerdict=PASS|FAIL|NOT_EXECUTED`。一旦产品检查开始，任何失败都设置 `productVerdict=FAIL` 并非零退出；它不能被 `startupOutcome` 降级为 `BLOCKED`，也不能触发恢复。

`PASS_WITH_STARTUP_RECOVERY` 在单次功能运行中可继续完成全部检查，但聚合门禁不得把它重写为普通 `PASS`。同一验证批次按时间排序读取标准 E2E 报告；出现两个相邻的 `PASS_WITH_STARTUP_RECOVERY` 时，批次立即升级为 `BLOCKED_ENVIRONMENT_UNSTABLE` 并非零退出，要求排查 DevTools/automator 环境。任一干净 `PASS` 会重置连续恢复计数；`BLOCKED` 或 `productVerdict=FAIL` 则立即终止批次并非零退出，不参与重置后继续运行。单次恢复态只能证明功能在恢复后可执行，不能单独证明冷启动稳定。

## 报告契约

报告 schema 升级，保留现有检查、路由和截图字段，并新增或明确以下字段：

```json
{
  "localGitSha": "75f124a7...",
  "startupOutcome": "PASS_WITH_STARTUP_RECOVERY",
  "productVerdict": "PASS",
  "recoveredStartupFailure": true,
  "startup": {
    "budgetMs": 90000,
    "frameworkTimeoutMs": 30000,
    "attempts": [
      {
        "attempt": 1,
        "events": [
          { "type": "spawn", "at": "2026-10-26T13:30:58.641Z", "elapsedMs": 0 },
          { "type": "connect", "at": "2026-10-26T13:31:03.441Z", "elapsedMs": 4800 },
          { "type": "framework_error", "at": "2026-10-26T13:31:16.441Z", "elapsedMs": 17800 },
          { "type": "close", "at": "2026-10-26T13:31:33.641Z", "elapsedMs": 35000 }
        ],
        "errors": [
          {
            "kind": "STARTUP_PAGE_META_NULL",
            "at": "2026-10-26T13:31:16.441Z",
            "elapsedMs": 17800,
            "message": "rawPath from getPageMetaByWebviewId is null"
          }
        ]
      },
      {
        "attempt": 2,
        "events": [
          { "type": "spawn", "at": "2026-10-26T13:31:34.641Z", "elapsedMs": 36000 },
          { "type": "connect", "at": "2026-10-26T13:31:39.641Z", "elapsedMs": 41000 },
          { "type": "framework_ready", "at": "2026-10-26T13:31:45.641Z", "elapsedMs": 47000 },
          { "type": "relaunch", "at": "2026-10-26T13:31:45.651Z", "elapsedMs": 47010 },
          { "type": "data_ready", "at": "2026-10-26T13:31:50.641Z", "elapsedMs": 52000 }
        ],
        "errors": []
      }
    ]
  },
  "console": [],
  "exceptions": []
}
```

事件至少覆盖 `spawn`、`connect`、`framework_ready`、`relaunch` 和 `data_ready`；失败路径补充 `framework_error`、`close` 与 `blocked`。事件和错误从父级继承 attempt，并记录绝对 ISO 时间与相对运行开始的 elapsedMs。`localGitSha` 来自 `git -C <projectPath> rev-parse HEAD`；已有 `git` 字段在迁移期可保留为兼容别名，但不得声称它来自运行时内部。

页面 data 只允许记录白名单摘要，例如 `loading`、`refreshing`、`itemCount`、`errorCode`，不保存活动正文、实名、电话或完整响应。console/exception 各最多 200 条、每条规范化后最多 2KB，超过部分只记录 dropped count。

所有写入报告的错误、console 和 exception 依次执行以下脱敏：

- projectPath、用户主目录、`/tmp` 与 `/private/tmp` 绝对路径替换为 `[project]`、`[home]`、`[temp]`；
- 11 位手机号、电子邮箱、微信/OpenID 类账号标识替换为对应 `[phone]`、`[email]`、`[account-id]`；
- `cloud://...`、CloudBase 环境 ID、文件 ID、资源 URL 查询串和 fragment 替换为 `[cloud-resource]` 或移除；
- 不序列化任意 page.data、请求 body、token、cookie 或账号对象。

## 组件边界

### `scripts/p0-journey-driver.mjs`

提供纯等待与分类能力：框架就绪等待、错误规范化分类、绝对 deadline 计算、阶段观察回调。它不负责启动 DevTools、不写文件，也不决定产品断言。

现有 `waitForPageReady` 必须保留最后一次安全观察与底层读取错误，通过结构化结果或带安全 diagnostics 的错误返回；不能继续裸 `catch { ready = false }`。对外错误仍不得泄露原始 page.data。

### `scripts/wechat-devtools-e2e.cjs`

负责 session 生命周期、最多两次 attempt、console/exception 监听、报告状态和退出码。session 恢复只调用当前 miniProgram 的关闭能力；不清缓存、不调用全局 `quit`、不触碰 MCP。

### 报告聚合

提供纯函数按顺序聚合 `startupOutcome`，对相邻两次恢复态返回 `BLOCKED_ENVIRONMENT_UNSTABLE`。标准单次运行只产出事实，不通过改名把恢复态压成普通 PASS；冷/暖验证批次和后续 CI wrapper 使用同一聚合函数。

## TDD 计划

先补 RED，再写实现。至少覆盖：

1. `currentPage`/`data` 可读且 path 非空才进入 `FRAMEWORK_READY`，业务 loading 不阻塞框架阶段；
2. 框架读取错误被结构化保留并脱敏，不再只剩 `PAGE_NOT_READY`；
3. 仅两类已确认启动瞬态在首次框架就绪前可触发一次 fresh session；
4. 第 2 次 attempt 失败后 `BLOCKED`，不会出现第 3 次；
5. 两次 attempt 共享 90 秒绝对预算，第二次只能使用剩余预算；
6. 页面断言、云数据、业务路由、截图和产品 check 失败均不重试；
7. **框架就绪后发生的错误即使长得像启动错误，也不得触发恢复**；
8. `PASS`、`PASS_WITH_STARTUP_RECOVERY`、`BLOCKED` 与 `productVerdict` 组合和退出码正确；
9. 两个相邻恢复态使批次升级为 `BLOCKED_ENVIRONMENT_UNSTABLE`，干净 PASS 重置 streak；
10. `localGitSha`、attempt 和五类关键阶段事件完整；console/exception 上限与 dropped count 可复算；
11. 路径、账号、云资源和 page.data 脱敏测试使用哨兵值证明无泄漏；
12. 现有 30 项检查、17 路由与业务 predicate 不减少、不放宽。

## 验证与证据

实现候选在同一目标工作树执行：

1. 定向 Node 合约测试，保留 RED 输出与 GREEN 输出；
2. 清编译缓存后的标准 harness 连续 2 轮，每轮记录环境 `PWD`、`pwd -P`、Git toplevel、HEAD、porcelain、非 MCP 进程和 9420/40694 端口；
3. 紧接的 warm 标准 harness 连续 2 轮；
4. 每轮必须覆盖 30/30 checks 和 17 条路由，任何 `PASS_WITH_STARTUP_RECOVERY` 原样保留；若相邻两轮都恢复，批次必须 `BLOCKED_ENVIRONMENT_UNSTABLE`；
5. `npm run validate` 使用临时 `OUT_DIR` 隔离三宽视觉输出，防止覆写 49 个已跟踪证据文件；
6. 所有运行前后 HEAD 不变、porcelain 为空；DevTools、CI、开发版与真机仍分别记录，不相互替代。

本片不要求开发版上传或真机发布，因为不修改产品产物；但代码合并、PR checks 和 main CI 仍需独立证明。模拟器通过只证明对应 SHA 的 runner 与只读功能，不关闭物理真机、普通成员写链路或目标云 P0。

## 清单与状态

只更新 `docs/high-priority-issues.md` 中既有“间歇性冷启动根因未确认”P1，不新增重复行。规格批准后状态为 `DESIGN_APPROVED / IMPLEMENTATION_PENDING`；实现和本地验证完成后为 `IMPLEMENTED / REVIEW_PENDING`；PR 与 main 门禁、冷/暖批次证据齐全前不得记为完成或从清单移除。

## 回滚与失败处理

- runner 改动可整体 revert，不影响产品代码或云资源。
- fresh session 关闭失败必须记录并直接 `BLOCKED`，不得继续叠加 session。
- 发现未知工作树写入、HEAD 漂移、启动路径不等于 Git toplevel、或报告脱敏哨兵泄漏时立即停止验证并保留现场。
- 方案 C 若持续产生恢复态，按连续恢复门禁升级为环境不稳定，不增加重试次数、不延长为无界 timeout。

## 完成标准

1. 框架与业务数据阶段在代码、报告和测试中严格分离；
2. 两类启动瞬态只在首次框架就绪前获得一次、且仅一次 fresh session 恢复；
3. 90 秒绝对启动预算和 30 秒单次框架预算可由测试证明；
4. runner 三态、产品 verdict、恢复 streak 与退出码不可混淆；
5. 底层错误、关键时序、console/exception 可复算且通过脱敏；
6. 冷 2 轮、暖 2 轮和全量门禁有干净工作树证据，现有覆盖和断言无回退；
7. 性能优化、视觉治理、运行时 SHA 围栏和授权骑行卡片缺陷继续保持独立范围。
