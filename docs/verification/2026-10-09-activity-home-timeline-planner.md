# 活动首页时间线 Planner 验证

## 结论

`PENDING (production BSON Date probe passed; independent review pending)`。

候选索引能为四条首屏查询提供 `LIMIT -> FETCH -> IXSCAN`，但首轮复合 `$or` keyset 的
`ongoing-cursor` 查询出现阻塞 `SORT`。按修订设计拆成 `same-time` / `cross-time` 后，第二轮
`ongoing-cursor-same-time` 仍出现阻塞 `SORT`。第三轮移除 same-time 的常量时间排序字段后，
12/12 explain 已通过；但 smoke 首次执行被 QUERY 多文档响应的测试设施解析错误阻断。修复
parser 与查询形态漂移后，第四轮完整 probe 再次取得 12/12 explain，并完成 future/history
各 50 条的真实 smoke、全部 QUERY requestId 与精确清理。后续独立代码审查发现第四轮 fixture
通过 JSON 写入 ISO 字符串，不能代表生产 BSON Date；同时服务端排序与 Date 合同存在缺陷，
因此旧 requestId 仅保留为历史证据。修复 BSON Date 查询、UTF-8 binary `_id` 排序以及严格
EJSON 回读后，第五轮已在精确 HEAD 上取得完整真实 PASS；在本轮证据完成独立复核前，结论仍
保持 PENDING，且不得部署或启动 Task 4。

## 固定范围

- 实施基线：`729937d5b8e90bc5e428faf2564126278cf7d002`。
- 设计基线：`0f3c727a81cbd1a78e0d47facc9c3feef8fdd34a`。
- cursor 拆流修订：来源 `92af761d582585b8fa755dc648fa8f8525b68e6e`，实施 worktree
  cherry-pick `42303fd90f11c1e0631c0932e8fc4c2d9426fec9`；两者 stable patch-id 均为
  `f2078c7944c910d3d61b17ebbc1b400970f164a2`。
- same-time 排序修订：设计来源 `aba02f28bfb450041f24e4f6e612d3cd22317945` 映射到
  `c917dcfb5fca58b04925d4189a971f67ff965a85`；计划来源
  `4756dff8b908e8341f37570969bcc7ce8a774d4c` 映射到
  `28804aae345b28fa74e25f7cb22f0f2ff2c9f85c`。
- production BSON Date 复跑 HEAD：`30f6023d9d8156c164508e2f7a7b4425385d4e4e`；probe
  SHA-256 `475a7aff7efdc5bdcf533cdf46d01aac5ff2f0c2ff96df6de3304d2817d018fa`，测试
  SHA-256 `d994448b269d1ba01b953b4d9416a2c065b7067df085c7ae359215168d146a1e`，生产
  `list-page.js` SHA-256 `a51661c8de8755e9032b658391d3767421b620b8eeb0ff902f3a9dafa66f930d`。
- 测试环境：`cloudbase-d0gizacy77a1ab017`。
- 唯一临时集合：`tmp_activity_home_timeline_f8d1d2e2`。
- fixture：108 条，包含进行中、未开始、自然结束 published、提前 finished、同时间戳、
  `is_deleted=false`、缺失 `is_deleted`、`is_deleted=true`、draft、非法 status 和非法时间。
- 业务集合 `activities` 在本地保护层直接拒绝；probe 未读写业务集合。

## 本地安全门禁

命令：

```bash
npm run test:bootstrap
```

