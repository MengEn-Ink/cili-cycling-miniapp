# 此里小程序设计入口

这份文件是实现与审查 UI 时的短入口，不替代已有页面设计稿、业务规范或验收证据。发生冲突时，依次以 `docs/high-priority-issues.md`、对应路由设计目录、`miniprogram/config/theme-contract.json` 和真实运行证据为准。

## 设计方向

- 真实的活动、路线、成员与状态优先于装饰；不为套模板新增业务字段、状态或入口。
- 保持大字号、足够留白、浅色文字可读，以及至少 44px 的实际触控范围。
- 颜色主要表达操作、状态和数据含义；层级优先用间距、边框与平面明暗，不堆叠无意义阴影。
- loading、empty、zero、error、disabled 必须诚实呈现，不能用理想数据遮盖异常。
- 入场动效只用于建立一次层级，遵守 reduced-motion；不让每个区块反复 fade-up。
- 手机端单独审查，不把桌面 Web 的 hover、滚动框架或响应式假设带入微信小程序。

这些原则借鉴 [brands-design-md](https://github.com/ricocc/brands-design-md) 的单文件设计入口与令牌并列方式、[awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 的可移植设计说明，以及 [taste-skill](https://github.com/Leonxlnx/taste-skill) 对产品对象、状态真实性和移动端审查的强调。GitHub `design-system` topic 中常见的多框架运行时方案只作为结构参考，本项目不引入对应依赖。

## Token 架构

权威值只定义在 `miniprogram/app.wxss` 的首个 `page` 块，机器契约位于 `miniprogram/config/theme-contract.json`。

1. Primitive：原始尺度与色板，例如 `var(--space-4)`、`var(--palette-red-600)`。
2. Semantic：面向含义的别名，例如 `var(--color-text)`、`var(--color-action)`、`var(--focus-ring)`。
3. Component：组件及状态，例如 `var(--button-bg)`、`var(--button-bg-active)`、`var(--input-focus-border)`。

页面和组件优先消费 semantic 或 component token。新增 token 时必须说明层级、复用场景和状态；不要在页面 WXSS 写颜色或字体字面量，也不要用 fallback 掩盖拼错或缺失的 token。`npm run check:design` 会阻断根 token 重复、未定义引用、无消费的核心 component token、解析环和文档中的失效 token。

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
