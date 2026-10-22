# 骑行影像志实施与端到端验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | [#342](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/342) |
| 部署 SHA | `f3071cbfe4465695579990a1fb84b1d7edac6455`；PR head `9663e3aa`。主线干净运行与 UI 内容摘要绑定，设计安全修复未改变正式 UI 内容 |
| 客户端版本 | `2026.10.22.2` |
| 微信上传版本 | `0.0.344.1`，不可变 receipt 对应上述部署 SHA |
| 验收环境 | 正式线上 Pages、微信开发者工具、目标 CloudBase |
| 验收角色 | Pages 合成骑友/管理员；DevTools 已登录管理员 |
| 执行时间 | 2026-10-22；本地 13:55–14:50，线上 14:59–15:07 CST |
| 执行人 | 自动化代理；物理设备和普通成员现场验收未执行 |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 17 注册路由保留；16 业务页面摄影编辑式长屏；头像与背景即「我的」名片；旧名片地址转跳；活动纵向列表、行程票据、表单与审核状态同步 |
| 云函数与数据 | profile 背景选填；七项报名资料、头像和媒体归属校验保留；不新增业务字段 |
| 权限与隐私 | 本人/审核管理员完整资料与其他骑友昵称规则保留；凭证仅分享公开活动；截图不透明脱敏 |
| Pages / 文档 | 六个正式 Pages 文件、设计规范、17 路由双端证据及内容摘要更新 |
| 部署与回滚 | 受保护 PR→main CI→Pages/CloudBase/微信开发版；回滚对应提交及 profile 函数，存量资料不迁移 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 背景选填 | 根因反例/空值 | 合成七项完整资料 | 无背景首次保存、移除后保存 | 完整度 100%，头像与归属限制保留 | 先失败后修复；资料核心 42 项通过 | `cloudfunctions/profile/core.node-test.js` | PASS（契约） |
| 名片兼容 | 存量 | 旧名片地址 | 进入旧路由 | 进入「我的」，无独立入口 | Pages 与 DevTools 实际转跳 | 新双端证据 capability-card | PASS |
| 活动日期/密度 | 正常/回归 | 多日期合成活动 | 日期选择→紧凑→摄影 | 保留选择并定位同一活动 | 21 项领域/控制器用例通过；双布局锚点存在 | `tests/activity-home-timeline.test.ts` | PASS（契约） |
| 报名至取消重报 | 正常/边界 | Pages 合成活动 | 审核报名、公开加入、满员候补、取消确认、重报 | 进入正确行程状态，候补无有效凭证 | 真浏览器点击通过 | 56 项浏览器验收 | PASS（Pages） |
| 审批/签到 | 正常/异常 | Pages 管理员状态 | 通过→签到确认；空驳回原因 | 已通过/已签到；空原因阻断 | 真浏览器点击通过 | 56 项浏览器验收 | PASS（Pages） |
| 媒体上传锁/重试 | 失败恢复 | Pages 上传中/失败 | 点击保存或重试 | 整表锁定；原图保留、可重试 | 审查发现失败后修复并复验 | `tests/cycling-image-journal-pages.test.ts` | PASS（Pages） |
| 长地址/窄屏 | 边界 | 340/375/430 手机画布 | 详情封面、Strava 地址＋、二维码提示 | 内容可见，操作不被裁切 | 修正 aspect ratio/min width/提示换行；51 项通过 | 新 Pages 截图 | PASS |
| 凭证分享 | 隐私/回归 | 合成队长凭证 | 分享 | 只有活动标题和编码地址 | 不含队伍、本人编号/实名/电话；提示一致 | `tests/credential-share.test.ts` | PASS（契约） |
| 真实云 17 路由 | 只读运行 | 现有管理员 | 官方 runner 读取、截图、状态核对 | 加载正常，无运行异常 | 27/27、17 路由、零异常；公开媒体样本缺失 | 新双端脱敏证据 | BLOCKED（总体） |
| 普通成员完整写链路 | 完整 E2E | 普通成员与隔离数据 | 创建→发布→报名→审批→凭证→取消→重报及回读 | 状态、人数、审计和补偿正确 | 缺现场身份及隔离环境证据 | 高优清单 | BLOCKED |
| 双真机/Strava/GPX | 现场验收 | iOS、Android 与 OAuth 配置 | 权限、上传、导航、弱网、授权导入 | 双端实际完成 | 当前条件不足；模拟器不替代 | 高优清单 | BLOCKED |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | PASS | 1365 项 Vitest、13 云包、全部 Node 门禁、构建与治理；既有 unused eslint-disable 一条 warning，零错误 |
| `npm run coverage` | PASS | 1365 测试通过；总行 86.55%、分支 77.47%；cloud.ts 行 91.02%、分支 89.00% |
| `npm run audit:all` | PASS | runtime/云函数零漏洞；工具五项已评估无上游修复告警，例外到 2027-01-15；固定 npm 11.21.1 修正旧报告错误修复标记 |
| `git diff --check` | PASS | 无 whitespace 问题 |
| `check:design` | PASS | 97 双端变量、15 对比度组 |
| `check:ui-sync -- --strict` | PASS | 新 17 路由双端截图与实际内容摘要一致，零 UI 漂移 |
| `check:governance` | PASS | 17 页面、引用、统一上传、源码卫生与 Actions 安全基线一致；未删除真实验收阻塞 |
| PR checks | PASS | [CI](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39736732366)、[CodeQL](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39736624503)；告警归零，两个安全审查线程自动关闭 |
| 主线门禁 | PASS | [main CI](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39737262567) 全量验证、覆盖率、安全审计通过；[main CodeQL](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39737262120) 通过 |
| 正式线上浏览器 | PASS | 部署后 56/56、三宽度 51/51；零脚本错误、横向溢出、过小控件和图片失败 |

