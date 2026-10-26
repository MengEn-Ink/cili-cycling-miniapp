# 本地分支与源码卫生整理验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| 需求 | 整理本地分支，代码卫生清理 |
| PR | 本地整理，未创建或推送 PR |
| Head SHA | `chore/source-hygiene-20261026`，以本报告所属提交为准 |
| 基线 | `origin/main@879ea813b10e808f9a6a68184f8a8b5f312c978b` |
| 客户端版本 | 不适用；产品文件无差异 |
| 验收环境 | macOS 本地 Git、工程门禁与合成数据原型 |
| 验收角色 | 工程维护；不涉及真实成员写入 |
| 执行时间 | 2026-10-26 CST |
| 执行人 | Agent |

## 2. 影响范围

进入任务时，主工作区位于 `temp-merge-check`，正在合并旧合规分支，存在 13 个冲突和两处额外 WXSS 改动。先保全原始文件、冲突索引、所有分支及五份原有 stash，再退出试合并。额外样式另存为第六份 stash。本地 `main` 已快进到上述基线。

| 维度 | 结论 |
| --- | --- |
| 本地分支 | 删除 9 个已合并分支；原有分支从 12 个收敛为 3 个，加本次工程分支后共 4 个 |
| Worktree | 清理 3 个目录已不存在的登记；仅保留主工作区 |
| 文件权限 | 39 个工程文件从 `100755` 改为 `100644`；逐文件 SHA-256 确认内容相同 |
| 产品与数据 | `miniprogram/`、`cloudfunctions/` 文件内容及权限均与基线一致；未执行云端写入 |
| 同步清单 | 仅修正 `syncedThrough`；摘要、截图、状态标注与采集时间均保留 |
| 本地产物 | 将 `dist/`、`coverage/`、`artifacts/`、`.trae-html-share-packages/` 移到私有恢复目录，未删除原始证据 |
| 部署 | 未推送、未部署、未上传；当前任务交付到本地提交 |

删除依据：

| 本地分支 | 可清理依据 |
| --- | --- |
| `docs/cycling-image-journal-20261022` | 主线祖先 |
| `feat/cycling-image-journal-20261022` | 主线祖先 |
| `fix/visual-polish-20261023` | 主线祖先 |
| `temp-merge-check` | 主线祖先；试合并已退出并保全 |
| `docs/official-miniprogram-reference-adoption` | 整体补丁的稳定 patch-id 与主线 `ac168f06` 完全相同 |
| `fix/cycling-image-journal-ui-sync-main-20261023` | 整体补丁的稳定 patch-id 与主线 `46be487f` 完全相同 |
| `feat/cycling-image-journal-revamp-20261022` | 整体补丁的稳定 patch-id 与主线 `8f1c006b` 完全相同 |
| `fix/cycling-image-journal-devtools-alignment-20261023` | 整体补丁的稳定 patch-id 与主线 `3d492c77` 完全相同 |
| `docs/cycling-image-journal-delivery-20261022` | 已包含于经过补丁核对的 revamp 分支 |

保留分支：

| 分支 | 用途与下一步 |
| --- | --- |
| `main` | 与本次获取的 `origin/main` 一致 |
| `feat/launch-compliance-20261021` | 保留未合并的隐私权益与内容治理工作；后续在最新主线独立解决冲突、验证和评审 |
| `chore/project-skills-library-20261021` | 保留未合并的项目能力库工作；后续独立集成与验证 |
| `chore/source-hygiene-20261026` | 本次工程整理提交 |

权限变更分布：工作流 1 个、文档及既有证据脚本 15 个、工程脚本 9 个、测试 14 个。带 shebang 的可执行入口保留执行权限。产品目录另有 29 个同类权限项，现有发布门禁按路径把纯权限变化视为产品修改，本次恢复其基线权限。

## 3. 测试用例矩阵

