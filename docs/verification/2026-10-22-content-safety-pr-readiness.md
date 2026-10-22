# 2026-10-22 内容安全与媒体审核 PR 就绪记录

## 结论

`feat/launch-compliance-20261021` 已完成可本地复现的内容审核、媒体待审状态、可信回调和
CloudBase 部署契约。本记录仅证明代码与自动化门禁状态，不证明目标云环境、微信公众平台或物理真机已验收。

当前结论：**代码可进入 Draft PR；部署、真实回调、普通成员写链路和双真机继续 BLOCKED。**

## 实现范围

- 昵称、活动标题/说明、俱乐部公开资料统一使用 `msgSecCheck` v2；长正文按单次
  2500 字符限制完整分块，审核在事务外执行，提交事务重新校验内容摘要与业务版本。
- 新媒体登记调用 `mediaCheckAsync` 后保持 `pending`；只有当前 generation、canonical
  文件和 SHA-256 绑定明确为 `pass` 才允许激活。客户端有限轮询、最多一次重提，失败保留旧图。
- `/content/callback` 支持微信 GET URL 校验和 JSON 安全模式 POST。坏签名/坏消息返回
  4xx，账本尚未可见和存储故障返回 5xx，重复终态回调幂等。
- `content-callback`、`content_media_checks`、全拒绝 ACL、稳定扫描索引、三项回调环境变量、
  声明式网关应用及路由回读已进入 CloudBase 配置和 CI。

## 本地验证

| 范围 | 结果 |
| --- | --- |
| 统一内容与回调协议 | 18/18 |
| `activity-admin` | 136/136 |
| `club-application` | 62/62 |
| `profile` | 104/104 |
| Profile 图片解码与重编码 | 3/3；`sharp@0.35.5` |
| 客户端全量 Vitest | 105 个文件，1350/1350 |
| CI 选择与云包契约 | 22/22 |
| 旅程证据与敏感字段契约 | 98/98 |
| bootstrap、部署与环境配置 | 178/178 |
| 小程序部署与发布契约 | 37/37 |
| 完整 `npm run validate` | 通过；15 个云函数包、部署包校验与 17 页面构建完成 |
| `npm run coverage` | statements 83.06%、branches 77.16%、functions 81.68%、lines 86.44% |
| `cloud.ts` 覆盖率门禁 | lines 90.80%、branches 88.34%、functions 96.73%、statements 89.93% |
| 依赖安全审计 | 根包与 15 个云函数包均为 0 漏洞；上传工具 5 个精确 allowlist 告警经 dry-run 确认无可用修复，例外到期 2027-01-15 |
| 设置页双端 UI 同步严格门禁 | 通过；版本 `2026.10.22.2`，review 仍为 `blocked` |
| TypeScript 类型检查 | 通过 |
| 云函数部署包自包含校验 | 通过 |
| `git diff --check` | 通过 |

这些测试使用 Mock、内存数据库或静态契约，不是 CloudBase、微信开发者工具或真机 E2E。

独立代码审查共提出 12 个 P1，另由客户端本地复核发现 1 个 P1，均已修复并纳入回归：

- Strava 刷新凭证明确失效后的状态收敛、撤销入口、补偿状态展示，以及连接态刷新失败后的“重试”路由。
- 内容审核响应类型严格校验，媒体重提的 generation fence、状态与次数限制。
- 唯一俱乐部新媒体必须使用已审核 canonical 登记；入口测试夹具同步覆盖真实登记和激活协议。
- 共享隐私/内容协议消费者部署范围、回调密钥临时配置权限、网关 domain 回读。
- 统一协议、媒体转换与公开同意测试全部进入 `validate`。

最终开放审查缺陷为 0。Group 5 自动审查未产出可用文件，客户端范围由本地逐项复核完成，不能表述为对应自动分组成功。

微信开发者工具只读运行补充结果：

- 完整 17 路由运行在首个活动页因“目标页面未就绪”终止，`outcome=failed`，0 条路由完成。
- 设置页单路由只读诊断成功回读 `2026.10.22.2` 和“隐私授权与内容安全保护升级”，并生成无个人标识的脱敏视觉证据。
- 单路由结果不能替代完整 17 路由、目标云部署回读、普通成员写链路或物理真机验收。

## 部署前配置

`cloudbase-production` 需由环境负责人配置：

- Secret：`WECHAT_CALLBACK_TOKEN`
- Secret：`WECHAT_CALLBACK_AES_KEY`
- Variable：`WECHAT_APP_ID`

微信公众平台消息推送配置使用目标环境 `/content/callback` HTTPS 地址、JSON 数据格式和安全模式。
不得把值写入仓库、PR、日志或验证材料。

## 未执行

- 未部署 `content-callback`，未应用或回读 `content_media_checks`、索引及 `/content/callback`。
- 未在微信公众平台完成 GET URL 校验，未收到真实 `wxa_media_check` 安全模式回调。
- 未验证真实头像、背景、活动图、群二维码或俱乐部图片的 pending/pass/review/risky 全链路。
- 当前未提交工作树的 17 路由 DevTools 真实云运行已执行但失败；未在最终 PR SHA 完成全路由通过。
- 未执行普通成员完整写链路或 iOS/Android 双真机。
- 未变更生产数据，未触发真实资料删除、反馈、Strava 撤销或 CloudBase apply。

以上项目保持在 `docs/high-priority-issues.md`，只能在同 SHA 部署和现场验收通过后关闭。
