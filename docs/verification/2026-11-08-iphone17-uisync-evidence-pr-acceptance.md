# 2026-11-08 iPhone 17 浅/暗双主题双端证据 PR 验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | 基于 `evidence/iphone17-uisync-20261108` → `main`（编号与链接由创建后的 PR 评论留痕） |
| Head SHA | 本 PR head；采集绑定 `adaee321a7c9564dcceaca17bb845fee5f924028` |
| 客户端版本 | 不适用；未改 `miniprogram/` 与 `cloudfunctions/`，未 bump 发布说明 |
| 验收环境 | 微信开发者工具 Stable `v2.02.2609250` / iPhone 17 模拟器、本机 headless Chromium Pages 原型、CloudBase `cloudbase-d0gizacy77a1ab017` 账号级只读 |
| 验收角色 | 真实云管理员只读（IDE 登录「蒙恩」，`auth` 云函数 `role=admin / isSuper=true`，与 `admins` 集合一致） |
| 执行时间 | 2026-11-08 00:36–01:10 CST |
| 执行人 | WorkBuddy（用户已授权 CloudBase 只读、IDE 自动化与 iPhone 17 标准） |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 零改动；17 路由 WXML / WXSS / TS 未改，主题切换只通过产品设置页按钮真实触发 |
| 云函数与数据 | 零写入；仅只读调用。唯一写入是本机 `cili-appearance` 主题偏好（本地 storage），采集后已恢复默认 dark |
| 权限与隐私 | 公开证据全部脱敏：照片/合影/头像/背景、实名、昵称、手机号、紧急联系人、报名与凭证编号按 400×870 当前坐标不透明遮挡；未脱敏原图只留本机私有目录，永不提交 |
| Pages / 文档 | 新增 68 张证据 PNG、README 与 `redaction-record.json`；整体更新 `docs/ui-sync-manifest.json`；`capture-routes.mjs` 新增可选 `--appearance`；根 README 产品预览改引当前清单登记的 Pages 截图；高优清单与 gap 报告标注 strict 已关闭 |
| 部署与回滚 | 未部署、未上传、未选版；证据规格由 iPhone X / 375×812 升级为 iPhone 17 / 400×870，10-30 历史证据与 `threeWidth` 340/375/430 不追溯改写 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 17 路由 × 2 端 × 浅暗双主题采集 | 标准路径 | 最终 SHA、管理员只读登录态、iPhone 17 | 独占单会话遍历 17 路由两轮 + Pages 两轮 | 68 张、尺寸一致、17/17 landed | 68 张全 400×870，`PROBLEMS=0`，两轮各 17/17 就绪 | `devtools-results.json`（私有）、`redaction-record.json` | PASS |
| strict 修复前反例 | 根因反例 | 旧清单 `prototype.digest=3eb3af30…` | 跑 `check:ui-sync -- --strict` | 报 Pages 摘要漂移 | 与 2026-11-07 gap 报告一致，确认不是 CRLF 或笔误 | `docs/verification/2026-11-07-unslop-uisync-evidence-gap.md` | PASS |
| 摘要自然对齐（不伪造谱系） | 边界 | 新证据绑定当前 UI | `source.digest` 设为重算值 `979bc87b…`，不写 `valuePreservation` | strict 直接通过 | 发布严格模式 PASS，0 未同步 UI 提交 | `npm run check:ui-sync -- --strict` 输出 | PASS |
| 空态与边界状态 | 边界 | 真实云样本 | 观察未来活动窗口、待审核筛选、空白创建表单 | 如实记录真实状态 | 未来 14 天无活动、待审核 0 人、空白表单均为真实业务/首访态 | 证据目录 README 逐路由差异表 | PASS |
| automator 协议失败恢复 | 失败恢复 | `callMethod` 传嵌套 event | 改为点击 `.appearance-option[data-mode=…]`，并等待 `loading !== true` | 主题真实生效、页面就绪 | 两轮 `verified=true`，17/17 主题 SHA 不同，恢复默认 dark | `devtools-results.json` | PASS |
| 存量证据兼容 | 存量兼容 | 换 `evidence.directory` | 检查 10-30 目录与 threeWidth 矩阵 | 不改写、不被误引用 | 10-30 原样保留；根 README 引用更新后静态资源完整性测试通过 | `npm test` 93 文件 / 1426 用例 | PASS |
| README 预览引用回归 | 关键回归 | 清单换目录 | 跑 `static-asset-integrity.test.ts` | 无未登记引用 | 首轮发现 3 处旧目录引用并修复，复跑全绿 | `tests/static-asset-integrity.test.ts` 首轮 FAIL → 修复后 PASS | PASS |
| 普通成员写链路 / 双真机 / 平台选版回读 | 端到端 | 隔离环境、iOS/Android 物理机、公众平台权限 | 未执行 | — | 未执行 | — | BLOCKED |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | **未执行完整链** | 首步 `tool:install` 含 `npm ci`，本机 `node_modules` 为跨 worktree 共享 junction，执行有破坏性且上一轮已被 `SAFE_DELETE_BULK_CONFIRM_REQUIRED` 拦截，按既有口径不绕过；已逐项跑完链内等价门禁（见下） |
| `npm run coverage` | **PASS** | `cloud.ts` 覆盖率门禁 lines 91.02% / branches 89.02% / functions 96.60% / statements 90.06%，exit 0 |
| `npm run audit:all` | **BLOCKED（环境）** | npm 镜像返回 `405 Request method 'POST' is not supported`，非本 PR 回归；本轮未改依赖或锁文件 |
| `git diff --check` | PASS | 无空白错误 |
| `check:ui-sync -- --strict` | **PASS** | 发布严格模式：双端截图与当前 UI / Pages 内容摘要一致；0 未同步 UI 提交；普通模式同样 PASS |
| `check:experience-releases` | PASS | `experience_release_repository=valid`（仅仓库候选记录校验，不等于平台选版） |
| 其余逐项门禁 | PASS | `format:check`、`lint`、`typecheck`、`check:governance`、`check:release-notes`、`check:main-package`、`test:content-contract`、`check:design`、`test:wxss-contract` |
| `npm test` | PASS | 93 文件 / 1426 用例全通过（含 DOM 契约与静态资源完整性） |
| PR checks | 待创建后回读 | 合并前不预写结果 |

