# 2026-10-11 页面边距与同列文字对齐 · 开发版运行态视觉 E2E

- 时间：2026-10-11 14:41（CST）
- 基线：main `f0cbcbc`（PR #122），对应微信开发版 **0.0.123.1**（robot 1，2026-10-11 14:21 上传成功）
- 被验证的修复：PR #120（合并提交 `87630f6`，开发版 0.0.121.1 首发，#122 未改动这两处 WXSS，0.0.123.1 继续携带）
- 工具：微信开发者工具官方 `miniprogram-automator@0.12.1`，真机已登录账号、线上 CloudBase；逻辑视口 `windowWidth=390`
- 方式：通过 `wx.createSelectorQuery().fields({ computedStyle, rect })` 读取真实运行态样式与几何，配合整屏截图；全程只读，不发布、不删除、不写线上数据
- 脚本：[`align-e2e-20261011.js`](./align-e2e-20261011.js)，原始结果：[`results.json`](./results.json)

## 被验证的改动

| 文件 | #120 改动 | 运行态期望 |
| :-- | :-- | :-- |
| `miniprogram/app.wxss` | `.page` 左右 padding `24rpx` → `var(--page-gutter)`（32rpx） | 通用页面左右内边距均为 32rpx 且对称 |
| `miniprogram/pages/capability-card/index.wxss` | `.capability-page` 水平 padding `40rpx` → `var(--page-gutter)`（32rpx） | 骑行名片左右内边距均为 32rpx 且对称 |
| 同上 | `.meta-value` `text-align: right` → `left` | 覆盖范围/最近同步两行同列左对齐、左缘一致 |

> 像素换算：390pt 视口下 32rpx 理论值为 16.64px，开发者工具按整数像素渲染为 `16px`（三个容器一致、左右对称），断言容差 1px。

## 结果：15/15 PASS，运行态异常 0

| # | 检查 | 结果 | 关键读数 |
| :-: | :-- | :-: | :-- |
| 1 | 设置页存在 `.page` | ✅ | 1 个节点 |
| 2 | 设置页左边距 32rpx | ✅ | `padding-left:16px` |
| 3 | 设置页右边距 32rpx | ✅ | `padding-right:16px` |
| 4 | 设置页左右边距对称 | ✅ | 16 / 16 |
| 5 | 活动首页存在 `.page` | ✅ | 1 个节点 |
| 6 | 活动首页左边距 32rpx | ✅ | `16px` |
| 7 | 活动首页右边距 32rpx | ✅ | `16px` |
| 8 | 活动首页左右边距对称 | ✅ | 16 / 16 |
| 9 | 骑行名片渲染成功（含真实 Strava 文案） | ✅ | 覆盖范围 `2026年7月12日 至 2026年10月10日 · 覆盖完整`；同步于 `2026-10-10 21:56:33` |
| 10 | 名片页左边距 32rpx | ✅ | `16px` |
| 11 | 名片页右边距 32rpx | ✅ | `16px` |
| 12 | 名片页左右边距对称 | ✅ | 16 / 16 |
| 13 | `.meta-value` 同列文字左对齐 | ✅ | 两行 computed `text-align` 均为 `left` |
| 14 | 两行同列左缘一致 | ✅ | left 均为 `87` |
| 15 | 数值列位于标签列右侧 | ✅ | 标签列右缘 `81` < 数值列左缘 `87` |

截图：[`01-settings-gutter.png`](./01-settings-gutter.png)、[`02-activities-gutter.png`](./02-activities-gutter.png)、[`03-capability-card-align.png`](./03-capability-card-align.png)。

## 结论与边界

- #120 的「页面左右边距统一为标准 gutter」与「骑行名片同列文字左对齐」在最新开发版 0.0.123.1 的开发者工具运行态客观成立，且有截图为证。
- 本证据为**开发者工具运行态**视觉 E2E；真机视觉复核仍按 `UI HP-20261010-02` 的关闭条件保留，不据此直接关闭整条。
- 播放三角、星星、下载图标的光学重心微调：本轮再次全仓核对，未发现对应真实控件/选择器，按既定要求不虚构选择器、不臆造改动；待用户提供具体页面或定位到真实控件后再处理。
