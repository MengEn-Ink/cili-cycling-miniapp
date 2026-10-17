# 俱乐部资料版本时间兼容修复验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| 关联 PR | [#278](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/278) |
| 问题运行 | [CloudBase 自动部署 #39076115518](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39076115518) |
| 客户端版本 | `2026.10.18.3` |
| 验收环境 | 本地自动化；CloudBase 与微信开发版待修复 PR 合并后复验 |
| 验收角色 | OWNER、ADMIN |
| 执行时间 | 2026-10-18 06:52 CST |
| 执行人 | Aime |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 无交互结构变化；更新设置页修复说明 |
| 云函数与数据 | 统一规范化 CloudBase 返回的 `Date`、时间戳对象和字符串版本时间 |
| 权限与隐私 | 不改变 OWNER/ADMIN 权限、字段白名单与头像边界 |
| Pages / 文档 | 同步客户端版本、UI schema 和本报告 |
| 部署与回滚 | 仅重新部署 `club-application`；异常时回滚该修复提交 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CloudBase 将 ISO 时间反序列化为 `Date` | 根因反例 | 俱乐部 `updated_at` 为 Date | 携对应 ISO `expectedUpdatedAt` 保存 | 版本相等，允许保存 | 新增 Date 回归测试通过 | `core.node-test.js` | PASS |
| 字符串时间版本 | 存量兼容 | `updated_at` 为 ISO 字符串 | 保存资料 | 保持原语义 | 全量云函数测试通过 | 32 项定向测试 | PASS |
| 云时间戳对象 | 边界 | 值提供 `toDate()` | 读取并比较版本 | 统一为 ISO 字符串 | 生产代码显式兼容 | `managedUpdatedAt` | PASS |
| 过期版本并发保存 | 回归 | 他人已先保存 | 使用旧 ISO 版本保存 | 返回冲突，不覆盖 | 原乐观锁测试继续通过 | `core.node-test.js` | PASS |
| 真实 CloudBase smoke | 端到端 | 修复合入 main | 部署后执行生产写入 smoke | 8 个阶段完成、清理零残留 | 待合并后执行 | main Actions | BLOCKED |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | 通过 | 云函数包和 17 个页面完整性通过 |
| `npm run coverage` | 通过 | 95 files / 1173 tests；`cloud.ts` lines 90.39%、branches 88.56% |
| `npm run audit:all` | 通过 | 项目及云函数 0 high；微信工具为已评估例外 |
| `git diff --check` | 通过 | 无空白错误 |
| PR checks | 待执行 | 推送修复 PR 后执行 |

## 5. 端到端执行记录

1. 从 main CloudBase 失败日志定位到 `CLUB_PROFILE_CONFLICT`。
2. 对照生产存储序列化行为，确认 `updated_at` 在 CloudBase 回读后可为 `Date`，而客户端携带 ISO 字符串。
3. 将投影和并发比较统一收敛到 `managedUpdatedAt`，兼容字符串、Date 和 `toDate()` 时间戳。
4. 将核心测试夹具改为 Date 复现线上类型，并通过完整门禁。

**执行结论**：本地自动化 PASS；真实 CloudBase smoke 待修复 PR 合并后执行。

**未执行或阻塞说明**：生产 smoke 只允许 main 部署后执行；合并后必须确认原失败步骤转为通过并完成临时数据清理。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回填 | 待执行 | 待核对最终 main SHA |
| Pages | 不适用 | 安全跳过 | 无独立 Pages 功能变化 |
| CloudBase | 待合并后回填 | 待部署 | 必须确认生产 smoke 通过 |
| 微信开发版 | 待合并后回填 | 待上传 | 待提取 `0.0.x` 版本号 |

## 7. 风险与回滚

- 剩余风险：CloudBase 可能返回 SDK 时间戳包装对象，已通过 `toDate()` 分支兼容。
- 监控与观察：关注 `CLUB_PROFILE_CONFLICT` 是否只在真实并发时出现。
- 回滚步骤：回滚本修复提交并重新部署 `club-application`。
- 数据恢复：本次失败发生在版本检查前，未写入俱乐部资料，无需恢复数据。

## 8. 最终结论

根因已由生产日志证实并完成最小修复，自动化门禁满足合并条件；整体交付需在 main CloudBase smoke 与微信开发版复验成功后转为 PASS。
