# 2026-10-18 统一媒体上传验证

## 范围与结论

本次只完成图片上传 P0 闭环：个人头像/背景、活动图片/群二维码、俱乐部头像/背景统一走一个客户端 orchestrator，并复用 `profile` 云函数既有的“签发路径 → 上传 → 登记/canonicalize”能力。没有新增云函数，也没有在同一变更中重写 GPX 业务校验、全部 action 注册或所有非媒体接口。

## 架构

```text
业务页（选择、裁剪、Canvas、业务校验）
  -> miniprogram/utils/media-upload.ts
     authorize(category, requestId, extension)
       -> profile.mediaUploadPath（服务端基于 OPENID 签发 owner alias 路径并持久化 intent）
     uploadWithRetry（进度、20s 超时、指数退避、同路径重试、诊断）
       -> wx.cloud.uploadFile（全客户端唯一调用点）
     finalize(source fileId, category, requestId)
       -> profile.registerMedia（owner/category/request 匹配、对象存在、5MB、magic、hash）
       -> profile-canonical/<owner-alias>/<category>/<source-hash>/<content-hash>.<ext>
       -> profile_media 原子登记
     finalize 失败 -> 删除 source；业务页卸载/移除 -> 删除本次 canonical
```

选择、裁剪、压缩和俱乐部固定像素 Canvas 仍在业务层。统一模块不理解业务 UI，只负责策略编排。GPX 与路线预览图只复用 `uploadWithRetry`，仍由 `activity-admin` 完成扩展名、4MB、SHA-256、XML 和路线语义校验。

## 核心安全与可靠性约束

- **服务端授权目标**：客户端只提交 category/requestId/extension，不提交 openid；路径由 `profile` 从可信微信上下文生成。
- **用途 allowlist**：`profile-avatar`、`profile-background`、`activity-image`、`activity-group-qr`、`club-avatar`、`club-cover`；路径带 category，finalize 不匹配即拒绝。
- **所有权**：source 必须位于当前用户 HMAC alias 目录；canonical 路径也带同一 alias。`activity-admin` 与 `club-application` 使用同值 `PROFILE_MEDIA_PATH_SECRET` 验证新 canonical owner，缺失密钥时 fail closed。
- **完整性**：云端从可信临时地址读取对象，限制 5MB，校验 JPEG/PNG/WebP magic，计算 SHA-256 后复制到不可变 canonical 目标。
- **幂等**：客户端 requestId 与已持久化 intent 绑定；上传重试复用同一个 cloudPath；canonical 路径由 source hash + content hash 决定；重复 finalize 复用登记。
- **状态机与回收**：profile 媒体由资料保存事务激活；activity/club 媒体 finalize 后保持 `unreferenced` 并带 `cleanup_after`，只有对应业务保存事务成功引用后才切为 `active`。页面放弃或客户端删除失败不会阻止后台 fenced cleanup 回收 source 与 canonical。
- **失败不激活**：对象校验或 canonical copy 失败时不完成 registry；activity/club 只有业务保存成功引用后才激活，profile 仍在资料保存事务中激活。
- **清理**：客户端可做尽力删除，但正确性不依赖客户端成功；未保存的 `unreferenced` 记录及其 source/canonical 由既有 cleanup 状态机回收。
- **错误阶段**：客户端错误稳定标注 `authorize`、`upload`、`finalize`、`cleanup`；技术码进入诊断，不把 openid 或密钥写日志。

## 迁移矩阵

| 场景 | category | 业务预处理 | 上传/登记 | 业务表新写入 |
| --- | --- | --- | --- | --- |
| 个人头像 | `profile-avatar` | 微信头像选择、5MB | 统一重试 + profile finalize | canonical fileId；`setAvatar` 事务激活对应 source registry |
| 个人背景 | `profile-background` | 16:9 裁剪、压缩、5MB | 统一重试 + profile finalize | canonical fileId；保留既有 `ride` 展示分类兼容 |
| 活动图片 | `activity-image` | 多图选择、会话内内容去重 | 完整 orchestrator | canonical fileId |
| 活动群二维码 | `activity-group-qr` | 单图选择 | 完整 orchestrator | canonical fileId |
| 俱乐部头像 | `club-avatar` | 1:1、512×512 | 完整 orchestrator | canonical fileId |
| 俱乐部背景 | `club-cover` | 16:9、1280×720 | 完整 orchestrator | canonical fileId |
| GPX | 不属于图片 category | 4MB、扩展名、SHA-256、XML/路线语义 | 仅复用 `uploadWithRetry` | 原路线 fileId |
| 路线预览图 | 不属于首期通用资产登记 | Canvas 生成，由路线预览绑定接口校验 | 仅复用 `uploadWithRetry` | 原路线预览绑定字段 |

> 所有六类图片的新业务写入都只保存 canonical fileId。`profile_media` 仍以 source fileId 作为 registry 主键并记录 canonical 绑定，但 profile 激活、revision、替换降级与 cleanup 均可通过 canonical 引用回查该 registry；存量 source/HTTPS 仅保持只读兼容，不做数据迁移。finalize 完成后 source intent 保留 24 小时回收窗口，业务表的 canonical 引用不会阻止 source 独立清理。

