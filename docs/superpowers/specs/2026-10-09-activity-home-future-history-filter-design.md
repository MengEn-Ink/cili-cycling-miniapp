# 活动首页未来 / 历史筛选设计

## 背景

活动首页当前调用 `activity-read` 的旧 `list` 动作，一次返回最多 20 条 `published` 活动。页面固定使用“UPCOMING RIDES”“下一场”“接下来”等未来活动文案，但服务端既不按当前时间过滤，也不返回 `finished` 活动。因此，过期但尚未手工结束的活动可能继续出现在首页，而已结束活动无法通过首页回看。

产品决策已明确：首页默认打开“未来活动”，用户可切换到“历史活动”。本设计同时收口服务端时间语义、完整历史分页、页面竞态和旧调用兼容。

## 目标

1. 首页提供“未来活动 / 历史活动”双视图，默认未来活动。
2. 所有时间边界由服务端判定，设备时钟不参与活动归类。
3. 正在进行的活动保留在未来视图；自然结束或手工结束的活动进入历史视图。
4. 两个视图都使用稳定的 keyset 分页，历史活动不会因固定 20 条上限永久不可见。
5. 切换、刷新和加载更多互不串写，迟到请求不能覆盖当前视图。
6. 保持旧 `listActivities()` 调用及旧云函数裸数组协议的既有语义，避免“我的报名”等现有页面丢失历史活动关联信息。
7. 上线前取得自动化、真实 CloudBase 查询计划和测试环境页面证据。

## 非目标

- 不合并或改造 PR #45 的活动管理页分页；该 PR 只可作为分页测试思路参考。
- 不修改活动状态机 `draft <-> published -> finished`。
- 不新增首页搜索、状态多选、日期范围、自定义排序或筛选计数。
- 不新增下拉刷新手势；继续使用 `onShow` 刷新和显式重试。
- 不修改活动详情、报名、管理页或“我的报名”的业务语义。
- 不在本轮清理旧 `list` 协议；旧调用迁移另立任务。

## 方案比较

### 方案 A：服务端分页分流，客户端只请求当前视图（采用）

服务端新增独立分页动作，按服务端时间把活动分为未来和历史；客户端默认请求未来，切换后懒加载历史。

优点：时间边界一致、历史可完整翻页、删除和非法数据可在分页窗口前排除、默认首屏只发一个请求。代价是需要新增 cursor、索引和页面加载更多状态。

### 方案 B：客户端获取混合列表后过滤（否决）

改动较少，但旧接口只返回 `published` 且最多 20 条。客户端过滤会漏掉 `finished` 及窗口外活动，并受设备时钟影响，无法满足完整历史和一致边界。

### 方案 C：首屏同时获取未来和历史并分组（否决）

可以立即显示两个分组，但会增加默认首屏成本和双请求竞态。产品已选择默认未来视图，没有必要预取用户尚未打开的历史列表。

## 业务语义

服务端在首屏请求开始时生成 `as_of`。同一分页链路始终使用该时间快照进行归类。

### 未来活动

活动必须同时满足：

- `status === 'published'`；
- `is_deleted !== true`；
- `event_start` 和 `event_end` 是合法数据库时间，且 `event_start < event_end`；
- `event_end > as_of`。

因此，`event_start <= as_of < event_end` 的正在进行活动仍属于未来视图。未来活动按 `event_start ASC, _id ASC` 稳定排序。

### 历史活动

活动必须满足非删除和合法时间要求，并满足下列任一条件：

- `status === 'finished'`，包括结束时间尚在未来但已被管理员提前结束的活动；
- `status === 'published' && event_end <= as_of`，包括自然结束但尚未手工结束的活动。

历史活动按 `event_end DESC, _id DESC` 稳定排序。`draft`、未知状态、缺失时间、非法时间和已删除记录不进入任一新视图。

边界无重叠也无空洞：`event_end > as_of` 属于未来，`event_end <= as_of` 属于历史。

## 服务端协议与兼容性

### 旧协议

旧请求继续使用：

```json
{ "action": "list" }
```

返回值继续是活动数组，查询、排序、上限和过滤语义保持现状。新首页不再依赖该动作，但 `registrations`、管理员审核选择器和旧客户端可继续使用。不能仅保持数组形状却把内容悄然收窄为未来活动。

### 新分页协议

首页使用独立动作，避免同一动作根据可选参数返回两种结构：

```json
{
  "action": "listPage",
  "view": "future",
  "page_size": 20,
  "cursor": "可选 opaque base64url"
}
```

`view` 只允许 `future | history`；`page_size` 默认 20、最大 20。成功响应：

```json
{
  "items": [],
  "next_cursor": null,
  "as_of": "2026-10-09T08:00:00.000Z"
}
```

