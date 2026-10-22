# 工程 Harness

项目通过统一 Harness 入口组织本地验证、CI 影响面检查和上线前门禁。Harness 不替代现有测试脚本，而是统一声明任务的前置能力、执行顺序、版本绑定和机器可读结果。

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
```

默认报告写入 `artifacts/harness/harness-report.json`，包含当前 commit SHA、执行环境、起止时间、预检结果和每个任务的状态。使用 `--report <path>` 可以修改位置；使用 `--continue-on-failure` 可以在诊断场景继续收集后续失败，但发布门禁不应开启该选项。

## 结果语义

| 结果 | 含义 |
| --- | --- |
| `passed` | 前置条件与全部任务均通过 |
| `failed` | 任务已执行且至少一个失败 |
| `blocked` | 环境、依赖、平台或凭证条件不满足，或者任务没有完成 |

`blocked` 不能写成测试通过。微信开发者工具 E2E 仍要求 macOS 和真实开发者工具；Node/Mock/Pages 结果不能替代真实 DevTools、普通成员写链路或双真机验收。

## 设计约束

- 任务定义集中在 `scripts/harness-registry.mjs`，禁止在多个 workflow 复制另一套清单。
- Harness 只编排稳定的现有 npm scripts，不重新实现测试、审计或部署逻辑。
- CI 的 `affected-pr` 通过 Harness 执行，并始终上传报告；失败时也保留诊断证据。
- 报告绑定执行时的 commit SHA。旧 SHA 的报告只能作为历史记录，不能重标为当前版本验收。
- 产品页面与业务逻辑不依赖 Harness；新增运行时能力仍按正常发布日志和真实环境验收流程交付。
