# CloudBase 云函数媒体密钥保全修复验证

- 日期：2026-10-19
- 修复分支：`fix/cloudbase-preserve-function-env`
- 失败基线：[CloudBase run 39154165321](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39154165321)
- 代码基线：`main@2ff5372`（包含 #289–#293 与活动审批 #292）

## 根因与安全约束

CloudBase CLI 3.8.4 的 `fn deploy --force` 会从 `cloudbaserc.json` 的 `functions[].envVariables` 应用环境变量。仓库配置没有声明 `PROFILE_MEDIA_PATH_SECRET`，所以函数部署会清空云端值；原工作流又在全部部署完成后才从 `club-application` 回读密钥，失败 run 因而在 post-deploy 阶段无法解析 secret。

本修复不生成、轮换或硬编码密钥。部署任务在任何 baseline、存储规则或函数部署前，查询六个媒体消费者尚未被本轮改写的函数详情，并把所有非空、长度合格的值作为可信 donor 集合；环境管理员也可在 `cloudbase-production` GitHub Environment 配置 `PROFILE_MEDIA_PATH_SECRET` 作为受控来源。所有非空来源必须完全一致，否则 fail closed；没有 donor 且未配置 Actions secret 时也 fail closed，并输出配置路径而不输出密钥。

## 实现

- 新增 `scripts/cloudbase-function-env.mjs`，集中负责 CloudBase 函数清单解析、函数详情解析、唯一值校验、运行时配置生成及部署后校验，避免在 workflow 内维护复杂 `jq`。
- 部署前先要求 `fn list --json` 成功并由 Node 严格解析现有函数清单；只有清单明确确认不存在的新函数才按空环境变量继续创建。鉴权、网络或 `fn list` / `fn detail` JSON 异常均 fail closed，不通过匹配 CLI 错误文本吞错。
- 解析成功后立即发出 GitHub Actions `add-mask`，只把密钥写入当前 job 的 `GITHUB_ENV` 和权限为 `0600` 的 runner 临时运行时配置。
- 运行时配置合并每个待部署函数的云端环境变量、仓库已有 `envVariables` 与媒体密钥，保留函数其他配置；六个消费者只要在本轮部署范围内都会注入同一值。
- CloudBase CLI 3.8.4 的 `fn deploy` 没有 config-path 参数，因此工作流先备份仓库配置，再把 runner 临时配置复制到工作区供部署命令自动读取；`always()` 步骤恢复仓库配置并删除运行时配置和函数详情文件。
- 顺序固定为：resolve / mask / prepare runtime config → database baseline / storage → deploy and verify each affected function → verify all six consumers → production smoke。
- 每个受影响函数执行 `fn deploy` 后立即开始有界回读：每 5 秒检查一次、最多 12 次以吸收配置传播延迟；必须是唯一目标函数、状态为 `Active`，媒体消费者还必须携带当前 job 的同值 secret，验证成功后才继续下一个函数。
- 部署后再次查询六个消费者，逐一确认状态为 `Active`，且变量存在、长度合格并与当前 job 的已掩码值一致。
- 工作流或密钥部署脚本自身变更会把六个消费者全部纳入部署范围，避免只修复流程而不修复已被失败 run 清空的函数。
- 已复核全仓同类 `fn detail` 调用：除本部署链路外，仅有 `cloudbase-club-application-smoke.mjs` 的部署后目标探针；它本就要求既有 `club-application` 且不参与新函数创建，因此本次不修改。

## 自动化覆盖

静态与 Node 测试锁定以下行为：

1. resolve 必须发生在 baseline 与 deploy 前，verify 在 smoke 前；
2. 不存在随机密钥生成路径；
3. donor 缺失、不合法或不一致时失败；
4. GitHub Actions secret 只能作为环境管理员配置来源，并且必须与云端非空 donor 一致；
5. 所有六个消费者在被部署时均注入相同密钥，同时保留每个函数已有配置与其他环境变量；
6. 输出先执行日志掩码，运行时配置只进入 runner 临时生命周期；
7. 部署使用临时替换后的 `cloudbaserc.json`，`always()` 恢复并清理；
8. 部署后任一消费者缺失或值不一致均 fail closed。

本分支本地验证结果：

| 验证 | 结果 |
| --- | --- |
| 密钥保全与部署决策定向 Node 测试 | 23/23 通过 |
| `npm run test:bootstrap` | 110/110 通过 |
| `CILI_SKIP_UI_SYNC=1 npm run validate` | 通过；99 个 Vitest 文件、1240 个用例通过，CloudBase / release / design / governance / build 门禁通过 |
| `npm run coverage` | 首次遇到既有 `route-analysis-runtime` 超时；重跑通过，`cloud.ts` lines 90.85%、branches 88.96%、functions 96.24%、statements 89.94% |
| `npm run audit:all` | 首次微信工具审计响应缺少 `vulnerabilities` 字段并 fail closed；重跑通过，业务依赖无漏洞，微信上传工具 5 个既有评估例外有效至 2027-01-15 |
| Prettier 与 `git diff --check` | 通过 |

## 部分部署边界与安全恢复

CloudBase CLI 的逐函数部署不提供本工作流可用的原子事务或自动回滚，因此中途失败时，之前已经通过 `Active + secret` 校验的函数会保持新版本，当前失败函数及后续函数不会被宣称完成。工作流会明确输出“已完成并验证”与“尚未完成（含当前失败项）”的函数名；不会伪造原子回滚，post-verify 与 smoke 也不会在部署步骤失败后运行，但 `always()` 清理仍会恢复仓库配置并删除临时密钥文件。

安全恢复方式是修复导致失败的权限、网络、函数代码或 CloudBase 状态后，使用同一不可变提交重新运行完整部署。重跑会在覆盖任何函数前重新从仍可信的云端 donor 或环境级 Actions secret 解析唯一 secret，并从部署范围首项开始逐个覆盖和验证；不得手工生成新 secret，也不得只跳到 smoke。若云端六个 donor 已全部缺失或不一致，必须由环境管理员先配置正确的 `cloudbase-production` GitHub Environment secret，再重跑完整工作流。

## 仍需 CI / 生产远端验证

本地静态与单元测试不能证明生产环境的函数详情响应结构、GitHub Environment 配置或 CloudBase 权限可用。合入 `main` 后必须由 `cloudbase-production` 环境执行一次真实工作流，并确认：

- resolve 阶段能从至少一个未被本轮覆盖的可信 donor 或环境级 Actions secret 取得唯一值；若失败 run 已清空全部六个消费者，环境管理员必须先配置同名 GitHub Environment secret；
- 六个消费者均成功部署或校验，部署后详情中的 `PROFILE_MEDIA_PATH_SECRET` 全部存在且一致；
- database baseline、存储规则 reconcile、生产俱乐部申请写入 smoke 全部成功；
- `always()` 清理步骤执行，日志、artifact 与 cache 中均无运行时配置或明文密钥；
- 以该次不可变提交和 Actions run 链接作为最终生产证据。未取得这些证据前，不宣称生产部署已恢复。

本次仅调整 CI / 部署防护与测试，不需要 App release note，也不改变业务状态机。