非法 `view`、`page_size`、cursor、cursor 与 view 不匹配，必须在任何数据库读取前返回 `VALIDATION_FAILED`。

## Cursor 契约

Cursor 是版本化的 opaque base64url JSON，最大 512 字符。解码后只允许以下字段：

- `v: 1`；
- `view: future | history`；
- `as_of: ISO 时间`；
- `boundary.time: ISO 时间`；
- `boundary.id: 非空活动 ID`。

未来 cursor 的 `boundary.time` 对应 `event_start`，历史 cursor 对应 `event_end`。cursor 不携带 openid、角色、status、删除条件或任意查询表达式。字段缺失、额外字段、非法版本、非法时间、非法 ID、超长输入和 view 不匹配全部 fail closed。

`as_of` 只冻结时间归类边界，不构成数据库快照。如果活动在翻页期间被编辑、结束或删除，当前分页链路不承诺跨写入的绝对无漏无重；用户重新进入页面或重试首屏后收敛到最新状态。静态数据集下必须无重无漏。

## 查询与分页

### 未来流

未来视图拆成两个互斥、同序的 `published` 流，避免直接用 `event_end` 范围过滤后再要求不同字段全局排序：

1. 进行中流：`event_start <= as_of && event_end > as_of`；
2. 未开始流：`event_start > as_of && event_end > as_of`。

两流都把 `status === published` 和 `is_deleted != true` 放入数据库 `where`，并按 `event_start ASC, _id ASC` 做 keyset。进行中流的所有排序键天然早于未开始流，因此服务端先读取进行中流；不足 `page_size + 1` 时再从未开始流补足。后续页把同一个 `(event_start, _id)` 严格大于条件应用到仍可能有结果的流。首轮每流最多一次 read，未来页最多两次 read，每次 limit 不超过 `page_size + 1`。

### 历史流

历史视图并行读取两个同序流：

1. `status === finished && is_deleted != true` 流；
2. `status === published && event_end <= as_of && is_deleted != true` 流。

两个流都按 `event_end DESC, _id DESC` 做同一 cursor 边界下的 keyset 查询。服务端全局归并、按 `_id` 防御性去重，再截取 `page_size + 1` 判断是否还有下一页。首轮每流最多一次 read，历史页最多两次 read，每次 limit 不超过 `page_size + 1`。

### Legacy 删除字段

`activity-admin` 的当前新建和复制路径已经显式写入 `is_deleted: false`，但存量记录允许字段缺失。新分页查询不做有副作用的数据迁移，统一把 `is_deleted != true` 放在数据库 `where` 中，使 `false` 和缺失字段可见、`true` 不可见。

设计不假设该谓词必然命中某个索引。真实 planner 必须证明它以有序 `IXSCAN + FETCH + LIMIT` 执行，且 `FETCH` 过滤发生在逻辑 limit 之前；允许扫描键数大于返回数，不允许出现阻塞 `SORT` 或应用层先 limit 后过滤。若测试环境不能证明这一点，本轮停止在 `PENDING (missing planner evidence)`，不得改成应用层过滤、不得提交生产 GREEN，也不得擅自回填业务集合。是否进行受控 `is_deleted=false` 回填必须另行设计和批准。

### 窗口正确性

- 禁止 `skip`。
- 任一数据库 read 的 `limit` 不得超过 `page_size + 1`。
- 删除、状态、时间合法性和 cursor 边界必须在最终分页窗口形成前生效。
- 正常页面的 read 上限为每流一次，即 future 最多两次、history 最多两次。
- 若 CloudBase 只能通过候选批次排除某类旧非法时间，每流最多继续 4 个 keyset 批次；单页总 read 上限为 10。五个批次仍无法形成页面或确认流耗尽时，返回 `DATA_INTEGRITY_ERROR`，不返回误导性的部分页面。不能在已经截断的 20 条上做事后过滤。
- 所有数据库响应必须验证为数组；异常统一走现有错误封装，不返回部分成功页面。
- 媒体临时 URL 解析失败继续沿用当前降级：保留原字段，不影响列表主结果。

## 索引与真实查询门禁

候选索引按 equality → sort → range 原则设计；`is_deleted != true` 作为 `FETCH` 过滤保留 legacy 缺字段语义，不把它误当成等值前缀：

- 未来两流：`status ASC, event_start ASC, _id ASC, event_end ASC`；
- 历史两流：`status ASC, event_end DESC, _id DESC, event_start DESC`。

候选索引不是已确认事实，当前状态为 `PENDING (missing planner evidence)`。实施计划必须把 planner 取证放在生产 GREEN 之前：先只写查询形态测试和测试环境 probe，不写正式查询实现。临时集合中同时保留可能竞争的旧索引，使用真实 CloudBase `explain` 验证 ongoing-future、scheduled-future、finished-history、published-history 及各自 cursor 查询：

