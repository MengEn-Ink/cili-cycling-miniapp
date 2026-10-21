# 官方依据与本轮核验记录

核验日期：2026-10-21。本文只记录官方规则和可观察事实；后台审核状态仍需登录正确账号后核对。

## 官方资料

| 编号 | 官方来源                                                                                                                        | 本轮核验内容                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S1   | [工信部 APP 备案通知](https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2023/art_920db564162e4312916a01bed6540ad8.html)             | 境内服务备案、主办者真实信息、编号展示及查询、违法内容监测和处置                                                                               |
| S2   | [微信备案操作指引](https://developers.weixin.qq.com/miniprogram/product/record/record_guidelines.html)                          | 个人/非个人证件、属地材料、核身、平台初审、短信核验和管局审核                                                                                  |
| S3   | [微信备案服务内容选择](https://developers.weixin.qq.com/miniprogram/product/record/receord_category.html)                       | 工具含预约/报名、体育与交通“自行车”的适用范围、个人/单位条件                                                                                   |
| S4   | [微信备案服务内容标识](https://developers.weixin.qq.com/miniprogram/product/record/record_review.html)                          | 服务内容与属地要求，以平台/管局实际审核结果为准                                                                                                |
| S5   | [微信开放服务类目](https://developers.weixin.qq.com/miniprogram/product/material/)                                              | 工具预约/报名、体育场馆/培训/赛事、社交笔记/社区范围和材料                                                                                     |
| S6   | [微信隐私填写说明](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/)                                    | 现网与提审隐私入口分别填写和生效                                                                                                               |
| S7   | [微信隐私项目映射](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/miniprogram-intro.html)              | 主动选点/文件/图片、头像昵称、手机号、剪切板映射，用户权益、期限和纯文本附件                                                                   |
| S8   | [微信隐私授权指南](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)               | 官方自动弹窗、同意与拒绝、缺失声明导致接口禁用；清授权状态不等于删云数据                                                                       |
| S9   | [wx.getPrivacySetting](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/privacy/wx.getPrivacySetting.html)         | `needAuthorization=false` 也可能是后台未声明，不能据此判配置通过                                                                               |
| S10  | [msgSecCheck v2](https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck.html)         | 云调用、可信 openid、scene、文本上限、pass/review/risky、配额/访问时效和错误码                                                                 |
| S11  | [mediaCheckAsync v2](https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_mediacheckasync.html) | 返回 trace 不是 pass；异步结果、文件格式、可下载地址与回调绑定                                                                                 |
| S12  | [微信消息推送](https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/message-push.html)                     | HTTP 验签、安全模式解密和 AppID 验证；云函数模式当前仅支持客服消息                                                                             |
| S13  | [微信 button](https://developers.weixin.qq.com/miniprogram/dev/component/button.html)                                           | `openSetting`、`feedback` 和后台“客服反馈”收件，不自动发送                                                                                     |
| S14  | [Strava Authentication](https://developers.strava.com/docs/authentication/)                                                     | scope、token、回调、刷新和撤销；不删除本地凭证冒充撤销                                                                                         |
| S15  | [个人信息保护法，网信办转载中国人大网](https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm)                                | 第十五、十七、十九、二十一、二十五、二十八至三十九、四十五至五十、五十五至五十六条；同意/撤回、必要期限、受托与公开、敏感/跨境、删除和影响评估 |
| S16  | [微信运营规范](https://developers.weixin.qq.com/miniprogram/product/)                                                           | 名称/服务一致、用户数据、内容安全、完整性、备案信息和不规避审核                                                                                |

平台权限和类目结论仅依据官方规则；未用社区问答替代账号资格判断。备案指引与开放类目是不同表，不能把个人备案允许某服务内容推断为该主体的小程序服务类目必获批准。

2026-10-21 再次回读 S14：Strava 自 2026-06-01 推荐 `POST /oauth/revoke`，应用使用 HTTP Basic 认证，可撤销 access token 或 refresh token。HTTP 200 空响应为成功，包括未找到该 token；关联的两类 token 一并撤销。HTTP 401 表示应用认证缺失或无效，不能当作撤销完成；HTTP 503 可重试。旧 `/oauth/deauthorize` 将于 2027-06-01 停止支持。本轮撤销实现据此采用可幂等重试的官方语义，目标环境实际调用仍待验收。

同日回读 S11/S12：图片结果在 30 分钟内异步推送，`trace_id` 不代表通过，`openid` 对应用户需在近两小时访问过小程序；WebP 不在支持图片格式中。安全模式验证四项 `msg_signature`，解密校验 AppID；普通云函数消息推送当前仅承诺客服消息。已用官方公开样例独立验证签名、AES、填充和消息边界，这只证明样例与算法要求，不能当作本轮实现或真实回调已验收。

## 源码观察

| 位置                                                                           | 实际观察                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `miniprogram/app.json`                                                         | 17 路由；`requiredPrivateInfos=["chooseLocation"]`；没有内嵌网页或新增注销页                |
| `miniprogram/pages/settings/index.ts`、`.wxml`                                 | 通知、官方隐私说明、安全缓存清理；无完整资料删除与 feedback 按钮                            |
| `miniprogram/pages/profile-edit/index.wxml`                                    | 头像选择、昵称、手填实名、性别、本人电话、紧急联系人、可选背景；头像选择后立即保存          |
| `miniprogram/pages/admin/activity-edit/index.ts`                               | 选择 GPX、图片、地点；Strava 授权链接复制；不能当作真实设备导入通过                         |
| `miniprogram/repositories/cloud.ts`                                            | 保留 profile/getPhoneNumber 动作；源码未发现当前运行页面使用手机号组件                      |
| `cloudfunctions/profile/index.js`、`store.js`、`core.js`                       | 本人资料/媒体读写和加密；无完整删除任务；头像默认 public                                    |
| `cloudfunctions/profile/media-upload.js`                                       | staging/canonical、验证图片格式/摘要、归属和意图；未接入内容安全审核                        |
| `cloudfunctions/shared/use-cases.js`                                           | 报名快照含昵称、掩码和紧急联系人姓名；单删 profile 会遗留副本                               |
| `cloudfunctions/activity-read/index.js`                                        | 缺 profile 的参与人可能回退报名快照昵称；删除须同时抑制回退                                 |
| `cloudfunctions/profile-media-cleanup/core.js`、`store.js`                     | 精确对象删除、租约、有限重试；只验证资料引用，不自动证明活动/俱乐部跨引用安全               |
| `cloudfunctions/activity-admin/use-cases.js`                                   | 状态下架、凭证失效、容量和审计；不能放宽活动删除为违规处置捷径                              |
| `cloudfunctions/strava-bridge/core.js`、`index.js`、`strava-callback/index.js` | 请求 read scope；账户摘要与 token 云端加密保存；start/status/importRoute；未提供 disconnect |
| `cloudbaserc.json`                                                             | 当前公开网关仅 Strava callback；尚无可信媒体审核 HTTP 回调                                  |
| `docs/cloudbase-schema.md`、`DESIGN.md`                                        | 已确认本人/审核管理员完整资料，其他骑友昵称，司机电话公开；不构成信息主体单独同意证据       |

以上为源码和配置事实，不代表目标环境逐字段回读、部署或普通成员实测。

## 后台与环境证据

- 材料阶段 `https://mp.weixin.qq.com/` 显示登录入口；之后用户明确已登录并授权继续办理。工具确认存在公众平台会话，但两次读取连续超时；桌面观察和一次恢复仍为持续空白页，未取得账号控制台字段。
- 主体类型、认证、备案、类目、现网/提审隐私、消息推送和客服反馈仍为未核验。没有进行备案填报、核身、短信确认或提审操作；用户无需因工具超时重复登录。
- 本轮没有读取主体证件、负责人私人联系方式、生产凭证或删除真实用户资料。
- 产品设计已获用户批准，正在独立分支 `feat/launch-compliance-20261021` 实施；独立测试工程已提交[草稿 PR #333](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/333)，所需 CI 与 CodeQL 通过，尚未合入。材料阶段“没有开放 PR”的观察不代表当前状态。
- 最新主线 `2251479d5a7b3184d59ea833c9130ac077871252` 的[CloudBase 部署](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/39559182239)已回读为 `completed/success`；该版本尚不包含本轮隐私产品实现，工作流成功不证明普通成员和双真机验收。
- 既有开发者工具读取结果详见[实测报告](../../verification/2026-10-21-wechat-e2e-and-launch-readiness.md)，保持 `blocked`；材料编写不改变普通成员、双真机和媒体验收缺口。

## 证据保存规则

证件、后台原始页面、用户姓名电话、媒体链接、令牌和真实反馈原文只进入私人受控路径；公开仓库仅存材料模板、来源链接、计数、布尔状态和脱敏结论。审核截图必须标明是提审版本运行图还是设计原型，不能混用。

后续后台证据记录最少包含核验时间、操作者角色、目标 AppID、事项、结果与受控附件定位。审批、提审、公开发布和真实删除应另行留实际回执；本地测试和打开页面不能替代回执。
