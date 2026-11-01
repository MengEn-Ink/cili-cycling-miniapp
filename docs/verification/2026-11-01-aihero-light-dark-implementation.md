# AI Hero 浅 / 暗生产实现验收

> **最新状态见末尾「布局迁移续轮」**。此前的主题/P2验证、包体数字和「不是完整布局实现」结论是对应阶段的历史记录，不代表本轮最终工作树；不把历史 validate/audit 结果算成本轮执行。

## 范围与交付状态

- 需求：已确认的 17 页 AI Hero 信息层级；墨黑 / 奶白、品牌红 `#e54242`、1px 边界、等宽数字；设置页浅暗切换及持久化、原生导航 / tabBar 同步。
- 基线：`6c1065c19f4a76050065ccb7f0f02ca49fb02b4c`，分支 `feat/aihero-light-dark-ui`。
- 当前：`IMPLEMENTED / LOCAL_TESTS_PASS / UI_SYNC_BLOCKED / REVIEW_PENDING`；本轮不 commit / push / PR / 合并 / 部署。这不是生产发布完成或 UI 门禁全绿。
- 不改后端字段、云能力、权限、隐私和业务状态机；不修改已确认设计 snapshot；不引入字体网络、依赖或锁文件升级。
- 本报告骨架在修改源码前建立。范围内的布局继续复用原有生产业务骨架，不用 React 演示替换真实页面，不引入 Tweaks 身份 / 状态面板。

## 实现接缝与失败语义

- `miniprogram/config/appearance.ts` 集中提供浅 / 暗 semantic 覆盖与原生浅色外观；保留 `app.wxss` 的安全暗色启动 / 回退块与三层 alias 契约。品牌红用于焦点和选中，深行动红承载白字；媒体上的白字、遮罩、二维码独立对比不随纸面主题反色。
- `theme-service` 增加 `getAppearance / setAppearance / themedPage`，存储键仅为 `cili-appearance`。首次无值、非法值或读取异常回退暗色；保存失败不更新内存偏好并在设置页显示 inline alert，不假报保存成功。
- 17 页只包装外观生命周期：保留业务 `this`、入参和返回值；`onLoad` 注册、`onShow` 重应用原生外观、`onUnload` 清理监听；主题变化更新全部仍挂载的栈页，不覆盖业务数据。
- `page-meta page-style` 在 page 层注入 CSS 变量，页面与组件按原继承链消费；不在各页设置独立色板。navigation、tabBar 颜色与三组图标、下拉背景同步；缺失 API 安全降级，抛错 / 异步失败允许后续 show 重试，快速切换以最新偏好结算。
- 原有 `*-light.png` 保留为暗场普通态，新增三个无后缀 PNG 为浅色普通态；active 图标不重绘、不替换。
- `app.wxss` 新增有作用域的 AI Hero 排版覆盖：无衬线紧字距标题、等宽标签 / 数字、1px 分隔、去除装饰阴影、44px 按钮下限。设置页是唯一生产主题入口，当前功能日志置顶且唯一 latest 为 `2026.11.01.1`。
- Pages 只在现有 app/templates/styles/schema 中同步浅暗选择、本设备 localStorage 和日志；保留示例数据标识，不混为真实生产业务。`standard-lint` 在该修改文件发现的 8 个既存未使用变量及 1 个失去唯一消费者的 helper 已删除，仅为落实改动文件 lint 门禁，不添加新演示能力。

## 功能矩阵与邻接测试

| 项目 | 正常 / 边界 | 失败 / 邻接 | 实际证据 |
| --- | --- | --- | --- |
| 设置入口 | 浅暗选中反馈、跨会话持久化 | 非法值、存储读 / 写失败；不触碰身份缓存 | Mock PASS；Pages 浏览器持久化 / reload PASS |
| 全局主题 | 17 注册路由含分包静态接线 | 多栈页更新、卸载清理、返回页重应用 | 静态 / Mock PASS；微信运行 BLOCKED |
| 原生外观 | navigation、tabBar、图标、下拉背景 | 缺 API、抛错、异步失败、重复 / 迟到回调 | Mock PASS；真实原生外观 BLOCKED |
| 阅读 / 触控 | 标题层级、1px、数字等宽、44px 下限 | 浅暗正文 / 次级 / 占位 / 禁用和状态色对比 | Token 对比 >=4.5:1 PASS；Pages 102 组合无横向溢出 / 小按钮；微信大字体未验 |
| 报名订阅 | 原有 requestSubscribeMessage / 提交链路保留 | 同意 / 拒绝 / 缺模板 / 失败不阻塞报名 | 原有 8 项订阅 Mock 测试 PASS；真实写链路未执行 |
| 权限与业务 | 审批、报名、候补、取消、签到 | 普通成员 / 管理员、隐私、迟到响应 | 全量 Vitest 与 13 云包契约 PASS；非真实 E2E |
| Pages 镜像 | 17 路由 × 2 模式 × 3 宽度 | reload、选中 radio、runtime error、横向溢出、触控尺寸 | 浏览器 102/102 PASS；capability-card 仍跳 profile |
| 严格 UI-sync | 当前源码需真实双端重采 | 不重签历史截图，不放宽 checker | BLOCKED / checker exit 1，详见下文 |

## 17 路由与批准原型映射

以下每条路由均接入公共 themedPage / page-meta / aihero-page，不改变注册路由、业务 handler、权限判断或请求逻辑。不是逐页像素验收通过表。

| 生产路由（省略 pages/ 与 /index） | 已批准原型 | 业务保持 / 特殊边界 |
| --- | --- | --- |
| activities | cili-activities_fuo1/v1 | 真实列表、日期 / 历史筛选、分页、失败重试 |
| activity-detail | cili-activity-detail_rzlg/v1 | 详情、资料可见性、报名状态与路线复制 |
| route-analysis | cili-route-analysis_2hmu/v1 | 原生地图 / Canvas 与解析降级不改 |
| registration-form | cili-registration-form_n86o/v2 | 资料门槛、真实订阅与报名提交 |
| registrations | cili-registrations_pesq/v1 | 行程状态、取消记录和删除确认 |
| credential | cili-credential_d02g/v1 | 凭证、真实状态与公开详情分享 |
| profile | cili-profile_onft/v1 | 本人资料 / 权限入口，直达设置 |
| capability-card | cili-capability-card_5sv1/v1 | 保留历史兼容跳转 profile，不恢复独立请求 |
| profile-edit | cili-profile-edit_nh2w/v1 | 隐私、本人媒体授权、上传 / 保存互斥 |
| settings | cili-settings_mwfq/v1 | 新增生产主题选择；通知 / 隐私 / 安全缓存 / Strava 原入口保留 |
| club/center | cili-club-center_cyal/v1 | 唯一俱乐部与角色入口保持 |
| admin/activity-list | cili-admin-activity-list_h1pu/v1 | 真实管理列表和分页 |
| admin/activity-edit | cili-admin-activity-edit_v4m2/v1 | 真实草稿 / 发布表单、路线能力边界 |
| admin/reviews | cili-admin-reviews_exg0/v1 | 真实审批 / 参与成员管理 |
| admin/review-detail | cili-admin-review-detail_k4lw/v1 | 通过 / 驳回 / 签到确认与权限不改 |
| admin/club-applications | cili-admin-club-management_xecm/v1 | 名称映射至实际路由；唯一俱乐部概览保持 |
| admin/club-application-detail | cili-admin-club-profile_e1u3/v1 | 名称映射至实际路由；唯一俱乐部编辑保持 |

## 验证记录

环境：Node `v22.23.3`，npm `10.9.9`，沙箱工作树；未使用本机 Keychain / 登录态，未读出或打印任何凭据。