| 用例 | 类型 | 步骤与预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- |
| 中断合并恢复 | 失败恢复 | 归档冲突索引和工作区后退出试合并 | 13 个冲突归零，两处样式保存到 stash | PASS |
| 未合并工作保全 | 边界 | 不丢弃独有提交和原有 stash | 两个工作分支、五份原 stash 与新增样式 stash 均保留 | PASS |
| 分支合并核对 | 正常 | 使用祖先关系或整体稳定 patch-id，不仅依赖分支名 | 9 个分支逐项核对，删除前确认归档 bundle 包含原分支 SHA | PASS |
| Worktree 清理 | 边界 | 仅移除 Git 已判定为 prunable 的不存在目录登记 | 移除 3 项，保留唯一实际工作区 | PASS |
| 文件权限卫生 | 回归 | 只改变工程文件模式，内容相同，可执行入口保留 | 39 项内容哈希一致，产品目录无 diff | PASS |
| 私有归档完整性 | 失败恢复 | 校验压缩包内容与 Git bundle | 883 个原工作区文件校验通过；bundle verify 和 Git 连通性检查通过 | PASS |
| 同步基线失效 | 根因反例 | 严格门禁应拒绝不存在的同步 SHA | 原清单引用 `d6332de0aefe81b4aa8d64146729cb265e58d241`，本地无法解析且不属于当前主线祖先 | PASS |
| 同步基线修正 | 回归 | 实际摘要一致时绑定主线 SHA，保留证据记录 | UI 与 Pages 摘要均与原清单一致；仅替换为 `879ea813b10e808f9a6a68184f8a8b5f312c978b` | PASS |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出 |
| --- | --- | --- |
| `npm run validate` | PASS | 87 个 Vitest 文件、1294 个用例；16 页 × 340/375/430 三宽度；工程契约、13 个云函数包测试、部署包一致性与 17 页面构建均通过 |
| `npm run check:ui-sync -- --strict` | PASS | UI 与 Pages 内容摘要一致，未同步 UI 提交为 0 |
| `npm run check:governance` | PASS | 页面、README 引用、媒体上传、源码卫生与 Actions 安全基线一致 |
| `npm run check:release-notes` | PASS | 无产品代码改动，无需业务版本更新 |
| `npm run coverage` | N/A | 无实现或测试内容变化，未重复采集覆盖率 |
| `npm run audit:all` | PASS | 根工程与 13 个云函数包均无漏洞；微信上传工具 4 个已评估例外通过门禁，到期 2027-01-15 |
| `git diff --check` | PASS | 无空白错误 |
| PR checks | NOT_EXECUTED | 未推送或创建 PR |

首轮验证发现产品目录的纯权限变化触发发布说明门禁，随后将权限整理收口到工程目录，并完整复跑。三宽度截图和日志均留在私有恢复目录，既有公开截图未被本次运行覆盖。

同步内容摘要：

- UI：`sha256:06d887c0ae1791be2382a561ba4ab46293ef4ac8070074fb8c8ad5e743cd9e1e`
- Pages：`sha256:89461e3d7e10123a6b78cce68bb929d4a43000574aa29c30e83fe220e50d4688`

## 5. 端到端执行记录

**执行结论**：N/A（工程整理，无新增或修改的产品路径）。

本次仅运行已有单元、契约、工程和合成原型测试。未执行微信开发者工具真实云回读、普通成员写链路、iOS/Android 真机或目标云环境验收。对应 P0/P1 继续按高优问题清单独立留证。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 不适用 | NOT_EXECUTED；本次未推送 | 未将本地结果标为远端验收 |
| Pages | 不适用 | NOT_EXECUTED；原型内容无差异 | 不适用 |
| CloudBase | 不适用 | NOT_EXECUTED；云函数内容无差异 | 不适用 |
| 微信开发版 | 不适用 | NOT_EXECUTED；产品内容无差异 | 不适用 |

## 7. 风险与回滚

私有恢复目录为 `~/.local/share/cili-local-cleanup/20261026-111311/`，目录权限 `0700`。其中包含 `repository.bundle`、原工作区压缩包、冲突索引、分支核对记录、权限清单及本次验证日志。原始恢复材料不纳入 Git。

恢复单个已清理分支时，先从 `branch-cleanup.json` 取得完整旧 SHA，再执行：

```bash
git fetch ~/.local/share/cili-local-cleanup/20261026-111311/repository.bundle <旧完整SHA>
git branch <待恢复分支名> FETCH_HEAD
```

额外样式可通过消息为 `archive: pre-cleanup profile styles 2026-10-26` 的 stash 查找与恢复。四类旧产物在恢复目录的 `ignored-products/` 下。恢复冲突现场时使用已归档的文件和索引在独立副本操作。

权限与同步记录可以通过回滚本次工程提交恢复；无业务数据需要恢复。

## 8. 最终结论

本地分支整理、恢复材料归档和工程权限清理已完成，最终全量门禁、安全审计、严格 UI 同步与治理检查均通过。提交后工作区应无未提交改动；远端发布及高优业务验收仍为 NOT_EXECUTED/BLOCKED。
