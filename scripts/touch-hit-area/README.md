# 触控热区门禁（touch-hit-area）

有效触控命中盒 ≥44 CSS px（340 / 375 / 430 三宽度）的静态契约 + 原型浏览器真实命中门禁。

## 文件

- `node-test.mjs`：静态门禁（node:test，零 npm 依赖，当前 **50/50/0 全过**；权威基线 RED 快照为 42 例口径，不改写）。
  - A 发货控件声明口径 ≥44px（登记表与 CSS 声明自洽，非 computed-style 实测）；B 命中层声明白名单 + 选择器合并零丢失反例（bearing/pad 类名合并后不得静默丢失）；
    C 豁免证据可复核；D 原型 8 关键点契约；E 双令牌契约（`--touch-target-min=44px` 且 `--control-height=96rpx` 不变）+ 命中块外受保护声明（视觉/承载/spacing/定位）等价映射，允许同值重复 spacing 合并、禁止删除必要声明；F native 真实 `.hit-pad` wxml 节点存在性与无伪元素兜底。
- `browser.mjs`：Playwright/Chromium 真实命中门禁，服务 `docs/index.html#route-analysis` 真实渲染壳（非自建 demo）。
  - 8 个地图 marker：9 点（中心 + 四角 + 四边中点）`elementFromPoint` 归属；marker 仅记录可达性归属，原型无 selectedPoint 回调，不声称选中态。
  - 19 个发货控件（`.ra-filter/.ra-seg-row/.ra-tl-row`，全量不截断）：5 点（中心 + 四边中点，含左右侧缘）采样；
    原生 `click()` 派发，带 `data-state` 的 8 个控件断言 `showPage` 写 `window.prototypeState` 副作用；
    控件邻近负例 18 对、背景误命中 0、相交投影对 0。
  - 当前缓存环境实跑 exit 0：三宽度 marker 最小命中盒 340=44.66 / 375=50.05 / 430=52.36px；每宽度控件 19、stateful click 8、邻近负例 18/18。
  - 禁用/加载态控件枚举登记，不计入 44px 失败清单。
- `lib/geometry.mjs`、`lib/registry.mjs`：rpx 换算、命中层解析、目标与豁免登记表。
- 承载策略：真实宿主 `min-height: var(--touch-target-min)`（bearing，令牌固定 44px）为主；局部视觉过小目标用真实 `.hit-pad` 子节点（pad，纵向 ±4px 扩张）。契约锁定 `var(--control-height)` 的主按钮不改写声明高度，由 `.hit-pad` 扩张补齐。页面 wxss 后加载且同/高特异性会覆盖单类 bearing 时，`app.wxss` 触控块内以合并逗号组保留各自原有特异性兜底（`.filter-tab.filter-tab.filter-tab`、`button.row.rowlink.rowbutton.rowlink`、`.chapterhead-action.chapterhead-action`），仅声明 `min-height`，不改字形/颜色/背景/边框；等价选择器已合并为共享规则以净减样式字节；明细见 `touch/evidence/native-instance-classification.json` 的 `cascadeFixR_CASCADE_1`。

## 运行

```bash
# 静态（无需浏览器依赖；TOUCH_REPO_ROOT 可指向基线副本做权威 RED）
node --test scripts/touch-hit-area/node-test.mjs

# 浏览器（需要 worktree node_modules 中的 playwright-core 与已就绪浏览器缓存）
export TMPDIR=<runtime>/tmp
export PLAYWRIGHT_BROWSERS_PATH=<runtime>/playwright-cache
TOUCH_EVIDENCE_DIR=<输出目录> node scripts/touch-hit-area/browser.mjs
```

退出码约定：`0` 通过；`1` 断言失败；`2` 仅在 `playwright-core` 或浏览器缓存缺失时表示依赖不可用（BLOCKED，非测试失败）；按上方 `PLAYWRIGHT_BROWSERS_PATH` 指向就绪缓存（chromium-1194）时本仓实跑为 `0`。

## 两套服务面与覆盖边界（不得混称）

| 面                                                                      | 服务内容                                                                    | 本门禁证据                                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 原型动态壳 `docs/index.html` + `templates.js`/`app.js`                  | browser.mjs 63911 端口                                                      | marker 9 点归属 + 发货控件 5 点采样与 showPage 副作用                                                             |
| 设计静态壳 `docs/designs/2026-10-22-cycling-image-journal/pages/*.html` | `scripts/run-phase3-three-width.mjs` → `phase3-three-width-walkthrough.mjs` | 16 页 ×3 宽度 44px 有效盒 + 归属采样；该目录无 `.hit-pad/.ra-mk-hit` 节点，overlay 扩张分支为空转路径，只测视觉盒 |
| 微信小程序 native 页（miniprogram/）                                    | 无浏览器服务面；无 IDE/真机授权                                             | 静态声明口径 + 真实 wxml 节点存在性；**native tap 命中未实测，结论 BLOCKED，不得外推为通过**                      |

## 边界

- A 段静态断言是“登记表数值与 CSS 声明自洽”，不是浏览器 computed style 几何实测；实测几何仅原型 HTML 层由 browser.mjs 提供。
- 接线现状（集成流程维护）：`test:touch-hit-area` 已进入 `validate` 链；`test:touch-hit-browser` 为独立 script（缓存就绪时 exit 0；缺依赖时 exit 2 = 不可用 BLOCKED）。本门禁代码不修改 `package.json`、`manifest` 与高优文档；后续接线/收敛由集成统一处理。
- 静态基线 RED：`TOUCH_REPO_ROOT=<基线 detached worktree> node --test scripts/touch-hit-area/node-test.mjs`。