| 命令 / 阶段 | 结果 |
| --- | --- |
| 首次 `npx vitest run tests/theme-preference.test.ts` | RED：缺少 getAppearance / setAppearance / themedPage；实现前失败 |
| 主题、原生服务、接线、静态资源、安全区 5 文件定向测试 | GREEN：28/28；后加生命周期 / 多栈 / 重复回调与 Pages token 同值断言 |
| `npm run cloud:install` | PASS：13 个包，未修改锁文件 |
| `npm run format:check` / `lint` / `typecheck` | PASS |
| `standard-lint` 修改的 3 个 docs JS + 2 个 mjs | PASS：All passed，未禁用规则 |
| `npm run validate` | FAIL：已执行并通过安装、格式、lint、类型、Vitest、业务契约、三宽度、暗场、CI / 旅程 / 发布等 Node 自测、体验版清单 / 日志 / 设计 / 主包检查；当时在 check:ui-sync 的祖先检查处退出 1；父 agent 补齐历史后该问题已解除，当前 strict 在 Pages 原型摘要不一致处退出 1 |
| `npm run coverage` | PASS：92/92 文件、1401/1401 用例；总体 statements 83.16%、branches 77.37%、functions 82.03%、lines 86.41%；theme-service 四项100%；cloud.ts 门禁 lines 91.02%、branches 89.02%、functions 96.60%、statements 90.06%；bootstrap Node 自测29/29 |
| `npm run audit:all` | PASS：根与云包 0 告警；上传工具 5 个已评估无修复告警按既有例外通过，到期 2027-01-15；未升级依赖掩盖问题 |
| `node scripts/check-appearance-pages.mjs` | PASS：17 × 2 × 3 = 102，340 / 375 / 430px，无脚本异常 / 横向溢出 / 小于44px按钮；持久化与 radio反馈通过；不生成截图或签名 |
| `test:phase3-visual`（validate 内） | PASS：历史 2026-10-22 设计源 16 页 × 3 宽度；不冒充当前生产浅暗像素验收；脚本生成的历史截图覆盖已回退，不纳入本轮 diff |
| `test:dark-resilience`（validate 内） | PASS：当前 Pages 暗场 3宽 × 3轮、459 次切页；不证明浅色冷启动与微信运行 |
| `test:cloud` / `verify:cloud-packages` / `build`（UI-sync 后续阶段独立执行） | PASS；13云包契约与自包含校验通过，不产生部署 |
| `check:design` | PASS：53 迁移账本、17配置、25核心 component token、0未定义 token / 页面颜色字体字面量 |
| `check:main-package` | PASS_WITH_WARNING：456738 B，硬限额459315 B，余2577 B |
| `check:ui-sync -- --strict` | FAIL / BLOCKED，保持 checker，不改摘要与 syncedThrough |
| `check:governance` / `git diff --check` | PASS |

Mock / 静态测试不冒充真实 E2E，Pages 不冒充小程序渲染器。未在微信中确认自定义组件 CSS 变量继承、地图 / Canvas 随主题的实际效果、字体放大、二维码解码和安全区。

## 阻塞、证据与下一步

1. 父 agent 已执行 `git fetch --deepen=250 --filter=blob:none origin main`，同步基线 `202b72b5d8be60c9c0a9aa42f91b943d679fe059` 的祖先检查已通过。P2 修复后重新运行 strict，当前实际红信号为 Pages 原型摘要不匹配：清单 `sha256:3eb3af30e64ed0527f0c15e8c684cda1e0be62c4f7df4f3455f4a43752df269c`，当前 `sha256:44eefba807278fd6e068c3bf730fa8fb7c447e78a2b6b3d6cfd989f5e9e7d986`。不能仅覆盖摘要来消除真实证据阻塞。
2. 即使解决谱系问题，本次源码与 Pages 已改变，当前截图证据仍必须重新采集。沙箱没有微信开发者工具运行证据；真实 17 路由浅 / 暗双端配对采集、状态 / 脱敏 / 差异核对为 BLOCKED。不能用旧 screenshot 的新摘要、浏览器图或 WXML 转 HTML 冒充 WeChatIDE。
3. `docs/ui-sync-manifest.json` 仅补充当前阻塞说明；syncedThrough、时间、source/prototype digest、历史截图与证据记录保持原值。只有真实重采完成后才能更新它们。本轮未调用 ui:digest / 同步重签工具。
4. 交付给父 agent 独立 diff 评审；先核对生产主题继承、布局及真实能力映射，再在授权环境做 IDE 与物理真机验收。全量 validate 与严格 UI-sync 未全绿，不能提交 / 发布为已完成。

## 发布与真实验收限制

用户提供的 main 开发版 run `41168382813` 成功；体验版门禁 run `41168441294` 在 `Require zero GitHub Pages UI drift` 失败，错误为“截图对应的 UI 内容摘要不匹配，请重新采集并核对双端证据”。这是历史平台 / CI 事实，不是本次本地祖先检查错误。公众平台第三方托管限制继续独立记录在高优清单。候选与开发版上传不等于体验版 verified。本次双物理真机、普通成员完整写链路、目标云回读均 NOT_EXECUTED，未改 candidate / verified 发布清单。

## 最终工作树回读

- HEAD 仍为上述基线，无 commit / push / PR / 合并 / 部署副作用。
- diff 为 52 个已跟踪文件变更及 7 个新文件（含3个浅色 tabBar PNG、主题配置、主题测试、Pages 浏览器检查脚本与本报告）。无依赖 / lock、云函数、历史设计源或截图变更。
- 首轮 validate 的 Vitest 为1401/1401；该轮祖先错误已被父 agent 修复，最新 strict 红信号为上述 Pages 原型摘要不匹配。历史截图覆盖已回退，未作为新证据。

## 独立 review 后：3 个 P2 最小修复（17:17 CST）

仅追加以下三个修复、相关测试与本报告，不改凭证取消业务、其他页面结构、Pages 原型、manifest、历史截图或部署记录，不 commit。

1. `theme-service.ts`：同一页面实例重复 `onLoad` 复用 WeakMap 内 listener，注册幂等；每次业务 onLoad 仍按原入参/返回值执行。卸载删除唯一 listener，重复卸载安全。
2. `activity-detail/index.wxss`：封面 caption 的标题、日期/级别、副标题明确使用 `--color-on-media`，标题/副标题选择器限定到 caption，优先级高于旧普通正文规则，保持媒体遮罩不变。
3. `route-analysis/index.wxss`：strategy-tags 的 text 使用 `--color-text` 和 `--color-border-strong`，不再在主题表面上继承行动按钮白字/白边。

### 红绿回归与最终测试形态

- RED：修改实现前，重复 load 后切换主题出现 2 次 setData（预期 1）；浅色真实 caption 标题计算色为 `rgb(20,22,26)`（应为 on-media）；真实 strategy-tags text 为白色（应为深色正文）。三个失败均实际复现。
- GREEN：`npx vitest run tests/theme-preference.test.ts tests/theme-runtime-integration.test.ts`，12/12 PASS；重复 load→单次主题更新→unload→切主题零 setData，业务生命周期仍执行。
- GREEN：`node --test tests/theme-consumer-regression.node-test.mjs`，2/2 PASS，覆盖两页 × 浅暗；读取实际生产 WXML 类层级与 app/page WXSS，以 Chromium 的 getComputedStyle 核对 caption 与其 text 子节点、结论板表面、标签正文和边界。仅为 CSS 消费测试：不执行微信条件/业务、不证明微信渲染、不生成任何截图。
- 浏览器测试最终独立放在 `.node-test.mjs`，显式执行前可用 `npx playwright install chromium` 安装浏览器；不把浏览器安装隐式加入默认 Vitest/coverage，避免干净 CI 在原有安装步骤之前缺浏览器失败。
- `npm run coverage`：92/92 文件、1402/1402 PASS；statements 83.16%、branches 77.37%、functions 82.03%、lines 86.42%；theme-service 四项 100%；cloud.ts 覆盖率门禁 PASS。
- `npm run lint`、`typecheck`、`check:design`、`check:governance`、定向 Prettier 与 `git diff --check` PASS。此 P2 轮未重跑完整 validate/audit，不将历史结果标作此次重跑。
- 最新 `npm run check:ui-sync -- --strict` 仍 exit 1：Pages 原型摘要不一致（完整摘要见上文）。祖先错误已解除，不重签旧 screenshots。