结果：54/54 PASS，其中 probe 30/30；activity-read 44/44、cloud package verifier、Prettier 与
`git diff --check` 同时 PASS。覆盖唯一临时集合白名单、精确 108 条 strict canonical EJSON
fixture、BSON Date 类型回读、四条首屏加八个 cursor 物理段共 12 条 explain、cursor 禁止
`$or`、CloudBase CLI 单元素数组解包、QUERY 多文档与空数组解包、malformed entry 拒绝、全部
远端证据 requestId fail closed、COMMAND exactly-one、缺失指标显式 null、失败 finally drop、
清理回读和既有 bootstrap 回归。strict EJSON 回读还覆盖真实日历、relaxed absolute UTC
1970–9999 范围、canonical 负毫秒和时区跨界；plan mode 输出 `fixtureCount=108`、
`explainCount=12`。当前 probe hash 为
`475a7aff7efdc5bdcf533cdf46d01aac5ff2f0c2ff96df6de3304d2817d018fa`。smoke 的 fake runner
会解析真实 CLI `--command` envelope，并以独立期望校验 filter、sort 与 limit；explain 与
smoke 共用唯一 `streamSort`，防止查询形态再次漂移。

## 真实环境证据

### 首轮：复合 `$or` cursor

#### 资源创建

| 动作 | requestId |
| --- | --- |
| create collection | `ecda4782-8947-46b9-8551-6224b4c5e0f9` |
| create `legacy_status_event_start` | `5d5c78d0-2aae-4b52-a8a5-72b9440fd830` |
| create `public_event_start` | `164ddca7-d379-48b3-9757-8e859d9c4580` |
| create `public_event_end` | `e00b381a-fcf5-464a-a0d6-8088466b90a9` |
| insert 108 fixtures | `29a04da0-e3ea-4db0-aaa5-1265baaad044` |

#### Explain

| 查询 | requestId | 结果 | winning path / index |
| --- | --- | --- | --- |
| ongoing 首屏 | `5b272354-d4a8-4af9-bb90-0ebb0c9b9333` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_start` |
| scheduled 首屏 | `af611e15-db78-45ee-b990-e4192d64dde0` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_start` |
| finished 首屏 | `f0660131-b004-4d44-ac53-35936915cea9` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_end` |
| past-published 首屏 | `ab112c36-a267-4524-8a34-74f1b623ad16` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_end` |
| ongoing cursor | `ba265d36-5df8-460c-a56d-26a6d538efe9` | **FAIL** | 出现阻塞 `SORT` |

失败发生后立即停止其余 cursor explain 和 20+20+N smoke；没有用内存结果或首屏 PASS
替代 cursor planner 证据。

#### 精确清理

| 动作 | requestId | 结果 |
| --- | --- | --- |
| drop 临时集合 | `35c264c7-8bb1-4418-b422-c819cd18867c` | 成功 |
| list collections 回读 | `a559ccc6-aaa8-4b98-b588-4ad316057fd3` | 同名集合 0 个 |

另一次独立只读回查 requestId `b0c01e08-43bf-4429-9bc4-7243928450d3` 同样确认同名集合为
0。业务 `activities` 未被触碰。

### 第二轮：`same-time` / `cross-time` 拆流

#### 资源创建

| 动作 | requestId |
| --- | --- |
| create collection | `0bffb00a-9cd7-43c9-87fd-111969d5f677` |
| create `legacy_status_event_start` | `79b6dffd-b9b2-490d-a875-b275f80aaefb` |
| create `public_event_start` | `7be88b1a-3af9-4f64-b97f-5898c3285a81` |
| create `public_event_end` | `645404de-c3cf-469c-9fe7-6b4946a95159` |
| insert 108 fixtures | `e3cada1e-44cc-40cd-93c0-cfe84af9df60` |

#### Explain

| 查询 | requestId | 结果 | winning path / index |
| --- | --- | --- | --- |
| ongoing 首屏 | `25c90b6f-cfc7-40c9-8620-e03a7260dc70` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_start` |
| scheduled 首屏 | `4451d2aa-e7da-4bd1-a6f3-38911c4a4e3b` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_start` |
| finished 首屏 | `12b1168a-d1a9-416f-b953-4782a8ab6e74` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_end` |
| past-published 首屏 | `87eff97c-a2c1-48ea-bdc2-f8d654a10616` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_end` |
| ongoing cursor same-time | `081d9fc2-8685-446c-957a-df9071be3fc1` | **FAIL** | 出现阻塞 `SORT` |
| ongoing cursor cross-time | 未执行 | PENDING | 前一条失败后 fail closed |
| scheduled cursor same-time / cross-time | 未执行 | PENDING | 前一条失败后 fail closed |
| finished cursor same-time / cross-time | 未执行 | PENDING | 前一条失败后 fail closed |
| past-published cursor same-time / cross-time | 未执行 | PENDING | 前一条失败后 fail closed |

