# 此里 CILI · 沸点风格设计令牌方案

> 状态：视觉方案已确认，先提交令牌规格；双端实施、部署与真机验收待完成。
> 优先级：用户指定为下一轮首要可执行 P0，先迁移双端令牌与公共组件，再推进 13 页及部署验收。
> 日期：2026-10-16。仓库基线：`origin/main` `3a7f6982`（PR #243），客户端 `2026.10.16.70`。
> 范围：现有 13 页及其状态；本次只提交规格与文档索引，不修改业务代码、运行样式、数据库字段或正式机器契约。

## 1. 方案依据与继承关系

视觉语言来自用户选定的「沸点 · 火锅点单」参考：暖米白画布、墨黑信息块、红色主行动、暖黄短标签、大图白卡与胶囊控件。最终稿按用户“文字太小、太拥挤，保持呼吸感”的反馈调整为内容自然展开的长屏。

本方案是下一轮实施的视觉目标。[统一设计规范](../../design-system.md) 与 [design-contract.json](../../design-contract.json) 仍是当前运行基线；后续实施时同步更新契约、小程序 WXSS、Pages CSS 与相关验证，完成部署验收后再更新正式基线状态。历史主题说明只作背景，不覆盖本文的目标值。

已确认的设计成果已归档至 [`docs/designs/2026-10-16-boiling-point/`](../../designs/2026-10-16-boiling-point/README.md)，可从[交接首页](../../designs/2026-10-16-boiling-point/index.html)阅读两份离线手稿、13 页高清长图、五类状态板与完整规格；原始 HTML 保存在 `sources/`，离线稿仅补归档注释并替换图片路径。以下内容摘要继续绑定未经修改的原始文件，临时预览地址不作为版本标识：

| 源文件 | 页面 | SHA-256 |
| --- | --- | --- |
| `01-direction-v1.html` | ①②③ | `e823a11db8c1faa5ba3fd8c3f6e6ccaf0adb0f69edb8dbad9468167d3ce34b5e` |
| `02-fullset-screens-4to13.html` | ④–⑬及五类状态示意 | `0f9c408e5dcf5bcad7d8898dd41b1c914a44e51a15542f482c3cc30026250c0c` |

## 2. 色彩令牌

基础色保留设计稿取值，消费层沿用现有 `--color-*` 命名。半透明装饰与文字承载色分别定义，避免同一个品牌色承担所有状态。

| 设计稿基础色 | 值 | 消费语义 |
| --- | --- | --- |
| `--cream` | `#fbf5ea` | 页面画布 |
| `--cream-2` | `#f3e6d0` | 分段底、隐私提示、禁用底 |
| `--white` | `#ffffff` | 白卡、输入底、行动反白 |
| `--ink` | `#211f1c` | 正文、墨黑卡、选中分段、次按钮文字 |
| `--ink-2` | `#6f675d` | 辅助说明、占位文字、禁用文字 |
| `--ink-3` | `#9a9186` | 装饰与白底控件边界；禁止用作正文或占位文字 |
| `--red` | `#e13b2b` | 品牌点、短线、轻量装饰 |
| `--red-deep` | `#c0321f` | 主行动、选中筛选、文字链接、焦点 |
| 稿内错误深红 | `#a52a1c` | 错误文案、主行动按压色 |
| `--yellow` | `#f5b83f` | 暖黄短标签，搭配墨黑字 |
| `--tip` / `--amber` | `#fff2c7` / `#7a5c00` | 提醒浅底与深琥珀字 |
| `--green-soft` / `--green-deep` | `#e7f4eb` / `#16633a` | 已通过、解析成功等状态 |

### 2.1 面向双端实施的契约草案

下面的 JSON 是待迁移契约，保留现有 32 个变量名及 15 组对比度检查。它不替换本次提交中的正式 `docs/design-contract.json`。

`--color-brand-soft` 是稿内品牌红 10% 透明度叠在白底上的实体色；分隔线同样按白底合成为 `#ededed`。深色卡上的分隔线仍使用白色透明度，不套用白底实体色。

`--color-on-brand` 使用稿中已有的近黑 `#0c0a07`，保证保留的品牌配对检查达标；普通文字承载优先使用深行动红配白字或暖黄配墨黑字。品牌红配白字、品牌红配普通墨黑字均不足正文 4.5:1，不能直接沿用。

