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

合并提交：`12e436561576cc3d6ec62c5abe91eb717ff96608`。

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| Main CI | `main-validate`、`main-coverage`、`main-audit`、`upload-decision` 全部通过 | [run 39511249427](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39511249427) |
| CloudBase 自动部署 | `activity-admin` 等受影响函数部署及环境回读通过 | [run 39511356146](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39511356146) |
| 历史活动清理 | 删除 7 个历史活动、12 条报名、32 条审计；关联路线预览和通知为 0；删除后五类关联集合回读均为 0 | [run 39513335641](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39513335641) |
| 活动全流程 smoke | 8 个阶段通过、产生并验证 6 条审计，最终隔离活动、报名、审计和通知全部物理清理 | [run 39513335641](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39513335641) |
| CodeQL | 通过 | [run 39511249254](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39511249254) |
| Pages | 发布成功 | [run 39511249422](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39511249422) |
| 微信开发版 | 客户端说明版本 `2026.10.21.1`，上传版本 `0.0.331.1`，robot 1，上传成功 | [run 39511356050](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39511356050) |

清理工具在删除前按 `event_end < cutoff` 或 `is_deleted=true` 筛选，并对 cutoff 之后的未来/进行中活动做硬保护；执行后关联集合全部零残留。活动 smoke 成功路径与失败补偿路径都执行物理清理，因此目标环境没有遗留测试活动。
