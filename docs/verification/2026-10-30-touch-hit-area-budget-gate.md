# 触控热区门禁与主包预算回归 · 端到端验收报告

- 分支：`fix/touch-package-budget-20261029`（专用 worktree，已三方 rebase 到 `origin/main=202b72b5d8be60c9c0a9aa42f91b943d679fe059`）
- 原始基线：`754268426df3134e93880483d9f1ca9840740f7f`（#407）；rebase 后基线为 `202b72b5`（#411 暗场对比度/加载反馈 + #408 Logo 回执已保留）
- 报告日期：2026-10-30（CST，rebase 后复测版）
- 总体结论：**BLOCKED / NOT MERGE-READY**。格式、lint、类型检查、静态触控契约、设计/治理/发布说明与硬限额体积已绿；真实剩余 FAIL 为预算预警线（本需求未达标，非外部已知项）、覆盖率闭环、strict UI 同步基线红；native 真机矩阵 BLOCKED。本报告按真实退出码登记，不将阻塞项包装为通过。

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | 待创建 Draft PR；平台创建由发布 MCP 执行，本报告先于提交落盘 |
| Head SHA | 单提交 HEAD（提交与推送完成后以 `git ls-remote --heads origin fix/touch-package-budget-20261029` 实测为准，本地与远端应一致）；PR_BASE `202b72b5d8be60c9c0a9aa42f91b943d679fe059` |
| 客户端版本 | 不适用：本轮未执行 `deploy:miniprogram`，无开发版上传 receipt；#411 发布版本号 `2026.10.30.1` 保留 |
| 验收环境 | 本地专用 worktree + Playwright Chromium（原型层）；无微信 IDE、无真机、无 CloudBase 生产写 |
| 验收角色 | 本地执行视角；普通成员真实写链路沿用高优 P0 阻塞项，不在本轮闭合 |
| 执行时间 | 2026-10-30 01:10–01:50 CST（F2 首轮 + F4 Producer 修复 + F5 rebase 复测，逐项日志见 §4 证据列） |
| 执行人 | 环境准备/集成 Agent；触控样式与原型证据由触控 Producer 产出，预算删除与回归测试由预算 Producer 产出，本报告只做集成登记与门禁执行 |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 新增页面级 `--touch-target-min: 44px` 承载令牌，bearing 与级联兜底统一引用令牌（不再写死字面 `44px`）；主按钮视觉声明保留 `var(--control-height)`（96rpx），窄屏不足由 `hit-pad` 扩张补齐实际命中盒；图标型另补最小宽度；视觉颜色、字号、背景、边框、圆角不在改动集合 |
| 云函数与数据 | 无云函数代码变更；未执行 `cloudbase:apply`；`cloud:install` 仅本地依赖树，无集合/索引/规则写 |
| 权限与隐私 | 无新增数据采集与权限声明；豁免表仅声明纯展示徽章无 tap handler，不改变权限模型 |
| Pages / 文档 | `docs/templates.js`、`docs/styles.css` 原型命中矩形与透明样式；`scripts/phase3-three-width-walkthrough.mjs` 由 32px 视觉门扩展为 44px 有效盒门；新增本验收报告 |
| 部署与回滚 | 回滚 = revert 工作分支提交；无生产数据写，无数据恢复需求；自动部署规则要求 main CI success 后才上传，本轮不触碰部署链路 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据（仓库相对路径） | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 发货控件静态触控契约（含令牌新增用例，共 43 用例） | 正常 | 专用树依赖就绪 | `npm run test:touch-hit-area` | 43/43 通过 | 43 tests / 43 pass / 0 fail（F2 首轮 42 用例；令牌化后 43 用例） | `artifacts/touch-package-delivery/runtime/logs/f5-touch_static.log`（F2 基线见 `f2-touch-static.log`） | PASS |
| 原型动态壳三宽度命中归属（340/375/430） | 正常 | Chromium 缓存就绪 | `npm run test:touch-hit-browser`（独立脚本，未挂 `validate` 主链，不计入主链覆盖） | 每宽度 8 marker ×9 采样点 = 72/72；19 控件 ×5 采样点 = 95/95；负例与重叠为 0 | 三宽度合计 marker 采样 216/216、控件采样 285/285；marker 最小盒 44.66/50.05/52.36px；每宽度可达 click 19/19、带状态副作用 8、控件邻居负例 18/18、marker 负例 8/8、背景误命中 0、相交投影对 0；`disabledExcluded=0` 如实登记 | `artifacts/touch-package-delivery/runtime/logs/f2-touch-browser.log`；计数权威 `artifacts/touch-package-delivery/touch/evidence/coverage-matrix.json`；明细 `browser-report.json` | PASS（原型层，不外推 native；未接入主链不得记为 validate 覆盖） |
| phase3 设计静态壳 16 页 ×3 宽度 | 正常 | 原型页面就绪 | `node scripts/phase3-three-width-walkthrough.mjs` | 0 尺寸失败、0 console 错误 | 363 候选评估；0 失败；3 禁用态登记排除 | `artifacts/touch-package-delivery/touch/evidence/phase3-green-coverage.json`、`phase3-green.log` | PASS（设计静态壳） |
| 禁用/加载态豁免可复核 | 边界 | 豁免登记表 | C 段静态断言 | 豁免证据完整、宿主类仍在 required 集合 | 21 豁免容器；动态壳 disabledExcluded=0 如实登记 | `artifacts/touch-package-delivery/touch/evidence/native-instance-classification.json` | PASS（静态证据） |
| native 真机 tap 矩阵（128 bearing + 6 pad 类族/17 实例 + 17 豁免容器，共 151 行级条目） | 边界 | IDE/真机授权 | 中心 + 四边中点 + 邻居负例 + 禁用态点击 | 运行时 computed 归属与业务回调成立 | 151 条 `file:line` 静态分类已落盘；无本机 IDE/真机授权，运行时 tap 与 computed 几何未执行 | `artifacts/touch-package-delivery/touch/evidence/native-instance-classification.json` | BLOCKED（静态分类 PASS，运行时未执行） |
| 预算：删除真实冗余后行为等价（缓存/持久化/状态机） | 回归 | 假仓储注入 | 定向 vitest 多文件 | 行为断言全绿 | 缓存透传/失败保留/成功失效、状态机助手迁出等用例通过；仅字节预警线 1 例失败 | `artifacts/touch-package-delivery/runtime/logs/f5-vitest-full.log` | FAIL（仅字节预警线断言，见 §4） |
| 预算：主包字节低于预警线（rebase 合并树同算法重测，不沿用旧投影） | 边界 | 同口径计量函数 | `mainPackageBytes() < MAIN_PACKAGE_WARNING_BYTES`（450560） | 低于预警线 | rebase 后合并工作树实测 **457511 B**，高于预警线 6951 B；硬限额 459315 B 余量 1804 B；旧 `452207 B` 干净投影为 F2 快照，不得作为最终结论 | `artifacts/touch-package-delivery/runtime/logs/f5-check-main-package.log`、`f5-vitest-full.log`（断言 457511 < 450560 失败） | FAIL（本需求预算项未满足，禁止上调阈值/挪包） |
| C2 无损 PNG 替换 | 回归 | 同解码像素、同 IHDR | `cp` 替换 + 像素/头校验 | 视觉字节不变、仅压缩体积下降 | 9046→6363 B；解码像素 SHA 不变；IHDR 500×400/8bit/RGBA/非隔行一致；其余资产未改 | 核算文件 `c2Lossless` 段；`f2-budget-targeted.log` | PASS（资产契约） |
| 既有样式契约（沸点控件基线 / 设置页控件基线） | 回归 | 存量 vitest | 全量 `npm test` | 断言与新承载声明一致，且不删断言、不弱化阈值 | bearing 改用 `--touch-target-min` 令牌、主按钮保留 `var(--control-height)` 声明；原 2 例断言转绿（全量仅剩预算 1 失败） | `artifacts/touch-package-delivery/runtime/logs/f5-vitest-full.log` | PASS（令牌正向调和；窄屏实际命中盒由 hit-pad 扩张保证，需独立复核结论） |
| 公共 API 与失败缓存（cached.ts 恢复后） | 回归 | A3 撤回、缓存行为保留 | `caching-repository-persist` 等定向用例 | 参数透传、失败不吞错、成功失效缓存 | 通过（见定向日志） | `f2-budget-targeted.log` | PASS |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` 链内分段 | **链未全绿 exit=1**：`format:check`=0、`lint`=0、`typecheck`=0 已绿；链在 `npm test` 预算失败处停止，后续契约脚本未由链内连续执行（已单项补跑，见下行） | `f5-format_check.log`、`f5-lint.log`、`f5-typecheck.log`、`f5-vitest-full.log` |
| `npm run coverage` | **FAIL exit=1（真实记录，不判 PASS）**：`vitest run --coverage` 被预算 1 例失败短路，`coverage/coverage-final.json` 未产出，云覆盖率阈值脚本未到达 | `artifacts/touch-package-delivery/runtime/logs/f5-coverage.log` |
| `npm run audit:all`（公开 registry 合法复跑） | **PASS exit=0**：`npm_config_registry=https://registry.npmjs.org` 下根、miniprogram-ci allowlist（4 条已评估例外至 2027-01-15）与 13 个云函数在 `--audit-level=high` 下通过；仅 qs moderate 提示不阻断高等级链；无依赖变更，新 head 已复跑确认 | `f5-audit-all.log`；首轮 `f3-audit-all-public-registry.log` |
| `git diff --check` | **PASS exit=0**（rebase 后无空白冲突残留） | `f2-git-diff-check.log`；rebase 无冲突记录 |
| `npm run lint` | **PASS exit=0**：F2 的 32 错误（browser.mjs 全局声明/未用变量、node-test.mjs 无用赋值）已由 Producer 修复 | `f5-lint.log`（F2 留痕 `f2-lint.log`） |
| `npm run typecheck` | **PASS exit=0** | `f5-typecheck.log` |
| `npm run test:touch-hit-area` | **PASS exit=0**，43 tests / 43 pass / 0 fail | `f5-touch_static.log` |
| `npm run test:touch-hit-browser`（独立脚本，未挂主链） | **PASS exit=0**；独立脚本 GREEN 不计入 `validate` 主链覆盖；approval 前按 R-OVERDESIGN-1 收敛 | `f2-touch-browser.log`；`coverage-matrix.json` |
| `npm run check:design` | **PASS exit=0**；53 条颜色账本、17 页面配置、0 颜色/字体字面量 | `f5-check_design.log` |
| `npm run check:governance` | **PASS exit=0**；17 页面治理与 15 个显式 CLI 入口 | `f5-check_governance.log` |
| `npm run check:release-notes` | **PASS exit=0**；21 个产品文件已记录 | `f5-check_release_notes.log` |
| `npm run check:main-package` | **PASS exit=0（仅硬限额语义）**；合并树实测 457511 B，硬限额 459315 B 余量 1804 B；同时打印预警提示（450560 B 预警线被突破）；预警线由预算测试断言守住，硬限额脚本不放宽阈值 | `f5-check_main_package.log` |
| `npm run check:ui-sync --strict` | **FAIL exit=1（基线红保留）**：`同步基线不是当前分支祖先：0119e45e40eca72661754d3251709a527e5c4a87`；按约束不改 manifest、不复制旧截图、不设豁免标签 | `f5-check-ui-sync-strict.log` |
| 全量 `npm test`（vitest） | **FAIL exit=1（仅预算 1 例）**；92 文件：91 通过 / 1 失败；1404 用例：**1403 通过、1 失败**（`mainPackageBytes()=457511 < 450560` 不成立） | `f5-vitest-full.log` |
| C2 像素独立复核（pngjs 外置于项目目录解码，未新装依赖） | **PASS**；基线/当前文件解码缓冲逐字节相等（`pixelBuffersEqual=true`），IHDR 相等（500×400、8bit、colorType 6、非隔行），解码像素 SHA 同为 `eb2774e8…`；文件字节 9046→6363（-2683） | `artifacts/touch-package-delivery/runtime/logs/c2-pixel-independent.json` |
| 独立只读审查（independent-review-subagent） | **FAIL（draftOnly=true，allowed=false）**；阻断：R-BUDGET-1 预算预警线、R-NATIVE-1 真机矩阵、R-UI-SYNC-1 基线红保留；另有 OPEN/FOLLOWUP 项见 §5.1 | `artifacts/touch-package-delivery/independent-review/verification.json` |
| PR checks | 未执行；Draft 创建与平台回读由发布 MCP 在授权后执行；本地不模拟平台结论 | — |

