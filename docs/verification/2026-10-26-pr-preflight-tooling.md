# PR 提交前置检查工具验收报告

- 日期：2026-10-26
- 分支：`chore/pr-preflight-tooling`
- 范围：`scripts/pr-body.mjs`、`scripts/pr-preflight.mjs`、`scripts/ensure-devtools-port.mjs`、`scripts/check-ui-sync.mjs`、`scripts/pages-visual-acceptance/sync-ui-digests.mjs`、`package.json`

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | 本报告所属 PR（合并后回填） |
| 客户端版本 | 不适用（无产品代码改动，版本号不变） |
| 验收环境 | Windows 11 本地开发环境 / PowerShell 5 |
| 执行时间 | 2026-10-26 CST |
| 执行人 | Agent |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 不适用（无 miniprogram 改动） |
| 云函数与数据 | 不适用 |
| 权限与隐私 | 不适用（工具只读本地 git 与 DevTools 配置） |
| Pages / 文档 | 无 UI 摘要漂移，`docs/ui-sync-manifest.json` 不变 |
| 部署与回滚 | 纯本地工具链，回滚即 revert commit |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UI 摘要双端口径一致 | 回归 | Windows `core.autocrlf=true` | `npm run ui:digest` 与 `npm run check:ui-sync` 各跑一次 | 两者 digest 与 manifest 一致 | 一致 | 命令输出 | PASS |
| DevTools 端口自动修复 | 回归 | DevTools 已启动、服务端口开启 | `npm run devtools:port` | 定位 profile、写入 `.ide`/`.cli`、`islogin` 返回 login:true | 符合 | 命令输出 | PASS |
| PR 描述骨架生成 | 新增 | 工作区有改动 | `npm run pr:body -- --title "chore(ci): 沉淀 PR 提交前置检查工具"` | 生成 `.pr-body.md`/`.pr-title.txt`，统计与 `git diff --numstat` 一致 | 符合 | 命令输出 | PASS |
| PR 描述结构校验 | 新增 | `.pr-body.md` 存在 | `npm run pr:preflight` | 结构通过；【】占位给出警告数量 | 符合 | 命令输出 | PASS |
| 标题规范前置拦截 | 新增 | 传入不合规标题 | `npm run pr:body -- --title "bad title"` | 报错并提示 `<type>(<scope>): <中文结果>` 格式 | 符合 | 命令输出 | PASS |
| 代理检测提示 | 新增 | 本地 7890 端口存活 | `npm run pr:preflight` | 末尾提示 git/gh 代理设置命令 | 符合 | 命令输出 | PASS |
| 门禁回归 | 回归 | 本分支 | lint / typecheck / governance / main-package / ui-sync / release-notes / settings-page | 全部通过 | 全部通过 | `npm run pr:preflight` 输出 | PASS |

## 4. 结论

工具链改动全部验证通过；无产品行为变化，不阻塞部署。

## 5. 遗留事项

- `check:pr-description` 的 CI 侧调用（`PR_BASE_SHA`/`PR_HEAD_SHA`）不受影响，仅本地校验路径改为直接 import 复用。