```json
{
  "schemaVersion": 1,
  "tokens": {
    "--color-bg": "#fbf5ea",
    "--color-surface": "#ffffff",
    "--color-raised": "#f3e6d0",
    "--color-text": "#211f1c",
    "--color-muted": "#6f675d",
    "--color-placeholder": "#6f675d",
    "--color-disabled-text": "#6f675d",
    "--color-border": "#ededed",
    "--color-border-strong": "#9a9186",
    "--color-card-border": "#ededed",
    "--color-input-bg": "#ffffff",
    "--color-action": "#c0321f",
    "--color-action-active": "#a52a1c",
    "--color-on-action": "#ffffff",
    "--color-brand": "#e13b2b",
    "--color-brand-active": "#c0321f",
    "--color-brand-soft": "#fcebea",
    "--color-on-brand": "#0c0a07",
    "--color-on-media": "#ffffff",
    "--color-media-muted": "#d4d4d4",
    "--color-media-card-bg": "#211f1c",
    "--color-status-success": "#16633a",
    "--color-status-success-soft": "#e7f4eb",
    "--color-status-warning": "#7a5c00",
    "--color-status-warning-soft": "#fff2c7",
    "--radius-sm": { "miniapp": "20rpx", "pages": "10px" },
    "--radius-md": { "miniapp": "26rpx", "pages": "13px" },
    "--radius-card": { "miniapp": "36rpx", "pages": "18px" },
    "--control-height": { "miniapp": "96rpx", "pages": "48px" },
    "--segment-height": { "miniapp": "92rpx", "pages": "46px" },
    "--page-gutter": { "miniapp": "32rpx", "pages": "16px" },
    "--card-gap": { "miniapp": "28rpx", "pages": "14px" }
  },
  "contrast": [
    { "foreground": "--color-text", "background": "--color-surface", "minimum": 4.5 },
    { "foreground": "--color-text", "background": "--color-bg", "minimum": 4.5 },
    { "foreground": "--color-muted", "background": "--color-bg", "minimum": 4.5 },
    { "foreground": "--color-muted", "background": "--color-raised", "minimum": 4.5 },
    { "foreground": "--color-placeholder", "background": "--color-input-bg", "minimum": 4.5 },
    { "foreground": "--color-disabled-text", "background": "--color-raised", "minimum": 4.5 },
    { "foreground": "--color-on-action", "background": "--color-action", "minimum": 4.5 },
    { "foreground": "--color-on-action", "background": "--color-action-active", "minimum": 4.5 },
    { "foreground": "--color-on-brand", "background": "--color-brand", "minimum": 4.5 },
    { "foreground": "--color-brand-active", "background": "--color-surface", "minimum": 4.5 },
    { "foreground": "--color-media-muted", "background": "--color-media-card-bg", "minimum": 4.5 },
    { "foreground": "--color-on-media", "background": "--color-media-card-bg", "minimum": 4.5 },
    { "foreground": "--color-status-success", "background": "--color-status-success-soft", "minimum": 4.5 },
    { "foreground": "--color-status-warning", "background": "--color-status-warning-soft", "minimum": 4.5 },
    { "foreground": "--color-border-strong", "background": "--color-input-bg", "minimum": 3 }
  ]
}
```

### 2.2 补充语义与对比度

| 用途 | 目标值 | 规则 |
| --- | --- | --- |
| 焦点光晕 | `0 0 0 3px rgba(192,50,31,.14)` | 深行动红描边加光晕 |
| 错误底 / 边 | `#fdeee8` / `2px solid #c0321f` | 就近附错误文字，区别于聚焦 |
| 主按钮阴影 | `0 8px 18px rgba(192,50,31,.3)` | 次按钮、禁用态不加此阴影 |
| 卡片阴影 | `0 6px 18px rgba(33,31,28,.06)` | 首页活动卡轻量承托，不用手机外框阴影 |
| 黑卡分隔线 | `rgba(255,255,255,.18)` | 仅作分组装饰 |
| 次按钮边线 | `1.5px solid #211f1c` | 白底、墨黑文字 |

按仓库 `contrastRatio` 算法复算，下列为代表值：

