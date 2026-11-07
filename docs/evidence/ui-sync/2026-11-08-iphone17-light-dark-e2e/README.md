# iPhone 17 浅/暗双主题双端视觉同步证据

- **绑定版本**：`1cd9e8d31a0e64237e05f4fa21b3c73e580476ac`（`origin/main`，PR #434 合并后的基线；本轮在其上做 unslop 前端细节精修并重新采集，证据绑定精修后的工作树）。
- **绑定摘要**：小程序 UI `sha256:55f38d3255085cd0fd63efd1383fc667850ee28b2fe37bab2c523d22aa13237f`；Pages 原型 `sha256:1036334def74858d29c1d37804ab07ae3630db14690b441113c384dd4b91fc1c`。两者均为**本次采集时重算的当前值**，不再绑定 10-30 的 `5fb23ba7…` / `3eb3af30…`。注意：IDE 编译期间会把临时产物算进 UI 摘要，正式绑定值取 IDE 退出后的稳定摘要。
- **证据规模**：17 条注册路由 × 2 端 × 浅/暗双主题 = 68 张 PNG。暗色主题 34 张由 `docs/ui-sync-manifest.json` 的 `evidence.routes` 绑定；浅色主题 34 张以 `-light.png` 后缀同目录配对，逐图 SHA-256 与矩形见 `redaction-record.json`。
- **本轮重采原因**：按 unslop Polish mode 修了两处命中项（行程票券超长标题两行溢出保护、管理端三格统计标签窄屏对齐）并同步发布说明；改 `miniprogram/` 后原 `source.digest=979bc87b…` 漂移，故在 `1cd9e8d` 基线上按同一规格重采 68 张并整体更新清单，`check:ui-sync -- --strict` 重新通过。未使用摘要回算或豁免标签。`miniprogram/styles/aihero-layout.wxss` 不在 checker 的 UI 路径集合内，但其视觉变化已被本次全量重采覆盖。

## 规格：iPhone 17 作为后续默认核对标准

| 项 | 值 |
| --- | --- |
| 模拟器机型 | `iPhone 17`（IDE Stable `v2.02.2609250`，机型列表已移除 iPhone X） |
| 逻辑视口 | `402 × 874`，`windowHeight 792`，`pixelRatio 3`，`statusBarHeight 54`，基础库 `3.18.0` |
| 实际渲染 / 截图 | `400 × 870`（IDE 100% 缩放、关闭 AutoFit 后的稳定输出，`scale = 1`） |
| 双端尺寸 | DevTools 与 Pages 均为 `400 × 870`，满足 `ui-sync-policy.mjs` 的整数 scale 校验 |

本机 IDE 的 `App.captureScreenshot` 逻辑视口与渲染像素存在 fit 差（402×874 → 400×870）。本规格**不做任何图像缩放或归一化**：`manifest.evidence.viewport` 记录双端真实渲染像素 `400×870`，逻辑视口与 DPR 在本 README 与 `redaction-record.json` 中另行记录。缩放档位已在采集前固定为 `deviceScale=1 / deviceScaleAutoFit=false`，并在采集会话内逐图复核 34 张尺寸全部一致。

这是一次**证据规格升级**，只作用于新采证据：`docs/evidence/ui-sync/2026-10-30-source-hygiene-e2e/` 的 iPhone X / 375×812 / 750×1624 历史证据保持原样、不追溯改写；`threeWidth` 的 `340,375,430` 三宽度矩阵是另一套证据，不受影响。

## 采集通道与主题机制

DevTools 端采用「`quit` 让 IDE 进程归零 → `spawn(cli.bat auto --auto-port 9420, {shell:true, detached:true})` → 轮询端口就绪 → `miniprogram-automator@0.12.1` 的 `connect()`」独占会话。`disconnect()` 会导致会话型 IDE 自动退出，因此 34 张图在**同一会话内**一次跑完。connect 后等待框架注册页面元数据，每路由等待 `loading !== true` 的就绪态。详情页使用真实样本参数：published 活动 `activity_create_cfa0beb960c47e1cb8ef781dfe552213`；凭证与审核详情使用从「我的行程」真实数据动态读取的本人报名 ID，未硬编码他人记录。

主题切换走**产品真实路径**：每轮先在 `pages/settings/index` 点击 `.appearance-option[data-mode="…"]` 触发 `chooseAppearance` → 核验 `cili-appearance` 存储值与页面 `appearanceMode` 一致（两轮均 `verified=true`）→ 遍历 17 路由。`automator` 的 `Page.callMethod` 无法序列化嵌套 event 对象，因此改用元素点击，未改任何业务代码。17/17 路由在两主题下截图 SHA 均不同；采集结束后再次点击暗色按钮，把 IDE 主题偏好恢复为默认 `dark`。

采集结果：`17/17` 路由 landed 正确、全部就绪态、`PROBLEMS=0`；`settings` / `profile` / `capability-card` / `activity-detail` / `admin-*` 页读到 `isAdmin:true`；`capability-card` 按设计重定向到 `profile`。

Pages 端复用 `scripts/pages-visual-acceptance/capture-routes.mjs`，新增 `--appearance light|dark` 参数：原型在 `docs/app.js` 启动时读取 `localStorage['cili-appearance']`，脚本设置后重载使其生效，再隐藏 showcase 外壳逐路由截图。两轮各 17 张，`400×870`，**0 横向溢出、0 页面脚本错误**，17/17 主题截图 SHA 不同。

## 真实云只读与写保护