## 5. 端到端执行记录

1. 用户授权 CloudBase 账号级只读；只读核实 `activities 16`（2 published）、`registrations 8`、`profile_media 22`、`admins 1`，并确认小程序端 `auth` 返回管理员身份。
2. 确认最终交付 SHA：PR #433 已由用户侧合并，main `adaee32` 与 PR head `9223074` 产品代码树完全一致；新建基于 `origin/main` 的证据分支。
3. 固定本机 IDE 缩放为 100% / 关闭 AutoFit，实测 iPhone 17（`402×874` / DPR3 / SDK 3.18.0）渲染输出 `400×870`；按用户选定方案 ① 以实际渲染像素作为双端一致尺寸，不做图像加工、不改门禁代码。
4. DevTools 独占单会话采集 34 张：主题经设置页按钮真实切换并核验，详情页带真实样本参数（本人凭证 ID 由「我的行程」真实数据动态读取），逐页等待就绪态，17/17 landed、0 problems；结束后恢复默认 dark。
5. Pages 用 `--appearance dark|light` 各采 17 张，`400×870`，0 溢出、0 脚本错误；17/17 主题截图 SHA 不同。
6. 逐图回看 17 张真实云截图，按当前坐标画不透明暗色矩形，脱敏后再次回看关键页面确认无 PII 残留；生成 `redaction-record.json` 与 README。
7. 整体更新 manifest（绑定摘要、祖先锚点、证据目录与视口、17 条 routes、`threeWidth.limitation`），未使用 `ui:digest --write` 或 `sandbox-skip-ui-sync` 豁免。
8. 跑完上表门禁；修复 README 预览引用回归后复跑 `npm test` 全绿。

**执行结论**：`BLOCKED`

**未执行或阻塞说明**：本地双端视觉同步证据采集与全部可本机执行的自动化门禁为 PASS；按模板口径的**真实端到端业务验收仍未关闭**：普通成员完整写链路（提交报名/审批/签到/资料保存）、iOS/Android 物理真机、目标云写后权威回读、开发版/体验版上传与微信公众平台选版回读、部署上线。阻塞原因是本环境没有隔离写测试环境、双真机设备与平台选版权限，且采集明确限定为只读；负责人仍为项目所有者，后续入口见 `docs/verification/p0-real-registration-journey.md` 与证据目录 README「未覆盖范围」。`check:experience-releases` 通过不代表平台选版已执行。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回读 | 待合并后回读 | 待合并后回读 |
| Pages | 待合并后回读 | 待合并后回读 | 待合并后回读 |
| CloudBase | 不适用 | 本 PR 无云函数或配置变更 | 不适用 |
| 微信开发版 | 未执行 | 未上传 | 未执行 |

PR 合并前无法取得 main 部署结果，按模板先写「待合并后回读」；合并后须以最终 main SHA 回填平台结果，不得把 PR 分支检查当作生产部署成功。

## 7. 风险与回滚

- 剩余风险：真机与平台选版未验；IDE 渲染 `400×870` 与逻辑视口 `402×874` 存在 fit 差（规格变更已在证据 README 与 `redaction-record.json` 明示）；本机 IDE 的 `deviceScale` / `deviceScaleAutoFit` / `maximized` 为非仓库配置改动，备份在 `%TEMP%/cili-ide-config-backup/`。
- 监控与观察：合并后回读 main CI、Pages 构建、微信开发版上传与体验版晋级证据门禁；若任一失败，按第 8 节保留 BLOCKED，不写成验收完成。
- 回滚步骤：`git revert` 本次证据提交即可回退；`docs/ui-sync-manifest.json` 回退到 10-30 目录会重新暴露 `3eb3af30… / 1036334d…` 摘要漂移，需同步恢复根 README 的 3 处预览引用并通过 `static-asset-integrity.test.ts`。
- 数据恢复：不适用；全程只读，未写任何云数据。

## 8. 最终结论

本 PR 的代码、证据与本地自动化门禁满足合并条件：`check:ui-sync -- --strict` 由「真实重采 68 张双端浅暗证据 + 整体更新清单」真实关闭，`npm test` 93 文件 / 1426 用例全通过，覆盖率门禁通过，未使用摘要回算或豁免标签刷绿。**但端到端验收未完成**，第 5 节列为 BLOCKED 的普通成员写链路、双真机、目标云写后回读、开发版/体验版上传与平台选版回读、部署上线必须保持 BLOCKED，不得以「代码已完成」或「CI 全绿」替代验收完成。合并后还需按第 6 节回读 main 平台结果。
