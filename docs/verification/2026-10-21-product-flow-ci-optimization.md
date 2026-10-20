# 产品流程与 CI 提速验收记录（2026-10-21）

## 验收范围

- 活动发布：显式报名截止日期/时间，发布与提交审核时必须早于集合时间。
- 路线恢复：GPX 缺失、解析失败、已就绪三态及重新上传/重试入口。
- 设置管理：活动通知订阅、微信隐私说明、安全缓存清理。
- 代码治理：移除生产链路中的 legacy mock-role，测试 Mock 与 fixtures 移出小程序上传目录。
- 工程效率：CI 并行 job、required `validate` 聚合门禁、云函数有限并发、affected 精确选择、审计例外期限、主包预算预警。
- 原型同步：GitHub Pages 原型、截图证据与 UI sync 清单同步。

## 关键场景结果

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 报名截止时间为空、等于或晚于集合时间 | 通过：发布/提交审核被阻断并定位字段 | `tests/activity-admin-edit.test.ts` |
| 跨日截止时间早于次日集合时间 | 通过 | `tests/activity-admin-edit.test.ts` |
| 草稿保留可继续编辑能力 | 通过：按既有服务端契约派生合法存储值 | `tests/activity-admin-edit.test.ts` |
| GPX 缺失、失败与已就绪状态 | 通过：支持重新上传、重试与更换 | `tests/activity-admin-edit.test.ts`、Pages 原型契约 |
| 通知订阅 | 通过：复用微信当次授权结果，不伪造永久开关 | `tests/settings-page.test.ts` |
| 隐私管理 | 通过：调用微信官方隐私说明能力并提供基础库兼容提示 | `tests/settings-page.test.ts` |
| 安全缓存清理 | 通过：不清除身份、报名、行程、个人资料和云端文件 | `tests/settings-page.test.ts`、`tests/temp-file-url-cache.test.ts` |
| legacy mock-role | 通过：生产代码与测试契约均无遗留标识 | `tests/auth.test.ts` |
| required validate 门禁 | 通过：普通 PR 依赖提交规范与影响面检查，机器人只允许规范检查 skipped | `scripts/ci-workflow-contract.node-test.mjs` |
| 云函数并发 | 通过：shared 先行、并发上限 3、失败传播 | `scripts/run-cloud-packages.node-test.mjs` |
| 主包预算 | 通过：426821 B，距离硬限额保留 32494 B | `npm run check:main-package` |
| UI 同步 | 通过：Pages 原型、截图证据、source/prototype digest 一致 | `npm run check:ui-sync` |

## 全量门禁

| 命令 | 结果 |
| --- | --- |
| `npm run cloud:install` | 通过，11 个包按上限 3 并发安装 |
| `npm run validate` | 通过，包含格式、Lint、TypeScript、1287 项前端测试、CI/发布/设计/UI sync/治理/云函数/构建门禁 |
| `npm run coverage` | 通过；`cloud.ts` lines 90.95%、branches 89.11%、functions 96.50%、statements 89.94% |
| `npm run audit:all` | 通过；根与 11 个云函数无高危漏洞，微信上传工具 5 个无上游修复告警受 120 天内复审期限约束 |
| `git diff --check` | 通过 |

## 安全与隐私

- 未新增密钥、账号、真实用户资料或受保护媒体。
- 缓存清理仅触达可安全重建的本地缓存。
- 通知订阅和隐私说明均走微信官方能力。
- CI 不上传 `node_modules` artifact；各 job 使用锁文件与 npm cache 独立安装。

## 遗留项

无。本清单中的产品、源码卫生、流程提速、门禁、原型同步与验收项均已完成并纳入自动化测试。
