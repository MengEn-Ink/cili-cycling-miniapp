# 体验版候选自动化验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | [#405](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/405) |
| Head SHA | `04f7fd669639a99d1c502f09695c4238bd83c4c5`（首次提交；本报告提交后以 PR 最新 head 为准） |
| 客户端版本 | 不适用；本次不修改小程序产品代码 |
| 验收环境 | 本地门禁、GitHub Actions、微信公众平台 |
| 验收角色 | 仓库发布负责人、小程序管理员 |
| 执行时间 | 2026-10-29 CST |
| 执行人 | Codex |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 不修改小程序页面；仅调整发布工作流与操作说明 |
| 云函数与数据 | 不修改云函数、集合、索引或生产数据 |
| 权限与隐私 | 不修改第三方授权；只读回读发现开发权限已托管给“腾讯位置服务” |
| Pages / 文档 | 不修改 Pages 产品原型；更新发布、治理和高优问题文档 |
| 部署与回滚 | PR 合入后，开发版真实上传成功会自动准备 candidate；删除该工作流提交即可回滚 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 真实上传自动候选 | 正常 | 成功上传 run 含唯一未过期 upload/release receipt | 运行发布契约测试 | 自动入口绑定同 SHA、CI、run 和当前 main | 契约通过 | `npm run test:deploy` 65/65 | PASS |
| 纯文档或无真实上传 | 边界 | 上传工作流安全跳过且无 receipt | 解析自动入口 | 记录跳过，不生成 candidate | 契约通过 | 体验版工作流测试 | PASS |
| main 已前进 | 失败恢复 | receipt SHA 不再是当前 main | 解析自动入口 | 保留上传证据并停止晋级 | 契约通过 | 体验版工作流测试 | PASS |
| verified 参数反推 | 回归 | 已存在唯一 candidate artifact | 仅提供 candidate run ID 与 CONFIRMED | 从 artifact 反推不可变字段并拒绝冲突值 | 契约通过 | 体验版工作流测试 11/11 | PASS |
| 第三方托管 | 根因反例 | 微信公众平台开发权限被第三方托管 | 打开版本管理与第三方设置 | 禁止把开发版 receipt 当作体验版；停止 verified | 版本管理显示“开发管理已禁用”；腾讯位置服务持有“小程序开发与数据分析” | 微信公众平台 2026-10-29 现场回读 | BLOCKED |
| 存量发布记录 | 存量兼容 | 仓库已有 verified 记录 | 校验整个发布记录目录 | 既有记录继续通过且禁止覆盖 | 校验通过 | `npm run check:experience-releases` | PASS |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | PASS | 91 个 Vitest 文件、1392 项用例、云函数 13 个包、构建与治理全部通过；首次因 `cloudfunctions/profile` 未安装锁定依赖中止，执行 `npm ci --prefix cloudfunctions/profile` 后完整重跑通过 |
| `npm run coverage` | PASS | statements 83.21%、branches 77.44%、functions 82.04%、lines 86.46%；cloud.ts lines 91.02%、branches 89.02%、functions 96.60%、statements 90.06% |
| `npm run audit:all` | PASS | 无 high 及以上漏洞；上传工具 4 个已评估无上游修复告警，例外到期 2027-01-15；部分云函数保留已知 moderate `qs` 提示 |
| `git diff --check` | PASS | 无空白错误 |
| 定向测试 | PASS | `npm run test:deploy` 65/65；体验版工作流测试 11/11；`check:experience-releases`、`check:governance`、Prettier、actionlint 1.7.12 均通过 |
| PR checks | RUNNING | [PR #405](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/405)；首次 `pr-submission` 因缺模板化描述失败，本报告和 PR 描述补齐后重跑 |

## 5. 端到端执行记录

1. 核验 `main@b891e5bd` 的 CI run `40851757136`、开发版 `0.0.401.1` 上传 run `40852148961` 与 candidate run `40863858643`。
2. 下载并核验 candidate：固定入口 `pages/activities/index`，digest `sha256:f07cbfb8e9ee9d0c1d4abbee2e70128131fa6f37066db22561ac07b9ebb40142`。
3. 登录微信公众平台“骑有此里”，打开版本管理；页面明确显示“开发管理已禁用，开发权限已托管给第三方，不能在此进行开发管理”。
4. 打开第三方设置；回读“腾讯位置服务”于 2026-10-28 20:05 获得包含“小程序开发与数据分析”的权限。“腾讯云官网”仅持有云服务相关权限，不是本次开发管理阻塞来源。
5. 未解除授权、未修改权限、未生成虚假 verified，也未把开发版上传成功报告成体验版成功。

**执行结论**：`BLOCKED`

**未执行或阻塞说明**：体验版尚未生成。小程序管理员需恢复原生开发权限后选用 `0.0.401.1`，或由持有腾讯位置服务 component 凭据与模板的一方调用微信开放平台 `commit` 生成体验版。完成真实平台版本回读后，才能运行 candidate `40863858643` 的 verified 和体验版 UAT。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | [40851757136](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40851757136) | PASS | 绑定 `b891e5bd` |
| Pages | 不适用 | 安全跳过 | 本次不修改 Pages 产品内容 |
| CloudBase | 不适用 | 安全跳过 | 本次不修改云函数或基础设施 |
| 微信开发版 | [40852148961](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40852148961) | 上传成功 | `0.0.401.1`，但第三方托管下不能据此证明体验版存在 |
| 体验版 candidate | [40863858643](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/40863858643) | candidate 成功 | 平台选版 / 第三方 commit 阻塞，verified 未执行 |

## 7. 风险与回滚

- 剩余风险：PR 合入只会自动准备 candidate，不能消除第三方托管阻塞；若授权关系继续存在，后续每个 candidate 都必须保持未验证状态。
- 监控与观察：观察自动入口对纯文档、安全跳过、真实上传和 main 前进四类 run 的 summary 与 artifact。
- 回滚步骤：revert PR #405；既有开发版上传工作流和已生成 candidate artifact 不受影响。
- 数据恢复：不适用；无数据库、云存储或生产配置写入。

## 8. 最终结论

发布自动化改动具备合并所需的本地门禁与 fail-closed 证据，但当前 `0.0.401.1` 体验版发布仍为 `BLOCKED`。不得在恢复原生开发权限或完成授权第三方 `commit` 并平台回读前宣称发布成功。