第二轮第 5 条 explain 失败后立即停止，未运行同一 108 fixture 的 20+20+N smoke。因此不存在
可报告的页数、ID 唯一性、全局排序或 legacy/deleted smoke 通过证据。

#### 精确清理

| 动作 | requestId | 结果 |
| --- | --- | --- |
| drop 临时集合 | `5aed7a45-de39-47db-a1c3-b84ce85e98b4` | 成功 |
| list collections 回读 | `e6970d3c-77f-40c2-9bf7-9fa21dc143b2` | 同名集合 0 个 |

### 第三轮：same-time 仅按 `_id` 排序

#### 资源创建

| 动作 | requestId |
| --- | --- |
| create collection | `21def445-7355-490f-8152-6a29290e404d` |
| create `legacy_status_event_start` | `54922282-5fd5-44f8-aa7b-bc2831a32df0` |
| create `public_event_start` | `2175515d-db78-41cf-bfbc-b220be9582df` |
| create `public_event_end` | `59342545-880c-415f-805a-b3d4d471161b` |
| insert 108 fixtures | `9eb66d59-5d71-496e-8cc2-e172c9c6bbfe` |

#### Explain

CloudBase 返回的 explain payload 未暴露可用的 `nReturned`、`totalKeysExamined` 或
`totalDocsExamined` 数值，因此这些指标显式记录为 null，不写成 0。

