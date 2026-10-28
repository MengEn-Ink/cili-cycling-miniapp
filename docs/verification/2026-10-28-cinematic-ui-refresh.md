# 17 路由内容先行 UI 改版验收记录

日期：2026-10-28
分支：`feat/cinematic-ui-refresh`

## 验收范围

- 保持 `miniprogram/app.json` 中 17 条生产路由与既有导航关系不变。
- 保持云函数、repository/service 契约、数据字段、权限和业务状态不变。
- 采用 B「内容先行」统一视觉语言；活动详情使用全宽摄影与上浮摘要 Sheet；表单及管理页面采用稳健单列结构。
- 新增原生微信小程序 `blur-text` 组件，适配按词/按字、方向、延迟、时长、触发、重放、完成事件和动效降级。

## 自动化验证

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 变更文件静态检查 | `standard-lint <全部变更 JS/TS 文件>` | 通过 |
| 全量校验 | `npm run validate` | 通过；包含格式、ESLint、类型检查、全量测试、契约检查、UI Sync、云函数测试与构建 |
| 单元测试 | `npm test` | 通过；90 个测试文件、1381 个测试（初次全量）；BlurText 时序修复后定向 2 文件 9 测试通过，随后 `validate` 再次通过 |
| 设计契约 | `npm run test:design` | 通过 |
| 设计字面量 | `npm run check:design` | 通过 |
| UI 同步 | `npm run check:ui-sync -- --strict` | 通过 |
| 发布日志 | `npm run check:release-notes` | 通过 |
| 空白字符 | `git diff --check` | 通过 |
| 代码评审 | Code reviewer + Bug reviewer | 修复 BlurText 初始化可能重复触发 `complete` 的 P2 时序问题 |

## 关键用例

| 关键用例 | 覆盖场景 |
| --- | --- |
| 17 路由契约 | 页面数量、路径及 capability-card redirect 行为保持不变 |
| 后端契约不变 | 未修改云函数、repository/service 接口、权限和状态机 |
| BlurText 初始化 | observer 早于 attached 时不提前触发 `complete` |
| BlurText 降级 | reduced motion、低性能设备和空文本只完成一次且不阻塞阅读 |
| BlurText 重放 | 新重放会清理旧计时器，避免重复完成事件 |
| 主题契约 | 业务 WXSS 只消费根 token，不新增颜色或字体字面量 |
| 核心页面 | 活动首页、活动详情、报名、行程、凭证、路线分析、个人中心、设置、俱乐部及管理页面保留原 CTA 与功能 |

## 端到端验收

自动化构建与页面契约验证已通过。沙箱不执行 CloudBase 或微信开发者工具人工真机验收；合并后由 GitHub Actions 执行 main CI 与微信开发版自动上传，并以 workflow 日志作为最终部署凭证。此次无云函数或索引变更，不需要 CloudBase 函数部署。

## 回滚

改动收敛为单提交，可通过 revert 该提交整体回滚；不涉及数据迁移和后端兼容处理。