| 前景 / 背景 | 对比度 |
| --- | --- |
| 正文墨黑 / 米白画布 | 15.15:1 |
| 辅助深灰 / 米白画布 | 5.13:1 |
| 辅助深灰 / 米杏底 | 4.52:1 |
| 占位深灰 / 白输入底 | 5.56:1 |
| 白字 / 深行动红 | 5.65:1 |
| 白字 / 按压深红 | 7.12:1 |
| 近黑品牌文字 / 品牌红 | 4.58:1 |
| 墨黑字 / 暖黄 | 9.25:1 |
| 深绿 / 成功浅底 | 6.44:1 |
| 深琥珀 / 提醒浅底 | 5.59:1 |
| 控件边界灰 / 白输入底 | 3.10:1 |

所有正文至少 4.5:1，交互控件边界至少 3:1。米杏底上的深灰仅略高于门槛，不再叠加文字透明度。`#9a9186` 在米白上只有 2.86:1；稿内 `.inp.ph`、`.ta.ph` 使用它的情况，实施时必须迁移到 `--color-placeholder`。稿内 28% 墨黑输入边线叠白底为 `#c1c0bf`，实施时改为契约规定的可见控件边界。字母头像采用深行动红配白字；品牌装饰红不作小字头像底。

照片上的文字必须在实际照片与深色承载层上复核；渐变、透明度与文字阴影不自动等于对比度通过。无图显示品牌墨黑底与 `CILI RIDER`，不留白。

## 3. 字体、尺寸与呼吸感

以 375px 宽度为视觉基线；表中 1 CSS px 对应 2rpx。这个换算不代表窄屏上的固定物理尺寸，44px 触控下限须按实际设备尺寸校验。

字体栈取自两稿：`Inter, "Noto Sans SC", "PingFang SC", system-ui, -apple-system, sans-serif`。优先系统回退，不新增字体下载依赖。数字、日期、时间、版本号与编号采用等宽数字。

| 字体语义 | 字号 px / rpx | 行高与字重 | 用法 |
| --- | --- | --- | --- |
| 页面标题 | 21–23 / 42–46 | 1.35，800 | 首页、行程、表单、活动管理 |
| 名片姓名 | 23–25 / 46–50 | 至少 1.35，800 | 大图身份区 |
| 活动卡标题 | 17–19 / 34–38 | 1.4–1.45，800 | 首页实值 18.5px，详情标题 21px |
| 分区标题 | 16–16.5 / 32–33 | 1.35–1.4，800 | 编号卡、审核分区 |
| 正文与输入值 | 13.5–15.5 / 27–31 | 多行 1.6，600–800 | 标签值、表单、集合方式 |
| 主按钮文字 | 15.5–16 / 31–32 | 垂直居中，800 | 页面级主行动 |
| 次按钮文字 | 13.5–14.5 / 27–29 | 垂直居中，800 | 解析、编辑、导航 |
| 辅助说明与日志 | 12–13 / 24–26 | 1.6–1.75，500–700 | 常用值 12.5px；禁止靠压行高塞一屏 |
| 标签与非核心指标注释 | 10.5–11.5 / 21–23 | 1.4–1.55，600–800 | 仅短标签、步骤副文、头像状态等；操作说明不得降到此档 |

| 布局 / 组件语义 | 目标值（CSS px） | 应用规则 |
| --- | --- | --- |
| 页面左右边距 | 16 | 标题与说明可用 19–20；同类卡片边缘对齐 |
| 卡片间距 | 13–16，通用 14 | 采用令牌变体，禁止通过局部压缩段挤内容 |
| 通用白卡 | 半径 18；内边距 17×18 | 活动、凭证和票据卡半径 20 |
| 大图身份卡 / 黑卡 | 半径 20–22 | 黑色决策卡可用 18，需明确组件变体 |
| 控件圆角 | 10–13 | 输入框 13，胶囊按钮 999，头像 50% |
| 输入框 / 次按钮 | 最小高度 48 | 输入框内边距 10×15；文本增大后自然增高 |
| 主按钮 | 最小高度 52 | 双色双按钮维持次 / 主宽比 0.82 / 1.18 |
| 分段选项 | 46 高；内间隙 4 | 选中墨黑白字；业务状态筛选可用深行动红 |
| 标签—值行 | 最小高度 46 | 长备注纵向排；电话和编号完整显示 |
| 资料快照格 | 两列，列间距 18；行最小 42 | 标签跟随值；联系电话独占整行 |
| 菜单行 | 最小高度 70；图标底 42 | 标题与说明分层，整行可操作 |
| 字段间距 / 标签间距 | 16 / 8 | 不靠缩字号避免换行 |
| 最后正文到操作区 | 至少 28 | 保证阅读留白与滚动可达 |