## 5. 端到端执行记录

1. 准备：专用 worktree 锁定在基线 `75426842`；`TMPDIR`、`npm_config_cache`、`PLAYWRIGHT_BROWSERS_PATH` 全部重定向到 `artifacts/touch-package-delivery/runtime/`，不污染原树与系统缓存。
2. 静态层：`node --test scripts/touch-hit-area/node-test.mjs` 捕获 RED→GREEN 证据；权威 RED 来自基线 `git archive` 快照（首轮 42 用例 24 过 18 败），令牌化后 GREEN 为当前树 43/43。
3. 原型层：本地 127.0.0.1 原型服务 + Chromium 三宽度 `elementFromPoint` 采样与 click 派发；证据含控件 tag/data-state/aria-label 身份快照，`liveButtonCount=19`，无 mock 节点。
4. 设计壳层：phase3 16 页 ×3 宽度静态几何门；禁用态 3 例登记排除，不计失败。
5. 预算层：删除项按 `final-machine-accounting.json` v1.1 七行明细登记；A3（cached.ts）已撤回恢复公共 API 与失败缓存测试；C2 无损替换经像素与 IHDR 校验。
6. 未执行项与阻塞原因：
   - native 真机 tap 矩阵：BLOCKED，无 IDE/真机授权；浏览器与静态证据不外推为 native PASS；151 条行级分类已落盘但缺运行时 computed 几何与业务回调证据。
   - 普通成员完整写链路（创建→发布→报名→审批→凭证→取消→重报回读）：BLOCKED，沿用 P0，本轮不关闭任何 P0 行。
   - `format:check` 8 文件与 `lint` 32 错误：**已由 Producer 修复并复跑 exit=0**（F4/F5 留痕）；样式契约 2 例经令牌正向调和转绿，未删断言、未弱化阈值。
   - 预算预警线（450560 B）回归：**FAIL（本需求未满足，非外部已知项）**；rebase 合并树实测 457511 B，硬限额 459315 B 未破；禁止上调阈值、禁止挪包冒充净减。
   - UI-sync strict：FAIL/RED 保留；rebase 后基线 `0119e45…` 非当前分支祖先；禁止改 manifest 豁免或复制旧截图冒充当前 SHA。
   - 覆盖率闭环：FAIL，预算失败未闭合前 `coverage-final.json` 未产出，云覆盖率阈值脚本未到达，不落地为 PASS。