## P2 阶段历史范围：当时不是完整布局实现

明确结论：本次是**原业务骨架上的全局浅暗主题 + 通用排版适配 + 设置页主题入口**，不是逐页完成已确认 AI Hero 原型的结构迁移，也不能称为整体布局与确认稿等效。17 路由接线、token 同值、无溢出和对比度测试都不能证明完整设计对齐。

除 settings 新增主题区外，各页本轮 WXML 仅增加 page-meta 与根类；页面专属 WXSS 此 P2 轮只修上述两个消费问题。因此以下结构迁移并未在本次完成，不能登记为完成：

| 范围 | 本轮保留的生产骨架 / 未完成的结构迁移 |
| --- | --- |
| 活动列表、活动详情 | 保留原有影像志/电影式封面、沉浸/紧凑列表、ink 指标区、content-sheet 与底部决策栏；未按新确认稿逐段重排模块、比例与位置 |
| 路线分析 | 原有地图/Canvas、指标与结论板排列不变；标签配色修复不是地图/图表/策略模块结构重构 |
| 报名、行程、凭证 | 原有资料段落、行程卡与凭证结构/操作区域不变；未逐项迁移确认稿分组、卡片组织和底部操作布局 |
| 我的、资料编辑、俱乐部主页 | 原有媒体 hero、资料区域、编辑表单、俱乐部概览与活动结构不变；未按确认稿重新组织各模块 |
| 活动管理/编辑、审核列表/详情 | 原有管理行、筛选、编辑表单、审核资料/动作结构不变；未逐页实现确认稿的列表密度、章节分组及动作位置 |
| 俱乐部管理/资料编辑 | 原有唯一俱乐部概览和分段表单不变；历史双端记录已注明概览 vs 紧凑列表、分段表单 vs 编号章节差异，本轮未消除这些结构差异 |
| capability-card | 仍是跳转 profile 的兼容路由；独立确认稿名片页面没有实现；是否继续保持兼容应由父 agent 判断，不能擅自恢复请求 |
| settings | 已增加生产主题选择，但其余区域沿用现有结构，未逐段复刻确认稿完整设置页布局 |

这些是代码变更范围和已知未迁移项，不是逐页重读全部独立确认稿后的精确差异清单。每页确认稿的具体尺寸/顺序/组件差异仍需独立原型对照 review；无此证据不能声称完整等效。Tweaks 身份/状态面板不应迁入生产，属于明确不迁移的演示控件，而非漏实现业务。

## 真正截图重新采集流程（计划，未执行）

先由父 agent 冻结/确认待采集工作树，记录 HEAD、dirty、客户端版本与 source/prototype 实际摘要；不可在采集中热改源码。工作树仍 dirty 时必须记录内容摘要，不能仅用旧 HEAD 表示新实现。

### A. Pages：沙箱可做真实浏览器采集

```bash
# 在仓库根；另一个终端保留此服务
python3 -m http.server 63742 --bind 127.0.0.1 --directory docs
```

用 Playwright codegen 打开设置页，点击生产镜像中的“浅色”，关闭浏览器保存本地存储；暗色另开一轮点击“暗色”保存。两份仅为 Pages 存储，不带微信身份。

```bash
npx playwright install chromium
npx playwright codegen --viewport-size="375,812" --save-storage=/tmp/cili-pages-light.storage.json 'http://127.0.0.1:63742/?capture=viewport#settings'
npx playwright codegen --viewport-size="375,812" --save-storage=/tmp/cili-pages-dark.storage.json 'http://127.0.0.1:63742/?capture=viewport#settings'
```

codegen 需要可用图形界面；纯 headless 沙箱可用 Playwright API 按 `scripts/check-appearance-pages.mjs` 中真实设置按钮点击→reload→核验 localStorage/data-appearance 的步骤等效操作，然后 storageState 保存。不能仅改 CSS dataset 假装已选主题。

随后逐路由重新渲染并截图，例如（其他路由采用上方17路由映射与 manifest 的 id，`club/center` 不改成错误 hash）：

```bash
npx playwright screenshot --browser=chromium --viewport-size="375,812" --load-storage=/tmp/cili-pages-light.storage.json --wait-for-selector='.pg' --wait-for-timeout=1000 'http://127.0.0.1:63742/?capture=viewport#activity-detail' /tmp/cili-activity-detail-light-pages.png
npx playwright screenshot --browser=chromium --viewport-size="375,812" --load-storage=/tmp/cili-pages-dark.storage.json --wait-for-selector='.pg' --wait-for-timeout=1000 'http://127.0.0.1:63742/?capture=viewport#activity-detail' /tmp/cili-activity-detail-dark-pages.png
```

逐页核验实际 hash、主题、状态、异常，再截底部/长文本等补充状态；主配对用同 CSS 视口截图而不是拿长图代替模拟器首屏。已有 `capture-routes.mjs --width 375 --height 812 --out /tmp/cili-pages-fresh` 可做默认主题的17页长图辅助，但它没有浅暗参数/持久化断言，不能冒充浅暗两套完整采集。`check-appearance-pages.mjs` 只断言、不截图，也不能替代截图。

### B. 微信 DevTools：必须在有 IDE 的授权 PC 执行

1. 将冻结的沙箱工作树准确同步到独立 PC 工作目录，核对实际 source digest；不能直接采集挂载 PC 项目的旧 main。此轮不使用本机登录态，也不擅自覆盖用户项目。
2. macOS 微信开发者工具打开该工作目录，登录授权测试账号，确认 AppID/云环境，开启安全设置的“服务端口”，模拟器设定实际 375×812 CSS 视口。仓库 `devtools:port` 是 Windows 修复脚本，不能当作 macOS 通用命令。
3. 仓库外独立安装 automator（见 `docs/verification/wechat-devtools-e2e.md`），然后从对应 PC 工作树根执行：

```bash
mkdir -p ~/.cili-devtools-e2e
cd ~/.cili-devtools-e2e
npm init -y
npm install miniprogram-automator@0.12.1
# 回到经过摘要核对的 PC 工作树根后：
WECHAT_DEVTOOLS_CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli CILI_E2E_OUTPUT=/tmp/cili-e2e-fresh-light npm run test:devtools:e2e
WECHAT_DEVTOOLS_CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli CILI_E2E_OUTPUT=/tmp/cili-e2e-fresh-dark npm run test:devtools:e2e
```

**两条命令本身不切换主题。** 每轮先在真实 settings 选择对应浅/暗，重启后核验持久化，再执行命令；当前驱动无 theme 参数。若自动化启动清空选择或选择无法保留，该轮必须阻塞，需授权后补驱动主题动作，不能靠修改存储 mock。检查 results.json 的 outcome、SHA/dirty、版本、环境、routes 和截图完整性；缺活动/凭证/审核样本不能用空态顶替。只读驱动不执行审批/报名/取消/保存。

### C. 证据绑定与严格复验

双端均实际采集后，逐图核对浅暗、账号角色、真实状态和布局差异；用当前坐标不透明遮挡真实媒体与个人资料，原始图/完整私有报告留受控 `/tmp`。在新 evidence 目录记录采集时间、视口/scale、source/prototype 内容摘要、原始/脱敏/Pages PNG SHA-256、遮挡矩形、逐路由 state/data/review/note 和未覆盖项。不得沿用历史矩形或把旧 PNG 换摘要。

之后才获授权更新 manifest 的新证据目录/配对引用/状态/摘要/时间/基线。`npm run ui:digest` 默认只打印；`sync-ui-digests.mjs --write` 只更新4个顶层字段、不重采图、不更新脱敏绑定，因此不能单独当作门禁修复流程。最后执行：

```bash
npm run check:ui-sync -- --strict
npm run validate
```

### 沙箱不能独立取得的证据