筛选、返回图标、文字链接和小号按钮在稿内仍有 32–42px 的视觉尺寸；这不是 44px 触控验收证据。实施时为可操作元素补足实际热区，且相邻热区不得重叠；空间不足时直接增高控件。状态徽标、只读指标不要求伪造交互热区。

## 4. 长屏与安全区规则

1. 设计稿手机基线为 375×812，812 是最小高度，内容可自然长高。长表单、日志、凭证不得通过缩小字号、压缩卡片、裁切文字满足“一屏装下”。
2. 两稿采用 `min-height:812px`、自动高度、纵向 flex；底部按钮和模拟 TabBar 在文档流中。外层展示宽 300px、缩放 0.8，外框高度按 `ceil(phone.scrollHeight × 0.8)` 同步。
3. 300px 展示框、46px 手机圆角、44px 状态栏、78×31px 胶囊及高度同步脚本只属于设计展示。产品应使用实际微信导航、原生 TabBar 与设备安全区，不能直接复制模拟框或重复绘制系统栏。
4. 实际页面内容可纵向滚动，禁止整页横向溢出；审批六项筛选保留局部横向滚动。长标题、备注和编号可换行；电话不拆成零散片段。日期 / 时间优先单行，窄屏放不下时改纵向排布。
5. 底部操作按页面采用文档流；如实施保留固定操作栏，必须预留实际栏高与 `env(safe-area-inset-bottom)`，确保最后一个字段、错误说明及操作可滚动到栏上方。不能用稿内固定 22–24px 下边距替代真实安全区。
6. 普通字号与系统放大字体分别验收；内容增加时优先长高、换行或单列退化，不得裁切、重叠或缩小操作文字。

## 5. 十三页落点与关键状态

Pages 路由与小程序路径均已按当前 `docs/schema.js`、`miniprogram/app.json` 核对。效果图只展示视觉落点，未画出的现有业务入口、字段与状态仍以代码为准，不得因效果图省略而删除。

| 屏 | 小程序路径 | Pages 路由 / 状态 | 本套视觉落点 |
| --- | --- | --- | --- |
| ① 活动首页 | `pages/activities/index` | `#activities/default` | 176px 大图活动卡、18.5px 标题、三格指标、48px 操作；保留空 / 加载 / 失败 |
| ② 活动详情 | `pages/activity-detail/index` | `#activity-detail/approved` | 208px 封面、2×2 指标、墨黑决策块、52px 主行动；头像条 44px 头像 / 54px 格 / 8px 间距 |
| ③ 我的行程 | `pages/registrations/index` | `#registrations/default` | 三格白卡统计、票据行程卡、48px 操作；保留空与加载 |
| ④ 填写报名 | `pages/registration-form/index` | `#registration-form/selected` | 三阶段步骤条、黑色活动信息块、四分区白卡；资料两列加整行电话，下方编辑链接 |
| ⑤ 出发凭证 | `pages/credential/index` | `#credential/with-photo` | 152px 公开名片图置顶、说明单独灰字行、白色凭证内嵌黑色集合块，完整展示编号 |
| ⑥ 个人中心 | `pages/profile/index` | `#profile/admin` | 236px 身份大图、66px 头像、三项常用服务及隐私提示；普通成员按权限展示 |
| ⑦ 设置 | `pages/settings/index` | `#settings/default` | 16px 日志标题、12.5px 说明 / 功能点、1.7–1.75 行高；版本内容从发布记录读取 |
| ⑧ 骑行名片 | `pages/capability-card/index` | `#capability-card/with-photo` | 448px 海报、72px 头像、25px 昵称；无图用 112px 品牌墨黑承载区示意 |
| ⑨ 编辑资料 | `pages/profile-edit/index` | `#profile-edit/default` | 72px 头像、独立头像选择链接、48px 输入、单张背景图与随内容滚动的保存按钮 |
| ⑩ 活动管理 | `pages/admin/activity-list/index` | `#admin-activity-list/default` | 标题 / 状态 / 三格人数 / 编辑动作分层；删除仅草稿，底部主次操作 |
| ⑪ 编辑活动 | `pages/admin/activity-edit/index` | `#admin-activity-edit/edit` | 三分区卡、日期时间选择器、四格路线指标、64px 曲线；GPX 与二维码上下排，二维码 68px |
| ⑫ 报名审批 | `pages/admin/reviews/index` | `#admin-reviews/default` | 六项横滑筛选；管理员实名主行、昵称副行；活动标题、资料与审核动作分层 |
| ⑬ 审批详情 | `pages/admin/review-detail/index` | `#admin-review-detail/default` | 编号与活动标题、四分区卡、备注纵向行、78px 照片；通过深红实底，驳回中性描边 |