7. rebase 记录：分支从 `75426842` 基线三方 rebase 到 `origin/main=202b72b5`，无冲突；#411 暗场对比度/加载反馈与 #408 资产回执完整保留，触控令牌、删除项与测试文件无丢失；本地备份 ref `backup/pre-rebase-fix-20261030`。

**执行结论**：BLOCKED（局部 PASS 不得提升为整体 PASS；需求未全部完成）。

### 5.1 独立审查登记的 OPEN / FOLLOWUP 项（本轮未闭合，禁止表述为“全部实现”）

| 规则 | 级别 | 事实 | 处置与后续入口 |
| --- | --- | --- | --- |
| R-CASCADE-1 | PARTIAL→OPEN（运行时证据仍缺） | 4 处特异性冲突（filter-tab、profile/settings rowlink、chapterhead-action）已用 `--touch-target-min` 高特异性选择器在 `app.wxss` 1261/1265/1269 行固定承载；但缺 native computed-style 实测，`overflow:hidden` 裁剪与原生 button 裁剪未测；窄屏主按钮由 hit-pad 扩张保证实际盒，需独立复核几何 | 后续补 computed 几何证据；契约若新增窄屏 44 断言属正向升级，须独立审查，禁止删断言补绿 |
| R-EVIDENCE-1 | PARTIAL→OPEN（运行时未执行） | 151 条 `file:line` 行级分类已落盘：128 bearing + 6 pad 类族（17 实例/6 文件）+ 17 豁免容器；缺运行时 tap 矩阵与业务回调归属 | Producer/真机环境补运行时证据；静态分类不替代 native PASS |
| R-DOC-DRIFT-1 | OPEN | 本报告已对齐权威口径：静态 43 用例、每宽度 marker 72 采样、控件 95 采样；`scripts/touch-hit-area/README.md` 第 7 行仍写“42 用例”，待 Producer 同步；PR 描述以 43/1403 口径为准 | Producer 提交前更新 README；不得以旧数字入 PR 描述 |
| R-C2-PIXEL-1 | PASS（本地双独立解码） | 实施方 pngjs 证据 + 独立审查 r7 复解码均为 `PIXEL_IDENTICAL_INDEPENDENTLY_CONFIRMED`：像素 SHA `eb2774e8…` 一致、IHDR 一致、字节 -2683；CI clean 树仍须复跑资产契约 | `c2-pixel-independent.json`、`independent-review/c2-pixel-decode-r7.json` |
| R-OVERDESIGN-1 | FOLLOWUP（不阻塞本 Draft） | 静态链为必要契约；`browser.mjs` 与 walkthrough 采样概念重叠、为非链独立脚本；approval 前应收敛为薄副作用层或并入既有 walkthrough，并清理仓库外 dev 副本 | 独立削减审判结论落地后由 Producer 执行；本轮不借“削减”新增功能或改写语义 |
| 链覆盖边界 | 事实声明 | `test:touch-hit-area` 已挂入 `validate`；`test:touch-hit-browser` 为独立脚本、未入主链，其 GREEN 不计入 `validate` 覆盖；主链在 `npm test` 预算失败处停止，§4 单项复跑结果不等同主链全绿；预算闭合后须由主链连续复跑确认 | 预算闭合后重跑完整 `validate` 与 `coverage` |

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回读 | 待合并；Draft 阶段不代表 main 结果 | 合并后以最终 main SHA 回填 |
| Pages | 本地原型层验证 | 静态/原型证据成立；非部署动作 | 无线上 Pages 部署回读 |
| CloudBase | 不执行 `cloudbase:apply` | 安全跳过（无云资源变更） | 无写操作、无配置漂移 |
| 微信开发版 | 不执行 `deploy:miniprogram` | 安全跳过 | 无上传 receipt；不存在版本号可回读 |