- 沙箱 headless 浏览器可以采 Pages；不能运行 macOS 微信开发者工具、继承其登录态或采原生导航/tabBar、地图/Canvas、微信媒体实际渲染证据。PC 已连接也不等于这份沙箱工作树已在 PC IDE 打开并运行。
- DevTools 需 PC IDE + 授权账号 + 正确云环境 + 真实只读样本；本轮未执行。
- iOS/Android 物理真机、订阅/隐私系统弹窗、扫码等，不能从沙箱或模拟器推导 PASS。
- 普通成员完整写链路、管理员审批及目标云权威写后回读需专门授权与样本；不属于只读截图命令的覆盖。
- 开发版上传不等于体验版晋级、第三方托管放行或 verified；此轮未部署、未改发布清单。

### 补充 lint 检查边界

本轮新 JS 测试执行 `standard-lint tests/theme-consumer-regression.node-test.mjs`（结果见最终回读）。额外扩大到 TS 文件的 standard-lint 检查发现 theme-service 原已有的 7 处单行 if 花括号规则 error，以及 any/常量/测试 describe 长度 warning；这些不是本次3个P2新增行为问题，未按 lint 建议重构业务或扩大修改范围。仓库统一 `npm run lint` 已通过；额外 TS standard-lint 不标成全绿，后续若纳入交付门禁需单独授权清理。

## 布局迁移续轮

**最终阶段状态：`LAYOUT_CODE_UPDATED / LOCAL_CHECKS_PASS / DESIGN_REVIEW_PENDING / UI_SYNC_BLOCKED`。**

本节替代上方主题/P2阶段的代码范围、包体和验证数字。现在不再只有主题接线：17 个生产路由的 WXML 均有结构或分区改动，WXSS 均导入 `miniprogram/styles/aihero-layout.wxss`；活动列表、行程、凭证的旧电影式局部样式已裁剪。并未取得当前微信渲染、逐页确认稿像素等效或全业务状态截图，不能将代码迁移登记为设计/发布验收完成。

### 代码接缝与保留边界

- 统一浅暗 gutter 为40rpx；无衬线紧字距主标题、等宽数字/标签、1px边界、编号章节、扁平管理列表。标签仍守24rpx可读下限，正文28–30rpx，原44px实际触控基线不降低。
- 活动卡拆分媒体caption、主办俱乐部/难度、三列指标、状态与真实详情动作；日期/历史/紧凑布局切换、分页和重试不改。
- 活动详情及资料背景/俱乐部封面使用16:9容器；媒体与占位层绝对定位，避免零高度padding容器裁掉内容。CSS消费测试核验实际导入后的层叠，不只搜未执行的局部声明。
- 报名的五个编号章节保留真实资料、交通、经验、备注绑定；第五节改为真实模板就绪和微信原生订阅说明，移除disabled预勾选“已同意”行，不新增长期订阅开关。既有订阅拒绝/失败不阻塞报名提交链保持。
- 行程增加`ticket-main`媒体/正文栅格，侧滑删除与确认保持；凭证增加独立`voucher-perforation`，保留真实编号、取消、导航、公开活动链接分享说明。
- 其余详情/表单改为编号阅读分区和扁平工具行；不添加身份/状态Tweaks、演示数据、云字段或新请求。`capability-card`仍是兼容跳转，而不是恢复已退役的独立名片请求。
- Pages镜像更新`docs/templates.js`和`docs/styles.css`，保留示例标识、原交互动作和状态分支。俱乐部首次创建/上传态保留原模式标题，不用装饰标题掩盖真实创建语义。

### 逐页确认块 → 生产落点 → 真实绑定 → 测试

下面路由路径均对应`miniprogram/pages/<路由>/index.wxml`、同目录`index.wxss`与共享`aihero-layout.wxss`；批准原型版本沿用上方17路由映射。每行均被`tests/aihero-layout.test.ts`的WXML平衡、共享导入、真实事件绑定断言覆盖，并被生产CSS消费脚本按浅暗/三宽度检查。它们不是截图验收PASS表。

| 路由 | 本轮布局块 / 生产类接缝 | 保留真实事件或数据 | 邻接验证 |
| --- | --- | --- | --- |
| activities | 双行导语、activity-toolbar、story-host、storyfacts、storymeta-action | switchView/selectDay/switchLayout/open/loadMore、item真实列表 | aihero-layout；首页/日期/状态/Pages契约 |
| activity-detail | hero+overview、01–09章节、固定actionbar | go/downloadGpx/navigate/openAttendeeCard/previewGroupQr；viewerStatus | aihero-layout；详情/媒体/隐私测试；caption与hero计算样式 |
| route-analysis | 地图01、剖面02、坡段03、关键点04、风险/策略/装备05–07 | markerTap/selectPoint/selectSegment/retryMap/backToActivity；真实canvas | aihero-layout；路线/坐标契约；策略标签计算色 |
| registration-form | 五段编号、纵向选择、原生订阅就绪说明 | profile/set/submit/back；notificationTemplateIds，真实提交顺序 | aihero-layout；8项订阅、11项请求代际、133项DOM契约中的对应页 |
| registrations | trip-stats、ticket-main栅格、ticketfooter | open/confirmDelete/onRowTouchStart/onRowTouchCancel；item.status | aihero-layout；行程归档/删除/侧滑契约 |
| credential | 纸面凭证头、真实编号、voucher-perforation、独立操作/隐私说明 | navigateToMeeting/cancel/retry/openRouteAnalysis；open-type share | aihero-layout；取消/分享/原生表单契约 |
| profile | 媒体hero与profile-links工具组分离 | edit/openSettings/retryAuth/activities/clubApplications；本人权限 | aihero-layout；个人页缓存/权限/媒体契约 |
| capability-card | redirect-heading、诚实跳转状态、主题回退 | openProfile；wx.switchTab到profile，不加独立请求 | aihero-layout；capability-card-page运行Mock |
| profile-edit | 权限卡、01头像背景/02基础/03紧急联系人、扁平上传块 | chooseWechatAvatar/showConsent/acknowledgeConsent/save；busy互斥 | aihero-layout；头像/授权/媒体测试；预览定位计算样式 |
| settings | 00浅暗偏好、通知/隐私/版本/Strava编号区、详情列表 | chooseAppearance/manageNotifications/managePrivacy/clearSafeCache；既有Strava入口 | aihero-layout；theme-preference/runtime/settings；Pages reload/radio |
| club/center | 媒体头、编号资料/活动区、扁平activity-row | openActivity/retryActivities/editClub/createClub；club真实资料/活动 | aihero-layout；club-foundation/身份契约 |
| admin/activity-list | 管理眉题、概览指标、扁平ticket/paper及操作 | edit/reviewActivity/toggleOnline/startClone/confirmDelete；分页 | aihero-layout；管理列表/侧滑/权限测试 |
| admin/activity-edit | 01–05章节、单列fieldgrid、上传网格、纵向choicegrid | save/chooseImages/dateTimePicker/chooseRouteGpx/chooseGroupQrCode | aihero-layout；真实活动编辑/GPX/二维码测试 |
| admin/reviews | 编辑式眉题、info-bar、reviewitem与分隔meta | choose/tab/open/sendReminders；审核角色/状态 | aihero-layout；审核批次/成员权限测试 |
| admin/review-detail | 编号资料/经验/备注/照片，互斥状态操作区 | act/checkIn/reason/previewPhoto；pending审核与approved签到不同时渲染 | aihero-layout；成员详情/签到/权限测试 |
| admin/club-applications | 唯一俱乐部概览/资料维护编号区，非多俱乐部列表 | create/edit/load/coverError；首建权限保持 | aihero-layout；唯一俱乐部/Pages各模式契约 |
| admin/club-application-detail | 头像背景/基本资料编号、全宽封面与扁平上传行 | chooseAvatar/chooseCover/removeCover/input/save；owner媒体锁 | aihero-layout；俱乐部媒体/保存契约；封面定位计算样式 |

### 本轮回归处理不是放宽门禁

初次全量测试暴露旧电影式几何/单行导语/禁止眉题断言与新布局冲突，另有Node类型错误；中间失败保留，不当成PASS。

