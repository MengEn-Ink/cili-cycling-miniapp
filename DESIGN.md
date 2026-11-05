# 此里小程序设计入口

这份文件是实现与审查 UI 时的短入口，不替代已有页面设计稿、业务规范或验收证据。发生冲突时，依次以 `docs/high-priority-issues.md`、对应路由设计目录、`miniprogram/config/theme-contract.json` 和真实运行证据为准。

## 设计方向

- 真实的活动、路线、成员与状态优先于装饰；不为套模板新增业务字段、状态或入口。
- 保持大字号、足够留白、浅色文字可读，以及至少 44px 的实际触控范围。
- 当前浅暗优化采用暖白纸面 / 近黑画布和经典红；自然语言使用无衬线，数字与编号保留等宽。指标以三列（分析概要两列）、间距和字号形成层级，不加外框或竖分隔线；章节不加装饰灰线。输入和选择控件独立使用高对比边界，不能随装饰线一起弱化。主要指标标签与表单辅助文字在 375px 基准为 14px，浅暗正文/辅助文字至少 4.5:1，必要控件边界至少 3:1；原生 TabBar 选中/未选中文字与导航栏前景色同属文字口径，浅色选中色不得直接沿用暗色品牌红。
- 键值型信息（集合与出发、路线参数、报名资料、审核资料等）采用编辑式事实流：取消表格外框与行分隔线，用留白、眉标字距与字重、`--color-brand-fill` 节奏点、事实列字重建立层级；次级按钮用 `--color-raised` 平面填充而不是描边，避免一屏内出现重复线框。设置页的入口分隔行承担点击范围分组，按既有契约保留单条底部细线，不在此次去框范围内。
- 颜色主要表达操作、状态和数据含义；层级优先用间距、边框与平面明暗，不堆叠无意义阴影。
- loading、empty、zero、error、disabled 必须诚实呈现，不能用理想数据遮盖异常。
- 入场动效只用于建立一次层级，遵守 reduced-motion；不让每个区块反复 fade-up。
- 手机端单独审查，不把桌面 Web 的 hover、滚动框架或响应式假设带入微信小程序。

这些原则借鉴 [brands-design-md](https://github.com/ricocc/brands-design-md) 的单文件设计入口与令牌并列方式、[awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 的可移植设计说明，以及 [taste-skill](https://github.com/Leonxlnx/taste-skill) 对产品对象、状态真实性和移动端审查的强调。GitHub `design-system` topic 中常见的多框架运行时方案只作为结构参考，本项目不引入对应依赖。

## Token 架构

静态启动 / 回退值定义在 `miniprogram/app.wxss` 的首个 `page` 块，机器契约位于 `miniprogram/config/theme-contract.json`。已批准的 AI Hero 浅暗运行时覆盖统一定义在 `miniprogram/config/appearance.ts`：只覆盖已有 semantic / component token，不在各页增加独立色板。公共 `themedPage` 经 `page-meta page-style` 在 page 层注入，页面、组件、固定层共同继承；原生 navigation / tabBar 由 `theme-service` 同步。Pages 的两套镜像值由 `tests/theme-runtime-integration.test.ts` 校验，不修改历史设计 snapshot。真实双端采集仍是独立门禁，见 [浅暗实现验收](docs/verification/2026-11-01-aihero-light-dark-implementation.md)。

1. Primitive：原始尺度与色板，例如 `var(--space-4)`、`var(--palette-red-600)`。
2. Semantic：面向含义的别名，例如 `var(--color-text)`、`var(--color-action)`、`var(--color-brand-text)`、`var(--focus-ring)`。
3. Component：组件及状态，例如 `var(--button-bg)`、`var(--button-bg-active)`、`var(--input-focus-border)`。

页面和组件优先消费 semantic 或 component token。新增 token 时必须说明层级、复用场景和状态；不要在页面 WXSS 写颜色或字体字面量，也不要用 fallback 掩盖拼错或缺失的 token。`npm run check:design` 会阻断根 token 重复、未定义引用、无消费的核心 component token、解析环、文档中的失效 token，以及把填充/边界用的品牌红 token 直接当作文字色。

品牌红按角色拆开：`var(--color-brand)`、`var(--color-brand-fill)`、`var(--color-action)` 及其 active 变体只用于填充、边框、渐变和图标等非文字元素（3:1 口径）；所有红色小字、强调标签、错误提示与可点击文字必须使用 `var(--color-brand-text)`（4.5:1 口径）。它在 `appearance.ts` 按模式覆盖为暗色 `#f06464`、浅色 `#b72c2c`，在画布、卡片和 raised 表面均达标；根值仅作为暗色启动首帧回退。`--color-brand-active` 保留为历史别名，不再作为文字色使用。

对比度门禁覆盖三个状态：暗色运行时（`theme.ts` 的原生配置 + `appearance.ts` 的 dark token）、浅色运行时（`appearance.ts` 的 light token + `LIGHT_APPEARANCE`）以及启动首帧（`app.json`）。每个状态分别校验正文、辅助、占位、禁用与状态文字（4.5:1）、必要控件边界（3:1），以及原生 TabBar 选中/未选中文字和导航前景色。`theme-contract.json` 的 `appearanceContrast` 声明清单、最低比值和浅色原生 TabBar 快照；`requiredModes` 与 `requiredForegrounds` 用于防止通过删除条目绕过校验，其中 `--color-brand-text` 在浅暗各校验画布 / 卡片 / raised 三种表面。静态根 token 的对比度不能代表运行时覆盖后的实际取值。TabBar 选中图标属于非文字元素，按 3:1 判定；两种模式共用同一份 `*-active.png`，因此浅色下图标仍是亮品牌红、与深红选中文字存在可控色差，若需完全一致应另出浅色图标资源并重采证据。

## 页面实施规则

- 修改 UI 前先读目标 `miniprogram/pages/**` 路由与 `docs/designs/2026-10-22-cycling-image-journal/` 对应页面。
- 保留 17 条已登记路由和现有业务状态机；通用控件使用 `var(--control-height)` 作为 44px 基线的一部分。
- 首屏媒体、列表数据和错误恢复按真实加载顺序设计；模拟器截图不能替代 iOS/Android 真机与目标云回读。
- 新视觉资产进入主包前先看 `npm run check:main-package`，优先复用现有品牌物料和 CSS 能力。

## 交付门禁

UI 改动至少执行：

```text
npm run test:design
npm run check:design
npm run check:ui-sync -- --strict
npm run check:governance
npm run validate
```

证据分层为：静态契约 → 单元/集成测试 → Pages/开发者工具 → iOS 与 Android 真机 → 目标云写入及回读。只有最后两层实际完成，才可把普通成员端到端写链路标记为通过。