分支基线说明：已三方 rebase 到 `origin/main=202b72b5`（#408、#411），无冲突；重叠的 4 个 wxss 与 `settings/index.ts`、`high-priority-issues.md` 经三方合并保留主题/加载反馈与触控令牌两侧内容。后续 target 若再前进，须重新 fetch 并在干净围栏内 rebase，禁止强推覆盖他人提交。

## 7. 风险与回滚

- 剩余风险一：预算预警线缺口（合并树 457511 B 对 450560 B，超 6951 B）；后续删除必须行为等价且不挪包冒充；禁止上调硬限额 459315 或预警常量 450560。
- 剩余风险二：`--touch-target-min` 令牌方案的窄屏实际命中盒（主按钮 hit-pad 扩张）尚缺 native computed 几何复核；不得用原型证据替代。
- 剩余风险三：UI-sync strict 基线红（基线 `0119e45…` 非祖先）保留；禁止改 manifest 豁免或复制旧截图。
- 监控与观察：合并前关注 validate/coverage/audit 三 harness 报告、主包体积与 CI 平台 checks；覆盖率在预算闭合后必须真实产出 `coverage-final.json` 并过阈值。
- 回滚步骤：`git revert` 本分支合并提交；触控 wxss 仅在 `touch-hit-begin…end` 标记块内，可按块回退；令牌删除不影响既有 `--control-height` 主题声明。
- 数据恢复：不适用（无生产写、无数据库变更）。

## 8. 最终结论

不满足合并条件（NOT MERGE-READY；独立只读审查 `verification.json` 结论 `FAIL`、`mergeDecision.allowed=false`、`draftOnly=true`）。本轮可确认成果：触控静态 43 用例 GREEN、原型三宽度每宽度 marker 72/72 与控件 95/95 GREEN、phase3 设计壳 GREEN、C2 无损资产经两次独立解码确认一致、format/lint/typecheck/design/governance/release-notes/硬限额体积/公开 registry 全链审计 GREEN、全量 1403/1404 用例通过。真实剩余阻塞：①预算预警线 FAIL（合并树 457511 B，本需求未达标，非外部已知项）；②`coverage` 未闭环（`coverage-final.json` 缺失）；③strict UI-sync 基线红保留；④native 真机 tap 矩阵与普通成员完整写链路 BLOCKED；⑤§5.1 运行时 computed 证据、README 计数同步、browser 脚本收敛等 OPEN/FOLLOWUP 项。Draft PR 按真实 FAIL/BLOCKED 状态提交，结论不得写“可合并”、不得表述为需求全部完成；P0 行不关闭；需求交付以阻塞项逐项闭合和全链绿为准。

