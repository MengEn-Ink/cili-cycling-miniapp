# CI 第一批：PR 元数据更新复用源码证据

日期：2026-10-26。已同步 `origin/main@85cbc8f1`。独立 PR 检查治理，不触发生产发布或微信上传。

仅 `edited` / `labeled` 尝试复用。证据必须绑定仓库、PR、head SHA、base SHA、实际合并 tree、校验器摘要、全部锁文件摘要、Node 主版本、runner 平台、source 事件、CI run / attempt 以及实际 Harness 报告摘要。当前 checkout 必须是预期 base/head 的合并，或包含 base 的 head。读取 GitHub 工作流与实际 attempt，确认 `affected-pr` 成功且 Harness 步骤实际执行成功，再验证不可变 archive 摘要、文件清单和 Harness 成功内容。

fork、无证据、旧 schema、下载失败、内容漂移、取消运行、失败源码 job 或 skipped Harness 均正常重跑 affected。旧运行整体失败但源码 job 实际成功时可复用，支持只修 PR 描述后恢复 required validate。查询有界且不等待活动源码 job；证据不送入带部署密钥的工作流。

source 与 metadata 并发组隔离，描述或标签更新不取消源码运行。每次仍检查 PR 描述并聚合稳定的 required `validate`，机器人描述例外保持现有边界。命中证据时跳过根依赖安装和 Harness affected；main 的 validate、coverage、audit 继续完整运行。

## 验证

- PASS：内容、head/base、tree、校验器、锁文件、旧 schema、run/attempt、平台和 Harness 摘要反例。
- PASS：源码 job 成功而描述失败、fork、取消、下载失败、缺失/篡改证据及未执行 Harness 回退。
- PASS：真实 Git 内容身份、checkout 不匹配拒绝；CLI 生成实际 Harness 证据并经真实 zip 校验。
- 首次 GitHub source run 的 Harness 已通过，但生成证据时暴露 fixture 的 mode 与实际报告不一致；实际为 `github-actions`。已用 Harness 自身生成器重现三个失败用例，再修复接受该 mode，并拒绝 `local` / `run`。后续远端实际命中另行核对。
- PASS：27 项源码证据与 CI 契约；1294 项 Vitest、全量 `validate`、覆盖率、high 审计、治理和严格 UI 同步。
- NOT_EXECUTED：生产发布、真机与普通成员写链路。本地 fixture 不证明 GitHub 真实元数据事件已命中复用，远端验证另行记录。

UI 同步只修复最新主线不可达的 `syncedThrough` 引用至 `85cbc8f1`；采用该主线截图、采集时间与源/Pages 摘要，未修改原图。无真实资料或原图公开。原基线全量结果如上，同步后的最终预检与真实 GitHub 元数据事件另行核对。
