# 微信官方参考项目借鉴与优先落地方案

> 基线日期：2026-10-23（CST）
> 适用范围：后续功能补齐、P0/P1 验收缺口、原生微信小程序交互一致性与 CloudBase 运行边界
> 状态口径：本文是设计与实施参考，不是部署或验收证据；实际优先级始终以
> [`high-priority-issues.md`](high-priority-issues.md) 为准。

## 1. 采用结论

项目把以下三个官方仓库作为只读参考基线：

| 官方仓库 | 固定参考提交 | 用途 | 接入决定 |
| --- | --- | --- | --- |
| [TencentCloudBase/awesome-cloudbase-examples](https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/dead77c85ebae5f43bc07c872318a8cb4a1635a9) | `dead77c85ebae5f43bc07c872318a8cb4a1635a9` | 云函数、云存储、订阅消息、内容安全与体育场景样例 | 只借鉴能力边界和部署检查，不复制其客户端直连数据库或简化鉴权模式 |
| [Tencent/tdesign-miniprogram](https://github.com/Tencent/tdesign-miniprogram/tree/7fd5c01b57c087f2dd8ba88a346946b72128e479) | `7fd5c01b57c087f2dd8ba88a346946b72128e479` | 表单、上传、结果页、加载/空/错误态和危险操作反馈 | 先借鉴交互契约和测试方法，不立即引入组件依赖或替换当前视觉体系 |
| [wechat-miniprogram/miniprogram-demo](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9) | `0fe5c7df8e90582dd0b89e283df7fe32e04413f9` | 微信原生 API、隐私、定位、网络、地图、Canvas、云存储和身份示例 | 作为原生 API 行为基准，补齐真机权限、取消、失败和降级分支 |

本轮不增加 Git submodule，不把三个仓库 vendoring 到项目内，也不修改运行依赖。固定提交用于让评审看到同一份参考代码；未来更新基线必须重新核对行为、许可证和本项目门禁。

TDesign 和微信官方 Demo 在该基线下使用 MIT 许可证。CloudBase 案例合集在本次核对时未发现仓库级许可证，因此当前仅链接和阅读；未来若要复制具体样例代码，必须先确认对应目录当时的许可证并保留必要声明。

## 2. 当前能力与真实缺口

外部示例不能推翻本项目已经建立的安全和可靠性设计。先按源码扫描区分“已具备”“需要统一”和“明确缺口”：

| 能力 | 当前结论 | 借鉴方向 |
| --- | --- | --- |
| 可信微信身份与服务端鉴权 | 已具备；客户端角色和 `openid` 不授予权限 | 用 Demo 的 `get-wx-context` 和 CloudBase 安全样例做回归对照，不退回客户端信任模型 |
| 报名、审批、凭证、取消和重报 | 代码与自动测试已具备；普通成员真实写链路仍缺现场证据 | 体育样例只用于核对用户旅程；优先完成目标环境回读、审计、幂等和补偿证据，不重写状态机 |
| 订阅消息 | 已有用户手势授权、事务 Outbox、租约、退避和 `delivery_unknown` | 只借鉴官方授权时机和模板字段核对，不改成业务事务内同步发送 |
| 媒体选择、上传和临时地址 | 已有 owner-bound intent、staging、服务端校验、canonical registry、临时地址缓存 | 借鉴 TDesign `Upload` 的可见状态，把活动、个人和俱乐部媒体的进度、失败和重试语义统一 |
| 地图、选点和打开地点 | 已有 `chooseLocation` 与 `openLocation` | 以官方定位/地图示例补齐拒绝授权、系统权限关闭、取消选点和坐标真机核对 |
| Canvas 路线图与媒体处理 | 已有 Canvas 导出路径 | 以官方 Canvas 2D 示例核对 DPR、尺寸、安全区和双平台渲染，不改用 WebGL |
| 网络状态感知 | **明确缺口**；当前没有 `wx.getNetworkType` / `wx.onNetworkStatusChange` 运行调用 | 增加应用级只读网络状态，区分离线、恢复和请求失败；不以网络类型替代真实请求结果 |
| 保存到系统相册 | **明确缺口**；当前没有 `wx.saveImageToPhotosAlbum` 运行调用 | 为已有“保存分享”验收补充显式保存、权限拒绝、设置引导和重试分支，不新增业务内容 |
| 隐私与上架材料 | 代码有权限声明和设置入口；平台侧完整证据仍缺失 | 借鉴官方协议页的最小结构，补齐版本、用途、撤回路径和平台后台核对清单 |
| Strava OAuth / GPX | 现有服务端 OAuth 与手动 GPX 降级设计强于三个参考仓库 | 仅借鉴文件选择、下载、地图和 Canvas 原语；OAuth 安全模型不得照搬客户端示例 |

## 3. 优先落地队列

### P0-1：先关闭普通成员完整写链路，不先做 UI 换件

**目标**：在隔离的目标云环境，用普通成员完成创建、发布、报名、人工审批或公开报名、凭证、取消和重报，并回读人数、状态、审计、幂等与补偿。

**参考内容**：

- CloudBase 体育示例的完整用户入口和云函数部署结构：
  [`miniprogram/tcb-demo-sports`](https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/dead77c85ebae5f43bc07c872318a8cb4a1635a9/miniprogram/tcb-demo-sports)；
- 微信官方云函数身份示例：
  [`get-wx-context`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/packageCloud/pages/scf/get-wx-context)；
- TDesign 表单的字段级错误、首错定位和提交态语义：
  [`Form`](https://github.com/Tencent/tdesign-miniprogram/tree/7fd5c01b57c087f2dd8ba88a346946b72128e479/packages/components/form)。

**落到本项目**：

- 保持 `cloudfunctions/registration/`、`cloudfunctions/admin-review/`、`cloudfunctions/activity-admin/` 的服务端状态机和事务边界；
- 复用 `scripts/p0-journey-driver.mjs` 与 `docs/verification/p0-real-registration-journey.md`，把每一步的请求 ID、服务端结果、权威回读和清理结果绑定到同一验收 SHA；
- `miniprogram/pages/registration-form/` 继续使用 busy lock、内联错误和提交结果反馈；只有真机发现首错不可见时，才按 TDesign 的“滚动到首错”模式局部优化；
- 网络超时或客户端失去响应时标记为“结果未知”，必须先按幂等键回读，禁止直接重复创建或审批。

**关闭条件**：真实普通成员账号、真实目标环境、同一固化 SHA 完整通过；Mock、CloudBase 案例和 DevTools 模拟数据均不能替代。

### P0-2：补齐网络状态和保存相册两个原生 API 缺口

**目标**：让弱网、断网恢复和保存分享在 iOS/Android 上具备明确状态，而不是统一显示“操作失败”。

**参考内容**：

- 微信官方网络类型示例：
  [`get-network-type`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/packageAPI/pages/device/get-network-type)；
- 微信官方 Canvas 2D 示例：
  [`canvas-2d`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/packageComponent/pages/canvas/canvas-2d)；
- TDesign `Message`、`Result` 与 `Button` 的非阻塞反馈和重试入口。

**建议实现切片**：

1. 新增单例网络状态服务，启动时调用 `wx.getNetworkType`，再监听 `wx.onNetworkStatusChange`；记录 `isConnected`、`networkType` 和 `observedAt`，不记录用户标识。
2. 把网络状态暴露给 `app-store`，仅用于提示和决定是否展示“重试”；业务成功与否仍以云函数响应和权威回读为准。
3. 离线时保留现有安全缓存并明确标记“离线内容”；网络恢复后允许用户主动刷新，不自动重放创建、报名、审批或媒体 finalize。
4. 在已有 Canvas 临时文件产物上增加 `wx.saveImageToPhotosAlbum`；分别处理成功、用户取消、相册权限拒绝、系统设置关闭和临时文件失效。
5. 权限拒绝时提供解释和打开设置入口；用户取消时静默返回，不显示技术错误；重试前重新生成或验证临时文件。

**建议代码位置**：`miniprogram/services/network-status.ts`、`miniprogram/store/app-store.ts`、`miniprogram/components/state-view/`，以及实际提供保存动作的路线图/分享图页面。文件名是后续实现建议，本轮不创建运行代码。

**验收**：飞行模式进入、请求中断、网络恢复、Wi-Fi/蜂窝切换、首次允许相册、拒绝后重试、系统设置关闭，以及 iOS/Android 保存结果均留存真机证据。

### P0-3：统一媒体上传可见状态，同时完成真实媒体回读

**目标**：不改变安全模型，只把个人、活动和俱乐部媒体的用户可见状态收敛为同一套语义。

**参考内容**：

- TDesign `Upload` 的 `loading`、进度、`reload`、`failed`、`done` 状态和失败重试事件：
  [`Upload`](https://github.com/Tencent/tdesign-miniprogram/tree/7fd5c01b57c087f2dd8ba88a346946b72128e479/packages/components/upload)；
- 微信官方云存储上传、下载与临时地址示例：
  [`storage`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/packageCloud/pages/storage)；
- CloudBase 内容安全示例：
  [`tcb-demo-sec`](https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/dead77c85ebae5f43bc07c872318a8cb4a1635a9/miniprogram/tcb-demo-sec)。

**落到本项目**：

- 以 `miniprogram/pages/profile-edit/` 已有的 `selection -> authorize -> upload -> finalize -> preview` 阶段为基线，收敛 `miniprogram/utils/media-upload.ts`、`miniprogram/utils/club-media.ts` 和活动图片上传的错误码、忙碌锁与重试文案；
- 上传进度只表达传输进度，不能把 `uploadFile` 完成显示为业务保存成功；只有服务端校验、canonical 激活和业务记录回读完成后才进入 `done`；
- 图片加载失败保留缩略图内错误和重试，不恢复整页遮罩；旧请求的迟到结果不得覆盖用户刚选择的新图片；
- CloudBase 简单案例中的公开存储或客户端直读模式不得进入本项目，继续保持业务集合全拒绝和服务端临时 URL 签发。

**验收**：真实头像、个人背景、活动图、群二维码、俱乐部头像/封面和路线预览 PNG，逐项验证 owner、canonical registry、内容元数据、临时 URL、失败回退和清理。

### P0-4：按官方 API 建立双真机权限矩阵

**目标**：把“模拟器可用”拆成真实设备上的 API、权限、系统设置和业务结果四层证据。

**参考内容**：

- 定位：[`get-location`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/packageAPI/pages/location/get-location)、
  [`choose-location`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/packageAPI/pages/location/choose-location)、
  [`open-location`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/packageAPI/pages/location/open-location)；
- 地图与 Canvas：[`map`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/packageComponent/pages/map)、
  [`canvas`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/packageComponent/pages/canvas)；
- 订阅授权：[`subscribe-message`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/packageAPI/pages/api/subscribe-message)。

**矩阵至少覆盖**：首次允许、首次拒绝、系统设置关闭、再次授权、用户取消、弱网、低内存回收、安全区、相册/相机、定位、二维码、Canvas、保存分享、Strava/GPX 和订阅消息。每格记录设备系统、微信版本、客户端版本、SHA、操作结果和脱敏截图。

### P0-5：加固 Strava / GPX 原语，不改变 OAuth 安全边界

**目标**：完成当前 P0 的授权同意/拒绝、刷新/撤销、导入预览、保存消费和手动 GPX 降级。

**可借鉴**：微信官方文件、下载、地图和 Canvas API 的参数与失败形态，以及 TDesign 上传组件的文件大小、失败重试和禁用态表达。

**禁止照搬**：三个参考仓库都没有本项目所需的 Strava 服务端 OAuth、token 加密、一次性预览票据和 SSRF 边界；不得因为官方示例简单就把 token、完整 URL 查询参数或可信判断放回客户端。

**验收**：保持 `strava-bridge`、`strava-callback` 与手动 GPX 双路径；每条路径验证用户拒绝、回调错误、token 刷新失败、重复消费、文件损坏、超限和降级入口。

### 上架前：隐私说明与平台证据

参考微信官方 [`privacy`](https://github.com/wechat-miniprogram/miniprogram-demo/tree/0fe5c7df8e90582dd0b89e283df7fe32e04413f9/miniprogram/pages/protocol) 页面结构，但实际说明必须覆盖本项目真实收集目的、使用时机、保存范围、撤回路径、联系渠道和媒体/定位/手机号差异。源码页面只能证明入口存在，不能替代微信公众平台中的隐私保护指引、主体、备案、类目和审核材料。

### P1：只借鉴 TDesign 交互契约，不立即整体换库

| TDesign 参考 | 当前对应位置 | 借鉴内容 | 暂不采用 |
| --- | --- | --- | --- |
| `Form` | 报名、资料、活动编辑 | 字段级错误、首错定位、提交时禁用、远端错误落到具体字段 | 全量替换现有表单或引入新的业务字段 |
| `Upload` / `Image` | 个人、活动、俱乐部媒体 | `loading/reload/failed/done`、进度、缩略图内失败、重试 | 用组件状态替代 canonical 激活或服务端校验 |
| `Dialog` | 取消报名、下架、删除、撤销连接 | 标题说明后果、主次按钮稳定、危险操作防重复 | 只用 Toast 承载不可逆确认 |
| `Result` / `Empty` | `state-view`、提交结果、空列表 | 成功/警告/错误语义一致，提供唯一主动作 | 每页各写一套不一致的状态页 |
| `Skeleton` / `Loading` | 列表、详情和资料首屏 | 保留布局、局部加载、不遮住仍可读内容 | 恢复全页黑色上传遮罩 |
| `Message` / `Toast` | 非阻塞提示 | 短提示只陈述结果，详细错误保留在页面内 | 把手机号、`openid`、临时 URL 或底层异常放进提示 |

若以后决定实际引入 `tdesign-miniprogram`，必须先单独提交体积和兼容性 PoC，证明按需构建不会破坏主包门禁、当前大字号/浅色可读性、44px 触控范围和 17 路由 UI 同步；未通过前继续使用现有组件。

## 4. 明确不采纳的模式

1. 不从 CloudBase 入门案例复制客户端数据库直读写；本项目业务集合继续全部拒绝客户端访问。
2. 不把订阅模板 ID、消息发送或审批结果可信判断放进客户端；授权仍由用户手势触发，发送仍走 Outbox。
3. 不把 `uploadFile` 成功当作媒体业务成功；必须完成内容校验、canonical 激活和业务回读。
4. 不因 TDesign 提供现成组件而整体换肤、引入暗色低对比文本或缩小实际触控区。
5. 不把 Demo、Mock、Pages、DevTools 或 CI 绿灯记作物理真机、目标云环境或普通成员完整写链路通过。
6. 不让参考仓库自动漂移到最新分支；升级固定提交必须形成独立评审。

## 5. 实施与验收门禁

每个借鉴项都按“小切片、可回滚、先证明缺口”执行：

1. 在 Issue/PR 中写明参考仓库、固定提交、具体路径、现有缺口和不采纳部分；
2. 先补失败测试或验收步骤，再修改本项目；不得直接复制整页或整套架构；
3. UI 变更先核对对应运行 Pages 与 `docs/designs/2026-10-22-cycling-image-journal/`；
4. 代码交付至少通过 `npm run check:ui-sync -- --strict`、`npm run check:governance` 和 `npm run validate`；
5. 涉及依赖时追加主包体积与 `npm run audit:all`；涉及 CloudBase 时完成 `plan -> apply -> verify`、受影响函数部署和目标环境回读；
6. 涉及权限、媒体、定位、Canvas、保存、订阅消息或 GPX 时，必须追加 iOS/Android 真机证据；
7. 只有关闭条件全部满足后，才更新高优问题清单；参考项目“有相同功能”不算完成证据。

## 6. 推荐执行顺序

1. 以现有代码完成普通成员真实写链路和权威回读，不做架构替换；
2. 单独实现网络状态感知与保存相册失败分支，并完成双真机验证；
3. 统一三类媒体的可见状态，随即完成真实媒体 smoke；
4. 固化双真机权限矩阵，补齐定位、Canvas、保存分享与弱网证据；
5. 完成 Strava OAuth / GPX 现场链路；
6. P0 关闭后，再评估 TDesign 局部组件 PoC 和 P1 体验优化。

这个顺序的核心是：官方项目用于减少 API 和交互试错，不用于绕过当前最关键的真实环境、普通成员和物理真机验收。
