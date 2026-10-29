# 此里 CILI · Brand Spec

> 采集日期：2026-10-28
> 资产来源：当前小程序源码、现有 DevTools 证据、用户提供的 CILI CINEMA v3 H5。
> 资产完整度：完整（本项目自有数字产品，以仓库实现为权威来源）。

## 核心资产

### Logo

- 小程序圆形标记：`miniprogram/assets/brand/logo-circle-144.png`
- 分享图：`miniprogram/assets/brand/logo-share-500x400.png`
- 字标实现：`miniprogram/components/brand-logo/`
- 使用原则：保留“此里 CILI”品牌名、路线与节点语义；不拉伸、不替换字标。平台头像、分享资产和现有 `brand-logo` 组件继续使用正式字标；正文不再为了品牌曝光增加与系统导航重复的横幅。

### 真实 UI 与参考界面

- 当前小程序活动页：`docs/evidence/ui-sync/2026-10-22-cycling-image-journal/activities-devtools.png`
- 当前小程序详情页：`docs/evidence/ui-sync/2026-10-22-cycling-image-journal/activity-detail-devtools.png`
- 当前小程序报名页：`docs/evidence/ui-sync/2026-10-22-cycling-image-journal/registration-form-devtools.png`
- 当前小程序凭证页：`docs/evidence/ui-sync/2026-10-22-cycling-image-journal/credential-devtools.png`
- 当前小程序个人页：`docs/evidence/ui-sync/2026-10-22-cycling-image-journal/profile-devtools.png`
- 目标视觉参考：`/Users/bytedance/Downloads/cili-cinematic-flow_qzsv_h5.html`

### 摄影素材

- 活动/详情：`docs/designs/2026-10-22-cycling-image-journal/assets/lakeside.webp`
- 路线/山路：`docs/designs/2026-10-22-cycling-image-journal/assets/mountain.webp`
- 俱乐部：`docs/designs/2026-10-22-cycling-image-journal/assets/club.webp`
- 个人名片：`docs/designs/2026-10-22-cycling-image-journal/assets/rider.webp`
- 原型只使用仓库已固化素材；正式小程序仍以云端真实活动图片和用户授权媒体为准。

## 色板

- Cinema Ink：`#0B0A0C`，用于画布和系统 Chrome。
- Cinema Panel：`#121116`，用于卡片、票据和表单分层。
- Cinema Raised：`#1A1820`，用于输入、选项、禁用与抬升层。
- Cinema Floating：`#24212B`，用于浮层与最高表面。
- Primary Text：`#F7F4F2`，用于暗场高对比正文。
- Focus Red：`#E54242`，用于暗场文字、图标、细线和 Tab 选中。
- Action Red：`#D93636`，用于承载白字的主操作与实心选中态。
- Action Active：`#B72C2C`，用于按下态和强危险态。
- Muted：`#B8B3BA`，用于暗场次级信息。
- Strong Line：`#766F7A`，用于控件边界和需要明确分隔的结构线。
- Logo Red：`#E13B2B`，只属于现有 Logo 资产，不作为 UI 按钮色。

色彩论证：对标经典红暗色产品时，只吸收四级近黑、单点焦点红与冷灰层级；不复制其品牌红、字标或布局。亮红与深红分工使焦点更鲜明，同时保证白字主按钮达到 4.5:1。完整映射与维护规则见 [theme-tokens.md](theme-tokens.md)。

## 字型

- Display：`Songti SC, STSong, serif`，用于活动名、章节标题与“海报”层。
- Body：`-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif`。
- Data：`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`。

## 签名细节

- 页面身份由微信现有导航承载；正文不重复放置 Logo、页名、页码或场记横幅。Logo 只在明确的品牌、头像、分享和空态语境使用。
- 活动图像采用 35mm 暗角、颗粒和字幕式信息层；表单、审核与隐私内容使用高对比炭黑面板。
- 路线数据使用刻度、海拔线和里程数字，不用虚构票务条码。

## 禁区

- 不新增支付、电影播放、配乐、条码或凭证二维码。
- 不把公开骑友包装成可点击的“演员主页”。
- 不显示其他骑友实名或电话。
- 不让电影化标签替代真实状态名称；所有状态文案以现有模型为准。
- 不牺牲 44px 触控范围、暗色文字对比度、控件边界与表单错误反馈。
