# 源码文件模式治理验收

日期：2026-10-26。基线：`main@4e69367f21139c8d9dab068fea5ed67926ef872b`。交付分支：`chore/governance-hygiene-20261026-v2`。本片只修改 Git 文件模式与治理检查，不改变产品、CloudBase、UI、客户端版本或 `docs/ui-sync-manifest.json`。

## 范围

- 15 个显式 Node CLI 入口保留 `100755`，且首行为 `#!/usr/bin/env node`。
- 68 个无 shebang 的异常 `100755` 文件改为 `100644`，blob ID 全部保持不变。
- `check:governance` 组合现有治理 CLI 与新文件模式 CLI，拒绝白名单外 `100755`、白名单缺项、错误模式和缺失 shebang。
- 发布说明门禁通过 Git raw diff 的 old/new blob ID 识别 mode-only 文件，不把本片误报为产品版本变更。

## TDD 证据

| 阶段 | 命令 | 实际结果 |
| --- | --- | --- |
| RED 1 | `node --test scripts/project-governance-policy.node-test.mjs` | 旧治理 CLI 对 alternate index 中的 `README.md@100755` 返回 0；测试 0 PASS / 1 FAIL，断言显示 `actual: 0`；日志 SHA-256 `9d0a69c373fbfa9bb3e3ebe5a650deaec5d8471708632e5387cca70e5ba40205` |
| RED 2 | 基线 alternate index 下执行 `npm run check:governance` | 退出 1，精确拒绝 68 个白名单外 `100755`；首项 `.github/workflows/daily-full-audit.yml`，末项 `tests/route-visual-unification.test.ts`；日志 SHA-256 `6e236d8e52f12bd775eda9d266296f7585b635d5b9a0c8747641cf4129057439` |
| Focused GREEN | `node --test scripts/project-governance-policy.node-test.mjs` | 6 PASS / 0 FAIL；alternate index、显式白名单、shebang、当前 index 和 package 命令契约全部通过 |
| CI-contract GREEN | `npm run test:ci-contract` | 45 PASS / 0 FAIL，包含 6 项文件模式回归 |
| Release-note RED/GREEN | `node --test scripts/check-release-notes.node-test.mjs` | 先以 `parseContentChangedFiles` 缺失获得 6 PASS / 1 FAIL，最小实现后 7 PASS / 0 FAIL；真实门禁报告本次无产品代码改动 |
| Blob 等价 | Git raw diff 校验 | 68 个 `100755→100644` 路径的 old/new blob ID 完全相同 |

## 验证中断与收敛

- 首次 `validate` 在 Bootstrap 套件中因 `cloudfunctions/activity-admin` 的独立 `fast-xml-parser` 依赖未安装而失败。执行仓库既有 `npm run cloud:install` 安装 13 个云函数包后，HEAD 与 porcelain 均未变。
- 依赖齐全后的下一次 `validate` 在 `check:release-notes` 暴露 mode-only 被误判为产品改动。按 TDD 新增失败测试后，门禁只忽略 old/new blob 一致的 `100755↔100644`，其他内容或类型变更仍 fail closed。
- 最终从头运行的 `npm run validate` 退出 0；不以前两次部分通过替代最终全量结果。

## 自动化门禁

| 门禁 | 状态 | 结论 |
| --- | --- | --- |
| `npm run validate` | `PASS` | 89 个 Vitest 文件 / 1376 项、CI contract 45 项、Bootstrap 156 项、部署 62 项、UI sync 22 项、13 个云函数包、包校验与构建全部通过 |
| `npm run coverage` | `PASS` | Vitest 总覆盖率 statements 82.84% / branches 77.30% / functions 81.35% / lines 86.09%；`cloud.ts` lines 91.02% / branches 89.02% / functions 96.60% / statements 90.06% |
| `npm run audit:all` | `PASS` | 根包与 13 个云函数包 0 vulnerabilities；微信上传工具 4 个无上游修复的已评估例外继续受 2027-01-15 到期门禁约束 |
| `git diff --check` | `PASS` | 最终实现与证据文档无空白错误 |

## 运行态与部署

本片不改变运行代码、UI、云函数、数据库、存储规则或小程序包；真实用户旅程、CloudBase 部署和物理真机为 `N/A`。合并后的 main CI、CloudBase/微信 workflow 安全跳过结果仍需独立回读，不能由本地绿色推断。

## 当前结论

`IMPLEMENTED / REVIEW_PENDING`。本地实现与完整门禁已通过，但不等于合并或治理闭环；等待审判者只读复审、PR checks、main CI 与适用 workflow 回读。
