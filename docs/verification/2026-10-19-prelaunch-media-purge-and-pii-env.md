# 预发布统一媒体数据清理与 PII 密钥部署验证

- 日期：2026-10-19
- 分支：`chore/clear-prelaunch-media-data`
- 性质：一次性、破坏性预发布清理；cleanup worker 产品修复已同步设置页 release note

## 根因与边界

俱乐部中心“资料加密服务未配置”来自 `profile` 与 `admin-review` 缺少 `PII_ENCRYPTION_KEY`。该密钥与六个媒体消费者使用的 `PROFILE_MEDIA_PATH_SECRET` 相互独立：PII 密钥必须是严格 base64 编码的 32 字节值，媒体路径密钥继续沿用原校验和保全行为。

清理脚本只处理统一图片上传影响的数据：

- 删除全部 `profiles`，从而移除旧 PII 密文及个人媒体引用；
- `clubs` 仅 unset 实际持久化字段 `avatar_url`、`cover_file_id`；
- `club_applications` 仅 unset `avatar_file_id`、`cover_file_id`；
- `activities` 仅 unset `images`、`cover_image`、`group_qr_code`、`group_qr_code_uploaded_at`、`club_identity.avatar_url`、`route.generated_preview_file_id`、`route.public_route_preview_id`，保留活动业务记录与 GPX 文件引用；
- 删除 `route_previews` 媒体预览元记录，但不删除 GPX 文件；
- 不删除俱乐部、申请、成员或审核业务记录；
- 将 `profile_media` 统一置为到期 `unreferenced`，将 `profile_media_imports` 统一置为到期 `uploaded`，调用已部署的 `profile-media-cleanup` 定时身份事件直至记录进入终态，再删除终态登记；
- 额外仅对 `profiles/**`、`profile-canonical/**` 执行 `tcb storage rm`，覆盖没有登记的 legacy / unregistered 文件。

## 生产失败回溯（run 39187606569）

合并后的首次人工清理在输出 `profiles=3, clubs_media=0, applications_media=2, activities_media=9, route_previews=9, profile_media=20, imports=2, storage_profiles=0, storage_canonical=0` 后，进入 `adapter.mutate` 的第一次 `tcb db nosql execute` 即失败，CLI 只返回 `Error: Unknown issue`，因此没有进入 cleanup 或存储删除。

最可能根因是脚本偏离了仓库内已验证的 NoSQL 调用形态：它把 7 个跨 collection 的 UPDATE / DELETE 命令放进一次 `MgoCommands` 请求，并在 4 个 DELETE 中使用 `limit: 0`。仓库的 `cloudbase-club-application-smoke.mjs` 每次 `execute` 只发送一个命令；本机 `@cloudbase/cli@3.8.4` 帮助中的 QUERY / INSERT / UPDATE / DELETE / COUNT 示例也都是单元素数组，DELETE 明确使用正数 `limit: 1`。CLI 3.8.4 实现仅校验 `--command` 是数组，随后将整个数组不加拆分地作为 `MgoCommands` 传给 `app.database.runCommands`；任一元素被服务端拒绝时，CLI 无法指出具体元素。结合失败发生在整批首次提交而摘要中的数据量很小，跨集合整批提交和未验证的 `limit: 0` 是最符合证据的触发因素，无法仅凭 `Unknown issue` 进一步区分二者。

修复后所有 mutation 都按原顺序逐命令执行，任一命令失败立即阻断；DELETE 固定使用 CLI 已验证的安全上限 `limit: 1000`，先以同一过滤条件 COUNT，非空时每批删除后继续 COUNT 回读至 0，空集合不下发 DELETE。失败日志只记录命令序号、collection、op 和经过脱敏截断的 stderr 尾部，不记录完整 command payload。

## 第二次生产失败回溯（run 39191387824）

第二次人工清理输出 `profiles=0, clubs_media=0, applications_media=0, activities_media=0, route_previews=0, profile_media=20, imports=41, storage_profiles=18, storage_canonical=5`。前三条 UPDATE 均成功，第 4 条空 `route_previews` DELETE 失败且 stderr 为空，证明 CloudBase 对空集合 DELETE 同样会失败，流程因此未继续到后续 `profile_media` UPDATE。

