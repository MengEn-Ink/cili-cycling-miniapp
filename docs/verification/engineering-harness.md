# 工程 Harness

项目通过统一 Harness 入口组织本地验证、CI 影响面检查和上线前门禁。Harness 不替代现有测试脚本，而是统一声明任务的前置能力、执行顺序、版本绑定、失败分类和机器可读结果。

## 使用方式

```bash
# 查看任务与配置
npm run harness -- list

# 仅检查执行条件，不运行目标任务
npm run harness -- preflight verify

# 开发验证：validate + coverage
npm run harness:verify

# 上线门禁：validate + coverage + audit
npm run harness:release

# 修复失败后，仅续跑同一提交中尚未通过的任务
npm run harness -- run release --resume
```

默认报告写入 `artifacts/harness/harness-report.json`。使用 `--report <path>` 可以修改位置；使用 `--continue-on-failure` 可以在诊断场景继续收集后续失败，但发布门禁不应开启该选项。

## 断点续跑

`--resume` 读取 `--report` 指向的已有报告，只跳过其中状态为 `passed` 的任务。为了避免复用已经失效的证据，旧报告必须同时满足：

- `schemaVersion` 与当前 Harness 一致；
- `selection` 与当前任务或配置一致；
- `commitSha` 与当前 Git 提交完全一致。

不满足任意条件都会直接拒绝续跑。被复用的任务在新报告中记录为 `skipped`，并写入 `skippedReason=resume:previously-passed`；失败、阻塞、未执行和未完成任务仍会重新执行。

## 报告 Schema v2

报告包含当前 commit SHA、执行环境、起止时间、预检结果、恢复来源和每个任务的状态：

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 报告协议版本；当前为 2 |
| `selection` | 执行的任务或 profile |
| `mode` | `local` 或 `github-actions` |
| `commitSha` | 报告绑定的 Git 提交 |
| `outcome` | 整体 `passed` / `failed` / `blocked` |
| `failureCategory` | `environment` / `infrastructure` / `application` / `incomplete` |
| `resumedFrom` | 续跑来源路径、提交与完成时间；非续跑为 `null` |
| `tasks[]` | 任务状态、时间、退出码、失败类别与跳过原因 |

## 结果语义

| 结果 | 含义 |
| --- | --- |
| `passed` | 前置条件与全部任务均通过，或未执行任务已有同提交通过证据 |
| `failed` | 任务已执行且至少一个失败 |
| `blocked` | 环境、依赖、平台或凭证条件不满足，或者任务没有完成 |
| `skipped` | 仅用于任务级状态：同一提交的历史报告已证明通过 |
| `not_executed` | 仅用于 preflight：条件检查通过，但目标任务没有执行 |

`blocked` 不能写成测试通过。微信开发者工具 E2E 仍要求 macOS 和真实开发者工具；Node/Mock/Pages 结果不能替代真实 DevTools、普通成员写链路或双真机验收。

## 本地与 GitHub Actions

- PR 的 `affected-pr` 通过 Harness 执行影响面检查，无论成功失败都上传报告。
- main 的 `validate`、`coverage`、`audit` 维持三个并行 job，各自执行 Harness 并上传独立报告。
- Artifact 名称包含 PR 号或 `github.run_id`，保留 14 天；CI 失败时仍可下载诊断。
- Harness 不自行调用 GitHub API 下载 Artifact。需要复跑时先把报告放到明确路径，再使用 `--report <path> --resume`。

## 设计约束

- 任务定义集中在 `scripts/harness-registry.mjs`，禁止在多个 workflow 复制另一套清单。
- Harness 只编排稳定的现有 npm scripts，不重新实现测试、审计或部署逻辑。
- 报告绑定执行时的 commit SHA。旧 SHA 的报告只能作为历史记录，不能重标为当前版本验收。
- 产品页面与业务逻辑不依赖 Harness；新增运行时能力仍按正常发布日志和真实环境验收流程交付。
- Pages-only 变更不触发 CloudBase 或微信开发版部署；部署范围由各自 decision 脚本确定。