- 修改obsolete视觉断言，明确检验双行导语、16:9、单个编辑眉题与共享导入的真实CSS；仍检验文案、实际事件、分页、权限和触控。
- DOM契约只显式映射报名的`legal-check`到`section-subscription`；其余容器/handler/同元素data属性/禁用类继续严格检查。未改不可变设计snapshot JSON。
- `readStyles`按实际WXSS import顺序展开；单行CSS声明解析兼容分号，不用CSS注释补假选择器过测试。
- Node导入沿用仓库已有类型约定；24rpx下限未放宽。新增订阅先后断言同时要求两个真实调用存在，防止`indexOf=-1`误PASS。

### 最新实际命令结果

| 命令 | 本轮结果与边界 |
| --- | --- |
| `npx vitest run tests/aihero-layout.test.ts` | 21/21静态布局/事件契约通过（同时纳入全量） |
| `npm test` / `npm run coverage` | 93/93文件、1423/1423用例通过；无跳过失败测试 |
| coverage | statements83.17%、branches77.37%、functions82.06%、lines86.43%；theme-service四项100%；cloud.ts门禁通过 |
| `npm run format:check` / `lint` / `typecheck` | PASS；完成定向Prettier，非禁用规则 |
| `node scripts/check-appearance-pages.mjs` | PASS：17×2×3=102组合；340/375/430px、持久化/radio、脚本/溢出/按钮尺寸检查；无截图输出 |
| `node --test tests/theme-consumer-regression.node-test.mjs` | 3/3 PASS：P2浅暗消费色；另17×2×3实际WXML类+导入CSS的计算表面/字体/媒体定位/指标列数；不执行微信条件和组件，不是IDE证据 |
| `check:design` / `check:governance` / `git diff --check` | PASS；53账本、17页面配置、25组件token、0未定义引用/页面颜色字体字面量 |
| `check:main-package` | PASS_WITH_WARNING：455577B；预警450560B、硬限额459315B、余3738B |
| `test:content-contract` / `test:rights-contract` / `test:strava-contract` / `test:wxss-contract` / `test:design` | PASS，纯本地契约不是生产调用 |
| `test:cloud` / `verify:cloud-packages` / `build` | PASS，云包自包含与源码17路由校验；无部署 |
| `check:ui-sync -- --strict` | FAIL/exit1：当前Pages摘要不一致；祖先错误已解除 |
| 完整`validate`、`audit:all` | 本续轮NOT_RERUN；上方是此前阶段的执行记录。validate包含历史三宽度制品生成，本轮未覆盖这些历史图；没有借历史结果声称全量发布门禁通过 |
| WeChatIDE / 双物理真机 / 普通成员写后回读 | NOT_EXECUTED，缺本工作树的真实账号/环境/状态/媒体运行证据 |

### 严格证据红灯与Git回读

- HEAD仍为`6c1065c19f4a76050065ccb7f0f02ca49fb02b4c`，分支仍`feat/aihero-light-dark-ui`；没有commit、push、PR、merge、部署或开发版上传。
- `git diff --numstat`确认17路由均有WXML与WXSS实际变更；例如activities WXML为+13/-6，registrations为+5/-1，registration-form为+13/-8；对应WXSS已裁剪旧几何并导入共享层。新共享文件和新增测试是untracked，不能从普通diff --stat遗漏后当成不存在。
- `git diff --exit-code -- docs/designs cloudfunctions package.json package-lock.json`退出0：历史设计/截图、云业务、依赖与锁文件无变更。
- manifest仅修正文案；`syncedThrough`、`syncedAt`、source/prototype digest和历史证据引用均未改，未调用重签脚本。
- 最新严格检查：清单Pages摘要`sha256:3eb3af30e64ed0527f0c15e8c684cda1e0be62c4f7df4f3455f4a43752df269c`，当前`sha256:17e7ce04e156d587ffea15be50d8d9df4d064efab877ecacf189dfbfbf834526`。不是浅历史祖先问题，不可只换digest消红。
- 当前尚未进行逐确认稿截图diff或微信渲染审阅。因此代码可供独立review，不登记为完整设计等效/上线完成。没有WeChatIDE证据不阻止以上布局编码；它仍阻止最终UI-sync和发布验收。
- 后续按上方真实重采流程冻结工作树、记录dirty内容摘要，重新采Pages与对应PC IDE浅暗同状态样本、脱敏核对后绑定新证据，再跑严格UI-sync和完整validate。只缺哪一端就记录哪一端BLOCKED，不复用旧图。

## 最终独立评审与本地复验（2026-11-01）

- 独立审查共发现五项 P2，均已修复并复验：重复 onLoad 主题监听泄漏；详情封面文案浅色对比；路线策略标签白字白边；详情概要全出血宽度裁切；活动封面日期被通用眉题覆盖。
- 最后两项先补消费者回归，实跑得到 2 PASS / 2 FAIL；补齐媒体选择器与概要 width 后 4/4 PASS，独立评审再次运行同一测试通过。
- 消费测试现在将样式表与内联主题 token 的 rpx 同步按视口换算，覆盖 340/375/414/430、17 路由、浅暗，共 136 组合，包含概要不越页边界断言。这是生产 CSS 接缝回归，不是微信 IDE 或真机证据。
- 最终候选工作树重跑 coverage（1423 用例）、仓库 lint、typecheck、check:design、check:governance、build、git diff --check 均通过；此前完整 audit:all 已通过且本轮未改变依赖。standard-lint 消费测试四类阻断错误为零，仍有魔法数/花括号等风格提示，不将其称为零告警。
- 完整 validate 已实际运行，仍停止于严格 UI-sync 的 Pages 原型摘要不一致；既有微信 IDE 截图未重采，不能重签旧摘要、放宽门禁或宣称视觉对齐已完整验收。
- 当前状态：IMPLEMENTED / LOCAL_VERIFIED_PARTIAL / UI_SYNC_BLOCKED。尚未 commit、push、创建 PR、合并或部署。需要授权在本机微信开发者工具重采当前版本证据，与真实 Pages 浅暗截图逐页对齐后才能继续；部署仍只通过 GitHub Actions。

## 自主 Pages 评审差异闭环（本轮最新结论）

本节覆盖前文历史阶段的当前状态及数字：**`LOCAL_VERIFIED / PAGES_REVIEWED / IDE_WAIVED_THIS_RUN / STRICT_UI_SYNC_BLOCKED`**。用户明确授权本轮暂不采微信 IDE 截图；普通 CI 可使用既有 `CILI_SKIP_UI_SYNC=1` 与 PR 标签 `sandbox-skip-ui-sync`。本轮只完成代码修复和本地验证，不 commit、push、创建 PR、合并或部署；PR 后续由父 agent 处理。豁免不是截图 PASS，更不代表严格体验版已放行。

### 实际修复

1. **外层 gutter**：生产 `aihero-page` 承担左右40rpx，内层 content 不再叠加；Pages 根承担20px，标题、content、section 不重复加 gutter。俱乐部主页 hero、活动与页脚清掉旧内层左右间距。新增消费者断言先真实发现 Pages heading 为0、生产管理页标题贴边，修复后通过；隐藏的审核详情标题不参与可见标题坐标断言。
2. **媒体文案**：Pages 详情标题、日期与副标题明确消费 on-media；实际截图复查进一步发现旧 `journal-detail-cover::after` 遮罩绘制在 caption 上方，颜色值正确也会变暗。将 caption 提至 z-index 1，并补层叠断言。截图关闭入场动画，只截稳定阅读态；不修改历史图、不替换生产媒体。
3. **settings 对齐**：现有 Pages 模板按生产内容分为 `00 显示主题 / 01 通知 / 02 隐私 / 03 应用 / 04 Strava 线路同步`。保留通知、隐私、安全缓存、本次版本更新和管理员专属 Strava 动作；App 更新仍是应用节内的可访问名称，不再独立重复编号。浏览器同时检查普通成员四节及管理员五节。章节头覆盖旧 space-between，索引与标题同侧排列。
4. **条件章节**：生产 activity-detail 改用自然章节标签，移除01–09固定编号；费用、路线、骑友、行前、时间、终点、群等既有 wx:if 与业务 handler 保留。Pages 同步不注入详情固定编号，避免隐藏可选节后断号。
5. **导航与状态**：活动 tabs、管理筛选、审核 filters 改为细线/下划线选中；pending 保留 warning 色，生产 approved/checked_in 保留 success 色。不把全部状态抹成正文，不把通用当前版本标签误染成成功状态。浅色审核页纸面上的“切换活动”旧反色 ghost 按钮改消费正文色/边界色。

