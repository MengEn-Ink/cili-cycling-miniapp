# 2026-11-07 unslop 精修后 UI 同步真实差异与证据缺口

> 状态：`LOCAL_COMMITTED / LOCAL_GATES_PASS / IDE_SIMULATOR_VERIFIED / PAGES_LOCAL_VERIFIED / PR_433_OPEN_CI_PASS / UI_SYNC_STRICT_BLOCKED / DUAL_DEVICE_EVIDENCE_BLOCKED / P0_REAL_DEVICE_BLOCKED`。
>
> 本文只记录**差异定位与证据规格**，不宣称任何验收通过。`docs/ui-sync-manifest.json` 未修改，`check:ui-sync -- --strict` 保持 BLOCKED；本地截图只存系统临时目录，不冒充公开脱敏证据。

## 1. 基线

- 工作树：`D:\workspace\cili-cycling-miniapp-latest`，分支 `feat/unslop-polish-latest`，基于 `origin/main@88d8356`。
- 提交：`f526806` `style(ui): 按 unslop 收敛新版 17 页样式细节`（25 文件 / 373 插入 / 384 删除）。
- 同步清单：`syncedThrough = 202b72b5d8be60c9c0a9aa42f91b943d679fe059`，`syncedAt = 2026-10-30T06:39:46.000Z`，`schemaVersion = 2`。
- 原工作区 `D:\workspace\cili-cycling-miniapp` 保持原样，未受影响。

## 2. strict 失败的精确原因：不是摘要写错

报错点位于 `scripts/check-ui-sync.mjs` 的 `assessUiSyncState`：`currentPrototypeDigest() !== manifest.prototype.digest`。

| 摘要 | 值 |
| --- | --- |
| 清单 `prototype.digest` | `sha256:3eb3af30…f269c` |
| 当前工作树原型摘要 | `sha256:1036334d…91fc1c` |
| 清单 `source.digest` | `sha256:5fb23ba7…7f416` |
| 当前 UI 源码摘要（`currentUiDigest()`） | `sha256:979bc87b…a866` |

关键判断：**`3eb3af30…` 恰好等于 `syncedThrough` 提交 `202b72b5` 处六个原型文件算出的摘要**（历史逐提交复算命中）。也就是说清单记录的是 10-30 当时的真实值，不是笔误或格式差异；`readNormalized` 已把 CRLF 归一，逐文件 `same=false` 全部来自内容变化。

漂移来自基线之后三次合入 main 的真实改版：

| 提交 | 日期 | 说明 |
| --- | --- | --- |
| `62376d3` | 2026-11-01 | 17 页 AI Hero 布局与浅暗主题切换（PR #420） |
| `d617ed2` | 2026-11-04 | 浅暗主题可读性与骑行指标层级（PR #424） |
| `7a029f7` | 2026-11-06 | 拆分品牌红文字 token 并校准浅暗对比度（PR #427） |

六个原型文件中四个发生内容变化：`docs/styles.css` +246/-0、`docs/app.js` +275/-77、`docs/schema.js` +293/-50、`docs/templates.js` +960/-284；`docs/index.html`、`docs/delivery-center.js` 未变。UI 源码侧同样漂移（清单 `5fb23ba7…` vs 当前 `979bc87b…`）。

结论：这是**主线真实改版后证据未同步**，不是可以靠格式修正或重算消除的假差异。

## 3. 为什么 `ui:digest --write` 不能关闭它