- 命中预期复合索引；
- 没有阻塞 `SORT`；
- 单次返回和 read limit 不超过 `page_size + 1`；
- deleted、非法状态、旧 `is_deleted` 缺失记录和同时间戳记录符合契约。

使用至少 101 条混合夹具做多页 smoke，其中必须包含 `is_deleted=false`、字段缺失、`is_deleted=true`、同时间戳、进行中、未开始、自然结束和提前 finished。临时集合、索引和夹具必须精确清理，并记录 requestId、查询计划摘要和清理证据。

若任一查询出现阻塞 `SORT`、删除过滤晚于逻辑 limit、不可接受的全表扫描或无法使用 cursor 稳定续页，立即停止实现并保持 `PENDING (missing planner evidence)`。不得用内存 mock、应用层全量排序或候选索引猜测替代；先回到设计阶段调整查询、排序或单独提出数据迁移方案。

## Repository 边界

新增类型：

- `PublicActivityView = 'future' | 'history'`；
- `PublicActivityPage = { items: Activity[]; nextCursor: string | null; asOf: string }`。

新增 `listActivityPage(view, cursor?)`，严格映射分页 envelope、活动 DTO、cursor 和 `as_of`。非法响应统一抛出 `INVALID_RESPONSE`。

现有 `listActivities(): Promise<Activity[]>` 保持签名和云函数调用不变。MockRepository 同时实现新方法，并按与 CloudRepository 相同的排序和分页契约提供确定性测试数据。

## 首页状态与数据流

页面维护 `future` 和 `history` 两份互不共享的状态：

- `items`；
- `nextCursor`；
- `loading`；
- `refreshing`；
- `loadingMore`；
- `error`；
- `refreshError`；
- `revision`；
- `loaded`。

页面另有当前 `activeView`，初始为 `future`。

### 首屏与切换

1. `onShow` 加载当前视图；默认只请求 future。
2. 切换到未加载视图时展示该视图自己的 loading/empty/error，不短暂显示另一视图的卡片。
3. 切换到已有缓存的视图时先展示缓存，再做后台刷新。
4. 每次首屏刷新先提升该视图 revision，并使旧 loadMore 失效。
5. 离开当前视图时，先提升被离开视图的 revision，同步把它的 `loading / refreshing / loadingMore` 归零，并释放该视图的首屏与 loadMore 单飞句柄；保留 items、cursor、error 和 refreshError。
6. 响应、异常和 `finally` 落地前都同时校验 active view、revision 和请求 cursor；不匹配则整批丢弃，不能写 items、cursor、loading、error 或单飞句柄。
7. 切回有缓存的视图后必须能够立即发起新的后台刷新；先前废弃的 loadMore 不得阻止同一 cursor 重试。

### 加载更多

- 只有当前视图存在 `nextCursor` 且没有首屏或更多请求时才允许加载。
- 同一 view + cursor 只允许一个在途请求。
- 成功后按活动 ID 去重追加，并更新 cursor。
- 失败时保留原 items 和 cursor，展示非阻塞错误，可使用同一 cursor 重试。
- 没有 cursor 时隐藏加载更多入口，不发探测请求。

### 生命周期

`onHide` 和 `onUnload` 对 future 与 history 分别执行与“离开视图”相同的同步失效：先提升 revision，再把 `loading / refreshing / loadingMore` 归零并释放全部单飞句柄，同时保留 items、cursor 和错误。旧请求的成功、异常与 `finally` 均不得写入新 revision。`onShow` 因而可以立即刷新当前视图，不预取另一视图。本轮不启用下拉刷新。

## 页面呈现

在页面引导区与活动列表之间增加双选控件：

- `未来活动`；
- `历史活动`。

控件使用明确选中态、语义标签和至少 44px 等效触控高度；窄屏下不得截断或横向溢出。

未来视图沿用：

- eyebrow：`UPCOMING RIDES`；
- 分区标题：`下一场`；
- 第二张卡前提示：`接下来`；
- 空态：`暂无未来活动` / `新的骑行活动正在筹备中`。

历史视图使用：

- eyebrow：`RIDE ARCHIVE`；
- 分区标题：`最近结束`；
- 第二张卡前提示：`更早活动`；
- 空态：`暂无历史活动` / `完成的骑行活动会出现在这里`。

页面主标题“发现活动 / 报名出发”保持不变。现有 `activity-card`、活动状态文案和详情导航继续复用，历史卡片不得重新开放报名 CTA。

## 错误处理