## 5. 端到端执行记录

1. 按批准设计适配正式 Pages 与小程序，保持后端接口和权限规则。浏览器审查暴露历史按钮、上传锁和内容裁切，修复后 56/56 项通过；340/375/430 共 51 项检查通过。
2. 官方微信 runner 在 2026-10-22 14:08–14:09 实际读取云端，版本 2026.10.22.2，Git `7790c48d1ed05346ea1af53c66e4048b7e35bf6d`、dirty=true。UI 摘要 `sha256:820c9de49872cb98489fc1ebddad88e990c3f2b775afcc1e099c1e0ba9fca86f`。
3. 27 项检查通过、零异常、17 路由，头像、本人背景、活动封面、编辑媒体、路线和俱乐部状态可读。一次 IDE 重编译就绪失败保留在私有日志；完成构建后复跑通过，不复用失败运行证据。
4. 公开骑友媒体当前只有安全空态，不能视为媒体样本通过。原始截图和个人资料仅私有留存；公开 34 张图片按不透明矩形脱敏。差异和坐标见 [双端证据](../evidence/ui-sync/2026-10-22-cycling-image-journal/README.md)。
5. 干净提交 `84e4271d25d9ca78275aae68b06203b57d09eeb6` 复跑同样 27/27、17 路由、零异常，dirty=false，UI 摘要相同。导出设计稿改为 DOM 克隆、状态白名单与完整替换，并删除共享页壳冗余处理器；最终 CodeQL 零新增告警，设计稿 56 画面、39 交互复验通过。
6. PR #342 于 14:57 CST 合入。线上六个正式资源的 SHA-256 与部署 SHA 全部一致；Google Chrome 对线上 Pages 实际点击 56/56，通过 340/1440 的 17 路由覆盖；340/375/430 共 51 项视口、触控和图片检查通过。合成数据交互不执行云写入。
7. 云函数部署和目标环境/媒体密钥验证后，15:02–15:04 CST 在干净主线 `f3071cbf` 复跑 DevTools：27/27、17 注册路由覆盖、零异常、dirty=false，UI 摘要一致。公开骑友媒体样本依然缺失，总 outcome=`blocked`。此次运行不覆盖普通成员写链路或双物理设备。
8. CloudBase 整体部署于 15:06 CST 完成，profile 逐项部署验证通过，六个关键函数密钥对账通过；俱乐部申请真实写入 smoke 八阶段通过且测试数据已清理。15:07 CST 在线截图集验证 17 组、34 张图片全部加载、零溢出和脚本异常。

