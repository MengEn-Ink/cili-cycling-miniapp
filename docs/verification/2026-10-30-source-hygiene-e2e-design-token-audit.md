# 源码卫生、E2E 与设计令牌复审

日期：2026-10-30（CST）
基线：`origin/main@202b72b5d8be`
分支：`chore/source-hygiene-design-audit-20261030`

## 范围

- 复核源码卫生、仓库治理门禁和未跟踪本地证据边界；
- 重新审计 17 条小程序路由、云函数与发布链路能够被当前自动化证明的范围；
- 调研外部 `DESIGN.md`、设计令牌和 UI 审核实践，并把适用于微信小程序且不增加运行时依赖的部分收口到现有契约；
- 不新增业务字段、接口、云函数、集合、权限、状态机或运行时依赖；不执行生产写入、部署、上传、体验版晋级或真机冒充验收。

## 验收矩阵

| ID | Given | When | Then | 状态 / 证据 |
| --- | --- | --- | --- | --- |
| H1 | 最新 `origin/main` | 执行源码卫生扫描与治理检查 | 系统垃圾、临时证据、调试语句、抑制型注释和异常执行位可被稳定识别 | `LOCAL_PASS`；`check:governance`、Git mode 门禁、`git diff --check` 通过 |
| D1 | 当前电影暗色三层令牌 | 执行设计契约测试和检查器 | primitive → semantic → component 结构完整，页面无主题字面量，现有视觉值不漂移 | `LOCAL_PASS`；14/14 设计契约、25 个核心 component token、0 未定义 token、0 页面颜色/字体字面量 |
| E1 | 当前 17 条注册路由与 E2E 驱动 | 执行本地契约、Pages、DevTools 可用性和证据复核 | 自动化能力、现场证据与阻塞项分层记录，不以 Mock/Pages/模拟器替代真机或写链路 | `LOCAL_READONLY_PASS / PARTIAL`；真实云只读 30/30、17/17、0 异常，Pages 同视口 17/17；现场写链路和双真机未提供 |
| R1 | 本次候选工作树 | 执行严格 UI sync、治理和全量 `validate` | 本地门禁通过，或保留准确失败与唯一下一步 | `LOCAL_PASS`；新采双端证据绑定当前摘要，strict UI-sync、治理与全量 `validate` 退出 0 |

## 外部设计系统调研

- 2026-10-30 通过 GitHub topic 搜索盘点 `design-system`：当时报告约 8,626 个仓库；GitHub Search API 只能稳定取得前 1,000 个结果，因此本次对前 1,000 个做元数据扫描，并对与本项目最相关的 `DESIGN.md`、token、移动端状态和静态门禁模式做源码抽样，而不是宣称逐文件审阅全部 8,626 个仓库。
- 定向检出与核对：
  - `ricocc/brands-design-md@a3ad408b`：采用 `DESIGN.md` 作为简短实施入口、来源与 token 并列、Do/Don't 显式化；仓库当时未发现 LICENSE，因此只借鉴抽象结构，没有复制其品牌内容或源码。
  - `VoltAgent/awesome-design-md@fcc70284`（MIT）：采用可移植设计说明的目录结构，不复制第三方品牌皮肤。
  - `Leonxlnx/taste-skill@12af471f`（MIT）：采用“产品对象优先、状态诚实、移动端单独审查、动效克制”的原则。
  - `mui/material-ui`、`chakra-ui/chakra-ui`、`carbon-design-system/carbon`、`primer/css`、Style Dictionary / Primer Primitives 等只用于比较 token 分层和治理方式；React、Tailwind、Web hover/scroll 体系和运行时 token 编译器不适合当前微信小程序与主包预算。
- 落地选择为 `DESIGN.md + theme-contract.json + check-design.mjs + Pages/DevTools/真机分层证据`，不增加运行时依赖、字体或图片资产。
- Topic 元数据含 `NOASSERTION` 或缺许可证的项目一律只作思路索引；本次新增文件均为本仓库原创表达，不搬运未明确授权内容。

## 源码卫生发现与修复

### 测试发现边界

- RED：原 `vitest.config.mjs` 会进入忽略目录 `artifacts/`，一次误发现 370 个测试文件、5,618 项并产生 24 个来自另一工作树快照的失败。
- GREEN：显式排除 `.trae/**`、`.superpowers/**`、`artifacts/**`、`coverage/**`、`dist/**`、`miniprogram_npm/**`，新增 `scripts/vitest-config.node-test.mjs` 并接入 `test:ci-contract`。
- 当前 `npm test` 只发现本仓库 90 个测试文件，1,385/1,385 通过；本次删除两个只验证已退役实现的测试文件，所以文件数从修复前预期 92 降为 90。

### 主包死代码

- 删除无任何 WXML 宿主的 `activity-card`、`blur-text`、`metric-grid` 三个组件及八处失效页面注册。
- 删除只由测试引用的 `miniprogram/utils/registration.ts`；内存缓存替身迁到 `tests/support/memory-cache-storage.ts`；移除仅测试消费的 `buildTimelineRows` 和相关类型。
- 新增主包反向契约，阻止退役组件、测试替身和注册重新进入生产源码。
- 主包由本轮开始前实测 459,151B 降到最终 446,120B，净减少 13,031B；相对硬限额 459,315B 的余量从 164B 增至 13,195B。

### 令牌卫生