## 9. F8 冻结补充记录（2026-10-30 最终集成轮，覆盖本节之前的 F5 旧计数）

> 本节为最终集成冻结事实；§1–§8 保留 F5 历史证据，其中 43 用例、1403/1404、457511 B、coverage 缺失与祖先门报错等旧表述以本节为准。

### 9.1 本轮实际范围

- 触控静态契约冻结为 **50/50/0**：在既有 E4 spacing/position/视觉保护映射之外，补充 `letter-spacing` 负例；README 同步为 50/50；产品颜色、字号、44px 令牌、主题字段与资产字节未改。
- 删除经五维审计确认零渲染的 `activity-card`、`blur-text` 共 8 个文件，并清理 8 处注册 JSON；存活组件 `state-view`、`generated-activity-cover`、`status-pill`、`brand-logo`、`cili-avatar` 完整保留。
- 集成侧受控完成 `#408` 祖先锚点数据修复（`syncedThrough` 绑定可达 merged commit `79bf1e0b…`，新增 `anchorProvenance`；两个 digest 原样保留，未跑 binder `--write`、未复制截图）与受控 `@import` 解析器（6 个正/负例）。
- `miniprogram/styles/shared.wxss`（303 B）不在本轮授权删除/提交范围，保持未跟踪；脏工作树主包计量保守计入该文件，最终 committed 快照单独排除并在外部 JSON 记录差值。

### 9.2 真实门禁退出码

| 门禁 | 退出码 | 事实与日志 |
| --- | --- | --- |
| `npm run validate` | **exit=1** | `artifacts/touch-package-delivery/runtime/logs/f8-validate-full-final.log`；`format:check`/`lint`/`typecheck`、94 文件 1417 用例、phase3 16 页 ×3 宽度、暗场 3 宽度 ×3 轮、CI/journey/bootstrap/deploy/发布说明/UI 节点测试/设计节点测试/`check:design`/`check:release-notes`/`check:main-package` 均到达并通过；链在非 strict `check:ui-sync` 原型摘要不匹配处停止，后续治理/云测试/build 已单独补跑 |
| `npm test`（validate 内 vitest） | exit=0 | 94 files / 1417 tests passed / 0 failed（同一日志第 887–888 行） |
| `npm run coverage` | exit=0 | `f8-coverage-final.log`；`coverage/coverage-final.json` 已产出；云覆盖率 lines 91.63%、branches 89.27%、functions 96.60%、statements 90.62% |
| `npm run audit:all`（官方 registry） | exit=0 | `f8-audit-official-final.log`；`npm_config_registry=https://registry.npmjs.org/` 下根目录 0 high、上传工具 4 条已评估例外至 2027-01-15、13 个云函数 high 链通过；`qs` 仅 moderate，不阻断 high 门槛。npmmirror 未实现 audit 端点的失败留痕为 `f8-audit-all-final.log`，不作为最终审计结果 |
| `npm run check:governance` | exit=0 | `f8-governance-final.log`；17 页面、README 引用、媒体上传、源码模式与 Actions 安全基线通过 |
| `npm run check:design` | exit=0 | validate 链内执行；53 条颜色账本、17 页面配置、0 颜色/字体字面量 |
| 云测试/云包校验/build | exit=0 | `f8-validate-remaining-supplement.log`：13 个云函数测试 102 pass、部署包自包含校验通过、`tsc -p tsconfig.build.json` 与源码完整性校验通过 |
| `npm run check:ui-sync --strict` | **exit=1** | `f8-ui-sync-strict-final.log`；#408 祖先门已闭合，剩余失败为 Pages 原型摘要：manifest `879d43a9…` vs 当前 `783e5d91…`；未改 digest、未加豁免、未补旧截图 |
| 死组件守卫 | exit=0 | `deadcomponents-guard-after-owner-delete.log`：5/5 通过；目录缺失、无注册、无标签、存活目录完整、注册路径可解析 |
| `git diff --check` | exit=0 | 无空白错误与冲突标记 |

### 9.3 主包计量口径

- 脏工作树（含未跟踪 `shared.wxss=303 B`）：94 文件、444922 B，低于预警线 450560 B，硬限额 459315 B 余量 14393 B；该数字是保守 on-disk 口径。
- 最终 committed HEAD 由 `git archive HEAD miniprogram` 生成，93 文件、**444619 B**，不含未跟踪 `shared.wxss`；`444922 - 303 = 444619` 校验成立。相对 `202b72b5…` committed 主包净减 14532 B，低于预警线 5941 B，距硬限额 14696 B；最终 HEAD SHA 以提交后 `git rev-parse HEAD` 与 PR 台账为准。逐文件明细在 `artifacts/touch-package-delivery/package/analysis/f8-committed-budget-final.json`，对账摘要并入 `deadcomponents-final-accounting.json`。
- 预算常量、分包排除规则、阈值与主包脚本零改动；禁止用仓库总净字节、旧 base `7542684` 投影或未跟踪文件冒充 committed 主包结论。