### 代码范围不能等同完整设计实现

- 17 路由接入主题/共享样式不是17页已完整等效的证明。
- **11 页 WXML 是小结构改动**（当前相对基线至多+5/-1）：activity-detail、admin/activity-list、admin/club-application-detail、admin/club-applications、admin/reviews、capability-card、club/center、credential、profile-edit、profile、registrations。其中 activity-detail 移除本阶段固定编号后，净差异仅+2/-1，不能用“章节全面迁移”夸大它。
- **8 页有明确的专属布局调整块**：activities（工具栏/16:9卡/主办方/指标）、activity-detail（16:9媒体/概要宽度/章节阅读）、route-analysis（地图/指标/策略分组）、registration-form（五节/纵向选择/真实订阅就绪说明）、registrations（ticket-main栅格/状态操作）、credential（纸面凭证/穿孔/独立操作）、profile-edit（权限/上传与预览）、admin/activity-edit（编号章节/单列字段/上传网格）。这是更深的 CSS/容器落点，不代表这八页逐像素或全状态验收。
- 两个数字是不同维度、存在交叉，不相加成19页。其余页面的局部分区/媒体适配仍沿用业务骨架；capability-card 继续跳 profile，不以 demo 替换退役业务。本轮未引入新 HTML 项目、新设计、后端能力或业务状态机。

### 本轮真实执行记录

| 验证 | 结果与边界 |
| --- | --- |
| 初次全量 validate / coverage | FAIL：8项旧源码字符串/固定空白或 settings/状态契约未同步；没有记录为PASS |
| 回归修复 | schema 改为实际执行数据断言，仍要求17正式路由各具备非空状态/问题/改法/规范；数组与花括号断言不再依赖固定格式。缓存文案对应生产“清理可重建缓存”，确认及动作断言保留；状态色仅准许具体小标签选择器 |
| `CILI_SKIP_UI_SYNC=1 npm run validate` | PASS/exit0：完整安装、format:check、lint、typecheck、93文件1425用例、全部Node业务/CI/部署契约、历史三宽度、暗场压力、设计/日志/主包、普通UI-sync受控豁免、治理、13云包与build全部执行 |
| `npm run coverage` | PASS/exit0：93/93文件、1425/1425；statements83.17%、branches77.37%、functions82.06%、lines86.43%；theme-service四项100%；bootstrap29/29、cloud.ts覆盖门禁通过 |
| `npm run audit:all` | PASS/exit0：根/云包0漏洞；上传工具5项既有已评估无上游修复告警，例外到期2027-01-15。未升级依赖或锁文件 |
| `node scripts/check-appearance-pages.mjs` | PASS：17路由×2主题×340/375/414/430=136组合；持久化/reload/radio、无横向溢出、44px按钮、heading/content gutter、media色及遮罩层叠、章节同侧、纸面按钮；额外8组管理员settings顺序/权限入口检查 |
| `node --test tests/theme-consumer-regression.node-test.mjs` | PASS：4/4；真实生产WXML类+实际import CSS，17×2×4=136组合。rpx按视口换算；不执行微信wx:if/组件/请求，不是IDE或真机证据 |
| `npx vitest run tests/aihero-layout.test.ts` | PASS：23/23，含条件详情自然标签、settings顺序/权限/动作与原业务绑定 |
| `standard-lint docs/index.html docs/app.js docs/schema.js docs/templates.js scripts/check-appearance-pages.mjs tests/theme-consumer-regression.node-test.mjs --quiet` | PASS：All passed；目标HTML/JS/MJS四类阻断错误为0，未禁用规则。与仓库eslint分开记录，不宣称整个仓库零warning |
| `check:main-package` | PASS_WITH_WARNING：456859B；硬限额459315B、余2456B；比本轮输入455577B增加1282B，保持有限余量 |
| `check:ui-sync -- --strict` | FAIL/exit1：清单Pages摘要与当前不一致。strict checker、旧摘要、旧截图未重签；体验版仍BLOCKED |
| `git diff --check` | PASS；分支/HEAD未变，无commit/push |

### 浏览器人工评审与剩余边界

已在Chromium实际渲染当前Pages 17路由，浅/暗375和414共68张稳定视口图，逐组合接触图查看标题/卡片边距、详情媒体文字、settings、审核状态和动作。capability-card对应既有profile跳转，不算恢复独立名片。发现的问题经过上述第二轮修复与计算样式复验；这不是独立确认稿逐像素diff、长页全状态、微信IDE或真机验收。

当前仍有业务/镜像差异：Pages使用明确标识的示例数据；settings版本区域仍有镜像更新摘要/功能说明，生产为真实currentRelease详情行；地图是Pages示意图而非原生Canvas；兼容名片路由不实现独立确认稿页面。未验证iOS/Android大字体、系统弹窗、原生导航/tabBar实际颜色、二维码解码与真实写后回读，不能把136组合替代这些验收。

完整validate必然重写旧 `docs/evidence/phase3-three-width` 制品，它属于历史设计测试产物，**不作本轮AI Hero浅暗证据**。该目录本次未手工编辑或重签，按委派边界留父agent还原；不可在PR中将重写图提交为新验收。临时Pages评审文件及拼图脚本不纳入交付源码。

当前内容摘要（最后strict实跑）：`sha256:e67d2ab526ee518e99d64aa3846eaad0f14b76d18fc24ed52407751fb15d3d0c`；清单仍为历史`sha256:3eb3af30e64ed0527f0c15e8c684cda1e0be62c4f7df4f3455f4a43752df269c`。父agent处理PR时使用本次既有豁免机制，独立审阅最终diff并还原历史生成物；不得将普通CI通过外推成严格体验版成功。

## 本次截图豁免授权与提交候选（2026-11-01）

- 用户本轮明确授权：本次跳过微信开发者工具补采，自行评审对齐页面后合并部署。使用仓库已有 `CILI_SKIP_UI_SYNC=1` 与 PR 标签 `sandbox-skip-ui-sync`，不修改 checker，不冒称严格 UI-sync 通过。
- 自行评审后修正 Pages 外层 gutter、详情媒体文字及遮罩、设置 00–04 分区同步、条件章节断号、tab/审核筛选细线与浅色文字。生产与 Pages CSS 各 136 组合通过，静态布局契约 23 项通过。原生微信渲染、真机和完整云写链路本次未验收；此豁免不构成体验版晋级证据。
- 最终 `CILI_SKIP_UI_SYNC=1 npm run validate`、`npm run coverage`（93 文件 / 1425 用例）、`npm run audit:all`、`git diff --check` 通过；上传工具保留既有审计例外，不新增依赖或漏洞豁免。
- 主包 456859 B / 硬限额 459315 B，余量 2456 B；已超过预警线，后续增加主包内容须重新验证预算。
- validate 自动重建的 `docs/evidence/phase3-three-width` 属旧设计制品，已全部还原，不作为本轮微信或生产对齐证据。
- 计划合并后的部署仅使用 GitHub Actions；开发版上传、Pages 发布和体验版晋级分别核验。严格体验版门禁预计因缺新双端证据阻塞，不修改 candidate 为 verified。

## PR #420 CI / CodeQL 两项已证实失败修复（2026-11-01 本轮最新）

本节记录模式修复前的历史状态：`LOCAL_FIX_VERIFIED / FULL_VALIDATE_BLOCKED_BY_EXISTING_INDEX_MODES / PR_CHECKS_NOT_RERUN / NOT_COMMITTED_NOT_PUSHED`；最终状态见下节「PR #420 模式修复后最终全量复验」。工作树为沙箱 `cili-theme-delivery`、`feat/aihero-light-dark-ui`。PR #420 的 Chromium 缺失与 CodeQL high 为用户提供的已证实失败；本轮未回读远端最新 checks，未将本地结果冒充 GitHub 通过或 CodeQL 重新扫描通过。