- 新增根级 `DESIGN.md`，`theme-contract.json` 升级为 schema v4，并机器声明 primitive、semantic 与 25 个核心 component/state token。
- `check-design.mjs` 现在拒绝根 token 重复、跨 WXSS 未定义 `var()`、组件 token 缺失/无消费/解析成环，以及 `DESIGN.md` 中的无效 token。
- 新门禁首次运行发现 25 个历史页面变量引用没有任何声明；已逐一改用现有语义 token，覆盖活动编辑、活动管理、俱乐部申请、俱乐部主页和个人主页的遮罩、边框、状态文字与进度轨道。
- 全局 cinema 入场补上 `prefers-reduced-motion` 降级；没有新增业务字段、状态、路由或后端能力。

## 端到端功能复审

| 层级 | 本轮结论 | 证据 / 限制 |
| --- | --- | --- |
| 17 条路由静态完整性 | `PASS` | `build` 与源码完整性校验通过，17 个注册页面仍完整 |
| 前端单元/集成 | `PASS` | Vitest 90 文件、1,385 项全部通过 |
| 视觉原型 | `PASS` | 16 页 × 340/375/430 共 48 个视口，无溢出、遮挡、无效小触控目标或 console 错误 |
| 暗场压力 | `PASS` | CSS/主脚本延迟、图片全失败、3 宽度 × 3 轮，459 次切页最大双帧 40.7ms |
| CloudBase 本地契约 | `PASS` | bootstrap 156 项；13 个云包测试与部署包自包含校验通过；未连接目标云执行写入 |
| 内容安全 / 权益 / Strava | `PASS`（契约层） | 74 / 31 / 76 项通过；非生产现场运行 |
| 旅程驱动与证据校验器 | `PASS`（工具层） | 130 项通过；裸 CLI 因缺现场 input、0600 签发密钥和报告路径而按设计 fail-closed，本轮记 `NOT_EXECUTED` |
| WechatIDE 编译与模拟器 | `PASS`（只读） | 重新登录后 iPhone X 模拟器完成 30/30 检查、17/17 注册路由、0 失败/异常/blocker；`startupOutcome=PASS`、`productVerdict=PASS` |
| 双端视觉同步 | `PASS`（本地） | DevTools 与 Pages 使用同一 375×812 逻辑视口；34 张公开图已脱敏，严格 UI-sync 绑定当前 UI/Pages 摘要通过 |
| 公开骑友媒体样本 | `PASS`（只读） | 两名公开骑友头像与背景均为 HTTPS；名片弹层打开，头像 132×132、背景 1600×900 下载解码通过 |
| 普通成员完整写链路 | `NOT_EXECUTED` | 未提供普通成员、隔离环境、签发材料；没有执行创建/发布/报名/审批/取消/重报或目标云回读 |
| iOS / Android 物理真机 | `NOT_EXECUTED` | 本轮没有物理设备证据；模拟器和 Pages 不替代真机 |
| 部署 / 上传 / 体验版 | `NOT_EXECUTED` | 本轮无部署、无云写、无小程序上传、无体验版晋级 |

历史报告可继续证明其绑定 SHA 上曾完成的操作，但不能重标为当前未提交工作树的现场证据。

## 验证结果

- `format:check`、ESLint、TypeScript、Vitest、内容/权益/Strava/WXSS 契约、Pages 三宽度、暗场压力、CI/旅程/bootstrap/deploy/release/UI-sync 自测、设计检查、App 更新、主包门禁均通过。
- `check:governance` 通过：17 路由、README 引用、媒体上传、源码卫生和 Actions 安全基线一致；15 个 CLI 执行位均在白名单中。
- `test:cloud` 通过：13 个包；`verify:cloud-packages` 与 `build` 通过。
- `audit:all` 以 high 阈值退出 0：根依赖 0 漏洞；上传工具 4 个“无上游修复”的限时例外仍由现有 2027-01-15 门禁管理；8 个云函数包各报告同一个间接 `qs@6.16.0` 中危 DoS 告警（`GHSA-6pq8-jhm2-2vcw`，可修复）。该中危不在本次 UI/源码卫生片扩大为八函数依赖发布，需另起受控依赖片更新锁文件、复跑 13 包并按累计影响面部署。
- 全量 `npm run validate` 退出 0；其中 Vitest 90 文件、1,385 项，CI 契约 47 项、旅程证据 130 项、CloudBase 基础契约 156 项、13 个云包和最终 17 页面构建全部通过。
- 微信开发者工具真实云只读 E2E：30/30、17/17 路由、0 失败、0 异常、0 blocker；Pages 同一 375×812 视口 17/17，无横向溢出或脚本错误。
- 新证据位于 `docs/evidence/ui-sync/2026-10-30-source-hygiene-e2e/`；真实照片与个人资料已不透明遮挡，原始图和完整运行报告只保存在本机 `/tmp`。
- 最终 `git diff --check` 通过。

## 剩余未完成与阻塞

- UI-sync 旧锚点和登录阻塞已核销：清单现绑定 `origin/main@202b72b5…`、当前 UI 摘要 `5fb23ba7…`、Pages 摘要 `3eb3af30…` 及本轮 17 路由双端证据；`check:ui-sync -- --strict` 与全量 `validate` 均通过。
- P0 普通成员完整写链路与当前候选的目标云权威写后回读仍为 `NOT_EXECUTED`；本轮没有创建/发布活动、提交报名、审批、签到、取消、重报、保存资料或修改俱乐部。
- iOS/Android 物理真机、部署、上传、体验版晋级与 UAT 保持 `NOT_EXECUTED`；模拟器、Pages 和本地全量门禁不能替代这些结论。
- 8 个云函数包仍各含同一间接 `qs@6.16.0` 中危告警；需在独立依赖片更新锁文件、复跑 13 个云包并按累计影响面部署回读，避免把 UI/源码卫生片扩大成八函数发布。
