# CI 第一批：实际发布基线与累计范围

日期：2026-10-26。已同步 `origin/main@85cbc8f1`，独立发布治理变更；草稿 PR #367，未合并、未调用生产部署或微信上传。

两条发布工作流不再把“上次 workflow 成功”或本次 push diff 当作实际发布基线。成功 receipt 绑定仓库、工作流、运行及 attempt、实际目标 SHA、工具链 SHA、Git tree、基础设施内容摘要、同 SHA main push 成功 CI、环境和实际部署函数。GitHub 下载验证来源运行、不可变 artifact archive SHA256、JSON 内容与 Git 内容；缺失/过期基线默认完整对账，篡改证据阻断。

从最后实际成功目标计算累计差异，包含删除以及跨目录移动的两端。基线之后的失败、取消、UNKNOWN、缺失 outcome 或同运行重试，均强制全量补偿；即使后继源码回滚至基线也不能隐藏部分部署副作用。有验证通过的无副作用 SKIPPED outcome 才可安全跳过，且不更新基线。运行分页按副作用更新时间重新排序，扫描截断时保守完整对账。

排队期间 main 推进时安全跳过过期目标，不改签至未经同 SHA CI 验证的新提交。微信恢复入口仍仅接受长期 verified/promote 清单，并验证历史目标的成功 main CI。上传窗口内 main 推进时记录已经发生的实际上传，阻断旧目标的体验版 receipt；原 schema v1/v2 微信 receipt 保留兼容。发布完成、回读和清理全部成功后才生成实际 receipt，失败保留有界 UNKNOWN outcome。

云端原有逐项部署、密钥对账、数据库与存储回读、全部 smoke 和串行副作用继续保留。实际函数清单包含计划部署及密钥对账触发的重部署。本批没有实施增量 smoke、并发云部署或 DevTools 免检。

## 验证

- PASS：真实 Git 历史覆盖累计删除、跨目录移动、非祖先、首次发布、重复运行、强制全量、内容摘要。
- PASS：注入 GitHub API 覆盖 artifact 篡改、环境/仓库/attempt、成功 CI、缺失、部分失败与回滚、无副作用跳过、跨页历史重试。
- PASS：真实 zip 单文件读取、附加文件拒绝、无效和过大 archive；finalize 覆盖成功、清理失败、SKIPPED 和 scope 目标不一致。
- PASS：全量 `validate`（1294 项 Vitest、16 页 × 三宽度、全部 Node 契约、13 云包与构建）、覆盖率、全依赖 high 审计、治理与严格 UI 同步。发布核心和决策共 35 项专门用例通过。
- 远端首个提交因 `env` 中调用 `success()` 被 GitHub 拒绝，尚未产生任务；已改为该位置允许的 `job.status == 'success'`，并用 actionlint 1.7.12 检查两条部署与 CI 工作流。同步后最终预检与 PR checks 继续复核。
- NOT_EXECUTED：main 发布、CloudBase 实际 receipt、微信实际 receipt、物理真机及普通成员写链路。本地契约验证不能证明生产发布或性能改善。

UI 同步修复最新清单 `syncedThrough` 的失效 Git 引用至 `85cbc8f1`；采用最新主线源码、Pages 摘要、截图与采集时间，未重采集或修改原图。原图和真实用户资料未进入公开报告。
