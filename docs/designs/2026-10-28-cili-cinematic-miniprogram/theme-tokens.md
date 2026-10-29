# 此里 CILI · 电影红暗色主题令牌

> 版本：2026-10-29.6
> 适用端：GitHub Pages 原型、17 条正式微信小程序路由、设计源 HTML
> 边界：只约束前端视觉与动效；不新增业务字段、接口、云函数、集合、权限或状态机。

## 参考页提取

2026-10-29 通过浏览器计算样式核对了[网易云音乐 NCM CLI 参考页](https://music.163.com/st/ncmcli#)。参考页的有效设计特征是四级近黑背景、单点高纯红、三级冷灰文字、克制红色 glow、约 150ms 的微交互，以及约 600ms 的区块显影。

参考页当时的主要原始值如下，仅用于分析，不直接进入此里代码：

| 类别 | 参考值 |
| --- | --- |
| 背景 | `#0A0A0F / #0F0F18 / #14141F / #1A1A28` |
| 表面 | `#1E1E2E / #252538` |
| 焦点红 | `#FF3A3A` |
| 正文 / 次级 / 弱化 | `#E8E8F0 / #8888A8 / #52527A` |
| 边界 | `rgba(255,255,255,.07 / .12)` |
| 出场缓动 | `cubic-bezier(.25,1,.5,1)` |
| 往返缓动 | `cubic-bezier(.65,0,.35,1)` |

此里不复制参考品牌、字标、版式或 `#FF3A3A`。参考亮红承载白字时对比度不足，因此只吸收“暗场层级、焦点红、双速动效”的方法，并保留暖黑影像志、宋体标题、现有 Logo 和骑行语义。

## 三层架构

### 1. Primitive

原始令牌只描述色阶或时长，不表达组件用途。原始值只能在 `docs/styles.css`、`miniprogram/app.wxss` 与设计源 `shared.css` 的令牌区出现。

| 令牌 | 值 | 用途边界 |
| --- | --- | --- |
| `--palette-ink-950` | `#0B0A0C` | 全局画布、原生系统 Chrome |
| `--palette-ink-900` | `#121116` | 卡片和普通面板 |
| `--palette-ink-800` | `#1A1820` | 输入、选中前底、抬升层 |
| `--palette-ink-700` | `#24212B` | 浮层和最高表面 |
| `--palette-red-500` | `#E54242` | 文字、图标、焦点线，不承载正文白字 |
| `--palette-red-600` | `#D93636` | 主按钮和实心选中态 |
| `--palette-red-700` | `#B72C2C` | 按下态和强危险态 |
| `--palette-warm-50` | `#F7F4F2` | 暖白正文 |
| `--palette-neutral-300` | `#B8B3BA` | 次级正文 |
| `--palette-neutral-500` | `#8C858F` | placeholder、禁用文字 |
| `--palette-line-500` | `#4B454F` | 装饰边界，不单独承担控件识别 |
| `--palette-line-700` | `#766F7A` | 卡片与控件强边界 |

### 2. Semantic

页面只使用语义令牌，不直接使用 primitive：

```css
--color-bg: var(--palette-ink-950);
--color-surface: var(--palette-ink-900);
--color-raised: var(--palette-ink-800);
--color-floating: var(--palette-ink-700);
--color-text: var(--palette-warm-50);
--color-muted: var(--palette-neutral-300);
--color-placeholder: var(--palette-neutral-500);
--color-brand: var(--palette-red-500);
--color-brand-fill: var(--palette-red-600);
--color-action: var(--palette-red-600);
--color-action-active: var(--palette-red-700);
--color-border: var(--palette-line-500);
--color-border-strong: var(--palette-line-700);
```

`--color-brand` 是亮红焦点；任何实心红底必须改用 `--color-brand-fill` 或 `--color-action`。这条规则保证红色仍鲜明，同时让白字主操作保持可读。

### 3. Component

按钮、卡片、输入、分段器与电影显影只消费组件令牌：

- 按钮：`--button-bg / --button-bg-active / --button-text / --button-border`
- 卡片：`--card-bg / --card-text / --card-border / --card-radius`
- 输入：`--input-bg / --input-text / --input-border / --input-focus-ring`
- 显影：`--cinema-title-duration / --cinema-content-duration / --cinema-hero-duration / --cinema-reveal-duration`

## 对比度底线

| 组合 | 对比度 | 结论 |
| --- | ---: | --- |
| `#F7F4F2` / `#0B0A0C` | 18.04:1 | 正文通过 |
| `#B8B3BA` / `#0B0A0C` | 9.59:1 | 次级正文通过 |
| `#8C858F` / `#0B0A0C` | 5.52:1 | placeholder 通过 |
| `#E54242` / `#0B0A0C` | 4.88:1 | 焦点红文字通过 |
| `#FFFFFF` / `#D93636` | 4.63:1 | 主按钮白字通过 |
| `#766F7A` / `#1A1820` | 3.62:1 | 强控件边界通过 |

小字号正文不使用弱边界灰。`--color-border` 只用于装饰分隔；输入、选项、按钮和可交互卡片必须使用 `--color-border-strong`。

## Logo 红与 UI 红

- `--color-logo-background: #211F1C`、`--color-logo-foreground: #FFFFFF` 与 `--color-logo-accent: #E13B2B` 是现有 Logo 三色资产契约，保持不变，不参与 UI 色阶推导。
- `--color-brand: #E54242` 是暗场上的 UI 焦点红，用于文字、图标、细线和 Tab 选中。
- `--color-action: #D93636` 是可承载白字的主操作红。
- 页面禁止把 Logo 红复制成按钮色，也禁止重新着色 Logo 图片资产。

## 动效令牌

| 层级 | 令牌 | 值 | 场景 |
| --- | --- | ---: | --- |
| 即时 | `--motion-duration-instant` | 100ms | Chevron 微位移 |
| 快速 | `--motion-duration-fast` | 150ms | 按压、透明度 |
| 基础 | `--motion-duration-base` | 220ms | 背景与描边 |
| 显影 | `--motion-duration-reveal` | 420ms | 内容块短距离 reveal |
| 强调 | `--motion-duration-emphasis` | 560ms | 标题显影 |
| Hero | `--motion-duration-hero` | 680ms | 影像 1.025 → 1 settle |

出场统一用 `--motion-easing-out`；交互反馈使用 `--motion-easing-standard`。标题从 `120ms` 开始，第二行从 `340ms` 开始；首批区块最多四个，以 `40ms` 递进。页面不使用循环 glow，也不为被移除的导航横幅保留专用动画令牌。

Web 在 `prefers-reduced-motion: reduce` 下把动画和过渡压到最终态。小程序动效只跟随原生页面创建播放一次，不阻塞加载、滚动或点击；禁止循环 glow、粒子、持续滤镜、逐字节点动画和 scroll-jacking。

## 维护规则

1. 新页面不得新增主题色、动画时长或 easing 硬编码；先在 primitive 建值，再做 semantic 与 component 映射。
2. Pages 与小程序同名令牌必须解析为同值；设计源 HTML 由 `shared.css` 机械同步。
3. Canvas、原生导航和 TabBar 无法读取 CSS 变量时，值必须来自 `miniprogram/config/theme.ts` 或同一主题常量，不能另建色板。
4. 主题改动必须更新本文件，并通过 `cycling-image-journal-theme-token`、`check:ui-sync -- --strict`、`check:governance` 与全量 `validate`。
5. 任何视觉通过都不能替代双物理真机、普通成员完整写链路或目标云环境回读。