脚本现对每条 DELETE 先按完全相同的 filter 执行 COUNT：结果为 0 时跳过该 DELETE 并继续后续命令；结果大于 0 时才按 `limit: 1000` 分批删除，每批按同一 filter 回读，直至为 0。非空 DELETE 不会被跳过；COUNT 或 DELETE 失败继续按原始 command index 准确定位，回读数量未下降则 fail closed。UPDATE 行为不变。

## 破坏性操作门禁

`scripts/cloudbase-prelaunch-media-purge.mjs` 默认 dry-run，只输出集合计数和两个固定存储 glob 的删除预览计数，不输出文档、openid、个人字段或密钥。`--apply` 必须同时满足：

1. `--env-id` 与 `cloudbaserc.json.envId` 一致；
2. `--confirm-env-id` 与目标环境一致；
3. `--confirmation DELETE_PRELAUNCH_MEDIA_DATA` 精确匹配。

apply 前再次输出摘要。mutation 按原顺序逐条调用 NoSQL CLI；DELETE 使用 `limit: 1000` 并按同一过滤条件 COUNT 回读循环至 0。cleanup 的单轮 `processed=0` 不视为失败：脚本每 30 秒有界等待并重试，24 轮最多约 12 分钟，覆盖 30 秒存储一致性窗口及最长 5 分钟确认窗口，同时为部署与 smoke 留出工作流余量；函数报告失败或超过上限即 fail closed。摘要计数使用 NoSQL `COUNT`，存在性检查使用 `limit: 1`，不依赖超过 CloudBase 限制的大查询。存储预览和最终验证均复用与删除完全一致的两个 `storage rm <prefix/**> --dry-run` glob。

apply 后必须回读确认：`profiles`、`profile_media`、`profile_media_imports`、`route_previews` 均为 0，clubs / applications / activities 不再含目标媒体字段，两个存储 glob 均无文件。重复执行空库清理仍应成功。

## 部署工作流

`deploy-cloudbase.yml` 从 `cloudbase-production` GitHub Environment 注入 `PII_ENCRYPTION_KEY`，运行时配置生成器会：

- 从 Actions secret 与部署前函数详情解析、掩码并校验两套密钥；
- 保留每个函数已有环境变量；
- 仅向 `profile`、`admin-review` 注入 PII 密钥；
- 保持媒体密钥原有六个消费者不变；
- 部署后验证 `profile`、`admin-review` 的 PII 密钥存在且一致，同时继续验证全部媒体消费者。

只有人工 `workflow_dispatch` 同时设置 `purge_prelaunch_media_data=true` 且 `purge_confirmation=DELETE_PRELAUNCH_MEDIA_DATA`，才会在函数部署及密钥验证通过后执行 apply；随后运行现有 production club application write smoke。该 smoke 会在 purge 后重新创建隔离的 `profile_media`、俱乐部申请和正式俱乐部数据，验证新写入链路可用，并在 finally 中删除这些 smoke 数据；普通 main 自动部署不会进入清理步骤。

## 自动化覆盖与远端待办

Node 测试覆盖 dry-run 不写、三重确认、环境不匹配、空库幂等、集合/字段/状态范围、mutation 逐命令执行与具体失败阻断、DELETE `limit: 1000` 回读循环、脱敏 stderr 定位、固定存储前缀、cleanup 等待重试、PII 严格解码、环境变量保全与 workflow 顺序/门禁，并纳入 `test:bootstrap`。

合入前仍需环境管理员：

1. 在 GitHub Environment `cloudbase-production` 设置 `PII_ENCRYPTION_KEY` secret（严格 base64 的 32 字节密钥），并确认既有 `PROFILE_MEDIA_PATH_SECRET` 正确；
2. 合入 main 后人工触发 workflow，勾选 `purge_prelaunch_media_data` 并填写固定确认短语；
3. 保存该次 Actions run，核对密钥验证、清理回读和 production smoke 均通过，且日志不含 secret 或个人数据。
