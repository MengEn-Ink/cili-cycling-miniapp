# 2026-10-21 活动全流程恢复与历史数据清理验收

## 目标

修复有限名额活动无法创建/发布的问题，安全删除已结束或已逻辑删除的历史活动及其关联记录，并在真实 CloudBase 环境验证活动创建、发布、报名、取消和删除全流程。

## 根因

活动编辑页已按极简表单移除“路线终点”，客户端创建活动时只提交路线起点；服务端发布校验仍把路线终点作为有限名额活动的必填字段，因此草稿可以创建，但第二阶段发布必然失败。活动详情和存量映射均已支持空路线终点，断裂发生在服务端发布校验层。

## 修复范围

- 发布和提审继续要求路线起点，但路线终点改为可选；提供终点时仍执行原有文本清洗。
- 新增真实 CloudBase 活动链路 smoke，使用隔离 ID 验证草稿、发布、回读、报名、取消、下架、逻辑删除和物理清理；失败执行补偿，成功也不遗留 smoke 数据。
- 新增历史活动清理工具：默认 dry-run，真实删除需要 gate、环境一致和确认短语三重门禁。
- 清理范围仅含已结束或已逻辑删除活动，以及其报名、路线预览、审计和通知；未来/进行中活动、用户、俱乐部和成员关系不受影响。

## 自动化验证

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 活动领域回归 | `npm --prefix cloudfunctions/activity-admin test` | 124 项通过 |
| 清理与真实 smoke 单测 | `node --test scripts/cloudbase-historical-activity-purge.node-test.mjs scripts/cloudbase-activity-flow-smoke.node-test.mjs` | 21 项通过 |
| 全量门禁 | `npm run validate` | 通过 |
| 覆盖率 | `npm run coverage` | 通过，`cloud.ts` lines 90.95%、branches 89.11%、functions 96.50%、statements 89.94% |
| 安全审计 | `npm run audit:all` | 通过；上传工具使用隔离依赖树，已覆盖可修复的 `follow-redirects` |

## 真实环境验收

合并并部署 `activity-admin` 后，通过 CloudBase 生产环境手动工作流执行：

1. 精确确认并清理历史活动，记录删除前各集合计数及删除后零残留回读。
2. 执行活动全流程 smoke，记录 7 个阶段、审计数量和最终逻辑删除结果。
3. 回读未来/进行中活动未被清理，smoke 无占位报名残留。

最终 workflow、提交 SHA、删除计数和 smoke 回执在部署完成后补充。
