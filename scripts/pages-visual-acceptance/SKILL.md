# 正式 Pages 视觉验收 Skill

正式 Pages（`docs/` 原型）每次改版后重复要做的两件事，固化成可复用脚本：

1. **逐路由截图核对**——启本地服务、隐藏 showcase 外壳、对 17 条正式路由逐页截图，
   检查影像志风格、窄屏横向溢出与脚本错误。
2. **ui-sync 摘要回算**——改动 `docs/` 或 `miniprogram/` UI 后，`check:ui-sync` 会因内容摘要
   漂移而失败；按门禁相同口径重算并写回 `docs/ui-sync-manifest.json`。

> 适用于本仓库（`cili-cycling-miniapp`）。脚本只读 `docs/`，除 `--write` 外不改任何文件。

## 何时使用

- 改了 `docs/styles.css` / `docs/templates.js` / `docs/app.js` / `docs/index.html` 等原型文件后，
  想快速看 17 路由的真实渲染，而不是手敲一堆 agent-browser 命令。
- `npm run check:ui-sync`（或 `-- --strict`）报“截图对应的 UI 内容摘要不匹配”时。

## 脚本一：逐路由截图

```bash
# 全部 17 路由，390px 宽，输出到 /tmp/cili-pages-shots
node scripts/pages-visual-acceptance/capture-routes.mjs --out /tmp/cili-pages-shots

# 只看单页 + 指定窄屏宽度（验收 340/375/430 时很有用）
node scripts/pages-visual-acceptance/capture-routes.mjs \
  --route profile --width 340 --height 780 --out /tmp/shots-340
```

参数：`--port`（默认 63742）、`--width`（默认 390）、`--height`（默认 844）、
`--out`（默认 `/tmp/cili-pages-shots`）、`--route`（留空=全部 17 路由）、
`--docs`（默认 `docs`）。

行为：

- 内置 `http.server` 托管 `docs/`，自动隐藏 `.site-header/.screen-nav-panel/.screen-notes/.site-footer`
  外壳，把 `#screen-container` 展开成整屏长图后截图。
- 退出码非 0 表示有路由横向溢出或控制台脚本错误；明细见 `<out>/report.json`。
- 优先复用系统 Chrome（`/Applications/Google Chrome.app`），否则回退 `playwright-core`。

截图落在 `/tmp`（私有、不入库），只把结论和脱敏摘要写进交付文档。

## 脚本二：ui-sync 摘要回算

```bash
# 仅打印当前 source(ui) 与 prototype 两个摘要
node scripts/pages-visual-acceptance/sync-ui-digests.mjs

# 写回 manifest（source.digest / prototype.digest / syncedThrough=HEAD / syncedAt）
node scripts/pages-visual-acceptance/sync-ui-digests.mjs --write
```

回算口径与 `scripts/check-ui-sync.mjs` 完全一致（`source`=`miniprogram/` UI 文件，
`prototype`=六个 `docs/` 原型文件）。写回后再跑 `npm run check:ui-sync -- --strict` 应通过。

## 重要边界

- **回算摘要只让门禁与“当前内容”对齐，不等于已重新采集真机/双端截图证据。**
  真机（iOS/Android）、普通成员完整写链路、公开媒体与目标云回读仍需按
  [`docs/high-priority-issues.md`](../../docs/high-priority-issues.md) 独立留证，不得用本地截图冒充。
- 模拟器/本地浏览器截图只证明对应内容的视觉同步，不能替代物理真机验收。
- 不改后端能力与 17 条注册路由；视觉改版须保留所有 `data-action` / `data-route` 等交互接线。

## 典型改版验收流程

```bash
# 1) 改完 docs/ 原型，逐页看渲染
node scripts/pages-visual-acceptance/capture-routes.mjs --out /tmp/cili-pages-shots
# 2) 回算并写回 ui-sync 摘要
node scripts/pages-visual-acceptance/sync-ui-digests.mjs --write
# 3) 跑交付门禁
npm run check:ui-sync -- --strict && npm run check:governance && npm test
```