## 历史兼容边界

- 已有 `club-applications/<openid>/...` 可继续创建/更新、签发预览；新上传不再生成含原始 openid 的路径。
- 已有活动 owner 路径、路线文件和已发布历史媒体继续读取；新增图片要求 category canonical owner 匹配。
- 既有 HTTPS 仅作为历史公开展示 URL 读取，不作为新上传授权结果，也不转换成 fileId。
- 新 canonical 俱乐部头像与背景分别校验 `club-avatar`/`club-cover`，创建和管理员更新均不能互串；存量 `club-applications/<openid>/...` 路径本身不含用途，无法严格区分头像/背景，仅保留读取与原值更新兼容，不把该兼容能力表述为强隔离。
- profile 旧 `ride/bike/other` 登记继续支持；新头像/背景 category 映射回既有展示语义。

## 成熟案例原则映射

- **Uppy core**：统一 orchestrator，业务层注入授权、登记、进度和 UI 策略。
- **tus 思想**：不引入 tus 协议；以稳定 requestId、同 cloudPath 重试和可重复 finalize 实现首期幂等/恢复。
- **S3 presigned 思想**：目标由服务端授权，客户端不决定 owner；登记前服务端校验类型、大小、所有权和完整性。
- **Cloudinary 思想**：统一资产登记与 canonical 副本，所有新业务写入均不直接依赖可覆盖的 source；历史 source/HTTPS 只读兼容。

## 全项目接口复用审计待办

### P0（本次完成）

- 禁止 `pages/`、`repositories/` 直接调用原生 `uploadFile`，唯一调用点为 `utils/media-upload.ts`。
- 六类图片统一授权、重试、进度、超时、登记、canonical 和清理。
- 修复俱乐部使用原始 openid 路径、头像/背景用途不分和缺少登记的问题。
- 静态治理接入现有 `check:governance`，并由 `validate` 闭环执行。

### P1（后续）

- 为 `profile_media.canonical_file_id + owner_openid` 查询补充生产索引与监控，并持续验证 canonical 双读性能；不迁移历史 source/HTTPS 业务数据。
- 为活动/俱乐部业务删除增加 registry 引用计数或 release action，清理已登记但最终未保存的 active canonical。
- 把 activity/club 的 canonical owner/category 校验抽成云函数共享包，减少当前小段同算法实现。

### P2（后续）

- Action 注册表与参数 schema 全量审计；先出报告，再按云函数逐个收敛，避免一次高风险重写。
- 临时 URL 解析、分页、requestId、错误响应等重复 repository 能力形成共享基建候选。
- 增加断点续传协议的可行性评估；当前文件上限与微信 API 不足以证明需要真正 tus。

### P3（观察）

- 内容去重跨用户复用、自动格式转换、CDN 派生图和生命周期成本优化。
- 非媒体领域的重复业务 action，仅记录 owner、调用方、幂等和鉴权差异，不随本 PR 改造。

## 不应统一的边界

- 图片裁剪比例、Canvas 输出尺寸、压缩质量属于业务体验，不下沉到 transport orchestrator。
- GPX 不是图片，不走 magic/image canonical 流程；路线解析和预览消费语义保留在 `activity-admin`。
- 微信选择 API、头像组件、取消交互和页面状态仍由页面负责。
- 历史 HTTPS 展示兼容与新文件授权不可合并成一个“任意 URL 可登记”入口。

## 测试与门禁

- `tests/media-upload.test.ts`：同路径重试、进度、超时 abort、阶段错误、canonical 返回、finalize 失败清理。
- profile 云端：category/path/owner、requestId intent 匹配、canonical 用途、重复登记、对象校验与 copy 失败不落 registry。
- activity/club：新 canonical owner/category 与旧路径兼容；头像/背景、活动图/群二维码互串拒绝。
- `scripts/media-upload-governance.node-test.mjs`：统一模块正例、pages/repositories 原生上传反例。
- 接线契约：profile/activity/club 页面只能导入统一模块，原生上传静态扫描为零。

部署前必须给 `activity-admin`、`club-application` 配置与 `profile` 相同的 `PROFILE_MEDIA_PATH_SECRET`，再做真机头像、背景、活动图、群二维码 smoke；未部署时不得宣称生产就绪。

## 回滚

1. 客户端回滚到旧版本后，历史 source/legacy 路径仍可读取；本次没有删除旧 action。
2. 云函数先保持新 allowlist 和双读兼容，再回滚客户端，避免新 canonical 在旧云端被拒绝。
3. 若必须回滚云端，先停止新客户端发布；新活动/俱乐部 canonical 记录不可直接改回 source，需按 `profile_media.canonical_file_id` 回查。
4. 不删除 `profile_media`、intent 或 canonical 对象；待引用核对后再由 cleanup/人工脚本处理。