### 改动

- 保留主 agent 已有的局部 `runNodeTests` 安装逻辑：消费者 Node 浏览器测试前执行 `npx playwright install --with-deps chromium`。
- 参照已有 Playwright npm scripts 新增 `test:theme-consumer`，安装 Chromium / 系统库成功后才运行消费者测试，并纳入 `validate`。选择器自身与根配置仍升级 full，full 通过完整 validate 实际执行消费者，不再遗漏；coverage / audit 不删减。
- 为影响面执行器增加默认真实命令、测试可注入命令的接缝；新增 4 项回归，验证局部安装顺序、安装失败阻断、非浏览器测试不误安装，以及 full → validate 注册与安全门禁保留。命令记录是契约测试；下面 validate 中 4 项消费者是实际 Chromium 执行。
- `cycling-image-journal-pages.test.ts` 移除剥离 HTML 的不完全 sanitizer 正则，直接断言实际 `<h1 class="editorial">周末，<br>交给山路。</h1>`，保留文本、标题及双行结构含义；未 disable CodeQL、未跳过测试或安全门禁。

### 真实验证结果

| 验证 | 实际结果 |
| --- | --- |
| affected-ci 定向 | 16/16 PASS（含新增 4 项），0 FAIL / SKIP |
| cycling-image-journal-pages 定向 | 1 文件，19/19 PASS |
| lint / typecheck | 均 PASS；validate 各次亦通过这两步 |
| coverage | PASS：Vitest 93 文件、1425/1425；bootstrap Node 29/29；cloud.ts lines 91.02%、branches 89.02%、functions 96.60%、statements 90.06% |
| audit:all | PASS：根包和 13 云包均 0 vulnerabilities；上传工具 5 个已评估、无上游修复例外仍由现有门禁管理，到期 2027-01-15 |
| 最后一次完整 `CILI_SKIP_UI_SYNC=1 npm run validate` | **FAIL**：Vitest 93 文件、1425/1425；content 74/74、rights 31/31、Strava 76/76、WXSS 3/3、实际 Chromium 消费者 4/4；三宽度 16×3 PASS；暗场 3宽度×3轮、459次切页 PASS；CI 契约 50 PASS / 1 FAIL（51项） |

最后一次 validate 在 CI 契约中被既有 Git index 模式门禁阻断：7 个不在可执行入口白名单的已跟踪文件为 `100755`：本报告、`miniprogram/config/appearance.ts`、`miniprogram/styles/aihero-layout.wxss`、`scripts/check-appearance-pages.mjs`、`tests/aihero-layout.test.ts`、`tests/theme-consumer-regression.node-test.mjs`、`tests/theme-preference.test.ts`。未篡改索引、白名单或测试来放行，也未将这些业务文件纳入本轮额外修复。最后一次累计执行用例为 1664 项，1663 PASS / 1 FAIL；不同轮次与定向复跑不去重累加为独立覆盖量。validate 后续 journey/bootstrap/deploy、检查与云测试/build 因 `&&` 短路未执行，不能宣称全量通过。

保留失败历史：首次完整 validate 的 Vitest 1425/1425、消费者 4/4 通过，但三宽度 `credential@375` 出现 `Failed to load resource: net::ERR_TIMED_OUT`；第二次因首轮生成 report 留有该错误而在度量契约失败（1424 PASS / 1 FAIL）。仅恢复 `docs/evidence/phase3-three-width` 已跟踪生成物后第三次完整重跑，三宽度与暗场通过，随后命中上述 index 模式阻塞。最终再次仅恢复该目录已跟踪历史生成物，未恢复/丢弃业务代码。

本轮用户已授权 `CILI_SKIP_UI_SYNC=1` 截图/IDE 豁免，未重签旧截图、未修改 UI-sync 摘要或制造新截图证据。strict/体验版、普通成员写链路、双物理真机与目标云回读独立门禁不变。下一步由主 agent 单独处理既有 index 模式问题，完整重跑 validate，然后在获授权提交推送后复验 PR #420 affected-pr 与 CodeQL；本轮没有 commit / push / 部署。

## PR #420 模式修复后最终全量复验（2026-11-01 最新结论）

最终状态：`LOCAL_VERIFIED / PR420_REMOTE_RECHECK_PENDING / IDE_WAIVED_THIS_RUN / NOT_COMMITTED_NOT_PUSHED`。

更正模式问题归因：用户已由 `git diff origin/main HEAD --summary` 证明上述 7 个非白名单 `100755` 文件是本 PR 新建文件；主 agent 已以 `chmod -x` 和 `git update-index --chmod=-x` 正确修复为 `100644`，没有修改门禁。本续轮保留全部 7 项已暂存模式修正，不修改其他代码、不提交或推送。

本续轮只重跑 `CILI_SKIP_UI_SYNC=1 npm run validate`，进程退出 **0 / PASS**，完整执行到 `build` 与 17 页面源码完整性校验结束：

| 验证组 | 实际结果 |
| --- | --- |
| Vitest | 93/93 文件，1425/1425 用例 PASS |
| content / rights / Strava / WXSS | 74/74、31/31、76/76、3/3 PASS |
| 实际 Chromium 消费者 | 4/4 PASS，含 17 路由 × 浅暗 × 4 宽度；安装先于启动 |
| CI / journey / bootstrap / deploy 契约 | 51/51、130/130、156/156、65/65 PASS |
| release-notes / ui-sync / design 契约 | 14/14、26/26、14/14 PASS |
| 云函数测试 | 13 包执行完成，572/572 PASS；其中一个包 0 用例，未虚增计数 |
| 三宽度 / 暗场 | 16 页 × 3 宽度 PASS；3 宽度 × 3 轮、459 次切页 PASS，最大双帧耗时 78.2ms |
| format / lint / typecheck / design / release-notes / governance / 云包 / build | 全部 PASS；治理包含正确模式检查，未放宽白名单 |
| 主包 | 456858B，硬限额 459315B，余量 2457B；预警仍可见但未超硬限额 |

本次 validate 的 Node 契约为 644 用例、云函数为 572 用例，加 Vitest 1425 用例，累计 **2641 PASS / 0 FAIL / 0 SKIP**（按运行日志计数，不将定向复跑或此前轮次重复累加为独立覆盖）。这是本地契约/浏览器验证，不是普通成员生产写链路或真机 E2E。

coverage / audit:all 沿用同轮前次真实 PASS（Vitest 1425/1425、bootstrap 29/29、覆盖率门禁与安全审计通过）；本续轮未变更代码，因此按用户要求不重复运行。前三次 FAIL 的网络超时、报告污染、PR 新建文件模式错误均保留在前节，现已不再作为当前 validate 阻塞。

成功后仅以 worktree restore 恢复 `docs/evidence/phase3-three-width` 已跟踪历史生成物，并确认该目录无 diff；没有重签旧截图、没有改变索引模式修正。`CILI_SKIP_UI_SYNC=1` 只代表本轮授权豁免，strict/体验版与独立 P0 门禁不变。PR #420 等待获授权提交推送后的远端 affected-pr / CodeQL 复验，不能把本地 PASS 表述为远端 checks 已通过。本续轮只更新本报告和高优清单，未 commit / push / 部署。

## PR #420 两项 P2 独立审查闭环（2026-11-01 当前最新）

状态：`LOCAL_VERIFIED / PR420_NEW_DIFF_REMOTE_RECHECK_PENDING / IDE_WAIVED_THIS_RUN / NOT_COMMITTED_NOT_PUSHED`。基线 `HEAD=2210d4c`，开始时工作树干净。用户已确认该 HEAD 的 PR #420 checks 绿；这只是原 HEAD 的结果，本节未提交的新改动须由后续新 head 重新运行远端 checks，不能继承旧绿状态。