**执行结论**：Pages PASS；真实云只读可执行项 PASS；完整端到端 BLOCKED。

**未执行或阻塞说明**：普通成员完整写链路、物理 iOS/Android、公开媒体以及完整数据库/存储规则现场回读仍由项目验收负责人通过 [高优清单](../high-priority-issues.md) 继续验证。此次函数和关键密钥部署回读通过，不扩大为全部基础设施或完整 E2E 通过。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | [39737262567](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39737262567) | PASS | `f3071cbf` 全量 validate/coverage/audit，通过后触发部署 |
| Pages | [39737261604](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39737261604) · [正式页面](https://mengen-ink.github.io/cili-cycling-miniapp/#profile) | PASS | Pages build 回读完整 SHA；六资源 SHA-256 6/6 一致；线上 56/56、51/51 |
| CloudBase | [39737420074](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39737420074) | PASS | profile 部署并验证，六个关键函数密钥对账与环境 `cloudbase-d0gizacy77a1ab017` 回读通过；俱乐部 smoke 八阶段通过且清理完成；数据库/存储 apply 本次安全跳过 |
| 微信开发版 | [39737420151](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39737420151) | PASS | receipt schemaVersion=1，mainSha=`f3071cbfe4465695579990a1fb84b1d7edac6455`，version=`0.0.344.1`，robot=1，createdAt=`2026-10-22T06:59:55.000Z` |

线上六资源摘要（2026-10-22 14:59 CST 回读）：

| 资源 | SHA-256 |
| --- | --- |
| index.html | `98bb17594e61d7cb88fae1881e5489b5918d44fef1ae107840a560059024d525` |
| styles.css | `633a774e2ad38ae722b4eabc21ae569f7ef0c00060d7f9bfa5d50b6fa9e61a61` |
| app.js | `8247a2a55ad275b8642414d61cc129d34eb57ad7d6cb611e8630cbd233b6d281` |
| delivery-center.js | `8d1c98fb5271c380756e35a5075e270e7f942928de23f8371cdc993812c3b84b` |
| schema.js | `c59de1cbdb036536b6cee6e19e6f4fb79da7696124f5efd70a857d8c26f8bb02` |
| templates.js | `f127946a99286e679cb6ac64befc4d5c2c0cbb44a945bcda76ff40bd3b360d24` |

最终成果：[我的名片](https://mengen-ink.github.io/cili-cycling-miniapp/#profile)、[活动影像](https://mengen-ink.github.io/cili-cycling-miniapp/#activities)、[17 路由双端截图集](https://mengen-ink.github.io/cili-cycling-miniapp/evidence/ui-sync/2026-10-22-cycling-image-journal/)。

## 7. 风险与回滚

- 剩余风险：双真机、完整写链路、公开媒体验收与 OAuth 配置尚有阻塞。
- 监控与观察：对照真实运行版本、云端错误、媒体解码、报名计数和重复操作补偿。
- 回滚步骤：通过修复 PR revert 本轮 UI/背景修复，正常 CI 部署原生与 profile；不直接修改 main。
- 数据恢复：无 schema 迁移或数据删除，不适用。

## 8. 最终结论

实现已合入 `f3071cbf`，Pages、CloudBase 和微信开发版已部署；线上交互、六资源回读、主线工程门禁、真实云只读可执行项和俱乐部写入 smoke 通过。普通成员完整写链路、双真机、公开媒体与 OAuth 等 P0 保持 BLOCKED；不具备体验版晋级或提审验收结论。
