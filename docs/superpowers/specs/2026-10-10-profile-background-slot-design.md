# 个人单背景槽位与历史媒体兼容设计

## 目标

个人中心和资料编辑页只允许设置、替换和预览一张当前背景图，同时保证存量 `photos` 多图资料不会因打开页面、普通保存或替换背景而被静默截断、降级或清理。管理员审核继续最多查看三张可信个人媒体。

## 已确认问题

- `profiles.photos` 同时承担个人背景和管理员审核媒体两个语义。
- 客户端加载时只保留 `photos[0]`，普通保存会把其余存量引用从服务端文档删除。
- 服务端把被删除引用对应的 active media 降级为 `unreferenced`，清理任务随后可能物理删除对象。
- 个人名片已只展示一张背景，但 schema、客户端模型和管理员审核仍按多图数组工作。

## 方案选择

采用显式可空单槽位 `background_photo`，保留 `photos` 作为只读的存量审核媒体。

不采用以下方案：

- 继续以 `photos[0]` 代表背景：无法区分“无背景”和“存量首图”，也无法安全替换或移除。
- 批量迁移到新集合：需要额外迁移作业、回滚和跨函数切换，超出本问题的最小安全范围。

## 数据模型

`profiles` 新增：

```text
background_photo: null | { file_id, category: ride|bike|other }
photos: [{ file_id, category: ride|bike|other }] # 只读存量审核媒体，不再由新客户端追加或截断
```

背景解析规则：

1. 文档存在 `background_photo` 字段时，以该字段为唯一事实源；`null` 表示明确无背景。
2. 文档缺少该字段时，兼容读取 `photos` 中第一条格式合法的媒体。
3. 新客户端只提交 `background_photo`，不回传 `photos`。
4. 旧客户端提交零或一条 `photos` 时，服务端将其翻译为 `background_photo` 更新，不改写存量 `photos`。
5. 同时提交 `background_photo` 和 `photos`，或提交多项 `photos`，服务端拒绝。

该规则无需一次性批量迁移。存量账号首次保存或替换背景时会写入显式槽位，历史数组保持原样。

## 服务端行为

`profile` 云函数：

- 响应增加 `background_photo`，并保留 `photos` 兼容字段。
- `buildUpdate` 只生成槽位更新；旧 `photos` 输入也转换成槽位更新。
- 槽位媒体必须通过现有 owner、registry、category、status 和 canonical 校验。
- 引用集合包含头像、显式背景和全部历史 `photos`。
- 替换背景时，仅当旧背景不再被头像或历史 `photos` 引用，才降级为 `unreferenced`。

个人名片：

- 只解析有效背景槽位。
- 对缺少槽位的旧文档回退到首张有效历史媒体。
- 永远最多返回一张背景。

管理员审核：

- 候选顺序为当前背景、历史骑行媒体、其他历史媒体、头像。
- 按 source file ID 去重后最多返回三张。
- 所有候选仍必须通过 canonical registry 校验。

媒体清理：

- `profile-media-cleanup` 在 claim 前同时检查头像、背景槽位和历史 `photos`。
- 任何仍被上述字段引用的媒体恢复或保持 `active`，不得删除。

## 客户端行为

`Profile` 增加 `backgroundPhoto?: Photo | null`。仓储层严格映射服务端槽位；字段缺失时保留 `undefined`，由页面执行 legacy fallback。

资料编辑页：

- 保留完整 `photos`，不再通过 `normalizeBackgroundProfile` 截断。
- 使用独立 `backgroundPhoto` 状态渲染、预览和替换。
- 保存只提交 `backgroundPhoto`。
- 新上传登记失败继续执行现有 orphan 补偿；替换成功前不触碰旧背景引用。

个人中心继续消费个人名片的单元素 `backgrounds`，无需引入多背景 UI。

## 错误与兼容

- 两张及以上旧协议输入返回 `VALIDATION_FAILED`。
- 非 owner、registry 缺失、category 不一致或状态非法继续 fail closed。
- 存量 legacy 媒体未 canonicalize 时可保留引用，但不进入个人或管理员能力卡。
- 读取旧文档不产生写入；普通保存不会删除历史媒体。

## 测试与验收

TDD 必须覆盖：

- 存量三图加载、普通保存、背景替换后 `photos` 原样保留。
- 显式 `background_photo: null` 不回退历史首图。
- 旧单图协议转换为槽位，多图协议拒绝。
- 背景替换只降级真正失去全部引用的媒体。
- 个人名片最多一张，管理员审核最多三张且当前背景优先。
- cleanup 对背景槽位引用 fail closed。
- 客户端仓储映射、编辑页保存 payload、预览和本地替换。

交付需要通过 focused tests、`npm run validate`、main CI、微信开发版上传，以及 `profile`、`profile-media-cleanup`、`admin-review` 的 Active 回读和线上代码比对。真实账号需验证存量多图保存前后引用不变、替换背景后个人中心预览正确；证据未齐前保持 `PENDING_EVIDENCE`。