| 查询 | requestId | 结果 | winning path / index |
| --- | --- | --- | --- |
| ongoing 首屏 | `9acb8069-1f5a-4a0f-84b8-effed2b72ff1` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_start` |
| scheduled 首屏 | `79c12e4d-dc1b-4cb3-bc99-5d4ce9f2eca2` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_start` |
| finished 首屏 | `941d0333-c522-403e-8e49-9b3aa66519af` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_end` |
| past-published 首屏 | `4efb6d5a-96c0-4dc2-83da-1c388ec7aaf9` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_end` |
| ongoing cursor same-time | `e23f36c2-1d46-4365-a7c1-e2451fbe5598` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_start` |
| ongoing cursor cross-time | `0afb324e-5e60-417e-ab45-bd28ce46e9de` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_start` |
| scheduled cursor same-time | `2d28fd28-d096-4c57-bd73-babc60ce6d32` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_start` |
| scheduled cursor cross-time | `00d14414-4121-496e-b798-fe955e4b6600` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_start` |
| finished cursor same-time | `e92a3577-1abe-416f-919b-937f693570bf` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_end` |
| finished cursor cross-time | `38d150ba-a4c4-42be-aa5d-a56af4a522e3` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_end` |
| past-published cursor same-time | `679953a1-50b9-4431-8e9c-1c4d19e5a35c` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_end` |
| past-published cursor cross-time | `903e5b41-be8c-4c5b-af04-6f0f373c953c` | PASS | `LIMIT -> FETCH -> IXSCAN` / `public_event_end` |

#### Smoke 设施阻断

12/12 explain 通过后进入 smoke，但首个 `smoke-ongoing-1` 因 QUERY 实际返回有序多文档数组，
旧 parser 错用 COMMAND 的 exactly-one helper，报“未返回唯一 Mongo 结果”。该项是测试设施错误，
不计 smoke RED 或 PASS。随后已通过 TDD 将 QUERY 与 COMMAND 解包分路；尚未重跑真实环境。

#### 精确清理

| 动作 | requestId | 结果 |
| --- | --- | --- |
| drop 临时集合 | `21921561-38f4-48c4-9817-14b49686262d` | 成功 |
| list collections 回读 | `ad0e3cc4-ae19-4e30-aa7f-e37f3083815e` | 同名集合 0 个 |

### 第四轮：完整 explain + smoke PASS

#### 资源创建

| 动作 | requestId |
| --- | --- |
| create collection | `36b8bade-3a55-4445-8bd7-912a85e2366f` |
| create `legacy_status_event_start` | `09e9e5d1-94d7-4aaa-adcc-a52fdc301fd5` |
| create `public_event_start` | `2d86b8a9-b54f-4b88-bb41-66a68b2dd9d5` |
| create `public_event_end` | `2ac884ad-612b-4cec-8a7d-1cfdaedb6428` |
| insert 108 fixtures | `7d416997-3eea-4005-a726-e00710fb5a73` |

#### Explain

12 条查询均无阻塞 `SORT`，winning path 均为 `LIMIT -> FETCH -> IXSCAN`，并命中预期索引。
CloudBase payload 仍未暴露 `nReturned`、`totalKeysExamined`、`totalDocsExamined` 数值，三项均
显式记录为 null。

| 查询 | requestId | index |
| --- | --- | --- |
| ongoing 首屏 | `c98ec94a-049e-430f-9b23-67815c067b56` | `public_event_start` |
| scheduled 首屏 | `94443715-484a-4511-8d36-26495f2a30b3` | `public_event_start` |
| finished 首屏 | `093803d2-4a51-482b-a0a0-73fbdf951585` | `public_event_end` |
| past-published 首屏 | `b29355cc-d18a-453b-9a62-a452bd038e21` | `public_event_end` |
| ongoing cursor same-time | `bf9bb714-4e12-4938-832a-1b6e052379e7` | `public_event_start` |
| ongoing cursor cross-time | `644576c1-fd75-4133-a753-6f07a1b6e861` | `public_event_start` |
| scheduled cursor same-time | `e7299cc6-c803-4891-b535-c729c0fc5d31` | `public_event_start` |
| scheduled cursor cross-time | `d14d8d2f-430f-490e-bc27-ee00632481c0` | `public_event_start` |
| finished cursor same-time | `cff1732b-93f2-4f20-81f5-328d57bf1a9e` | `public_event_end` |
| finished cursor cross-time | `6794788e-ec6b-4e67-8196-922026cdf9b9` | `public_event_end` |
| past-published cursor same-time | `29f3f699-a58b-4d52-bb98-4a5dec34c661` | `public_event_end` |
| past-published cursor cross-time | `ded2bbdb-d995-4f43-9818-fa59c1a2c7dd` | `public_event_end` |

#### Smoke QUERY

| 逻辑流 / 物理段 | requestId |
| --- | --- |
| ongoing 首屏 | `437345b1-f915-4cd6-8425-33e299e3f7bb` |
| ongoing same-time | `51c5755a-879c-4e60-be68-4a1cfd0727f9` |
| ongoing cross-time | `55020f7d-6d9c-4cc8-bd67-2c74a845df3a` |
| scheduled 首屏 | `0f0eb15b-9b9b-4656-a98b-5e1f46aa35af` |
| scheduled same-time | `a5cb6afc-9e1f-4916-8582-ae12a3a4400c` |
| scheduled cross-time | `6182f25c-68ec-4940-bcb5-08aecaf56aa8` |
| finished 首屏 | `a70c2a0b-e92f-4f1c-833e-849b6a55afd4` |
| finished same-time | `282f3ff6-56da-4f48-9827-1a3386b413bf` |
| finished cross-time | `69442468-a7d1-4e84-ba07-b072cce24f0a` |
| past-published 首屏 | `78074279-9fea-4090-b37c-9f09cbe43653` |
| past-published same-time | `e1509eb6-aee4-48e6-a4f8-66e02da90fee` |
| past-published cross-time | `bb68f32f-30e2-4062-a14d-d91e38d3e5af` |

- future：50 条，分页 `[20, 20, 10]`，50 个唯一 ID，按 `event_start ASC, _id ASC`
  全局有序。
- history：50 条，分页 `[20, 20, 10]`，50 个唯一 ID，按 `event_end DESC, _id DESC`
  全局有序。
- 四条缺失 `is_deleted` 的 legacy 记录 `ongoing-000`、`scheduled-000`、`finished-000`、
  `past-published-000` 均在结果中。
- 结果 ID 仅包含 `ongoing-*`、`scheduled-*`、`finished-*`、`past-published-*`；
  `deleted-*`、draft、archived、invalid/reversed/missing-time 均未出现。

#### 精确清理

| 动作 | requestId | 结果 |
| --- | --- | --- |
| drop 临时集合 | `394649dc-fd9c-46db-abdf-5ead89ebaa2d` | 成功 |
| list collections 回读 | `08a57d8e-a101-4d6a-acc4-720ad6c34ce8` | 同名集合 0 个 |

独立复核另以只读 `ListTables` 再次确认同名集合为 0，requestId
`e2fdeed5-2cc2-470c-b406-9e767b47020b`。

### 第五轮：production BSON Date 合同完整重跑（等待独立复核）

本轮只在 HEAD `30f6023d9d8156c164508e2f7a7b4425385d4e4e` 上执行。108 条 fixture 以
strict canonical EJSON `{"$date":{"$numberLong":"<epoch-ms>"}}` 写入；insert 后、首条
explain 前先回读 `finished-000`、`ongoing-000`、`past-published-000`、`scheduled-000`，并
确认 `event_start` / `event_end` 为 BSON Date。第四轮 ISO string requestId 仅保留为历史，
不参与本轮结论。

#### 资源创建与类型回读

| 动作 | requestId |
| --- | --- |
| create collection | `440e6d69-6a60-4db0-9188-97b9cdf867fe` |
| create `legacy_status_event_start` | `8e679732-85ad-4da7-abc7-b40c451c59a6` |
| create `public_event_start` | `1ffb9fce-2c86-4cc3-847a-ce1af5d05785` |
| create `public_event_end` | `a43ee202-5694-427b-bd9b-20903d85c187` |
| insert 108 BSON Date fixtures | `65631a14-91bd-4459-b05c-ff90bb543df8` |
| BSON Date `$type:'date'` 回读 | `708303ce-0075-4637-b3d0-bc1aeacb79e1` |

#### Explain

12 条查询均无阻塞 `SORT`，winning path 均为 `LIMIT -> FETCH -> IXSCAN`，并命中预期索引。
CloudBase payload 仍未暴露 `nReturned`、`totalKeysExamined`、`totalDocsExamined` 数值，三项均
显式记录为 null。

| 查询 | requestId | index |
| --- | --- | --- |
| ongoing 首屏 | `005e0515-2a16-4d6e-a5ba-4181ba98410e` | `public_event_start` |
| scheduled 首屏 | `18c99a7b-38de-4329-a74c-7875f83e3c59` | `public_event_start` |
| finished 首屏 | `7c44abd9-670b-48be-bf7d-2b471c6b888d` | `public_event_end` |
| past-published 首屏 | `188e863b-c0c1-49f8-a83f-ceac08d2078a` | `public_event_end` |
| ongoing cursor same-time | `6e3966d0-5e3c-4995-a6cc-429764d6b9a2` | `public_event_start` |
| ongoing cursor cross-time | `39ba8a35-6aab-48e5-9143-616aa22337da` | `public_event_start` |
| scheduled cursor same-time | `1baf2834-77cd-4362-8df4-119490010306` | `public_event_start` |
| scheduled cursor cross-time | `fb70751e-57e3-4869-8193-1a885f58ecf0` | `public_event_start` |
| finished cursor same-time | `46a6fc4a-6b3c-4c6d-910e-371fd6feaf02` | `public_event_end` |
| finished cursor cross-time | `ab2336ea-042c-4c08-a713-d3e03367f1d9` | `public_event_end` |
| past-published cursor same-time | `7de7da64-01d0-45f8-beb7-50c7be5f5c2f` | `public_event_end` |
| past-published cursor cross-time | `92e75b45-db65-4376-8d95-ce7ac125c6c0` | `public_event_end` |

#### Smoke QUERY

| 逻辑流 / 物理段 | requestId |
| --- | --- |
| ongoing 首屏 | `abab273a-f816-4e80-b15e-99553327bd0e` |
| ongoing same-time | `ced71a0b-ba4b-4db0-bae0-a7498a42bac4` |
| ongoing cross-time | `d6afa151-4076-4d92-a07a-3d62db84c775` |
| scheduled 首屏 | `1bdca2a4-642a-4087-9ce4-57c27272b375` |
| scheduled same-time | `1f9ae4a6-85de-4c65-8bce-7add9e3aa6e8` |
| scheduled cross-time | `f493f0eb-410c-4280-b49a-0d4e5541c8ef` |
| finished 首屏 | `598b60c4-849d-44d3-b76f-cd581eb60d2c` |
| finished same-time | `3b1fd067-8751-4ce2-bf67-deedb4bdacfb` |
| finished cross-time | `163db9ea-422d-4d5f-bace-c99ba7966b3b` |
| past-published 首屏 | `ce096446-6e94-4fb9-8fac-3bc7aed401a9` |
| past-published same-time | `0a60444f-facd-4c88-9a32-fc1c0e01465d` |
| past-published cross-time | `76f23d10-eaa8-4608-8fd4-ddbee2cf56a8` |

- future：50 条，分页 `[20, 20, 10]`，50 个唯一 ID，按 `event_start ASC, _id ASC`
  全局有序。
- history：50 条，分页 `[20, 20, 10]`，50 个唯一 ID，按 `event_end DESC, _id DESC`
  全局有序。
- 四条缺失 `is_deleted` 的 legacy 记录 `ongoing-000`、`scheduled-000`、`finished-000`、
  `past-published-000` 均在结果中。
- 结果 ID 仅包含 `ongoing-*`、`scheduled-*`、`finished-*`、`past-published-*`；
  `deleted-*`、draft、archived、invalid/reversed/missing-time 均未出现。
- create、3 个 index、insert、类型回读、12 条 explain、12 条 smoke QUERY、drop 与两次清理
  回读的 requestId 均为非空字符串。

#### 精确清理

| 动作 | requestId | 结果 |
| --- | --- | --- |
| drop 临时集合 | `f6d78faf-a187-4fdc-91ef-2e0478506593` | 成功 |
| probe 内 ListTables 回读 | `b7e97009-3dd9-4188-b066-d01fc3094862` | 同名集合 0 个 |
| probe 后独立只读 ListTables 回查 | `f5519da0-3840-4b7f-854b-e29abc5db6ff` | 同名集合 0 个 |

## 历史修订说明

首轮 cursor 曾使用一个 `$or` 表达复合边界：

```text
time > boundary.time
OR (time == boundary.time AND _id > boundary.id)
```

真实 planner 已证明该形态会引入阻塞 `SORT`。修订设计已把每个逻辑流的 cursor 查询拆成
两个可单独命中索引的物理段并在服务端归并：

1. 严格跨时间段：升序使用 `time > boundary.time`，降序使用 `time < boundary.time`；
2. 同时间段：`time == boundary.time`，再按同方向约束 `_id`。

第二轮真实 planner 证明冗余的时间排序字段会让 `same-time` 出现阻塞 `SORT`。第三轮将
same-time sort 收敛为仅 `_id` 后，12 条 explain 首次全部取得真实 PASS；修复 QUERY parser
并让 explain/smoke 共用 `streamSort` 后，第四轮再次取得 12/12 explain，并完成同一 108
fixture 的 20+20+10 smoke、ID 唯一性、全局排序、legacy 可见、deleted/非法记录排除与精确
清理；该轮曾通过独立复核，但 ISO string fixture 后来被证明不能代表生产类型。第五轮改用
真实 BSON Date 写入及类型回读后再次取得同等完整 PASS，目前等待本轮不可变证据的独立复核；
复核前不部署、不启动 Task 4。