### 先 RED 后 GREEN，最小修复

1. **P2：局部主题/页面源码未映射消费者回归。** 新增真实输入契约：从 `app.json` 枚举全部 17 注册路由的 WXML/WXSS，并验证真实存在的 `appearance.ts`、`theme-service.ts`、`app.wxss` 和 `aihero-layout.wxss` 单文件变更。RED 为 affected-ci **16 PASS / 1 FAIL（17项）**，首先在 `miniprogram/config/appearance.ts` 复现 targeted 的 scriptTests 缺失。修复只向 scriptTests 增加主题配置/服务与小程序 WXML/WXSS 到 `tests/theme-consumer-regression.node-test.mjs` 的映射；保留全量风险判定、去重、安装顺序和原测试/安全门禁，无其他重构。真实输入契约覆盖 38 个已存在文件，GREEN affected-ci **17/17**。
2. **P2：两页无头像兜底字低对比。** 新增 registrations、credential 各一项 Chromium 真实 CSS 消费测试：加载生产 WXML、app+页内+递归导入 WXSS，显式保留无 avatarUrl 分支并填入“此”，计算 foreground/background 实际对比，并断言使用 text token；浅/暗两模式均执行。RED 为消费者 **4 PASS / 2 FAIL（6项）**，两页浅色均复现 **1.12:1**。修复仅分别在两页 `.club-avatar--placeholder` 增加 `color: var(--color-text)`，不影响图片、媒体白字或业务字段。GREEN 消费者 **6/6**，两页浅暗占位字均达到 **≥4.5:1** 且实际 color=text。

新增测试后、生产修复前真实执行 RED，未将预期失败跳过或伪装成通过；GREEN 定向合计 **23 PASS / 0 FAIL / 0 SKIP**。浏览器测试是 WXML 类层级/WXSS 消费适配，不运行原生 wx:if/业务事件，不是真机 E2E。

### 当前新改动完整复验

以下均针对 `2210d4c` + 本节新改动实际重新执行，三个命令退出码均 **0**：

| 验证 | 真实结果 |
| --- | --- |
| `CILI_SKIP_UI_SYNC=1 npm run validate` | 完整 PASS，执行至 13 云包校验与 build / 17 页面源码完整性校验 |
| Vitest | 93 文件、1425/1425 PASS |
| Node 契约 | 647/647 PASS；content74、rights31、Strava76、WXSS3、消费者6、CI52、journey130、bootstrap156、deploy65、release-notes14、ui-sync26、design14 |
| 云函数 | 13 包执行完成、572/572 PASS；0 用例包保持0，不虚增 |
| validate 累计 | **2644 PASS / 0 FAIL / 0 SKIP**（不重复累加定向、coverage 或历史轮次） |
| 三宽度 / 暗场 | 16 页×3宽度 PASS；3宽度×3轮、459次切页 PASS，最大双帧耗时74.9ms |
| lint/typecheck/format/design/governance/release-notes/build | 全部 PASS；源码模式检查仍为15个显式CLI入口、无额外100755 |
| 主包 | 456914B，硬限额459315B，余量2401B；预警保持可见 |
| `npm run coverage` | PASS：Vitest93文件1425/1425、bootstrap29/29；cloud.ts lines91.02%、branches89.02%、functions96.60%、statements90.06% |
| `npm run audit:all` | PASS：根包+13云包0 vulnerabilities；现有上传工具5个无上游修复例外仍受门禁约束，到期2027-01-15 |

成功后仅恢复 `docs/evidence/phase3-three-width` 已跟踪历史生成物，确认目录无 diff；未重签旧截图、未改UI-sync摘要。本轮 `CILI_SKIP_UI_SYNC=1` 豁免继续使用，strict/体验版与独立P0不变。此前网络、报告污染、文件模式 FAIL 与此次 RED 均作为真实历史保留，不能覆盖为 PASS。未 commit / push / 部署；下一步获授权后提交新差异并重跑 PR #420 affected-pr、CodeQL 等远端 checks。

## 最终合并与发布验收（2026-11-01）

本节覆盖此前阶段状态。产品最终候选 `bbdead45cb2693e03bda5d6ca059eaa78b2603b7` 经独立只读复审通过，两项 P2 已消除，未发现新增 P0/P1/P2；在 11:40:02、11:41:11、11:42:21 UTC 完成三次独立评论/checks快照，目标未漂移、open thread=0、检查收敛，闭环校验脚本退出0。自有GitHub项目按用户明确授权自行评审合并，不宣称取得非作者GitHub Approve。

[PR #420](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/420) 已于 2026-11-01 11:42:38 UTC squash 合入 `main@62376d3a95c681d64380c4ce8d7dca5d6181f6a8`。90文件，+5054/-2014；合并内容与最终候选树相同。最终本地validate为2644/2644，coverage/audit实际通过；该数据不扩张为真机或实际写链路E2E。

| 环节 | 不可变产品版本 / 结果 | 原始证据 |
| --- | --- | --- |
| 最终PR CI | `bbdead45`，affected-pr、validate、pr-submission成功 | [CI](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/41302296161) |
| 最终PR CodeQL | `bbdead45`，分析及CodeQL成功，原high线程自动resolved/outdated | [CodeQL](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/41302296285) |
| main CI | `62376d3a`，success | [main CI](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/41303086878) |
| 微信开发版 | `62376d3a`，success；`MINIPROGRAM_VERSION: 0.0.413.1`；“微信开发版 0.0.413.1 上传成功” | [自动上传](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/41303321879) |
| CloudBase | `62376d3a`，workflow success；无资源变更，实际skip | [部署决定](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/41303321520) |
| Pages | `62376d3a`，built/success；线上三个核心文件逐字节哈希匹配 | [Pages发布](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/41303086815) |
| 微信体验版 | `62376d3a` / 目标 `0.0.413.1`，failure；首个阻断为严格Pages零漂移 | [晋级门禁](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/41303385402) |

### Pages实际命中

[线上入口](https://mengen-ink.github.io/cili-cycling-miniapp/) 可访问。Pages API `builds/latest` 返回 `status=built`、`commit=62376d3a95c681d64380c4ce8d7dca5d6181f6a8`。从公开地址读取并与该产品版本本地文件计算SHA-256：

| 文件 | 线上与本地一致的SHA-256 |
| --- | --- |
| styles.css | `d2f15a624524f4ea438708403529a6f6aedcefd1112bd992876e117e25bc4090` |
| templates.js | `93f5a7ff538c03467cacc66a40cbcefa31baba538b1cf2bdbf8fcf06993d10fd` |
| app.js | `2b1bdd991e778e83d06202d48473ee1d8eabe528246acc80a774e52e352d5ceb` |

### 体验版阻断与唯一下一步

`Require zero GitHub Pages UI drift` 调用 `check:ui-sync -- --strict`，清单摘要 `sha256:3eb3af30e64ed0527f0c15e8c684cda1e0be62c4f7df4f3455f4a43752df269c` 与当前 `sha256:e67d2ab526ee518e99d64aa3846eaad0f14b76d18fc24ed52407751fb15d3d0c` 不一致，退出1。后续来源校验、体验版manifest和证据存储均跳过，**本轮没有成功candidate，更没有verified体验版**。

用户本次授权只豁免IDE截图补采；普通CI受控豁免不传播为strict或平台选版豁免。不得只改摘要掩盖差异、复用旧截图、把开发版上传或candidate称为体验版发布。

下一步须经授权重采对应版本的小程序/Pages双端证据并对齐实际内容；严格同步及来源校验通过后生成candidate，再由具有真实开发权限的一方完成微信平台选版，回读版本、SHA及入口并verified。历史第三方托管权限须现场重新核验；本轮未操作公众平台，不能断言当前权限已恢复。普通成员写链路、目标云权威回读与iOS/Android双物理真机仍按独立P0验收。

**终态：开发版与Pages已发布；体验版交付BLOCKED。** 本次仅前端/测试/CI/文档变更，无云函数更新。后续仅文档状态回写不改变此产品版本或已上传开发版。
