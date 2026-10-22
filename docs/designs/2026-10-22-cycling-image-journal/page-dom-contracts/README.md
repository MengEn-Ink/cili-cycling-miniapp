# 骑行影像志 · 16 页 DOM/交互契约基线

本目录是机器可校验的页面结构基线，从设计稿 `docs/designs/2026-10-22-cycling-image-journal/pages/*.html` 与当前小程序实现双向校准。每条契约描述一个页面：

- `designIntent`：设计稿对该页的功能/交互意图总结（Phase 2 起补齐），用于解释为什么容器与文案是这样挑选的。
- `containers`：按出现顺序排列的容器 class/role 序列，用于验证 WXML 的分块顺序一致。`optional: true` 的分块仅在特定数据状态下渲染。
- `interactions`：每个必备交互节点及其 `trigger`、`dataAttr`、`openType` 要求；对应 WXML 中的 `bind:xxx` / `catch:xxx` / `open-type`。
- `copy`：必须复用的文案锚点（例如 eyebrow、标题、按钮文案），用于验证不是只套令牌。
- `assets`：必须命中的媒体资源 class 或资产引用。
- `forbids`：旧 Oil UI 或语义冲突 class 的黑名单，用于防止回归。

## 分阶段落地

**Phase 1：骑友体验核心 6 页**

- `activities`
- `activity-detail`
- `route-analysis`
- `registration-form`
- `registrations`
- `credential`

**Phase 2：我的、俱乐部、管理工作台 10 页**

- `profile`
- `profile-edit`
- `settings`
- `club-center`
- `admin-activity-list`
- `admin-activity-edit`
- `admin-reviews`
- `admin-review-detail`
- `admin-club-management`（历史路由名 `pages/admin/club-applications/index`，设计语义是唯一俱乐部管理）
- `admin-club-profile`（历史路由名 `pages/admin/club-application-detail/index`，设计语义是唯一俱乐部资料编辑）

全部 16 份契约都纳入 `tests/cycling-image-journal-page-dom-contract.test.ts` 的深度校验：

1. 校验 containers 中非 optional 的分块都在对应 WXML 中出现；
2. 校验 containers.order 严格递增；
3. 校验 interactions 中的 trigger 真实绑定（含 `dataAttr`、`open-type` 变体）；
4. 校验 copy 中的文案锚点真实出现；
5. 校验 forbids 中的旧 class / 冲突 class 没有泄漏；
6. 校验 assets 中列出的媒体 class 在 WXML 中出现；
7. 校验 wxml / wxss / ts 文件都存在且非空。

## 使用方式

- 修改任一页面的 WXML / WXSS / TS 时，先更新本契约再调整实现（或反之，并同时跑测试）；
- 添加新的必备分块、交互、文案锚点时，必须同步追加到契约；
- 退役旧 class 时，加入 `forbids` 以阻止回归；
- 历史命名的路由（例如 `club-applications`）不要重命名文件（会与 #341 等并行 PR 冲突），而是在契约里明确新设计语义，并在 `forbids` 中禁止重新回到旧列表语义。

> 本基线不替代真实视觉验收，只是"Director 验收单的 lint 层"，用于在 PR 里拦住 DOM 顺序漂移、关键钩子丢失、文案被改白、旧语义回归等问题。