五类状态板覆盖：空行程、加载与失败重试、满员候补、聚焦与报错、大字号与高对比。状态板是缩略示意，不替代每页真实状态验收，也不新增“大字模式”开关。

## 6. 数据、权限与交互不变量

- 本人和审核管理员完整显示实名与电话；其他骑友的身份标识只展示昵称；后援车司机电话公开完整显示。截图中的合成示例与运行时个人信息权限分开验证。
- 审批列表主名称采用已有 `realName || nickname`，不改存储字段。公开名片继续使用本人维护的公开资料，不添加第三方统计、城市或虚构成就。
- 集合方式只有“自行前往 / 需要后援车”；性别只有“男 / 女”；骑行经验保留“新手 / 有经验 / 常骑”。活动备注上限 5000，报名备注上限 500，个人背景图最多 1 张、活动封面最多 3 张。
- 审批筛选固定“候补 / 待审核 / 已通过 / 已签到 / 已驳回 / 全部”；满员后的候补入口可用。通过、驳回、签到、取消与通知行为依照现有业务校验。
- 出发凭证编号格式为 `RE-YYYYMMDD-XXXXXX`；示例日期 2026-10-18、10-25、10-11 均为周日。夜骑主样本集合时间 17:30，临安活动样本 07:30；不能跨活动复制数据。
- Strava 仅解析公开路线与复制规范化链接，GPX 使用已有上传 / 解析 / 下载能力；不恢复 OAuth、第三方跳转或已下线的内嵌路线页。二维码是否过期按业务数据判断，不固化设计稿示例天数。
- 设置页从已有发布记录读取版本、摘要与功能点。稿中 `.70` / `.69` 各三条、`.68` / `.67` 各两条是本次样本，不作为删减真实升级记录的规则。

## 7. 实施交接与验收边界

本次交付是可版本化的令牌方案。此前两份 HTML 已进行逐屏截图目检与横向溢出复核；这些属于静态设计样本，不能据此宣称新主题已在 Pages、模拟器或真机部署通过。

后续实施先同步颜色、尺寸契约与双端公共组件，再按现有 13 页迁移布局。上述占位色、输入边界、头像文字和触控热区修正必须随实施落实，不降低既有门槛。不会因本规格提交而关闭任何 P0 / P1 验收项。

实施完成后的关闭条件：

1. `npm run check:design`、`npm run check:ui-sync -- --strict` 与全量 `npm run validate` 通过。
2. 重新采集本套主题的 13 页双端截图；375×812 同视口，长页分段或滚动采集，证据绑定实际 UI / Pages 内容摘要。标注状态、`fixture` / `sanitized-runtime`、脱敏范围和差异，不能复用旧主题截图作为新主题证据。
3. 人工核对正文与浅色控件可读性、无文本截断重叠、整页横向溢出为零、44px 实际热区、安全区、长标题、完整电话与编号；同时覆盖 340px 窄屏和系统字体放大。
4. 核验相应 PR checks、main CI、Pages 部署及按 diff 触发的微信开发版回执；iOS / Android 物理真机与普通成员完整写链路独立验收。只有部署及验收通过后才能从高优清单移除相关待办。
