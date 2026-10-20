# 骑友端旅程 P1 UI 修复验证（2026-10-20）

## 修复结论

本批只改骑友端五个页面，基于 2026-10-20 全量页面交互核对结论，发布版本 `2026.10.20.2`：

- 出发凭证：rejected 状态在票据下方展示“未通过原因”卡片（无填写时给出兜底文案），与“我的行程”票据“查看未通过原因”跳转形成闭环；票据明细补本人完整手机号；需要后援车时在墨黑集合信息块展示司机姓名与完整联系电话；公开骑行名片只用昵称、缺失时显示“匿名骑友”；RE 编号 `white-space: nowrap` 不断行；无样式的 `error-card` 改为全局 `card danger`。
- 活动详情：顶部 state-view 开放重试；返回页面走后台刷新（refreshing/refreshError），不清空已加载内容、不走整页 loading，失败只在顶部显示非阻断重试提示；删除全仓无样式定义的 `route-action--primary` 死类。
- 填写报名：经验三选一中档展示值与提交值统一为“有经验”，端到端打通 wxml、`cloud.ts` 双向映射、mock fixture 与测试；服务端仍只接收英文枚举 `intermediate`，校验不变。活动信息块删除页面白卡覆盖，回归全局墨黑 `.activity-context`。
- 我的行程：集合地点取消两行截断，长地址完整换行；活动标题仍保留两行截断。
- 设置：发布日志标题 32rpx、摘要与功能点 25rpx、行高约 1.7；顶部红色 hero 收口为白卡墨黑标题，行动红仅保留在“当前版本”胶囊。

## 自动化验证

已在当前分支执行：

- `npm run format:check`：通过。
- `node scripts/check-release-notes.mjs`：通过，13 个产品文件已记录发布日志。
- `npm test`：通过，99 个测试文件、1252 个用例全部通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过（仅 1 条与本次无关的历史 warning）。
- `npm run coverage`：通过；All files Statements 81.89%、Branches 75.91%、Functions 81.73%、Lines 85.25%；`cloud.ts` 覆盖率门禁通过（lines 90.91%、branches 89.00%）。
- `npm run audit:all`：通过，0 高危漏洞（fast-glob、request 工具链升级仍为高优清单 P1 跟踪项）。
- `npm run check:design`、`npm run check:ui-sync -- --strict`、`npm run test:ui-sync`、`npm run test:design`、`npm run check:main-package`、`npm run check:governance`、`npm run test:release-notes`：通过；UI 内容摘要按当前代码树重新计算并同步到 `docs/ui-sync-manifest.json`，未改 Pages 原型与截图证据。
- `git diff --check`：通过。

## 关键用例

| 场景 | 预期结果 | 自动化结论 |
| --- | --- | --- |
| rejected 报名进入凭证页 | 票据下方出现未通过原因卡；无原因时展示兜底文案 | 通过 |
| 我的行程票据“查看未通过原因” | 跳转凭证页并看到同一条驳回原因 | 通过（静态契约 + 跳转既有测试） |
| 凭证票据 | 展示本人完整手机号；需要后援车时展示司机姓名与完整电话 | 通过 |
| 公开名片昵称为空 | 显示“匿名骑友”，不回退真实姓名 | 通过 |
| RE 编号较长 | 单行不断行 | 通过（样式契约） |
| 活动详情首屏失败 | state-view 展示重新加载按钮 | 通过 |
| 活动详情返回刷新失败 | 保留原内容，顶部提示可重试，不出现整页 loading | 通过 |
| 报名经验选择“有经验” | 提交 `intermediate`，回显“有经验” | 通过（cloud 仓储往返测试） |
| 长集合地点 | 我的行程票据完整换行不裁切 | 通过（样式契约） |
| 设置页 | 字号/行高符合沸点规格；hero 中性、仅胶囊为行动红 | 通过（token 与对比度契约） |

## 真机验收（合并后执行，未提前标记通过）

1. PR checks 全绿后合并，等待 main CI 与微信开发版 `2026.10.20.2` 自动上传。
2. 普通成员在 iOS / Android 真机覆盖：驳回闭环、凭证手机号与后援车司机电话、弱网下活动详情返回刷新与重试、报名经验选择与回显、长地址换行、设置页字号与对比度。
3. 本批无云函数、数据库、索引或存储规则变更；无需 CloudBase 部署。
4. 开发者工具 / 真机双端截图证据重采仍按高优清单 P1 跟踪，代码通过不等于验收关闭。
