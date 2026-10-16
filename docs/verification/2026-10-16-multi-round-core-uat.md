# 2026-10-16 多轮核心链路与 UAT 前置验收

状态：PR #238 已合入并上传开发版；三轮真实云只读 E2E 通过，当前旅程 v2 预检与证据工具已上线。PR #240 已阻止旧页面句柄造成错页误验收；后续 tabBar 导航与有界重发修复分支在客户端 `.69`、`.70` 各完成 24/24 真实云回归，仍需合入后从干净主干复测。普通成员写链路、iOS/Android 物理真机和体验版 UAT 因现场前置不足标记为 `not_executed`，不能关闭对应 P0/P1。

三轮原始运行基线为 `ce79517239e78fe400a4b46cd918e02cc45a2c0b`；v2 功能提交为 `ce94914c1b93364d4361fbc1a39580027af68b13`，客户端 `2026.10.16.69`，开发版 `0.0.241.1`。main CI [38865578645](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38865578645)、Pages [38865578539](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38865578539) 和上传 [38865736980](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38865736980) 均成功。

最新合入基线为 `8d408852141f18181a3f08e67f1eef9251b8218f`（PR #241），客户端 `2026.10.16.70`，开发版 `0.0.244.1`。main CI [38870368656](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38870368656)、Pages [38870369347](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38870369347)、CodeQL [38870368600](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38870368600) 和上传 [38870500651](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38870500651) 均成功。

## 验收矩阵

| 角度 | 结果 | 证据与边界 |
| --- | --- | --- |
| 当前旅程契约 | 通过 | v2 不再要求 OAuth；公开 Strava URL、GPX、iOS、Android 分别预检 |
| 历史兼容 | 通过 | v1 预检、签名域和历史证据仍可验证，但不能签发当前模板 |
| 状态与人数 | 单测通过 | pending → approved → cancelled → pending；人数基线、+1、幂等、回落、+1 |
| 审计与脱敏 | 单测通过 | 支持取消→重报→收尾取消的第二条 cancelled；真实目标替换为同 RUN_ID 合成别名 |
| 签名与敏感字段 | 单测通过 | v2 独立签名域；未知字段、重复 JSON key、敏感 key、伪造别名继续拒绝 |
| 冷启动稳定性 | 已修复 | `miniprogram-automator` 实际参数为 `timeout`；旧 `launchTimeout` 未生效 |
| 真实云只读 | 基线 3 轮及修复分支 2 轮通过 | 基线每轮 24 项、13 路由、16 张本地截图，合计 72/72；tabBar 修复分支在客户端 `.69`、`.70` 各有 24/24、0 异常 |
| 管理员自报名写入 | 未进入业务步骤 | 两次均在创建活动页前丢失页面上下文；0 活动、0 报名、无需补偿，停止重试 |
| 普通成员写链路 | `not_executed` | 开发者工具 `testAccounts()` 返回 0，当前登录账号是管理员，禁止用管理员冒充普通成员 |
| iOS 真机 | `not_executed` | 未连接 iOS 物理设备，不能验证相册、扫码、分享、安全区和系统字体 |
| Android 真机 | `not_executed` | 未连接 Android 物理设备且无 adb，不能验证 Android 系统能力 |
| 体验版 UAT | `not_executed` | 普通成员、双真机和路线夹具未就绪，不生成虚假的完整通过证据 |

公开机器可读证据：[现场预检](../evidence/uat/2026-10-16-multi-round/preflight-report.json)、[三轮只读汇总](../evidence/uat/2026-10-16-multi-round/readonly-rounds.json)。原始 `results.json` 和 48 张截图保留在 `/tmp/cili-e2e-20261016/multi-round-readonly-{1-fixed2,2-fixed,3-fixed}/`，包含真实运行界面，不进入公共仓库。

## 本轮发现与修复

1. 当前旅程预检仍只接受 v1 OAuth 字段，公开路线/GPX 正常条件会被错误阻塞。新增严格 v2 schema，保留 v1 历史兼容。
2. 离线签发器和校验器仍要求 `strava.sync.succeeded`。签发器改为 v2 签名域，固定声明双路线、双平台和九类核心 UAT；校验器按版本选择审计链。
3. 审计脱敏按 action 全局去重，合法的第二次 `registration.cancelled` 会被拒绝。改为只拒绝 action、目标和时间完全相同的重复记录。
4. 开发者工具 E2E 使用不存在的 `launchTimeout` 参数，冷启动仍按默认 30 秒。改为 automator 支持的 `timeout: 180000` 并新增源码契约测试。

