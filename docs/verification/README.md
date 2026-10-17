# 验证与发布证据

本目录区分长期可重复执行的验证手册与单次发布记录，避免把一次成功结果误写成永久成立的系统事实。

## 文档类型

| 类型 | 用途 | 维护方式 |
| --- | --- | --- |
| 运行手册 | 定义可重复执行的真实环境验证步骤和证据格式 | 流程、契约或安全边界变化时更新 |
| 发布记录 | 固化指定代码提交的本地门禁、预览、部署和 smoke 结果 | 创建后保持不可变；后续发布新增文件 |
| 外部证据 | GitHub Actions、微信开发版和 CloudBase 的平台记录 | 通过最终 `main` SHA 或平台记录查询，不复制敏感原文 |

## 当前文档

- [PR 端到端验收报告模板](pr-acceptance-report-template.md)：每个 PR 必填的影响范围、测试用例矩阵、自动化门禁、真实路径验收、部署回读和回滚记录。
- [Pages 与微信端到端验收流程](wechat-devtools-e2e.md)：17 路由只读运行、双端截图校准、部署回读及完整验收分层。
- [P0 真实报名旅程](p0-real-registration-journey.md)：完整报名、审批、凭证、取消与重报的现场验证手册。
- [2026-10-16 设计校准与端到端验收](2026-10-16-design-e2e-acceptance.md)：统一设计门禁、13 对脱敏截图、开发版上传回执与部署后同 SHA 模拟器复测。
- [2026-10-16 多轮核心链路与 UAT 前置验收](2026-10-16-multi-round-core-uat.md)：三轮真实云回归、当前旅程 v2 证据工具、写链路与双真机现场 blocker。
- [2026-10-08 资料头像与核心界面发布验证](2026-10-08-profile-avatar-ui-release.md)：默认公开头像、个人中心、浅色主题及相关云函数的发布记录。
- [2026-10-09 核心流程端到端验证](2026-10-09-core-flow-e2e.md)：两轮真实报名主链、数据库审计、失败补偿与剩余 P0 缺口。
- [2026-10-09 报名与活动简化端到端验证](2026-10-09-registration-simplification-e2e.md)：性别、日程费用、无条码凭证、手工签到及优化项。

## 历史归档（不代表当前实现）

- [2026-10-13 官方路线 + GPX 部署验证](2026-10-13-route-embed-gpx-no-oauth.md)：记录 `route-web` / `pages/route-view` 仍存在时的阶段性验收；当前主线已删除官方路线页并改为复制 Strava 路线链接。
- [`../superpowers/plans/2026-10-13-route-embed-gpx-no-oauth.md`](../superpowers/plans/2026-10-13-route-embed-gpx-no-oauth.md)：历史实现计划，保留追溯价值，不再作为现行方案。
- [`../superpowers/specs/2026-10-13-route-embed-gpx-no-oauth-design.md`](../superpowers/specs/2026-10-13-route-embed-gpx-no-oauth-design.md)：历史设计稿，描述的是旧的 Embed / `web-view` 方案。
- [`../evidence/ui-sync/2026-10-13-route-embed-gpx-no-oauth/README.md`](../evidence/ui-sync/2026-10-13-route-embed-gpx-no-oauth/README.md)：旧路线页与当时 UI 同步截图，仅用于审计留档。

## 记录规则

1. 只记录实际执行的命令、提交、环境标识、稳定状态和脱敏结果。
2. 未执行的真机、权限或端到端场景必须明确标记为“未执行”，不能由单元测试推断。
3. 不保存密钥、token、真实 `openid`、手机号、OAuth 参数、密文、二维码或原始用户截图。
4. GitHub CI 和自动上传结果以最终 `main` SHA 查询；避免为补写运行编号再次触发文档提交和部署。
5. 单次发布记录不能替代产品需求、数据契约或运行手册。