- 当前视图没有缓存时，首屏失败使用阻塞错误和重试入口。
- 当前视图已有缓存时，刷新失败保留列表并展示非阻塞 `refreshError`。
- 加载更多失败不清空列表、不推进 cursor。
- future 的错误不得出现在 history，反之亦然。
- 迟到成功和迟到异常都必须先通过 revision 校验，不能清除较新的错误或 loading 状态。
- 云函数日志只记录错误码和动作，不记录 cursor 原文、活动内容、openid 或其他敏感数据。

## 测试设计

### 云函数 RED → GREEN

- 缺省旧 `list` 保持裸数组、既有查询语义和媒体降级。
- `listPage/future` 只返回 published 且 `event_end > as_of`；进行中活动归 future。
- `event_end === as_of` 归 history。
- 提前 finished 即使 `event_end > as_of` 仍归 history。
- published 自然结束归 history。
- draft、未知状态、deleted、缺失或非法时间不占分页窗口。
- future 与 history 在同时间戳下按 `_id` 稳定排序。
- 至少 41 条数据完成 20 + 20 + 1 分页，无 skip、无重、无漏。
- history 两流全局归并正确，cursor 同时约束两流。
- 后续页沿用首屏 `as_of`，时间推进不改变静态数据集归类。
- 版本、长度、字段白名单、时间、边界和 view mismatch 全部在数据库读取前拒绝。
- 每个数据库 read 的 limit 不超过 21。

### Repository

- `listActivityPage` 正确映射 request 和 envelope。
- future 首屏不传 cursor，history 更多页携带原 cursor。
- 非数组 items、非法活动 DTO、非法 cursor、非法 `as_of` 和额外响应结构按现有严格契约拒绝。
- 旧 `listActivities` 调用与返回保持不变。
- CloudRepository 与 MockRepository 行为一致。

### 页面

- 默认 activeView 为 future，首屏只请求 future。
- 首次切换 history 懒加载；再次切回使用本视图缓存并刷新。
- 两视图 items、cursor、loading 和 error 隔离。
- future 请求晚于 history 返回时不能覆盖 history。
- loadMore 晚于同视图首屏刷新时整批丢弃。
- future 首屏在途时切到 history、再切回 future：旧请求不落地，future 不永久 loading，能够立即重新请求。
- future loadMore 在途时切到 history、再切回 future：旧更多不落地，`loadingMore` 与单飞句柄已释放，原 cursor 能够重试。
- 同一 cursor 并发 loadMore 单飞。
- loadMore 失败保留 items/cursor，重试成功且按 ID 去重。
- `onHide/onUnload` 使两个视图的首屏和 loadMore 都失效并同步收敛 volatile 状态，随后 `onShow` 可重新请求。
- 文案、空态、加载更多入口、选中态和窄屏触控尺寸符合契约。

### 回归门禁

- `npm run format:check`；
- lint 与 typecheck；
- 页面和 repository focused tests；
- `activity-read` 全部 Node tests；
- `npm run test:cloud`；
- `npm run verify:cloud-packages`；
- `npm test` 与仓库 `npm run validate`；
- `git diff --check`；
- release notes 门禁。

## 文档与发布记录

实施时同步：

- `docs/requirements-design.md`：公开列表包含未来与历史视图；
- `docs/cloudbase-schema.md`：新分页协议、公开 finished 历史读取和索引；
- `README.md`：用户可见能力与索引数量；
- 当前版本 release notes：筛选、兼容性、验证和部署证据。

文档不得在真实部署前声称功能已上线。缺少真实测试环境证据时统一标记 `PENDING (missing evidence)`。

## 实施与上线顺序

1. 设计文档审核通过后，从届时最新 `origin/main` 新建独立 worktree；每轮开始最多 fetch 一次。
2. 按云函数、repository、页面和索引顺序取得确定性 RED，生产代码保持不变。
3. 完成最小 GREEN，先跑 focused tests，再跑完整门禁。
4. 对冻结 diff 做独立 P0–P2 复核；PR #45 不进入本分支。
5. 提交并创建 Draft PR，等待不可变 SHA 的原始 CI 成功。
6. 由 Aime 仅向测试环境部署 `activity-read` 与微信开发版，执行真实页面 smoke：默认 future、进行中、history、20+ 加载更多、切换竞态、空态和错误重试。
7. 回读部署版本、云函数更新时间、planner requestId 和 smoke 证据；证据不足保持 PENDING，不转 Ready、不合并、不发布生产。

## 验收标准

- 用户打开首页只看到未来及正在进行活动，且可切换浏览完整历史。
- 边界、排序和分页由服务端统一决定，静态数据集下无重无漏。
- 旧调用方行为不变，新旧协议不会因返回形状混用而崩溃。
- 任意迟到请求都不能污染当前视图或清除更新的错误状态。
- 自动化、真实 planner、测试环境部署和页面 smoke 都有不可变证据。