1. `scripts/pages-visual-acceptance/sync-ui-digests.mjs --write` 只写四个字段：`source.digest`、`prototype.digest`、`syncedThrough(=HEAD)`、`syncedAt`。它**完全不动** `evidence.directory` 与 17 条 `evidence.routes` —— 那仍是 `docs/evidence/ui-sync/2026-10-30-source-hygiene-e2e/` 下 34 张 10-30 旧截图及旧 state/note。等于把旧截图重签到新 SHA，正是高优清单与 `docs/verification/2026-11-01-aihero-light-dark-implementation.md` 明确禁止的「不重签旧截图」。
2. 更机械的一层：`schemaVersion = 2` 时，若 `currentUiDigest !== manifest.source.digest` 且 `manifest.source.valuePreservation` 不存在，`assessUiSyncState` 会抛「截图对应的 UI 内容摘要不匹配，请重新采集并核对双端证据」。当前清单**没有**谱系记录，因此即便手工只补 `prototype.digest`，strict 会立刻撞上下一条；而伪造谱系也不可行 —— `validateValuePreservationProvenance` 要求 16×3 零差异像素证据报告、冻结的 53/49/4/1 主题保值分类、像素证据 SHA-256 与 PR C Task 0 日落条款。
3. 唯一关闭路径：真实重采双端证据 → 整体更新清单（含 evidence 全部字段）→ 过 strict。

## 4. 正式双端证据规格（从 `validateManifest` 与 10-30 证据集读出）

- 覆盖：17 条注册路由 × 2 端 = **34 张 PNG**，命名 `<id>-devtools.png` / `<id>-pages.png`，文件名不含路径分隔符。
- 视口：`evidence.viewport = 375×812` 逻辑像素；PNG 实际尺寸须为逻辑尺寸的 **1~3 整数倍**且高度按比例，历史证据为 `750×1624`（2×）。
- 每条 `evidence.routes` 必须带 `state`、`note`、`data`（`sanitized-runtime` / `real-runtime` / `fixture`）、`review`（`aligned` / `differences` / `blocked`）；v2 要求证据路由集合与 17 路由完全一致。
- DevTools 侧：微信开发者工具 iPhone X 模拟器，真实云管理员**只读**遍历 17 路由，记录 0 失败 / 0 异常、`startupOutcome`、`productVerdict`；不得触发报名、审批、签到、保存、创建/发布、编辑俱乐部或删除。
- Pages 侧：同一 375×812 视口采集 17 路由，0 横向溢出、0 页面脚本错误；与 DevTools 侧内容不同属正常，逐路由标 `differences`，只对齐布局、主题、信息层级与交互接线。
- 浅/暗：AI Hero 实现后，17 路由需按**两套主题**配对采集（见 `2026-11-01-aihero-light-dark-implementation.md` 的 BLOCKED 条目）。
- 脱敏：真实照片、头像、背景、昵称、实名、电话、紧急联系人、报名编号、连接账号用不透明暗色矩形遮挡；逐图矩形与输出 SHA-256 记入 `redaction-record.json`；原始图与完整运行报告只保留在私有临时目录。
- 绑定：证据目录 README 写明 UI / Pages 摘要与祖先锚点；证据齐备后更新 `syncedThrough`、`syncedAt`、`source.digest`、`prototype.digest`、`evidence.directory` 及全部 `evidence.routes` 描述，并同步修正 `threeWidth.limitation` 的旧 BLOCKED 说明。

## 5. 本轮在最终 SHA `f526806` 上已完成的本地复核（非正式证据）

| 项 | 结果 |
| --- | --- |
| 微信开发者工具 | 重新编译成功；17/17 路由逐页打开并截图成功 |
| 抽样视觉复核 | `activities`（深色电影感、分段控件与骨架正常）、`settings`（00–03 编号章节、浅/暗切换、暗色选中红框正常）、`club/center`（加载骨架态，Hero 为纯中性深色，无径向光晕 / 白色高光 / 毛玻璃）、`admin/reviews`（筛选标签与红选中态、排版正常） |
| 控制台 | 快速连续切页时 IDE 内省出现一条 `inspectee MPPage.getCurrent error: Cannot destructure property 'rawPath' … getPageMetaByWebviewId(...) is null`，属于工具内省告警，非页面业务错误；页面截图均正常 |
| Pages 端 | `node scripts/pages-visual-acceptance/capture-routes.mjs --width 375 --height 812` 采 17/17 路由，`report.json` 全部 `overflow=false`、`pageErrors=[]` |
| Pages 外观 | `node scripts/check-appearance-pages.mjs` 136 组 route/mode/width 检查 PASS（脚本自述「Not WeChat/DevTools evidence」） |
| 门禁 | `check:design`、`test:design`、`test:wxss-contract`、`check:governance`、`check:release-notes`、`check:main-package`、`format:check`、`lint`、`typecheck`、`test:ui-sync` 全 PASS；`check:ui-sync -- --strict` 保持 BLOCKED |
| 前一轮已跑 | `npm test` 93 文件 / 1426 用例、DOM 契约 133 项、主包 454709 字节（余 4606） |
| 门禁逐项补跑 | `validate` 链除 `tool:install` 外 27 项：22 PASS / 5 FAIL；4 项测试失败在 `origin/main@88d8356` 干净基线逐条复现，`check:ui-sync` 为本文第 2 节的既有漂移；`coverage` / `audit:all` 分别被批量删除防护与 npm 镜像 405 阻断。详见验收报告第 4 节 |

