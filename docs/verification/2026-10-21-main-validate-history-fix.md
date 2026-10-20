# main-validate 完整历史修复验收记录

## 验收范围

修复 PR #324 合并后 main push 工作流中 `main-validate` 因浅克隆无法读取基线与提交历史而失败的问题。本次不修改小程序、云函数、数据结构或部署逻辑。

## 根因与修复

- 根因：`main-validate` 使用 checkout 默认浅克隆，历史差异与 UI 同步类门禁无法稳定取得所需 Git 历史。
- 修复：为该 job 配置 `fetch-depth: 0`。
- 防回退：CI 工作流契约测试新增断言，要求 `main-validate` 始终使用完整历史。

## 验证结果

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 工作流契约 | `node --test scripts/ci-workflow-contract.node-test.mjs` | 5/5 通过 |
| 治理检查 | `npm run check:governance` | 通过 |
| 格式检查 | `npx prettier --check .github/workflows/ci.yml scripts/ci-workflow-contract.node-test.mjs` | 通过 |
| Diff 卫生 | `git diff --check` | 通过 |

PR #324 已完成 `npm run validate`、`npm run coverage` 和 `npm run audit:all` 全量门禁；本修复仅调整 checkout 历史深度，不改变依赖或生产代码。PR 合并后以 main push 工作流实际全绿作为最终端到端验收信号。

## 安全与回滚

不新增权限、凭证、网络调用或敏感数据处理。若出现异常，可直接回滚本提交恢复原 checkout 配置。
