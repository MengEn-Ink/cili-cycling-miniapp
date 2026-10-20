# 源码卫生清理验收报告（.gitignore 本地产物）

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | #316 `chore: 清理源码卫生并忽略本地分享产物目录` |
| Head SHA | `chore/source-hygiene-20261020` 分支 HEAD（以 PR 页面最终提交为准），基线 `c87f0526` |
| 客户端版本 | 不适用（无 `miniprogram/`、`cloudfunctions/` 产品代码改动） |
| 验收环境 | 本地 macOS 门禁 + GitHub Actions PR checks |
| 验收角色 | 不适用（纯工程配置与文档，无用户路径） |
| 执行时间 | 2026-10-20 CST |
| 执行人 | caomengen.lwdl |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 无变化，不涉及任何页面、组件与交互 |
| 云函数与数据 | 无变化，不涉及云函数、集合、索引与规则 |
| 权限与隐私 | 不适用；忽略的是本地 HTML 分享产物目录，不改变任何敏感数据边界 |
| Pages / 文档 | 仅新增本验收报告；Pages 构建源不受 `.gitignore` 影响 |
| 部署与回滚 | 小程序、Pages、CloudBase 均安全跳过；回滚仅需还原 `.gitignore` 一行 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 产物目录被忽略 | 正常 | 已删除工作区中的 `.trae-html-share-packages/` 且 `.gitignore` 含规则 | `git check-ignore -v .trae-html-share-packages/foo` | 命中第 16 行忽略规则 | 输出 `.gitignore:16:.trae-html-share-packages/` | 本地命令输出 | PASS |
| 工作区无残留产物 | 回归 | 分支最新代码 | `git status --porcelain` | 不再出现该 untracked 目录 | 工作区干净（仅报告内预期改动） | 本地命令输出 | PASS |
| 门禁回归 | 回归 | 依赖安装完整 | `npm run validate` | 全量门禁通过 | 见第 4 节与 PR checks | Actions 链接见 PR #316 | PASS |
| 产品代码零差异 | 边界 | 最终 diff | `git diff --numstat c87f0526...HEAD` | 仅 `.gitignore` 与本报告，无 `miniprogram/` 产品文件 | 与「改动文件」统计一致 | 本地命令输出 | PASS |
| 失效 ESLint 注释 | N/A | 评估过的候选项 | 对比 `miniprogram/pages/profile-edit/index.ts` | 注释删除会触发产品发布门禁，已评估后移出本 PR | 文件与基线一致，留给后续产品 PR | `git diff` 无该文件 | N/A |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | 通过（最终提交后以 PR checks 为准） | `prettier` 全部通过；`eslint` 0 error / 0 warning（基线状态含 1 条历史 warning，本 PR 不修改该文件）；`tsc --noEmit` 通过；vitest 99 文件 1247 用例全通过；设计契约 95 个双端变量、15 组对比度；UI 同步与主包检查通过 |
| `npm run coverage` | 通过 | cloud.ts 门禁：lines 90.91%、branches 89.00%、functions 96.27%、statements 90.00% |
| `npm run audit:all` | 阻塞（既有 P1，非本次引入） | 根工程与全部云函数 `npm audit --audit-level=high`：0 vulnerabilities；`scripts/audit-miniprogram-ci.mjs` 因微信上传工具内 `fast-glob`、`request` 存在上游可修复依赖退出 1，属主干既有阻塞，本 PR 不触碰 `tools/miniprogram-ci` |
| `git diff --check` | 通过 | 无空白错误 |
| PR checks | 待回填 | CodeQL 与 analyze 已通过；`validate` 首次因 PR 描述不符合模板被拦，补齐本报告与规范章节后重跑，结果以 PR #316 最终状态为准 |

## 5. 端到端执行记录

1. 不适用：本 PR 无产品代码、无用户可感知路径，无需真实角色与测试数据。
2. 替代验证为仓库门禁与 git 层面的可重复检查（见第 3、4 节）。
3. 按 diff 触发策略，本 PR 不包含 `miniprogram/` 与 `cloudfunctions/` 改动，微信开发版上传应判定为安全跳过；若 PR checks 出现上传作业，以其决策日志为准回填。
4. 全程不涉及截图、手机号或其他敏感证据。

**执行结论**：N/A（纯工程配置，以自动化门禁替代端到端验收，门禁通过即满足合并条件）

**未执行或阻塞说明**：`audit:all` 的微信上传工具依赖告警为既有 P1 阻塞项，影响所有主干构建而非本 PR 特有；负责人为仓库维护者，后续通过升级 `tools/miniprogram-ci` 依赖或 `miniprogram-ci` 版本收口，不阻断本次无产品改动的卫生 PR。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回填 | 待合并后回读 | PR 分支 checks 不作为生产部署结果 |
| Pages | 不适用 | 安全跳过 | 无 Pages 源与构建配置改动 |
| CloudBase | 不适用 | 安全跳过 | 无云函数、集合、规则改动 |
| 微信开发版 | 不适用 | 预期安全跳过（diff 无产品代码） | 合并后以按 diff 触发的上传决策日志确认 |

## 7. 风险与回滚

- 剩余风险：极低；忽略规则只影响 untracked 文件的展示，不影响已被 Git 跟踪的任何文件。
- 监控与观察：不适用，无运行时行为。
- 回滚步骤：还原 `.gitignore` 第 16 行（删除 `.trae-html-share-packages/` 规则）即可；无配置或数据需要恢复。
- 数据恢复：不适用。

## 8. 最终结论

满足合并条件：变更仅限一条忽略规则与本验收报告，自动化门禁通过，不触发任何产品发布与部署；既有 `audit:all` 阻塞与本 PR 无关，已如实记录。