### 9.4 未闭合阻塞（不得表述为全绿/可合并）

1. **strict UI-sync 摘要门 FAIL**：祖先数据缺陷已修；其中 Pages 原型摘要部分已在 §10 受控闭合，`source(ui)` 摘要仍未闭合，禁止手工写 digest 或复制旧截图。
2. **native 真机 tap 矩阵 BLOCKED**：静态 50 例与 Playwright 原型证据不替代 iOS/Android 真机 computed 几何与业务回调。
3. **普通成员完整写链路、体验版晋级与公开媒体 UAT**：沿用高优 P0/P1 独立验收行，本轮不关闭、不并入 UI 提交前置。
4. PR 平台卡片仍待发布 MCP 创建/更新；本报告不伪造 PR URL。

## 10. R25 Pages 原型摘要受控闭合（2026-10-30；状态 `PAGES_PROTOTYPE_DIGEST_CLOSED / SOURCE_UI_DIGEST_NATIVE_BLOCKED_NOT_MERGE_READY`；覆盖 §9.4 第 1 项的 Pages 部分，source/native 阻塞保留）

### 10.1 授权边界与 docs 原型 diff 审计

- 本轮授权范围限定为官方 binder 的 `prototype` 作用域：只更新 `docs/ui-sync-manifest.json` 的 `prototype.digest`；`source.digest`、`syncedThrough`、`syncedAt` 不得由本次 Pages 动作改写。未使用 legacy 全量 `--write`，未手填 hash，未复制旧 IDE 或 phase3 截图冒充当前新采集。
- 以 `origin/main` 三点 diff 到 HEAD 的口径统计，`docs/styles.css` 与 `docs/templates.js` 分别为 `+15/-0`、`+15/-0`，合计 `+30/-0`；两文件当前 SHA-256 分别为 `22cd7db06328e4fc70362befaabf30eafd99a39725a8c2388f627a633b75df7c`、`0ce762725463120d124b669f5b0a05062af53fb2feec4d1a751437aeacaac5a6`。
- 审计结论：新增内容仅为透明触控命中矩形、glyph `pointer-events: none` 归属与 `HIT_SIDE=15.4` / `hitOffsets` / `hitX/hitY` 事件承载层；未改颜色、字号、字重、背景、边框、圆角、glyph 坐标、label 坐标或数据切片。外部辅助审计：`/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/package/analysis/docs-touch-semantic-aux-note.md`。

### 10.2 受控 binder TDD 与写回字段

| 项 | 事实 |
| --- | --- |
| 节点测试 | `npm run test:ui-sync` exit=0，31 tests / 31 pass / 0 fail；日志 `/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/runtime/logs/r25/test-ui-sync.log` |
| 新增守卫用例 | ① `--write --scope=prototype` 只改 `prototype.digest`；② `--scope=native` 在写文件前报错且 manifest 字节不变；③ 只读调用不修改 manifest |
| 写回命令 | `node scripts/pages-visual-acceptance/sync-ui-digests.mjs --write --scope=prototype` |
| 写回快照 | `/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/package/analysis/pages-binder-write-snapshot-20261030.json` |
| `prototype.digest` | `879d43a9…b07a` → `783e5d91…2f1`；清单值与当前计算值一致 |
| `source.digest` | 保持 `sha256:afa1f2548fcc28151a860d4e7e08a37b23740d8a31c8cbb65ebb0f4c7378d90d` |
| `syncedThrough` | 保持 `79bf1e0bec32f6fbe9c3f754da5052f15aca6451` |
| `syncedAt` | 保持 `2026-10-29T13:27:27.287Z` |
| legacy 全量 `--write` | 本轮未执行；其机械刷新 `source.digest` 与同步时间戳的行为不在 Pages 授权范围内 |

### 10.3 17 条 Pages 路由本地 Chromium 证据

- 采集报告：`/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/runtime/pages-browser/final-20261030/report.json`；`capturedAt=2026-10-30T01:43:01.951Z`，视口宽 390；17 条路由 `overflow=0`、`pageErrors=0`，截图均为 390×844 非空 PNG。
- 仓库内公开取证摘要（不含原始 PNG 二进制，含逐张文件名、字节、宽高、SHA-256、溢出与错误状态）：[`../evidence/ui-sync/2026-10-30-r25-prototype-only/pages-local-chromium-index.json`](../evidence/ui-sync/2026-10-30-r25-prototype-only/pages-local-chromium-index.json)；私有原始采集台账保留在 `/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/package/analysis/pages-capture-evidence-index-20261030.json`。
- 覆盖路由：`activities`、`activity-detail`、`route-analysis`、`registration-form`、`registrations`、`credential`、`profile`、`capability-card`、`settings`、`profile-edit`、`admin-activity-list`、`admin-activity-edit`、`admin-reviews`、`admin-review-detail`、`club/center`、`admin-club-applications`、`admin-club-application-detail`。
- 证据边界：采集时隐藏 showcase 外壳并展开 `#screen-container` 以获得 fullPage 展示态；这些图是 Pages 原型展示证据，不是微信真机 viewport 几何、不是 iOS/Android tap 矩阵、不是普通成员写链路或 CloudBase 回读证据。

### 10.4 触控证据两阶段分离

