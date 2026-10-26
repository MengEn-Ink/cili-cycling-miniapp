# 微信远端上传阶段超时验收记录

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | `fix/ci-upload-timeout-20261026` 草稿分支；最终提交以 PR head 为准 |
| Head SHA | 已同步 `85cbc8f1fb0e16a884760deedaaf49ff7ee8c287`，本记录随最终提交固化 |
| 客户端版本 | 不适用：没有产品代码变化 |
| 验收环境 | macOS / Node 24，本地真实隔离子进程与合成配置 |
| 验收角色 | 工程自动化；没有真实用户或上传凭证 |
| 执行时间 | 2026-10-26 CST |
| 执行人 | TRAE |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 不适用，无产品文件变化 |
| 云函数与数据 | 不适用，无函数代码和数据迁移 |
| 权限与隐私 | SDK stdout/stderr 隔离；诊断只保留阶段、时间、状态与整数错误码；拒绝密钥符号链接 |
| Pages / 文档 | 修复不可解析的 syncedThrough；摘要、截图、采集时间保持原证据口径 |
| 部署与回滚 | 上传开始后绝对五分钟截止；成功确认才签发原格式 receipt；可回滚工程提交 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 编译后正常上传 | 正常 | 合成 worker | 准备 250ms；上传预算 80ms；SDK 成功 | 编译不消耗上传预算 | UPLOADED | 上传 Node 测试 | PASS |
| 远端永久等待 | 根因反例 | worker 忽略 SIGTERM | upload 后等待 80ms；再升级 SIGKILL | UNKNOWN，无 receipt，无重试 | worker 被终止且仅启动一次 | 上传 Node 测试 | PASS |
| 高频进度 | 边界 | 10ms 间隔进度 | 等待绝对预算到期 | 进度不延长预算 | upload-timeout | 上传 Node 测试 | PASS |
| 取消与 SDK 错误 | 失败恢复 | 正在上传 | 取消 / SDK 整数错误 | UNKNOWN，保留有界诊断 | cancelled / sdk-error | 上传 Node 测试 | PASS |
| 异常退出 | 回归 | 编译阶段 worker | exit 7 | FAILED，不冒充上传成功 | FAILED / 7 | 上传 Node 测试 | PASS |
| SDK 原始日志与密钥链接 | 隐私边界 | 合成秘密、符号链接 | 输出原始文本 / 加载配置 | 诊断没有秘密，链接目标权限不变 | 满足断言 | 上传 Node 测试 | PASS |
| 存量 receipt | 兼容 | workflow 契约 | 核对成功输出、清理、诊断条件 | 仅 uploaded=true 才有 receipt，always 清理 | 满足契约 | 上传 Node 测试 | PASS |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| 上传定向测试 | PASS | 20/20；真实子进程，不是微信平台 E2E |
| `npm run validate` | PASS | 87 文件 / 1294 项 Vitest；16 页 × 3 宽度；13 云包；构建与治理通过 |
| `npm run coverage` | PASS | 总体 statements 82.43%、branches 77.09%；cloud.ts lines 91.02%、branches 89.00% |
| `npm run audit:all` | PASS | 根与云包无告警；上传工具 4 项既有评估例外，至 2027-01-15 |
| 严格 UI 同步 | PASS | `npm run check:ui-sync -- --strict`，只修复失效引用，未重采集截图 |
| `git diff --check` | PASS | 无空白错误；门禁日志仅私有临时留存 |
| PR checks | 原提交 PASS | PR #365 required validate / CodeQL 通过；同步主线后复核 |

## 5. 端到端执行记录

1. 使用临时目录、合成 appid/key 与真实 fork 进程验证进度 IPC 和进程退出。
2. 不提供微信上传密钥，不创建远端版本，不触发 CloudBase 写入。
3. 上传阶段只从 SDK message=upload 开始计时；SDK 的随机 task id 不作为阶段标志。
4. 原始 SDK 文本隔离；输出不包含真实资料、URL 参数或凭证。
5. 主线 WXML 编译修复与 affected 选择器新增的语法测试保持完整；入口采用 supervisor / worker，worker 确认 IPC 后直接退出，覆盖 SDK 失败后残留 socket / timer 的旧入口问题。
6. 与实际发布基线组合时，原体验版 receipt 门禁兼容 `uploaded` / `experience_eligible` 两种成功标志；实际发布 receipt 仍独立绑定完成上传。已观察组合旧断言失败，再验证兼容断言通过，避免两个 PR 的工作流门禁相互阻塞。

**执行结论**：工程进程集成 PASS；微信平台 E2E BLOCKED。

**未执行或阻塞说明**：草稿 PR 尚未合并，真实上传需要 main 同 SHA CI 和授权的发布窗口；后续维护者在正常 main 发布时核对耗时、平台版本及 receipt。真机、普通成员写链路和目标环境回读仍按高优清单独立验收。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回读 | NOT_EXECUTED | 不以 PR 检查替代 |
| Pages | 待合并后回读 | NOT_EXECUTED | 无页面变化 |
| CloudBase | 待合并后判定 | NOT_EXECUTED | 无云函数变化 |
| 微信开发版 | 待合并后回读 | NOT_EXECUTED | 核对同 SHA 成功 receipt 或 UNKNOWN 诊断 |

## 7. 风险与回滚

- 剩余风险：微信平台成功但 SDK 未确认时结果 UNKNOWN；需要先核对平台再决定重传。
- 监控与观察：每分钟 uploadElapsedMs、lastProgressAt、noProgressMs；五分钟绝对截止。
- 回滚步骤：回滚本工程提交，保留未知结果诊断；不要以重试覆盖未知状态。
- 数据恢复：不适用；上传版本是不可撤销副作用。

## 8. 最终结论

定向与全量测试、覆盖率、审计和严格同步通过，草稿 PR #365 原提交远端检查通过；同步主线后的最终预检与远端检查另行核对。代码完成不代表真实上传与发布验收完成。
