# 最终 PR 预检与工作树摘要验收

日期：2026-10-26。范围：A 方案第一批第 1 项，基于 `origin/main@879ea813b10e808f9a6a68184f8a8b5f312c978b`。状态：`LOCAL_VERIFIED / NOT_DEPLOYED`，未合并、未部署。

## 改动与失败路径

- 最终预检先拒绝未提交内容、缺失标题/描述、中文补充占位、无主线基准、无有效报告和过期 diff 统计；失败时不启动耗时检查。
- 成功后调用现有 Harness affected，共用 CI 影响选择器。产品变更先跑 release-notes/settings 版本测试；UI 影响先跑严格同步和治理，局部影响再补全量 validate。
- 描述生成器仅对干净最终提交计算统计。本次 diff 唯一验收报告可自动选择，其他情况必须明确 `--report`；文件 mtime 不再决定报告来源。
- `.pr-body.md` / `.pr-title.txt` 是本地草稿，忽略于 Git；最终预检支持 `--body` / `--title-file` 指向私有文件。
- UI 与 Pages 摘要从实际工作树计算，过滤删除文件，规范文本 CRLF 并保持二进制字节；`ui:digest` 共用同一实现。
- 预检将全量校验生成的原型截图写入忽略的 `artifacts/pr-preflight`，保留已提交证据与最终工作树状态；若检查期间提交或基线改变，预检仍失败。

## 摘要算法迁移与证据边界

旧算法把 PNG 等二进制转换为 UTF-8；该转换会丢失字节信息。本次仅修正摘要算法，不修改产品源码或截图。逐文件核对工作树与 `879ea813` 的 Git blob，所有 UI 文件原始字节完全相等；按旧算法重算主线结果与现有清单完全一致：

| 项目 | 摘要 |
| --- | --- |
| 历史 UI（UTF-8 转换） | `sha256:06d887c0ae1791be2382a561ba4ab46293ef4ac8070074fb8c8ad5e743cd9e1e` |
| 同一内容的新 UI（文本 LF / 二进制原字节） | `sha256:d9122581373e754c5b40de45a53393a39acc961486b39468d371d3b72fff5ff3` |
| Pages（不变） | `sha256:89461e3d7e10123a6b78cce68bb929d4a43000574aa29c30e83fe220e50d4688` |

同步清单的失效 `d6332de0` 引用绑定到可解析祖先 `879ea813`；截图、路由状态、数据脱敏标记、差异说明和原采集时间保持不变。此处是相同源码的算法迁移，未重新采集双端截图，未签发新的真机或旅程证据。历史 receipt 的原摘要不改写，后续验收使用新的算法结果。

## 验证

| 检查 | 结果 |
| --- | --- |
| 真实临时 Git 仓库 UI/Pages 修改、提交、新增、删除、CRLF、二进制、digest 工具一致性 | PASS；先观察旧实现错误通过，再验证修复 |
| 预检/报告选择 Node 用例 | PASS，10 项；覆盖 dirty、占位、统计、主线缺失、mtime、报告歧义和 UI 全量门禁 |
| PR 描述中文占位反例 | PASS；旧实现未拒绝，已加入共用校验器 |
| `npm run check:ui-sync -- --strict` | PASS |
| `npm run validate` | PASS；1295 项 Vitest、16 页三宽度、Node 契约、13 个云函数包和构建通过 |
| `npm run coverage` | PASS；cloud.ts lines 91.02%、branches 89.00%、functions 96.60%、statements 90.06% |
| `npm run audit:all` | PASS；上传工具 4 项已有有期限例外，其余依赖无 high 告警 |
| `git diff --check` / 治理 | PASS；最终提交预检继续复核同一内容 |
| 远端 PR CI / main CI / 部署 | NOT_EXECUTED，待提交推送与合并 |
| DevTools、普通成员写链路、双真机、目标云回读 | NOT_EXECUTED；工程检查不替代这些 P0 验收 |

## 回滚与后续

预检与摘要修复可以整体 revert；回滚算法时需同时恢复同步清单旧摘要。不要仅手工更改摘要或采集时间来消除门禁失败。上传阶段超时、累计发布 receipt 和元数据复用在第一批后续独立逻辑中交付；本项不提供本地证据免除 main CI 的能力。