| 阶段 | 口径 | 实测事实 | 索引 |
| --- | --- | --- | --- |
| Phase A measurement | 保持原运行时布局，不展开/不强制动画；`elementFromPoint`、原生 click 派发与 `showPage` 状态副作用 | 340/375/430 三宽度 marker 最小盒 `44.66/50.05/52.36px`；每宽度 19 个控件采样、0 相交重叠对、8 个 marker 可达且归属匹配；8 个带状态控件 click 有状态变化 | 仓库摘要：[`../evidence/ui-sync/2026-10-30-r25-prototype-only/touch-phase-summary.json`](../evidence/ui-sync/2026-10-30-r25-prototype-only/touch-phase-summary.json)；私有原始台账保留在外部 analysis 目录 |
| Phase B presentation | 仅生成/复用展示态截图，单独记录文件 mtime、字节与 SHA-256，`regenerated=false` | `route-analysis-340/375/430.png` 三张；430px 展示放大后的坐标不得回写为手机运行时命中几何；既有 capturedAt、字节与 SHA-256 完整保留，未用报告运行时间冒充新截图 | 仓库摘要同上；私有权威报告 `/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/runtime/touch-browser-evidence/browser-report.json` |
| 静态触控契约 | `npm run test:touch-hit-area` | exit=0，50 tests / 6 suites / 50 pass / 0 fail；日志 `/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/runtime/logs/r25/test-touch.log` | — |

### 10.5 R25 组件门禁退出码

| 门禁 | 退出码 | 说明与日志目录 `/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/runtime/logs/r25/` |
| --- | --- | --- |
| `npm run format:check` | 0 | 全量格式检查通过 |
| `npm run lint` | 0 | ESLint 通过 |
| `npm run typecheck` | 0 | TypeScript 无错误 |
| `npm run test:ui-sync` | 0 | 31/31；含 prototype scope 三个新守卫用例 |
| `npm run test:touch-hit-area` | 0 | 50/50 |
| `npm run test:design` / `check:design` | 0 / 0 | 设计契约与设计规则通过 |
| `npm run test:ci-contract` | 0 | 45/45 |
| `npm run check:governance` | 0 | 治理与源码模式通过 |
| `npm run check:main-package` | 0 | 硬限额语义通过；committed 与脏工作树口径仍按 §9.3 分开，未跟踪 `shared.wxss` 不提交 |
| `npm run check:ui-sync` | **1** | 失败点已不再是 prototype 摘要；剩余为 `source(ui)` 摘要不匹配 |
| `npm run check:ui-sync --strict` | **1** | 同上，失败消息为“截图对应的 UI 内容摘要不匹配，请重新采集并核对双端证据”；不得改为 skip、豁免或绿标 |

### 10.6 当前 source(ui) 摘要门精确记录

仓库内机器可读记录：[`../evidence/ui-sync/2026-10-30-r25-prototype-only/source-ui-gate-block-record.json`](../evidence/ui-sync/2026-10-30-r25-prototype-only/source-ui-gate-block-record.json)。

- 未闭合摘要字段：manifest `source.digest=sha256:afa1f2548fcc28151a860d4e7e08a37b23740d8a31c8cbb65ebb0f4c7378d90d`；当前计算 `source(ui)=sha256:4273274e99cbe82d0db21d75a7f2fc07ad2eda57ebbf871630b12db948f7d316`，`sourceMatches=false`。prototype 双值均为 `sha256:783e5d916b349b6db6e198df6f8393069f2d951483cc5ad3563b552eebe5e2f1`；`syncedThrough=79bf1e0bec32f6fbe9c3f754da5052f15aca6451` 与 `syncedAt=2026-10-29T13:27:27.287Z` 未被 prototype scope 改写。
- 保值分类器规则：`scripts/theme-preservation-policy.mjs` 的 `classifyValuePreservingThemeMigration` 在 355-360 行先取 `miniprogram/**` 与 `cloudfunctions/**` 产品文件；只要存在既不是 `miniprogram/config/theme-contract.json`、也不匹配 `miniprogram/**.wxss` 的文件，即返回 `eligible=false`，原因 `product path outside the value-preserving theme whitelist`。本轮实测结果正是 `eligible=false`。
- 当前按三点对比口径从 `origin/main` 到 HEAD 的 `miniprogram` diff 共 40 个路径：27 个修改、13 个删除；其中 11 个为 wxss 路径形状，29 个不在分类器早期白名单内。29 个非白名单路径又分为 19 个修改非 wxss/json/asset/wxml/ts 路径和 10 个删除非 wxss 路径。
  - 19 个修改非白名单路径：`miniprogram/assets/brand/logo-share-500x400.png`、`miniprogram/pages/activities/index.json`、`miniprogram/pages/activities/timeline-state.ts`、`miniprogram/pages/activity-detail/index.json`、`miniprogram/pages/activity-detail/index.wxml`、`miniprogram/pages/admin/activity-edit/index.json`、`miniprogram/pages/admin/activity-edit/index.wxml`、`miniprogram/pages/admin/activity-list/index.json`、`miniprogram/pages/admin/activity-list/index.wxml`、`miniprogram/pages/admin/review-detail/index.json`、`miniprogram/pages/admin/reviews/index.json`、`miniprogram/pages/credential/index.wxml`、`miniprogram/pages/profile-edit/index.json`、`miniprogram/pages/profile/index.json`、`miniprogram/pages/registrations/index.wxml`、`miniprogram/pages/route-analysis/index.wxml`、`miniprogram/pages/settings/index.ts`、`miniprogram/repositories/persistent.ts`、`miniprogram/utils/date-time.ts`。
  - 10 个删除非白名单路径：`miniprogram/components/activity-card/index.json`、`miniprogram/components/activity-card/index.ts`、`miniprogram/components/activity-card/index.wxml`、`miniprogram/components/blur-text/index.json`、`miniprogram/components/blur-text/index.ts`、`miniprogram/components/blur-text/index.wxml`、`miniprogram/components/metric-grid/index.json`、`miniprogram/components/metric-grid/index.ts`、`miniprogram/components/metric-grid/index.wxml`、`miniprogram/utils/registration.ts`。
