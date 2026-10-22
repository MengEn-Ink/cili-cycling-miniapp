# Harness v2 与工程化实践 Pages 验收记录

## 版本与范围

- 日期：2026-10-22
- 分支：`docs/harness-engineering-practice`
- 基线：`0f7fa8dccd91f29554416fe6f3ba5415ef575405`
- 范围：Harness Schema v2、同提交断点续跑、main CI 报告接线、工程化实践 Pages 文章与研发交付中心入口。
- 非范围：小程序业务逻辑、CloudBase 云函数、数据库结构、微信开发版产物。

## 环境

- Node.js：22.23.3
- npm：仓库锁定依赖
- 浏览器：Playwright Chromium（headless）
- 视口：桌面 1440×1000；手机 390×844

## 验收路径与结果

| 类型 | 命令 / 路径 | 实测结果 |
| --- | --- | --- |
| Harness 单测 | `node --test scripts/harness.node-test.mjs scripts/ci-workflow-contract.node-test.mjs scripts/affected-ci.node-test.mjs` | PASS；覆盖参数解析、失败分类、同提交续跑、跨提交与旧 schema 拒绝、Actions 接线 |
| Pages 契约 | `npx vitest run tests/showcase-pages-contract.test.ts` | PASS，56/56 |
| 全量门禁 | `npm run validate` | PASS；格式、lint、typecheck、根测试、云函数、设计、治理与构建全部通过 |
| 覆盖率 | `npm run coverage` | PASS；仓库覆盖率门禁与 `cloud.ts` 专项门禁通过 |
| 安全审计 | `npm run audit:all` | PASS；0 个高危漏洞；微信上传工具 5 个既有评估例外有效至 2027-01-15 |
| Harness 发布配置 | `npm run harness:release` | PASS；Schema v2 报告中 validate / coverage / audit 全部为 passed |
| Diff 卫生 | `git diff --check` | PASS |
| 桌面浏览器 | 工程化实践文章 1440×1000 | PASS；标题、7 个目录入口、返回交付中心、锚点偏移、横向溢出和控制台检查通过 |
| 手机浏览器 | 工程化实践文章 390×844 | PASS；单列布局、无横向溢出、固定导航不遮挡锚点、控制台无错误 |

## 关键边界验证

1. `--resume` 仅复用同一 `schemaVersion`、`selection` 和 `commitSha` 报告中的 passed 任务。
2. 跨提交或 Schema v1 报告会 fail closed，不会跳过任务。
3. 预检失败归类为 `environment`；进程启动失败归类为 `infrastructure`；测试非零退出归类为 `application`；未完成归类为 `incomplete`。
4. Pages 文章通过 `docs/delivery-center.js` 唯一入口可达，使用相对链接并满足移动端布局。
5. 本次没有产品运行时代码、云函数或数据库改动，不应触发 CloudBase 或微信开发版部署。

## 证据

- 本地 Harness 报告：`artifacts/harness/harness-report.json`（临时产物，不入库）。
- CI 报告：PR 的 affected Harness Artifact，以及合并后 main validate / coverage / audit 三份 Harness Artifact。
- Pages 正式证据：合并后 GitHub Pages workflow 与正式 URL 回读。

## 已知问题与后续动作

- GitHub Artifact 保留 14 天；长期结论以本报告、PR 和 commit 为准。
- Harness 本轮不自动调用 GitHub API 下载历史 Artifact；续跑时需把目标报告放到明确路径。
- Pages 正式 URL 只能在合并 main 后复验，合并前结论为本地浏览器 PASS。

## 结论

本地工程门禁、Harness release profile、Pages 契约和双视口浏览器验收均通过。PR checks 全绿并合并后，需要继续核验 main 三路 Harness Artifact 与 GitHub Pages 正式发布；CloudBase 和微信开发版应安全跳过。