修复前新增 3 个旅程缺陷用例均稳定失败；修复后旅程与证据测试 86/86 通过。开发者工具冷启动曾有三次 0 业务检查的端口失败；清理残留 IDE 进程后连续三轮业务检查均通过。启动失败与业务结果分开统计。

## 部署后路由门禁复测

从干净主干 `ce94914c` 复测时，报告为 13 通过、8 失败、只访问 12 个路由；`01-activities.png` 实际显示“我的行程”。根因不是产品页面，而是 automator 的 `reLaunch()` 可返回旧页面对象，脚本又把该对象的旧路径作为期望路径，导致路由未切换时等待提前成功并继续读取错页数据。

当前修复新增 `relaunchWhenReady`：发起路由重启后，每轮都重新调用 `currentPage()`，并同时核对请求 URL 的目标路径和该当前页数据。失败用例以“返回旧行程页句柄、随后活动页加载”为固定输入，修复前模块缺少该能力，修复后通过。真实云复测 2026-10-16 07:20:29–07:21:55 UTC 为 24/24、13 路由、16 张本地截图、0 异常；UI 摘要保持不变。该次工作区包含当前脚本修复，仍需合入后从干净主干再跑一次，不能用它直接关闭部署验收。

PR #240 合入后的干净主干 `056929bd` 首轮复测在 0 项业务检查时以 `PAGE_NOT_READY` 退出：旧页面不再被误判为成功，但首个目标活动页属于 tabBar，继续使用 `reLaunch` 会被当前 IDE 忽略。后续修复按 `app.json` 对 tabBar 使用 `switchTab`，其他页面继续使用 `reLaunch`；同时在总 30 秒预算内把只读路由命令最多重发一次，每次仍严格核对当前路径和数据。固定用例分别覆盖 tabBar 方法选择和第一次停在行程页、第二次进入活动页；重发不是业务写入重试，也不会放宽最终路径或超时门禁。

修复分支冷启动实跑 2026-10-16 07:53:50–07:55:18 UTC 为 24/24、13 路由、16 张本地截图、0 异常。活动页与行程页截图分别显示对应标题、内容和选中 tab，375×812 模拟器视口未见错页、浅色文字消失或明显溢出。报告基线 SHA 为 `056929bd` 且 `dirty=true`，原始证据位于 `/tmp/cili-e2e-20261016/tabbar-cold-2/`；因此该结果证明修复分支有效，但仍不替代合入后的干净主干复测。

同步 PR #241 后，客户端 `.70` 的首轮热会话在 0 项检查时以 `PAGE_NOT_READY` 退出并保留失败报告；正常退出 IDE 后只进行一次冷启动复测，2026-10-16 08:00:18–08:01:51 UTC 为 24/24、13 路由、16 张本地截图、0 异常，设置页版本也与 `.70` 一致。报告基线 SHA 为 `8d408852` 且 `dirty=true`，原始成功证据位于 `/tmp/cili-e2e-20261016/tabbar-main-8d408852-cold/`，失败证据位于相邻的 `tabbar-main-8d408852/`；两者都不替代合入后的干净主干复测。

## 完整写链路复测步骤

1. 在微信开发者工具配置一个资料完整、非管理员、未参加目标活动的 test ticket，复查 `testAccounts()` 数量大于 0。
2. 连接一台 iOS 和一台 Android 物理设备，记录机型别名、系统、微信、基础库、字体和网络；不得记录设备序列号。
3. 准备公开 Strava 路线和 GPX 文件，完成预览、Canvas、复制、选择与下载；将 v2 预检所有 blocker 清零。
4. 依次执行人工审批、自动通过、快速双击、取消重报、签到独立样本、跨角色隐私和地址续签；每次写入超时先只读对账。
5. 通过正常业务取消和结束活动回收；用 v2 模板填入状态、人数和脱敏审计，再执行签名校验。
6. 只有普通成员写链路、双真机和体验版均有实际验收人及设备证据时，才能把本记录改为完整通过。

标准操作与固定 blocker 见 [P0 真实旅程手册](p0-real-registration-journey.md)。