- 即使本地视觉比对等价，也不能替代分类器：分类器先按路径集合与保值谱系裁决，截图外观一致不会把 `wxml/ts/json/asset/组件删除` 路径纳入合法保值 lane。
- 闭合 `source.digest` 字段的必要证据限定为：iOS 与 Android 微信真机各自覆盖 17 条路由的原生截图、实际 native tap/click 矩阵、computed 命中几何、tap 回调结果、选中/页面状态变化、设备型号、系统与微信版本、采集时间、逐图哈希与状态哈希；并将这些双端截图、点击矩阵和摘要比较绑定到同一最终 push head。另一条合法路径是后续 diff 严格落入分类器白名单并通过新增 `theme-contract.json`、token 保值、映射与消耗要求。普通成员写链路、CloudBase 回读、媒体解码和体验版晋级属于独立业务验收，不作为本摘要字段的直接输入。本地 Chromium 展示图、Phase A DOM 采样、旧 phase3/devtools/dark 截图均不得手填或冒充该输入。
- PR 平台条件与摘要字段分开记录：用户历史合并授权继续保留，不再写成缺失；当前平台侧仍需最终 push head 的非作者 `Approve` 和必需 CI/check 收敛。本地 Draft 分支 push 不等于 merge。

### 10.7 其他独立运行时阻塞（不作为 source 摘要门字段输入）

- 普通成员完整写链路、CloudBase 集合/文档回读、公开骑友媒体解码、体验版晋级回读和双端真实手势权限验收，仍沿用清单中的独立 P0/P1 事项；它们影响整体业务验收，但不直接作为 `source.digest` 字段计算输入。
- 这些事项不得被本轮 Pages 原型闭合、静态触控契约或主包预算结果覆盖为已完成。

### 10.8 冻结台账与预算口径

- 本地冻结台账由外部独立 JSON 承载，避免把本地截图、原始日志或临时取证目录提交进仓库：`/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/env-prep/r25-final-integration-state.json`；最终门禁日志目录为 `/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/runtime/logs/r26-final/`。
- 主包预算按两个口径分别登记：committed `git archive HEAD miniprogram` 经官方 `mainPackageFiles()` 排除分包目录后为 93 文件、444619 B；工作树保守口径为 94 文件、444922 B；差额即未跟踪且不提交的 `miniprogram/styles/shared.wxss=303 B`，`444922 - 303 = 444619` 校验成立。明细：`/Users/bytedance/work/ride-event-miniprogram/artifacts/touch-package-delivery/package/analysis/r25-committed-budget-final.json`。
- 本轮未执行 PR 创建/重试、合并、IDE 云写或生产云写；平台 PR 状态由发布 MCP 回读与维护。Pages 原型闭合只降低 prototype 摘要门禁失败，不把总体状态改写为可合并。

### 10.9 绑定最终候选 head 的 validate / coverage / audit 实跑记录

| 命令 | 退出码 | 事实与日志位置 |
| --- | --- | --- |
| `npm run validate` | **1** | 链上 `tool:install`、format、lint、typecheck、Vitest 94 文件 / 1417 tests、content 74、rights 31、strava 76、wxss 3、触控 50、phase3/dark、CI 契约 45、journey 130、bootstrap 156、deploy 65、release-notes 14、UI 节点 31、design 12、release-notes 检查与主包预算均已执行；链在 `check:ui-sync` 因 source 摘要不匹配停止。日志：`runtime/logs/r26-final/validate.log` |
| `check:governance` / `test:cloud` / `verify:cloud-packages` / `build` | 0 / 0 / 0 / 0 | validate 链停止后的独立补跑，日志位于 `runtime/logs/r26-final/post-validate-segments.txt` 与对应命令日志 |
| `npm run coverage` | 0 | Vitest 94 文件 / 1417 tests 通过；云覆盖率门禁 lines 91.63%、branches 89.27%、functions 96.60%、statements 90.62%；日志 `runtime/logs/r26-final/coverage.log` |
| `npm run audit:all` | **1** | 根 `npm audit` 命中镜像源 `/-/npm/v1/security/* not implemented yet` 404，链在根审计停止；`scripts/audit-miniprogram-ci.mjs` 与 `cloudfunctions/shared` 分别为 0，其余函数 audit 段均为同一 registry endpoint 1，不得把该失败解释为已确认依赖漏洞，也不得标记为全绿。分段日志：`runtime/logs/r26-final/audit-segments/` |
| `npm run check:ui-sync` / `--strict` | 1 / 1 | source 摘要不匹配；不 skip、不豁免、不改写为 green |
