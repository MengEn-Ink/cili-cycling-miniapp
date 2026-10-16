# 高优问题清单

> 最后更新：2026-10-16（CST）
>
> 本文件只保留**尚未完成的实际交付或验收**。已合并 PR、历史 CI 流水账、已关闭问题和被新产品口径取代的方案，以 Git/GitHub 历史为准，不再复制到活跃清单。

## 当前基线

- 代码与 Pages 基线：`main` 最新提交；最近一次已核验基线为 `c16da08`（PR #230，研发交付中心）。
- main CI：run [38833306179](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38833306179) 成功；Pages：run [38833306570](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38833306570) 成功。
- 最近一次已核验微信开发版：run [38695551594](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38695551594) 成功，版本 `0.0.231.2`；是否存在更新版本以微信后台和最新 workflow 为准。
- 云函数：`profile`、`registration`、`activity-read`、`activity-admin`、`admin-review` 已按对应功能 PR 部署；`route-web` 与 `/route/embed` 已确认下线。纯文档、测试和未引用资源清理不触发云函数部署。
- GitHub 实时状态是 PR、分支与 workflow 的唯一事实源；本文件不维护已完成分支清单。

## 当前待办

| 优先级 | 待办 | 已完成 | 剩余关闭条件 |
| --- | --- | --- | --- |
| P0 | 核心活动链路真机验收 | 创建/编辑、发布、报名、审批/自动通过、凭证、名片、Strava、GPX、群二维码和分享海报已有代码、自动化与开发版 | 在 iOS 与 Android 各完成一次完整旅程；核对 Canvas 字体、换行、二维码、照片、受保护媒体回显与地址续签 |
| P0 | 统一视觉与触控验收 | 13 个核心页面已完成浅色主题重构和多轮截图对齐；自动化覆盖 340px 窄屏、44px 触控、高对比与核心视觉契约 | 按 375×812 基线在 iOS 与 Android 真机核对安全区、长标题、小屏退化、系统字体放大和高对比可读性 |
| P0 | Strava / GPX 路线双模式验收 | Strava 公开路线免授权解析、规范化链接复制、GPX 解析与下载已实现；旧 OAuth、`route-web` 和内嵌路线页已退役 | 使用当前开发版完成 iOS/Android 的公开路线解析、GPX 文件选择、Canvas 和下载验收；确认历史 OAuth 数据 dry-run 与备份后再决定是否执行 purge |
| P0 | 云端密钥与媒体链路就绪性 | 媒体 owner/canonical、`PROFILE_MEDIA_PATH_SECRET`、加密与服务端临时地址签发均有测试和部署记录 | 在目标环境回读受影响函数配置并完成真实头像、背景图、活动图、群二维码和路线图 smoke；缺证据时不得宣称线上就绪 |
| P1 | 体验版晋级与 UAT | 开发版自动上传和候选/验证两阶段晋级工作流已具备 | 选择已核验开发版晋级体验版，完成用户验收并留存版本、时间、验收人和结果 |

## 分支与交付约束

- 所有工作从最新 `origin/main` 创建 `feat/`、`fix/`、`chore/` 或 `docs/` 分支，禁止直接提交 `main`，禁止使用含 `aime` 的分支名。
- 同一需求优先复用已有开放 PR，避免重复分支和重复实现；相对 `main` 最终保持一个中文语义提交。
- PR checks、main CI 和按 diff 触发的微信开发版上传全部成功后才算交付完成；涉及云函数、集合、索引或规则时还必须完成对应部署和回读。
- PR 合并后删除来源分支；已合并但残留的远端分支仅在确认无开放 PR、无独立提交后清理。