以上截图与报告均在 `C:\Users\89786\AppData\Local\Temp\`（`cili-final-sha-ide/`、`cili-pages-final-sha/`），**未**写入 `docs/evidence/`，**未**冒充公开脱敏证据。

## 6. 仍缺失且必须授权 / 真机的部分

- 34 张 750×1624 正式配对截图：真实云管理员只读 + 浅/暗双主题；脱敏处理与 `redaction-record.json`；逐路由差异复核；绑定最终 SHA 后整体写回清单。
- 体验版平台选版与回读（历史因 strict 漂移被阻断，未生成 candidate / verified）。
- iOS / Android 双物理真机、普通成员完整写链路、目标云权威回读。
- 部署与晋级：分支已推送并开出 [PR #433](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/433)（OPEN / MERGEABLE / PR CI targeted 全绿），但**未合并、未上传、未部署、未选版**；合并与晋级须在 strict 关闭后由授权环境执行。

## 7. 关闭顺序（供授权环境照做）

1. 在最终 SHA 上以真实云管理员只读账号，按浅/暗两套主题采集 DevTools 端 17 路由 750×1624 截图，完成脱敏与矩形记录。
2. 以 `capture-routes.mjs`（375×812）采集 Pages 端 17 路由，逐路由比对布局 / 主题 / 信息层级 / 交互接线，产出新证据目录、`README.md`、`redaction-record.json`。
3. 证据齐备并独立复核后，整体更新 `docs/ui-sync-manifest.json` 的 source / prototype / syncedThrough / syncedAt / evidence 全部字段，修正 `threeWidth.limitation`。
4. 跑 `npm run check:ui-sync -- --strict`、全量 `validate` 与体验版晋级门禁；通过后再做平台选版与回读。
5. 最后关闭 P0：双真机 UAT、普通成员写链路、目标云权威回读。

**命令参考（仅为可复跑入口；本轮均未执行，且证据未齐时禁止单独执行第 2 条）**：

```bash
# Pages 端 17 路由，375×812 逻辑视口；正式 PNG 需按 1~3 整数倍输出（历史为 750×1624）
node scripts/pages-visual-acceptance/capture-routes.mjs --width 375 --height 812 --out <private-dir>/pages

# 仅在新证据目录、README、redaction-record.json 与 evidence 全部字段就位后才回算
npm run ui:digest -- --write

# 回算不等于通过：strict、完整链与体验版晋级门禁依次验证
npm run check:ui-sync -- --strict
npm run validate
npm run check:experience-releases
```

注意 `ui:digest -- --write` 只写 `source.digest` / `prototype.digest` / `syncedThrough` / `syncedAt` 四个字段，`evidence.directory` 与 17 条 `evidence.routes` 必须人工整体更新（第 4 节）；在 `schemaVersion = 2` 且缺 `source.valuePreservation` 时，只回算会立刻在下一条校验失败。

## 8. 文档口径冲突已修正

`scripts/pages-visual-acceptance/SKILL.md` 的「典型改版验收流程」原写 `ui:digest --write` 后 strict 应通过，与高优清单 2026-11-06 / 11-07 条及本文第 3 节冲突。本轮补上前置条件：仅回算摘要适用于证据已同步的场景；当 `UI_SYNC_STRICT` 被标为 BLOCKED 时，必须先重采双端证据，禁止仅回算摘要把门禁刷绿。
