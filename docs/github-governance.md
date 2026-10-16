# GitHub 仓库治理与发布自动化

本文定义此里小程序在 GitHub 上的最小治理基线。它只说明平台职责和可复核设置，不复制业务发布脚本；具体命令仍以仓库工作流与发布文档为准。

## 1. 变更入口

- 功能和缺陷使用 `.github/ISSUE_TEMPLATE/` 下的结构化表单，禁止在公开 Issue 中提交凭证、真实用户资料或漏洞细节。
- 所有代码变更通过 Pull Request 合入 `main`，PR 描述必须覆盖需求上下文、方案、验证、影响面和部署结果。
- `main` 应由单一 Repository Ruleset 保护，不再叠加一套含义相同的传统 Branch protection，避免规则来源漂移。

## 2. `main` Ruleset 基线

仓库管理员在 **Settings → Rules → Rulesets** 中维护一条启用状态的 `protect-main`：

| 规则 | 配置 |
| --- | --- |
| 目标 | Default branch / `main` |
| 更新入口 | Require a pull request before merging |
| 合并检查 | Require status checks：`validate`；先使用 loose policy |
| 会话 | Require conversation resolution |
| 历史保护 | Restrict deletions；Block force pushes |
| 审批 | 单维护者阶段为 0；有第二位稳定维护者后改为 1，并启用 CODEOWNERS 与 latest-push approval |
| 绕过 | 默认无常态 bypass；确需应急时应留下后补 PR 和发布记录 |

`validate` 是 `.github/workflows/ci.yml` 中始终创建的聚合检查。不要把有路径条件、可能完全不创建的 job 设置为 required check。

## 3. 安全能力

仓库保持以下能力开启：

1. Dependency graph、Dependabot alerts 与 Dependabot security updates；安全更新仍需通过同一 PR 和 CI 门禁。
2. Secret scanning 与 push protection；真实凭据一旦出现，先撤销和轮换，再处理 Git 历史。
3. Private vulnerability reporting；`SECURITY.md` 负责政策，GitHub Security 入口负责私密传输与协作。
4. `.github/workflows/codeql.yml` 对 JavaScript/TypeScript 执行 CodeQL；先处理基线，再考虑把新增 High/Critical 告警设为合并阻断。

平台安全设置依赖仓库 Administration / Security 权限。代码工作流存在不等于对应平台开关已经启用，验收时必须从仓库 Settings 回读状态。

## 4. 依赖更新

`.github/dependabot.yml` 覆盖根目录、微信上传工具和全部云函数 npm manifest，同时维护 GitHub Actions：

- 每周错峰检查，避免与日常开发高峰重叠；
- npm minor/patch 合并为一组，限制同时打开的 PR；
- major 更新不自动提出，必须结合 Node 24 CI、Node 20.19 云函数运行时和微信工具链单独评估；
- Dependabot PR 不自动合并，仍执行 `npm run validate`、覆盖率和安全审计。

## 5. Issue、版本与发布记录

- Labels 只表达类型、模块、优先级和少量机器规则；流程状态不重复编码到多套标签。
- Milestone 仅对应真实正式版或活动交付目标，不按周制造空里程碑。
- `.github/release.yml` 按标签生成 Release Notes。自动内容说明“发生了什么”，发布负责人补充微信版本、CloudBase 部署范围、兼容性、回滚方式和 receipt。
- 正式版使用语义化 Tag；候选版本使用 prerelease。Actions artifact 不是永久制品库，需要长期保存的发布证据应进入 Release 或已有不可变清单。

## 6. Actions 与部署环境

| 能力 | 当前职责 |
| --- | --- |
| `CI / validate` | 格式、静态检查、测试、覆盖率、CloudBase 只读校验和安全审计 |
| 微信开发版自动上传 | `main` CI 成功后按变更判定上传；串行执行并生成 90 天 receipt |
| 微信体验版晋级证据门禁 | 使用 `wechat-experience` Environment，绑定候选、平台回读和不可变 manifest |
| GitHub Pages | 由 GitHub Pages 的 `github-pages` Environment 记录部署 |
| CodeQL | PR、`main` 和每周定时扫描 JavaScript/TypeScript |

同一 PR 的旧 CI run 可以取消；微信上传、晋级和其他有外部副作用的发布 run 必须串行且不得用新 run 中断旧 run。Environment deployment history 记录 GitHub 侧事件，receipt 记录微信或云平台的业务响应，两者不能互相替代。

## 7. 验收清单

每次治理设置变更后至少核对：

- 失败的 `validate` 不能合入 `main`，直接 push、删除和 force push 被阻止；
- Dependabot、secret scanning、push protection、private vulnerability reporting 的仓库设置为 Enabled；
- CodeQL 最新 PR / `main` 扫描成功，且告警可在 Security 页面追踪；
- Issue 新建页只显示结构化缺陷/功能表单和受控联系入口；
- 自动 Release Notes 分类符合标签，未把跳过项写入版本说明；
- Deployments 页面能定位 Pages 与体验版相关 run，微信 receipt 仍可从对应工作流下载。
