# 骑行影像志 · 后端能力与设计细则

核对日期：2026-10-22。此文件对应设计提案修订，不代表部署或真机验收。

## 「我的」就是骑行名片

顶部采用一张个人背景、一个独立头像、昵称和性别。背景点击看完整图片，头像独立预览；背景失败时保留深色承托与身份文字，头像失败只降级头像。没有背景时使用无人物的颜色承托，不冒充用户上传的骑行照片。

完整资料页不再重复 100% 卡片；不足 100% 时展示后端的 7 项完整度、缺失项和一个「去完善」动作。7 项为昵称、实名、本人电话、紧急联系人姓名及电话、性别、头像。背景不计入完整度，也不是报名的硬门槛。

普通成员默认没有管理工作台；平台管理员可见活动及唯一俱乐部管理。评审入口的身份选择器位于手机外，只用于比较权限，不成为产品的身份切换功能。

当前 `profile.get` 和 `profile.capabilityCard` 读取本人数据，名片服务仅返回 `profile`、`backgrounds`、`generated_at`，其中展示字段为昵称、性别、头像和背景。没有个人骑行成绩、独立经验档案、个人介绍、关注或任意骑友详情接口。设计删除独立名片页面和所有入口；保留其数据能力供个人中心、本人凭证及授权审核使用。本次没有删除小程序生产路由。

| 页面或操作 | 已有能力 | 修订规则与恢复方式 | 代码依据 |
| --- | --- | --- | --- |
| 个人名片 | 本人头像、背景与基础身份 | 合并至「我的」，不新增介绍、成绩、分享名片或任意骑友主页 | `cloudfunctions/profile/capability-card.js`、`cloudfunctions/profile/index.js`、`miniprogram/pages/profile/index.ts` |
| 资料完整度 | 后端 7 项 readiness | 只在缺失时出现，进度与缺失项一致；背景不计入 | `cloudfunctions/profile/core.js:PROFILE_REQUIREMENTS`、`miniprogram/utils/validation.ts` |
| 头像 | 专用选择、上传与即时保存 | 先设置头像，再编辑整表；选取、上传、保存、预览分别反馈失败，原值保留 | `miniprogram/pages/profile-edit/index.ts:chooseWechatAvatar` 及头像保存流程 |
| 背景 | 最多一张、上传压缩与整表保存 | 16:9 展示；上传中锁定保存；当前稿保留替换，移除流程须先解决下述口径冲突 | `profile-edit/index.ts:chooseBackgroundPhoto/removeBackgroundPhoto/save` |
| 资料刷新 | 当前账号缓存、8 秒期限与迟到响应防护 | 缓存可读，刷新失败明确提示；切换账号不得带出前账号资料；媒体失败单独恢复 | `miniprogram/pages/profile/index.ts`、`utils/profile-page-cache.ts` |
| 报名经验 | `beginner/intermediate/regular` | 新手／有经验／常骑；不提供自由文字经验，额外说明使用备注 | 报名领域 `validateOptions`、`miniprogram/pages/registration-form/index.ts` |
| 集合方式 | `self_drive/support_vehicle`，由活动交通配置决定 | 示例未配置交通分流，仅自行前往；配置分流后才提供后援车选项 | `miniprogram/pages/registration-form/index.ts` |
| 报名结果 | 审核模式 pending；公开且有名额 approved；满员 waiting | 结果页按三种状态区分，候补无虚构排名；未通过或候补不得展示有效出发凭证 | 报名领域、`registration-form/index.ts`、`credential/index.ts` |
| 凭证 | 文字凭证、联络资料、取消及活动分享 | 本人资料完整显示；分享的是活动详情；不提供不存在的保存凭证图、条码核销 | `miniprogram/pages/credential/index.ts:onShareAppMessage/cancel` |
| 通知 | 微信订阅请求 | 按次请求，拒绝后可继续使用；无模板时解释暂无可订阅通知；不承诺永久开启 | `miniprogram/pages/settings/index.ts:manageNotifications` |
| 隐私 | 微信隐私管理 | 打开微信指引；失败提示升级或从系统菜单查看；不新增自行生成的隐私条款 | `settings/index.ts:managePrivacy` |
| 缓存 | 可重建活动、资料、图片缓存 | 清理确认；保留登录、报名、行程和个人资料；部分失败可重试 | `settings/index.ts:clearSafeCache` |
| Strava | 管理员授权开始、状态查询与路线导入 | 尚未连接／等待授权／已连接／失败；复制链接后浏览器授权；当前没有断开授权操作 | `settings/index.ts:openStravaSync`、`cloudfunctions/strava` |
| 活动编辑 | 公开／审核报名、自动截止、最多 3 封面、可选群二维码 | 首张封面、活动日 00:00 截止、一个活动说明；无独立可见范围和第二备注字段 | `miniprogram/pages/admin/activity-edit/index.ts` |
| 路线导入 | Strava 地址与 GPX 降级、预览生成并绑定 | 解析、预览及绑定期间锁定发布；失败保留表单；开发者工具选文件失败持续提示真机 | `admin/activity-edit/index.ts`、路线及媒体领域 |
| 审核操作 | pending 通过／驳回，approved 签到 | 驳回必填意见；通过后才显示签到，签到必须确认；候补、驳回及已签到按状态只读 | `miniprogram/pages/admin/review-detail/index.ts` |
| 公开骑友 | 昵称与同意公开的头像 | 静态公开名单，不把别人的头像导航到自己的「我的」 | `cloudfunctions/activity` 与 `activity-detail/index.ts` |
| 唯一俱乐部 | 成员只读、平台管理员维护 | OWNER／ADMIN 不自动获得平台编辑权；无加入申请、多俱乐部切换或创建第二个入口 | `club/center`、历史 `admin/club-applications` 路由 |

## 已确认的落地问题

前端 `removeBackgroundPhoto` 将 `backgroundPhoto` 设为 `null`，随后 `save` 总是提交 `gender` 和 `backgroundPhoto`。云函数 `buildUpdate` 对这两类更新调用 `assertFullProfileReady`，而该函数额外要求背景存在。使用合成当前资料调用 `buildUpdate({background_photo:null}, …)`，得到 `VALIDATION_FAILED / 请上传个人照片`。

这与 7 项完整度和前端背景选填、删除能力冲突，已去重后加入 `docs/high-priority-issues.md` 的 P1。当前设计不演示「删除背景已保存成功」。正式落地应统一背景选填口径后，再验证首次无背景保存、移除保存、背景替换及普通成员云端回读。

电话格式存在客户端和服务端差异：当前编辑页校验大陆手机号 `^1\d{10}$`，云函数允许 `^\+?[0-9]{7,20}$`。本稿输入沿用当前客户端口径，允许手工填写，不以服务端较宽的格式能力推断客户端已支持国际电话。

## 评审与实施边界

16 个主业务稿和 12 个状态稿沿用已确认的影像风格。新增状态为资料待完善、资料刷新失败、先设置头像、报名候补；已有状态保留加载、空内容、网络失败、图片失败、待审核、提交失败、路线准备中、公开报名成功。

评审脚本只演示本地状态，不上传图片或调用云函数。实际实现需沿用现有请求幂等、媒体登记、权限与隐私规则，并通过项目门禁、17 路由双端证据、普通成员写链路、部署回读和物理真机验收后，才能关闭相关待办。
