# Issue #382 隐私代际消费者实施方案

日期：2026-10-27
基线：`822cfdf`
来源：Issue #382、固定 source `0908a0214f02b0817fcaefbe188e928905535d5b`、已合 #375（`d7d073c`）及当前主线

## 1. 目标与约束

本方案从现有实现增量恢复数据主体权利能力，不整包搬运旧 PR。本次只完成后端的“报名写入代际”纵切片：报名事务读取服务端资料、校验删除锁和请求代际，并把服务端确认的 `profile_generation` 与报名一同写入。小程序页面、交互、设置页 `RELEASE_NOTES`、公开读取、签名和删除 worker 均不在本次改动中。

该切片不把“本人报名资料可用”与“允许公开展示”混为一件事：报名事务仍可为本人和审核流程保存必要快照，不读取或伪造 `public_consent`；公开名片和签名消费者后续必须单独执行 `registrationPublicEligible` 与显式同意检查。

## 2. 复用依据

- `scripts/rights/privacy.cjs`（#375）是完整代际规则基准：无 `generation` 的存量资料按 g1；generation 必须为正安全整数；非 active 删除状态锁定写入；完整客户端迁移后 g2 及以后应要求请求显式匹配。本阶段因已发布报名客户端尚不发送 generation，只在请求显式携带该字段时启用严格匹配。
- source `0908a021...` 的 `cloudfunctions/shared/privacy.js`、`shared/use-cases.js` 和 `registration/index.js` 已提供相同的报名调用顺序与 `profile_generation` 写入口。本次只提取其中报名必需的三个纯规则，并适配当前主线的 `DomainError`，不恢复 source 的旧 UI、部署配置或其他消费者。
- 当前主线继续以 `cloudfunctions/shared/{domain,use-cases}.js` 为领域源码，由 `prepare-cloudfunctions.mjs` 同步到 activity-read、registration、admin-review 的部署副本；不引入新依赖，不改变复制机制。
- #372 已建立本人私人预览与公共能力分离的边界。本次测试明确：资料为 private 且未给予公共同意时，合法报名仍能保留本人/审核所需快照；返回 DTO 不暴露内部 `profile_generation`。

## 3. 本次实现（阶段 1）

### 3.1 写入协议

`submit` 请求新增可选后端字段 `generation`：

1. 在同一 CloudBase 事务中依次读取活动、资料、已有报名和管理员状态。
2. 先校验资料删除状态与 generation：
   - 存量资料缺 generation 时视为 g1。
   - 请求缺 generation 时按旧客户端处理：只要资料未被删除锁定且服务端 generation 合法，允许 g1 或 g2+ 报名继续；该兼容分支不声称具备客户端并发防护。
   - 请求显式携带 generation 时必须与服务端当前正安全整数完全匹配；显式过时代际稳定失败。
   - deletion_status 存在且不为 `active` 时始终返回 `PROFILE_DELETION_LOCKED`，旧客户端兼容不得绕过删除锁。
   - 非法服务端 generation 返回 `PROFILE_GENERATION_INVALID`；显式不匹配返回 `PROFILE_GENERATION_MISMATCH`。
3. 通过后把服务端确认值（绝不采用客户端值）写入报名的 `profile_generation`，与报名、占位、通知和审计共享原事务。
4. 失败发生在任何报名写入、名额更新、通知和审计之前。

### 3.2 隐私边界

- generation 是内部关联围栏，不加入当前 `publicRegistration` DTO。
- `public_consent`、`avatar_visibility` 不参与本人报名资格判断，也不会被报名写入改写。
- 本切片没有接通公开读取或 URL 签名，因此不能把 `profile_generation` 已写入解释为“可公开”。
- 当前 `miniprogram/repositories/cloud.ts` 的 `saveRegistration` 未发送 generation，这是本次确认的生产断链；遵守后端范围，本次不修改仓储、页面或交互，而由服务端兼容缺字段请求。
- 缺 generation 的成功只保证已发布客户端可用和服务端落库代际正确，不提供“资料读取后到报名提交前未重建”的客户端乐观并发证明，也不得标记为客户端代际迁移完成。
- 不新增客户端入口；后续必须让 profile 读取 DTO 返回 generation、报名仓储显式透传，并通过发布观测确认旧客户端退场，才能评估收紧缺字段请求。

## 4. 数据迁移与兼容

### 4.1 存量数据

- `profiles.generation` 缺失按 g1 读取，不要求一次性回填。
- 新建或重新提交的报名写入显式 `profile_generation`；既有报名缺失值暂按 g1 解释，直到读取/签名消费者迁移。
- `profile_generation` 仅由服务端资料记录派生；客户端值只用于乐观并发/迟到请求校验，不能成为最终写入来源。
- 本次不扫描、不重写历史报名，不创建集合或索引。

### 4.2 上线兼容顺序

