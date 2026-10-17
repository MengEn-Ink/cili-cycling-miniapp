# PR 提交流程质量门禁验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | [#272](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/272)；分支 `chore/pr-submission-quality-gate` |
| Head SHA | 由 PR 页面与 Actions 绑定最终 head；报告不自引用 SHA，避免修改报告再次改变 head |
| 客户端版本 | 不适用；本次不修改小程序运行代码 |
| 验收环境 | 本地 Node.js 门禁 + GitHub Pull Request CI |
| 验收角色 | 仓库贡献者、评审者、维护者 |
| 执行时间 | 2026-10-17 CST |
| 执行人 | Aime |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 不修改小程序运行 UI；补齐主分支已发布 `2026.10.17.88` 设置页在 Pages 原型、截图和摘要中的同步证据 |
| 云函数与数据 | 不修改云函数、集合、索引、权限规则和存量数据 |
| 权限与隐私 | 只读取 PR event 中的标题、描述和 Git diff；不读取 Secret，不执行描述内容 |
| Pages / 文档 | 更新贡献规范、GitHub 治理说明、PR 模板、验收报告模板及设置页同步证据 |
| 部署与回滚 | PR CI 规则与 Pages 证据会随合并发布；不触发 CloudBase 部署和微信上传，回滚本提交即可撤销 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 八段描述和统计一致 | 正常 | 完整标题、描述、报告文件和 diff 统计 | 调用 `validatePullRequest` | 无错误 | 5 个定向用例通过 | `tests/pr-description-gate.test.ts` | PASS |
| 缺失测试章节与未完成清单 | 根因反例 | 删除测试章节并保留未勾选项 | 调用门禁 | 同时报告全部缺口 | 返回标题、章节、清单和统计错误 | 同上 | PASS |
| 报告路径未提交 | 边界 | 描述填写不存在的仓库路径 | 注入 `fileExists=false` | 拒绝合并 | 返回“验收报告文件不存在” | 同上 | PASS |
| 二进制文件统计 | 边界 | numstat 含 `-/-` | 解析最终 diff | 文件数计入、行数不误加 | 3 files, +13/-2 | 同上 | PASS |
| Dependabot PR | 兼容 | `github.actor=dependabot[bot]` | 触发 CI | 跳过人工描述门禁，保留其他测试 | 工作流条件已锁定 | `.github/workflows/ci.yml` | PASS |
| 描述编辑重验 | 回归 | PR 创建后修改标题或正文 | 触发 `pull_request.edited` | 重新执行描述门禁，避免旧 event 结果掩盖新描述 | 工作流 `edited` 事件与治理断言均已锁定 | `.github/workflows/ci.yml`、`scripts/check-project-governance.mjs` | PASS |
| 真实 PR 事件 | 端到端 | 分支推送并创建 PR | GitHub Actions 读取 event、校验 body 和 `base...head` | 描述完整时通过，漂移时失败 | PR #272 首轮已通过描述门禁；后续 `check:ui-sync` 暴露主分支证据漂移并已补齐 | [Actions 39039962628](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39039962628) | PASS |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | PASS | 95 个测试文件、1149 个用例通过；17 页面构建通过 |
| `npm run coverage` | PASS | `cloud.ts` lines 90.24%、branches 88.43%、functions 95.93%、statements 88.94% |
| `npm run audit:all` | PASS | 根项目与云函数 0 高危；微信上传工具 5 个已评估例外有效至 2027-01-15 |
| `git diff --check` | PASS | 无空白错误 |
| PR checks | BLOCKED | 描述门禁已在 Actions 39039962628 通过；该轮暴露的主分支设置页证据漂移已修复，等待最新 head 复跑 |

## 5. 端到端执行记录

1. 本地以完整描述调用门禁，确认八段结构、固定测试命令、影响范围、报告文件和最终 diff 统计全部通过。
2. 以缺失章节、未勾选清单、错误标题、统计漂移和不存在报告路径注入失败，确认一次返回全部可修复问题。
3. 推送并创建 PR #272，确认 GitHub `pull_request` event 能正确注入标题、描述、base SHA 与 head SHA，描述门禁通过。
4. 首轮后续全量 CI 暴露主分支 `2026.10.17.88` 设置页与 Pages 证据漂移；已同步 schema、截图、摘要和对应契约测试，本地全量门禁通过。
5. 最新 head 推送后仍须等待全部 PR checks 全绿，结果以 PR 页面为准。

**执行结论**：`PASS`

**说明**：真实 PR event 已验证描述门禁正常生效；PR 整体是否允许合并继续由最新 head 的全部必需检查决定，报告不自引用最终 SHA，避免更新报告再次改变验收对象。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| PR CI | [Actions 39039962628](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39039962628) | 描述门禁 PASS；全量 CI 待最新 head 复跑 | 首轮确认真实 PR event 接线有效，并暴露主分支 UI 证据漂移 |
| main CI | 待合并 | BLOCKED | 最终 main SHA 再核验 |
| Pages | 待合并 | 待发布 | 合并后回读 `2026.10.17.88` 设置页证据 |
| CloudBase | 待合并 | 预期安全跳过 | 本次无云函数、数据库和规则变化 |
| 微信开发版 | 待合并 | 预期安全跳过 | 本次无小程序产物变化 |

## 7. 风险与回滚

- 剩余风险：文本门禁可以验证结构和证据路径，不能替代评审者对报告真实性与测试质量的判断。
- 监控与观察：以 PR `CI / validate` 结果和报错明细为准；Dependabot 仅跳过描述门禁，不跳过原有测试与安全审计。
- 回滚步骤：回滚本提交，CI 即恢复原流程。
- 数据恢复：不适用；无数据写入和迁移。

## 8. 最终结论

真实 PR event、负向用例、本地全量门禁、覆盖率与安全审计均已通过；最新 head 的 PR checks 和合并后 main 工作流仍须保持全绿，才能完成最终交付。
