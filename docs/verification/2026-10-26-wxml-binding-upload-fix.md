# 2026-10-26 WXML 绑定语法修复与开发版上传恢复验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | `fix/wxml-binding-compile-error`（合并后回填 PR 编号与链接） |
| Head SHA | 合并后回填 |
| 客户端版本 | `2026.10.26.1`（与 PR #362 共用，因此前无任何开发版成功上传） |
| 验收环境 | main CI + 微信 CI 上传（miniprogram-ci） |
| 验收角色 | 不适用（交付链路修复，非页面功能） |
| 执行时间 | 2026-10-26 CST |
| 执行人 | Agent（门禁与上传验证） |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 骑行卡头像占位字符渲染结果不变（原表达式从未在真机生效过）；逻辑层新增 avatarPlaceholder 字段 |
| 云函数与数据 | 不适用 |
| 权限与隐私 | 不适用 |
| Pages / 文档 | 不适用（占位符 UI 结构不变，仅绑定表达式来源变化；UI 摘要随提交重新计算） |
| 部署与回滚 | 合并后微信开发版自动上传必须成功（这是本 PR 的核心验收）；回滚 = revert |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WXML 绑定语法清零 | 根因反例 | 仓库工作区 | 全量扫描 miniprogram 下 WXML 绑定表达式 | 无方法调用、模板字面量、箭头函数 | 修复 `(rider.displayName \|\| '骑友').slice(0, 1)` 后全仓清零 | `tests/wxml-binding-syntax.test.ts` | PASS |
| 占位字符逻辑层计算 | 回归 | attendees 数据 | 打开活动详情骑行卡，无头像骑友 | 显示昵称首字（空昵称显示「骑」） | 契约断言 avatarPlaceholder 存在于 wxml 与 ts | 同上 | PASS |
| 上传失败快速退出 | 边界 | miniprogram-ci 上传失败 | 观察上传 job 结束方式 | 失败后 0.5 秒内退出，不再挂满 30 分钟运行器配额 | 上传脚本 catch 分支改为显式 process.exit(1) | `scripts/upload-miniprogram-ci.mjs` | PASS（本地逻辑审查） |
| 微信 CI 编译上传 | 核心 | main 合并后自动触发 | 微信开发版自动上传 workflow | miniprogram-ci 编译通过并上传成功，receipt 绑定同 SHA | 待合并后回填 | workflow 运行链接 | BLOCKED（合并后回填） |
| 真机版本获取 | 核心 | 上传成功后 | iOS/Android 微信开发版拉取 | 真机可获取包含 #362 权限卡排版修复与 #358 头像类别修复的版本 | 待上传成功后回填 | 真机截图 | BLOCKED |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | PASS | 1294+ 项 Vitest（含新增 WXML 语法契约）、bootstrap/deploy/cloud/构建全绿 |
| `npm run coverage` | 不适用 | 无覆盖率阈值变化 |
| `npm run audit:all` | 不适用 | 未新增依赖 |
| `git diff --check` | PASS | 无空白错误 |
| PR checks | 待回填 | pr-submission / affected-pr / validate 待推送后回填 |

## 5. 端到端执行记录

1. 根因定位：微信 CI 上传日志显示 `inner upload fail with errcode: -80054, errmsg: ./pages/activity-detail/index.wxml:1:15637: Bad value with message: unexpected token '.'`，为 PR #358 引入的 WXML 方法调用表达式；自该 PR 起所有开发版上传编译失败且 job 挂满超时，真机始终停留在旧版本——这是用户报告「还是不可以」的直接原因。
2. 修复：占位字符改由 attendees 映射时计算；新增全仓 WXML 绑定语法契约测试；上传失败显式退出。
3. 上传验证（合并后执行）：微信开发版自动上传 workflow 成功并产出同 SHA receipt；随后真机获取新版本，验证权限卡排版（PR #362）与授权后头像回读（PR #358）。

**执行结论**：BLOCKED（待合并上传后回填核心验收）

**未执行或阻塞说明**：微信 CI 编译与真机验收依赖合并后的自动上传；回填负责人 MengEn-Ink。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回填 | 待回填 | 待回填 |
| 微信开发版上传 | 待合并后回填 | 待回填 | 待回填 |
| CloudBase | 不适用 | 安全跳过（无云函数变更） | 不适用 |

## 7. 风险与回滚

- 剩余风险：契约测试的正则覆盖常见方法调用，未穷尽 WXML 全部限制（如过滤器语法）；上传仍是最权威的编译校验。
- 监控与观察：合并后上传 workflow 必须在数分钟内完成（此前为 30 分钟超时）。
- 回滚步骤：`git revert` 本次合并提交并重新触发上传。
- 数据恢复：不适用。

## 8. 最终结论

修复已阻断 WXML 编译错误再次进入主线的路径；核心验收（上传成功 + 真机获取新版本）在合并后回填，在此之前保持 BLOCKED 不得视为验收完成。