1. 先部署本阶段后端：删除锁保持 fail closed；缺 generation 暂按旧客户端兼容；显式 generation 严格匹配；所有成功写服务端实际代际。
2. profile 读取 DTO 增加 generation，报名仓储显式透传；身份切换和删除/重建时清理旧缓存。该项未完成前，不得宣称已有客户端并发防护。
3. 观测缺字段请求比例并覆盖所有受支持客户端版本；只有确认旧版本退场后，才可另行变更为“g2+ 缺字段拒绝”，且需独立发布闸门与回退方案。
4. 读取与签名消费者对历史缺失值按 g1 处理，对显式 generation 严格匹配。
5. 删除账本、媒体保存和公开出口全部接线后，才在同一候选版本启用完整代际约束。

回退不能删除已经写入的 `profile_generation`。代码回退时旧服务会忽略附加字段；若已启用删除 worker 或显式同意，必须先停入口/worker、保留账本与补偿证据，而不是回滚数据。

## 5. 后续阶段

### 阶段 2：读取与签名资格（R02）

- 将 #375 的 `registrationPublicEligible` 接入公开报名读取、头像/媒体签名入口。
- 同时核对报名 generation、当前资料 generation、删除状态、`privacy_generation`/suppressed 标记和显式公共同意。
- 本人私有 profile/capability 读取不复用公共资格门槛；撤回同意后本人仍可预览合法私人资料。

### 阶段 3：删除目标移交（R01）

- 删除已取消报名时，在同一事务调用 `retainSnapshotTargets`，把头像、背景和照片目标并入删除请求后再物理删除报名。
- 超过 256 个唯一目标时显式进入 `manual_required`，不得截断后继续删除。
- 增加事务失败回滚、幂等重试、报名已不存在和重复删除测试。

### 阶段 4：其余写消费者（R12/R15）

- 管理员上传、活动媒体保存、俱乐部媒体保存均从服务端 owner profile 获取 generation，并在保存/激活事务内核对。
- 客户端 DTO 显式透传 generation；迟到 g1/g2 请求不得附着到新资料。
- 显式同意/撤回入口与缓存失效另行实现，不以普通资料保存或历史 public 标记代替。

### 阶段 5：部署与联合验收

- 与 #385 的 CloudBase 配置、集合/索引、函数和 Timer 变更合并到同一候选版本。
- 通过全量 validate、安全审计、PR/main CI、CodeQL 后，再执行真实云和双真机旅程。

## 6. 自动化验收

本切片必须满足：

- 缺 generation 的旧客户端对 g1、g2+ 资料均可报名，数据库记录显式写入服务端实际 `profile_generation`。
- 显式 generation 完全匹配时成功并写入服务端实际代际；显式过时代际稳定返回 `PROFILE_GENERATION_MISMATCH`。
- 删除锁无论请求是否携带 generation 都稳定返回 `PROFILE_DELETION_LOCKED`；服务端 generation 非法返回 `PROFILE_GENERATION_INVALID`。
- 所有失败均不写报名、不改名额、不写审计。
- private/未公共同意资料仍可完成本人报名，快照供本人和审核使用；公共 DTO 不泄漏内部 generation。
- 验收不包含客户端 generation 透传、缺字段请求收紧、公开读取/签名或删除账本；不得据此宣称端到端并发防护完成。
- registration 云包定向测试、#375 权益契约测试、标准 lint/格式和 `git diff --check` 通过。

## 7. 后续真实云验证

使用隔离账号和专用测试活动，禁止使用真实用户资料或公开截图：

1. 回读 legacy g1 报名，确认数据库 `profile_generation=1`、占位/审计各一次。
2. 将隔离资料重建为 g2，分别发送缺 generation、旧 generation、正确 generation 请求；缺字段请求兼容成功且写入 g2，旧 generation 无副作用地失败，正确 generation 成功并只产生预期报名。
3. 在提交与事务执行之间触发删除状态，验证事务冲突重试后 fail closed。
4. 接入阶段 2 后，验证旧 g1 报名不能签 g2 私人头像；撤回公共同意后公共签名拒绝而本人私人预览仍成功。
5. 接入阶段 3 后，执行取消→删除报名→worker，回读删除请求目标、审计、幂等和补偿状态。
6. 最后执行删除→重建→重新报名完整旅程，并核对缓存失效、迟到请求、CloudBase 配置与数据回读。

## 8. 未关闭事项

本次只关闭 R12 的“报名后端写入与旧客户端兼容”子项，不关闭 Issue #382，也不宣称 R01、R02、R13、R15 已完成。客户端 profile DTO/报名透传及缓存清理尚未实现，因此缺 generation 的兼容窗口内不存在端到端乐观并发防护；收紧窗口还依赖版本覆盖率观测和独立发布闸门。公开读取/签名、删除账本事务、管理员与活动/俱乐部媒体消费者、显式同意 UI、真实云、普通成员真机及联合 UAT 均继续阻塞完整上线。