CloudBase 账号级只读已授权，环境 `cloudbase-d0gizacy77a1ab017`（国内站 / ap-shanghai / NORMAL）；只读核实 `activities 16`（2 条 published）、`registrations 8`、`profile_media 22`、`admins 1`。IDE 登录账号「蒙恩」可管理 AppID `wx62022d5b32a4e546`，`auth` 云函数返回 `role=admin / isSuper=true`，与 `admins` 集合记录一致。

**写保护**：全程只读遍历 17 路由，未提交报名、未批准/驳回、未确认签到、未发送提醒、未保存资料、未创建或发布活动、未编辑俱乐部、未删除任何数据。唯一写入是通过产品设置页修改本机 `cili-appearance` 主题偏好（本地 storage，非云数据），且已在采集结束恢复。空白创建表单未触发必填校验，未创建草稿。

首页「近期活动」为空是**真实业务结果而非权限故障**：`FUTURE_PREVIEW_DAYS=14`，两条 published 活动的 `event_start` 在 22 天后；真实数据可由活动详情、路线分析、我的行程与管理端路由覆盖。

## 脱敏

DevTools 真实云截图中的照片 / 合影 / 头像 / 背景、真实姓名、微信昵称、手机号、紧急联系人、报名与凭证编号，均使用**不透明暗色矩形**按本次 `400×870` 实际坐标整块遮挡；每张 DevTools 图另遮挡顶部 8px、底部 24px、左右各 8px。没有沿用 10-30 的 `750×1624` 矩形，也没有对像素做缩放或插值。

逐图矩形、源图 SHA-256、脱敏后 DevTools 图 SHA-256、Pages 图 SHA-256 见 `redaction-record.json`。**未脱敏原图与完整运行报告只保留在本机 `%TEMP%/cili-evidence-1cd9e8d/private/`，永不提交**。Pages 为原型合成资料与仓库内静态素材，不含真实云用户数据，按 10-30 口径不脱敏。

脱敏后已逐张回看关键页面（凭证、报名表单、审核详情、我的、行程、活动详情、俱乐部中心、俱乐部管理、浅色凭证），确认上述个人信息无可见残留。

## 双端差异（逐路由 `differences`）

DevTools 使用真实云管理员只读数据，Pages 使用合成资料；内容、数量、媒体、状态与权限入口不同，因此 17 条路由一律标 `differences`，只对齐布局、主题、信息层级与交互接线。

| 路由 | DevTools 真实状态 | Pages 合成状态 |
| --- | --- | --- |
| activities | 未来 14 天窗口内无活动（真实空态） | 合成活动列表 |
| activity-detail | 「黑分解 ride」87.7km / 961m，封面合影已遮挡 | 「云蒙山 & 喇叭沟 RIDE」168km |
| route-analysis | 真实黑分解 87.7km 完整路线分析 | 合成路线指标 |
| registration-form | 真实活动表单，本人资料已回显并遮挡，骑行经验未选、提交禁用 | 合成完整表单 |
| registrations | 真实 7 场（0 审核中 / 2 可出发 / 5 已失效） | 合成多种状态 |
| credential | 本人已签到凭证，编号与联络资料已遮挡 | 合成凭证 |
| profile | 本人管理员，真实头像背景已遮挡 | 合成骑行名片 |
| settings | 管理员，暗色主题选中，通知与隐私入口 | 合成设置页 |
| capability-card | 历史路由按设计重定向进「我的」 | 复用合成名片 |
| profile-edit | 首访资料用途引导弹层，未确认、未保存 | 合成编辑表单 |
| club/center | 唯一俱乐部真实背景与近期活动，媒体已遮挡 | 合成俱乐部 |
| admin-activity-list | 2 条已上线 / 10 场正在筹备 | 合成统计与活动卡 |
| admin-activity-edit | 真实空白创建表单，未创建 | 合成已填编辑态 |
| admin-reviews | 真实待审核 0 人 | 合成待审核人员 |
| admin-review-detail | 真实已通过报名详情，PII 已遮挡，未执行签到 | 合成待审核态 |
| admin-club-applications | 唯一俱乐部资料概览，合影已遮挡 | 合成紧凑列表 |
| admin-club-application-detail | 俱乐部资料编辑，现有媒体回显并遮挡，未保存 | 合成编号章节 |

## 未覆盖范围

本证据只证明**当前源码在本地 Pages 原型与微信开发者工具模拟器中的浅/暗双主题视觉同步、17 路由只读运行状态与真实云公开媒体读取**。以下仍未执行，不因本次重采而关闭：普通成员完整写链路、iOS/Android 物理真机、目标云写后权威回读、开发版/体验版上传与平台选版回读、部署上线。`check:ui-sync -- --strict` 的摘要漂移由本次「真实重采 + 整体更新清单」消除，不依赖 `ui:digest --write` 或 `sandbox-skip-ui-sync` 豁免。

## 复现要点

```bash
# DevTools：先退出 IDE，再独占启动 9420 并在单会话内跑完 34 张
node <capture-devtools>.mjs   # quit → cli auto --auto-port 9420 → automator.connect
                              # settings 点击主题按钮 → 17 路由 → 恢复 dark

# Pages：同尺寸、双主题
node scripts/pages-visual-acceptance/capture-routes.mjs \
  --width 400 --height 870 --out <private>/pages-dark  --appearance dark
node scripts/pages-visual-acceptance/capture-routes.mjs \
  --width 400 --height 870 --out <private>/pages-light --appearance light
```

脱敏与 SHA-256 记录由 `redaction-record.json` 固化；原始图目录不入库。
