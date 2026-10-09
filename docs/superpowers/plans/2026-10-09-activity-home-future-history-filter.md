# 活动首页未来 / 历史筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 活动首页默认展示未来及正在进行活动，并通过服务端时间线分页完整浏览历史活动。

**Architecture:** 保留旧 `activity-read/list` 裸数组协议，新增独立 `listPage` envelope；服务端以固定 `as_of` 将未来拆为进行中/未开始两流、历史拆为 finished/自然结束 published 两流，并以 opaque cursor 做 keyset 分页。客户端新增专用 repository 方法和两份隔离视图状态，以 revision fence 收敛切换、刷新和 loadMore 竞态。

**Tech Stack:** Node.js 20 CloudBase 云函数、CloudBase Mongo 4.2、原生微信小程序 TypeScript/WXML/WXSS、Node test runner、Vitest、Prettier、ESLint、CloudBase CLI 3.8.4。

---

## 固定基线与停止条件

- 唯一设计基线：`0f3c727a81cbd1a78e0d47facc9c3feef8fdd34a`。
- 实施开始时只 fetch 一次，从当时最新 `origin/main` 创建新 worktree，再 cherry-pick 设计和计划提交；不得复用 prunable 的 a81e472c worktree。
- PR #45 只读参考，不 merge、cherry-pick 或复制其混合 diff。
- 真实 CloudBase planner 证据当前为 `PENDING (missing planner evidence)`。Task 2 未通过时立即停止，不得执行 Task 3 及后续生产 GREEN。
- 实施、PR、测试环境部署与生产发布是不同门禁；缺少真实证据不得互相替代。

## File Structure

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `cloudfunctions/activity-read/list-page.js` | request/cursor 校验、四流查询、keyset、归并与 read budget |
| Create | `cloudfunctions/activity-read/list-page.node-test.js` | 时间边界、分页、非法数据、cursor、read 上限 RED/GREEN |
| Modify | `cloudfunctions/activity-read/index.js` | 接入 `listPage`，保留旧 `list` 原语义 |
| Modify | `cloudfunctions/activity-read/package.json` | 将新 Node 测试加入函数测试命令 |
| Modify | `scripts/verify-cloud-packages.mjs` | 要求部署包包含 `list-page.js` |
| Create | `scripts/activity-home-timeline-planner-probe.mjs` | 建立/解释/清理唯一临时集合并输出结构化证据 |
| Create | `scripts/activity-home-timeline-planner-probe.node-test.mjs` | probe 目标保护、108 条 fixture 与 12 条命令形态测试 |
| Modify | `package.json` | 把 planner probe 单测纳入 `test:bootstrap` / `validate` |
| Create | `docs/verification/2026-10-09-activity-home-timeline-planner.md` | 真实 explain、108 条 fixture、requestId 与清理证据 |
| Modify | `scripts/bootstrap-cloudbase.mjs` | 新增 future/history 复合索引 |
| Modify | `scripts/bootstrap-cloudbase.node-test.mjs` | 索引 plan/verify/conflict 测试 |
| Modify | `miniprogram/repositories/types.ts` | `PublicActivityView/Page` 与新 repository 方法 |
| Modify | `miniprogram/repositories/cloud.ts` | 严格映射 `listPage` envelope |
| Modify | `miniprogram/repositories/mock.ts` | 与云端相同的确定性视图/分页行为 |
| Modify | `tests/cloud-repository.test.ts` | request、mapping、非法 envelope 与旧方法兼容 |
| Create | `miniprogram/pages/activities/timeline-state.ts` | 两视图缓存、revision 失效、去重和单飞状态 |
| Create | `tests/activity-home-timeline.test.ts` | 首页筛选、分页和确定性竞态 |
| Modify | `miniprogram/pages/activities/index.ts` | 默认 future、切换、刷新、loadMore 与生命周期 |
| Modify | `miniprogram/pages/activities/index.wxml` | 双选控件、动态文案、加载更多与空态 |
| Modify | `miniprogram/pages/activities/index.wxss` | 双选和 loadMore 的主题/窄屏/触控样式 |
| Modify | `tests/tab-page-refresh.test.ts` | 活动页改用新分页 repository mock |
| Modify | `tests/theme-accessibility-regressions.test.ts` | 双选控件触控尺寸、主题和窄屏契约 |
| Modify | `docs/requirements-design.md` | 骑手未来/历史公开列表产品契约 |
| Modify | `docs/cloudbase-schema.md` | `listPage`、finished 历史读取、cursor 与索引 |
| Modify | `README.md` | 已实现能力与索引数量 |
| Modify | `miniprogram/pages/settings/index.ts` | `2026.10.09.3` 功能升级日志 |

---

### Task 0: 建立最新、隔离的实施 worktree

**Files:** none

- [ ] **Step 1: 只执行一次 fetch 并记录最新 main**

```bash
git fetch origin --prune
IMPLEMENTATION_BASE=$(git rev-parse origin/main)
printf '%s\n' "$IMPLEMENTATION_BASE"
git status --short --branch
```

Expected: 主工作区无文件变化；保存输出 SHA 为 `IMPLEMENTATION_BASE`。本轮后续不得再次 fetch。

- [ ] **Step 2: 从最新 main 创建新分支和 worktree**

```bash
git worktree add -b worktree-feat-activity-home-timeline-f8d1d2e2 \
  /private/tmp/ride-event-home-timeline-f8d1d2e2 origin/main
```

Expected: 新 worktree clean，HEAD 等于 `IMPLEMENTATION_BASE`。

- [ ] **Step 3: 带入设计与计划提交**

```bash
git cherry-pick 729937d5b8e90bc5e428faf2564126278cf7d002..docs/activity-home-timeline-20261009
git log --oneline origin/main..HEAD
```

Expected: 该 range 只有本功能 design/plan 文档提交；若 main 已包含等价提交，使用 `git cherry-pick --skip` 并以 `git range-diff` 证明等价，不重复提交。

---

### Task 1: 先取得完整服务端 RED

**Files:**
- Create: `cloudfunctions/activity-read/list-page.node-test.js`
- Modify: `cloudfunctions/activity-read/package.json`

- [ ] **Step 1: 写 request/cursor 和四流失败测试**

测试先引用尚不存在的模块：

```js
const {
  decodeListCursor,
  encodeListCursor,
  listActivityPage,
  parseListPageRequest,
} = require('./list-page');
```

至少创建以下确定性用例：

```js
test('future 先读取进行中流再以未开始流补页，正在进行归 future', async () => {});
test('history 全局归并 finished 与自然结束 published', async () => {});
test('event_end 等于 as_of 只进入 history', async () => {});
test('同时间戳按 _id 稳定 keyset，41 条按 20+20+1 无漏无重', async () => {});
test('deleted、draft、未知状态、缺失或非法时间不占窗口', async () => {});
test('首屏每个 view<=2 reads，cursor 页拆同时间/跨时间两段且<=4 reads', async () => {});
test('四流 cursor 都不生成复合 $or，先同时间段再跨时间段', async () => {});
test('非法数据连续五批仍无法收敛时返回 DATA_INTEGRITY_ERROR 且不返回部分页', async () => {});
```

fixture query recorder 必须记录每次 `where/orderBy/limit/get`，并真实执行条件、排序和 keyset，不能只按预置调用次序返回数组。

- [ ] **Step 2: 写严格 cursor 失败测试**

用表驱动覆盖：非 base64url、非法 JSON、513 字符、缺失/错误 `v`、额外字段、非法 view/as_of/boundary、空 ID、future cursor 用于 history。每项断言：

```js
assert.equal(result.ok, false);
assert.equal(result.error.code, 'VALIDATION_FAILED');
assert.equal(activityReads, 0);
```

- [ ] **Step 3: 锁住旧 list 兼容**

在 `index.node-test.js` 保留并强化现有测试：`{action:'list'}` 仍返回裸数组、仍只用旧 published 查询和既有 limit/排序，不能返回 envelope 或 timeline 过滤结果。

- [ ] **Step 4: 运行 RED**

```bash
node --test cloudfunctions/activity-read/list-page.node-test.js \
  cloudfunctions/activity-read/index.node-test.js
```

Expected: exit 1；新测试因 `Cannot find module './list-page'` 失败，旧 `index.node-test.js` 全部 PASS。若测试设施自身报错，先修夹具再重新取得有效 RED。

- [ ] **Step 5: 提交 RED**

```bash
git add cloudfunctions/activity-read/list-page.node-test.js \
  cloudfunctions/activity-read/index.node-test.js \
  cloudfunctions/activity-read/package.json
git commit -m "test(activity): define public timeline pagination"
```

---

### Task 2: 在生产 GREEN 前取得真实 planner 证据

**Files:**
- Create: `scripts/activity-home-timeline-planner-probe.mjs`
- Create: `scripts/activity-home-timeline-planner-probe.node-test.mjs`
- Create: `docs/verification/2026-10-09-activity-home-timeline-planner.md`
- Modify: `package.json`

- [ ] **Step 1: 先写 probe 安全边界 RED**

测试导出的 `assertTemporaryCollection`、`buildFixtures` 和 `buildExplainCommands`：

```js
assert.throws(() => assertTemporaryCollection('activities'), /只允许临时集合/);
assert.doesNotThrow(() =>
  assertTemporaryCollection('tmp_activity_home_timeline_f8d1d2e2'),
);
assert.equal(buildFixtures(PROBE_AS_OF).length, 108);
assert.deepEqual(
  buildExplainCommands('tmp_activity_home_timeline_f8d1d2e2', PROBE_AS_OF)
    .map((item) => item.name),
  ['ongoing', 'scheduled', 'finished', 'past-published',
   'ongoing-cursor-same-time', 'ongoing-cursor-cross-time',
   'scheduled-cursor-same-time', 'scheduled-cursor-cross-time',
   'finished-cursor-same-time', 'finished-cursor-cross-time',
   'past-published-cursor-same-time', 'past-published-cursor-cross-time'],
);
```

再断言 runner 总在 `finally` 发送精确 drop，并在 drop 后 list collections 验证同名数量为 0。

- [ ] **Step 2: 运行 probe RED**

```bash
node --test scripts/activity-home-timeline-planner-probe.node-test.mjs
```

Expected: module/function missing 导致 exit 1。

- [ ] **Step 3: 实现可复现 probe**

脚本固定：

```js
export const PROBE_AS_OF = new Date('2026-10-09T08:00:00.000Z');
export const PROBE_COLLECTION = 'tmp_activity_home_timeline_f8d1d2e2';

export function assertTemporaryCollection(name) {
  if (!/^tmp_activity_home_timeline_[a-z0-9]+$/.test(name))
    throw new Error('只允许临时集合');
}
export function buildFixtures(asOf) {}
export function buildExplainCommands(collection, asOf) {}
export async function runProbe({ envId, collection, execute }) {}
```

`execute` 使用 `spawnSync` 调用固定版本：

```bash
npx --yes --package @cloudbase/cli@3.8.4 tcb -e cloudbase-d0gizacy77a1ab017 \
  db nosql execute --json --command "$MGO_COMMANDS"
```

脚本依次执行 create、三条索引、108 条 insert、12 条 explain、future/history 多页 smoke、drop、list collections；所有写目标都必须先过 `assertTemporaryCollection`。输出结构化 JSON，日志不得含凭据。cursor query builder 禁止 `$or`：每个逻辑流分别生成 `same-time` 和 `cross-time` 两条命令。

- [ ] **Step 4: 运行 probe 单测 GREEN**

把根 `package.json` 的 `test:bootstrap` 更新为同时执行 bootstrap 与 planner probe 两个 Node 测试文件，确保 `npm run validate` 不会遗漏 probe 安全边界。

```bash
npm run test:bootstrap
```

Expected: exit 0，未连接或修改 CloudBase。

- [ ] **Step 5: 建立唯一临时集合并写入 108 条 fixture**

通过已登录的 CloudBase CLI 3.8.4，只操作测试环境和唯一集合：

```bash
node scripts/activity-home-timeline-planner-probe.mjs \
  --env-id cloudbase-d0gizacy77a1ab017 \
  --collection tmp_activity_home_timeline_f8d1d2e2 \
  --apply
```

fixture 必须包含：进行中、未开始、自然结束 published、提前 finished、相同 start/end、`is_deleted=false`、字段缺失、`is_deleted=true`、draft、非法 status 和非法时间，总数固定为 108。

- [ ] **Step 6: 建立候选索引并保留竞争旧索引**

临时集合同时包含：

```json
[
  { "name": "legacy_status_event_start", "key": { "status": 1, "event_start": 1 } },
  {
    "name": "public_event_start",
    "key": { "status": 1, "event_start": 1, "_id": 1, "event_end": 1 }
  },
  {
    "name": "public_event_end",
    "key": { "status": 1, "event_end": -1, "_id": -1, "event_start": -1 }
  }
]
```

- [ ] **Step 7: 对四流首屏和 cursor 查询执行 explain**

使用 `db nosql execute` 的 `COMMAND` 类型执行 Mongo `explain`。先覆盖以下四条首屏 where：

```json
{
  "ongoing": { "status": "published", "is_deleted": { "$ne": true }, "event_start": { "$lte": "2026-10-09T08:00:00.000Z" }, "event_end": { "$gt": "2026-10-09T08:00:00.000Z" } },
  "scheduled": { "status": "published", "is_deleted": { "$ne": true }, "event_start": { "$gt": "2026-10-09T08:00:00.000Z" }, "event_end": { "$gt": "2026-10-09T08:00:00.000Z" } },
  "finished": { "status": "finished", "is_deleted": { "$ne": true } },
  "pastPublished": { "status": "published", "is_deleted": { "$ne": true }, "event_end": { "$lte": "2026-10-09T08:00:00.000Z" } }
}
```

future 两流使用 `sort:{event_start:1,_id:1},limit:21`；history 两流使用 `sort:{event_end:-1,_id:-1},limit:21`。每个逻辑流的 cursor 再拆两条：`time == boundary.time + _id 严格边界` 的 same-time 查询，以及仅 `time 严格跨 boundary.time` 的 cross-time 查询；禁止 `$or`。总计 4 条首屏 + 8 条 cursor 物理查询。每条 explain 必须证明：命中候选索引、无顶层/阻塞 `SORT`、`FETCH` 删除过滤在逻辑 `LIMIT` 前、返回和 limit 不超过 21。

- [ ] **Step 8: 做静态数据集 20+20+1 smoke**

按 cursor 连续执行 future/history 查询并在本地按服务端算法归并。断言 IDs 唯一、future 全局 `event_start/_id ASC`、history 全局 `event_end/_id DESC`、deleted/draft/invalid 缺失、legacy `is_deleted` 缺失可见。

- [ ] **Step 9: 精确清理并回读证明为零**

只 drop `tmp_activity_home_timeline_f8d1d2e2`，再 list collections 精确确认同名集合数量为 0。禁止触碰业务 `activities`。

- [ ] **Step 10: 写证据并执行门禁判断**

证据文档记录 env 别名、临时集合名、候选/竞争索引、每条 requestId、winning plan、keys/docs examined、分页结果和清理 requestId；不得记录 token、cookie、openid 或 CLI 凭据。

若任一查询有阻塞 `SORT`、删除过滤晚于逻辑 limit、不可接受全表扫描或 cursor 不稳定：停止并报告 `PENDING (missing planner evidence)`，回设计阶段，不执行 Task 3。

- [ ] **Step 11: Planner 通过后提交 probe 与证据**

```bash
git add scripts/activity-home-timeline-planner-probe.mjs \
  scripts/activity-home-timeline-planner-probe.node-test.mjs \
  docs/verification/2026-10-09-activity-home-timeline-planner.md package.json
git commit -m "test(activity): verify timeline query plans"
```

---

### Task 3: 实现服务端分页并保持旧协议

**Files:**
- Create: `cloudfunctions/activity-read/list-page.js`
- Modify: `cloudfunctions/activity-read/index.js`
- Modify: `scripts/verify-cloud-packages.mjs`
- Test: `cloudfunctions/activity-read/list-page.node-test.js`
- Test: `cloudfunctions/activity-read/index.node-test.js`

- [ ] **Step 1: 实现严格 request/cursor 边界**

导出固定 API：

```js
const PAGE_SIZE = 20;
const MAX_CURSOR_LENGTH = 512;
const MAX_STREAM_BATCHES = 5;

function parseListPageRequest(event, now) {}
function encodeListCursor(value) {}
function decodeListCursor(value, expectedView) {}
async function listActivityPage({ db, command, request, now }) {}
```

解码先检查长度和 base64url 字符集，再 JSON parse，再做 exact-key 白名单。任何异常转换为 `VALIDATION_FAILED`，不要记录 cursor 原文。

- [ ] **Step 2: 实现四流 query 与 keyset**

使用 Task 2 已证明的 exact where/orderBy。每个首屏 query 按时间字段、`_id` 排序并 `limit(request.pageSize + 1)`。cursor 页不得构造复合 `$or`：每个逻辑流先读 same-time 段，再读 cross-time 段，并在凑满 `pageSize + 1` 时停止。future 先 ongoing 后 scheduled；history 两流归并。所有候选先验证 Date、`start < end`、status/delete，再形成 page；正常首屏最多 2 reads、cursor 页最多 4 reads，每流最多五批，最坏 20 reads 后抛 `DATA_INTEGRITY_ERROR`。

- [ ] **Step 3: 接入独立 action**

`index.js` 在旧 `list` 分支之后新增：

```js
if (event.action === 'listPage') {
  const request = parseListPageRequest(event, now);
  const page = await listActivityPage({ db, command: _, request, now });
  return ok({
    items: await resolveActivityMedia(page.items.map((item) => publicActivity(item, request.asOf))),
    next_cursor: page.nextCursor,
    as_of: request.asOf.toISOString(),
  });
}
```

旧 `list` 查询和返回结构不得改变。

- [ ] **Step 4: 更新测试命令和 package verifier**

`activity-read/package.json` 加入新 test；`verify-cloud-packages.mjs` 的 activity-read required files 加入 `list-page.js`。

- [ ] **Step 5: 运行 GREEN**

```bash
npm --prefix cloudfunctions/activity-read test
npm run verify:cloud-packages
```

Expected: 全部 exit 0；旧 list 与新 listPage 同时 PASS。

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/activity-read/list-page.js \
  cloudfunctions/activity-read/list-page.node-test.js \
  cloudfunctions/activity-read/index.js \
  cloudfunctions/activity-read/index.node-test.js \
  cloudfunctions/activity-read/package.json scripts/verify-cloud-packages.mjs
git commit -m "feat(activity): add public timeline pagination"
```

---

### Task 4: 固化 CloudBase 索引

**Files:**
- Modify: `scripts/bootstrap-cloudbase.mjs`
- Modify: `scripts/bootstrap-cloudbase.node-test.mjs`
- Modify: `docs/cloudbase-schema.md`

- [ ] **Step 1: 写索引 RED**

在 bootstrap test 中断言存在两条已由 planner 证明的索引：

```js
assert.deepEqual(byName('activities_public_event_start').keys, [
  ['status', 1],
  ['event_start', 1],
  ['_id', 1],
  ['event_end', 1],
]);
assert.deepEqual(byName('activities_public_event_end').keys, [
  ['status', 1],
  ['event_end', -1],
  ['_id', -1],
  ['event_start', -1],
]);
```

同时断言缺失索引生成 create action、同名不同 key 产生 conflict、完整状态 verify 无动作。

- [ ] **Step 2: 运行 RED**

```bash
node --test scripts/bootstrap-cloudbase.node-test.mjs
```

Expected: 只因两个索引不存在而 FAIL。

- [ ] **Step 3: 加入 Task 2 实证索引**

只把真实 explain 通过的 key 顺序加入 `INDEXES`；如果实证顺序与设计候选不同，先修订设计和 planner 证据，不在此临时猜测。

- [ ] **Step 4: 运行 GREEN**

```bash
npm run test:bootstrap
npm run cloudbase:plan
```

Expected: test exit 0；plan 只读列出缺失索引，不执行写动作。

- [ ] **Step 5: Commit**

```bash
git add scripts/bootstrap-cloudbase.mjs scripts/bootstrap-cloudbase.node-test.mjs \
  docs/cloudbase-schema.md
git commit -m "feat(cloud): index public activity timelines"
```

---

### Task 5: 新增严格 repository 分页契约

**Files:**
- Modify: `miniprogram/repositories/types.ts`
- Modify: `miniprogram/repositories/cloud.ts`
- Modify: `miniprogram/repositories/mock.ts`
- Test: `tests/cloud-repository.test.ts`

- [ ] **Step 1: 写 CloudRepository RED**

新增测试锁住：

```ts
await repository.listActivityPage('future');
expectCall(callFunction, 'activity-read', {
  action: 'listPage',
  view: 'future',
  page_size: 20,
});

await repository.listActivityPage('history', 'cursor-1');
expectCall(callFunction, 'activity-read', {
  action: 'listPage',
  view: 'history',
  page_size: 20,
  cursor: 'cursor-1',
});
```

返回映射为 `{items,nextCursor,asOf}`。表驱动拒绝非 object、非数组 items、非法 activity、缺失/超长 cursor、非法 as_of、额外 envelope 字段。另断言 `listActivities()` 仍调用 `{action:'list'}`。

- [ ] **Step 2: 运行 RED**

```bash
npx vitest run tests/cloud-repository.test.ts
```

Expected: `listActivityPage is not a function`，旧 repository 用例 PASS。

- [ ] **Step 3: 实现类型和 CloudRepository**

`types.ts` 加入：

```ts
export type PublicActivityView = 'future' | 'history';
export interface PublicActivityPage {
  items: Activity[];
  nextCursor: string | null;
  asOf: string;
}
```

`RideRepository` 加入：

```ts
listActivityPage(view: PublicActivityView, cursor?: string): Promise<PublicActivityPage>;
```

CloudRepository 使用现有 `expectRecord`、`mapActivity(..., true)` 和 `strictDateText`；cursor 只接受 `null` 或 1..512 字符字符串，并拒绝额外 envelope key。

- [ ] **Step 4: 实现 MockRepository**

以固定 `new Date()` 快照分类，future 按 `startAt/id` 正序，history 按 `endAt/id` 倒序，每页 20。Mock cursor 同样使用版本化 base64url，不能用未校验的数组下标。

- [ ] **Step 5: 运行 GREEN**

```bash
npx vitest run tests/cloud-repository.test.ts
npm run typecheck
```

Expected: exit 0。

- [ ] **Step 6: Commit**

```bash
git add miniprogram/repositories/types.ts miniprogram/repositories/cloud.ts \
  miniprogram/repositories/mock.ts tests/cloud-repository.test.ts
git commit -m "feat(activity): map public timeline pages"
```

---

### Task 6: 用状态机实现首页筛选与竞态收敛

**Files:**
- Create: `miniprogram/pages/activities/timeline-state.ts`
- Create: `tests/activity-home-timeline.test.ts`
- Modify: `miniprogram/pages/activities/index.ts`
- Modify: `tests/tab-page-refresh.test.ts`

- [ ] **Step 1: 写页面 RED**

mock `rideService.listActivityPage`，覆盖默认 future、history 懒加载、切回缓存后台刷新、首屏 race、loadMore race、同 cursor 单飞、失败保留 cursor、ID 去重、onHide/onUnload。

两条必须使用 deferred promise 的确定性交错：

```ts
it('首屏在途切走再切回会释放 loading 并重新请求', async () => {});
it('loadMore 在途切走再切回会释放单飞并允许同 cursor 重试', async () => {});
```

断言旧 promise 的 resolve/reject/finally 均不改变新 revision 的 items、cursor、loading、error 或句柄。

- [ ] **Step 2: 运行 RED**

```bash
npx vitest run tests/activity-home-timeline.test.ts tests/tab-page-refresh.test.ts
```

Expected: 新方法/页面事件不存在导致 FAIL；registrations 刷新测试继续 PASS。

- [ ] **Step 3: 实现独立状态 helper**

`timeline-state.ts` 提供：

```ts
export interface TimelineViewState {
  items: Activity[];
  nextCursor: string | null;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string;
  refreshError: string;
  revision: number;
  loaded: boolean;
}

export function createTimelineViewState(): TimelineViewState;
export function invalidateTimelineView(state: TimelineViewState): TimelineViewState;
export function appendUniqueActivities(current: Activity[], incoming: Activity[]): Activity[];
```

`invalidateTimelineView` 必须 revision+1、三个 volatile flag=false，保留 items/cursor/errors/loaded。

- [ ] **Step 4: 修改页面控制器**

页面初始 `activeView:'future'`，为两个视图保存 state 和单飞句柄。`switchView` 顺序：invalidate old → release old handles → set active → render target → load target。`load` 和 `loadMore` 的 success/catch/finally 都通过同一 fence：

```ts
if (
  this.data.activeView !== capturedView ||
  this.viewStates[capturedView].revision !== capturedRevision ||
  capturedCursor !== expectedCursor
) return;
```

`onHide/onUnload` 同步 invalidate 两视图并释放所有句柄。

- [ ] **Step 5: 适配既有 tab refresh 测试**

活动页分支改 mock `listActivityPage` 并从 `.items` 取活动；registrations 分支继续 mock 旧 `listActivities()`，证明旧调用面未变。

- [ ] **Step 6: 运行 GREEN**

```bash
npx vitest run tests/activity-home-timeline.test.ts tests/tab-page-refresh.test.ts
npm run typecheck
```

Expected: exit 0，两条切换交错均证明无永久 loading。

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/activities/timeline-state.ts \
  miniprogram/pages/activities/index.ts \
  tests/activity-home-timeline.test.ts tests/tab-page-refresh.test.ts
git commit -m "feat(activity): isolate home timeline state"
```

---

### Task 7: 增加双选 UI、动态文案与加载更多

**Files:**
- Modify: `miniprogram/pages/activities/index.wxml`
- Modify: `miniprogram/pages/activities/index.wxss`
- Modify: `tests/activity-home-timeline.test.ts`
- Modify: `tests/theme-accessibility-regressions.test.ts`

- [ ] **Step 1: 写模板与样式 RED**

断言 WXML 包含 `未来活动`、`历史活动`、`aria-selected`、history 动态 copy、`bindtap="loadMore"`；WXSS 中 tab 等效高度至少 88rpx、选中态使用语义主题 token、320px 下无横向溢出。

- [ ] **Step 2: 运行 RED**

```bash
npx vitest run tests/activity-home-timeline.test.ts \
  tests/theme-accessibility-regressions.test.ts
```

Expected: 缺少 selector/load more 导致 FAIL。

- [ ] **Step 3: 实现模板**

在 intro 与 section head 之间加入：

```xml
<view class="timeline-tabs" role="tablist" aria-label="活动时间筛选">
  <view class="timeline-tab {{activeView === 'future' ? 'is-active' : ''}}"
    role="tab" aria-selected="{{activeView === 'future'}}" data-view="future"
    bindtap="switchView">未来活动</view>
  <view class="timeline-tab {{activeView === 'history' ? 'is-active' : ''}}"
    role="tab" aria-selected="{{activeView === 'history'}}" data-view="history"
    bindtap="switchView">历史活动</view>
</view>
```

`state-view` 使用当前视图状态；`nextCursor` 存在时显示加载更多按钮，loadingMore 时禁用且显示“加载中…”。

动态文案严格使用：future 为 `UPCOMING RIDES / 下一场 / 接下来 / 暂无未来活动 / 新的骑行活动正在筹备中`；history 为 `RIDE ARCHIVE / 最近结束 / 更早活动 / 暂无历史活动 / 完成的骑行活动会出现在这里`。主标题保持“发现活动 / 报名出发”。

- [ ] **Step 4: 实现主题与窄屏样式**

只使用现有 `--color-*`、`--radius-*` token；tab 最小高度 88rpx，flex 1:1，文字不截断。历史视图沿用 activity-card，不增加报名 CTA。

- [ ] **Step 5: 运行 GREEN**

```bash
npx vitest run tests/activity-home-timeline.test.ts \
  tests/theme-accessibility-regressions.test.ts
npm run format:check
```

Expected: exit 0。

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/activities/index.wxml \
  miniprogram/pages/activities/index.wxss \
  tests/activity-home-timeline.test.ts \
  tests/theme-accessibility-regressions.test.ts
git commit -m "feat(activity): add future and history filters"
```

---

### Task 8: 同步产品文档、schema 和 release notes

**Files:**
- Modify: `docs/requirements-design.md`
- Modify: `docs/cloudbase-schema.md`
- Modify: `README.md`
- Modify: `miniprogram/pages/settings/index.ts`

- [ ] **Step 1: 更新产品和数据契约**

写明默认 future、进行中归 future、finished/自然结束归 history、旧 list 保持兼容、新 `listPage` envelope、cursor/as_of 非数据库快照、索引和 planner 证据链接。

- [ ] **Step 2: 更新 README 与索引数量**

活动能力加入“首页区分未来与历史并支持分页”；bootstrap 索引数量按 `INDEXES.length` 实际结果更新，不能猜测。

- [ ] **Step 3: 增加升级日志**

在 `RELEASE_NOTES` 顶部加入：

```ts
{
  version: '2026.10.09.3',
  date: '2026-10-09',
  title: '活动首页区分未来与历史',
  summary: '活动首页默认展示未来与进行中活动，并可稳定分页回看历史活动。',
  latest: true,
  features: [
    '默认展示未来活动，正在进行的骑行不会提前移入历史',
    '历史活动按结束时间倒序分页，支持持续加载',
    '切换、刷新和加载更多相互隔离，迟到请求不会覆盖当前列表',
  ],
},
```

原首项改为 `latest:false`。

- [ ] **Step 4: 运行文档与 release 门禁**

```bash
npm run test:release-notes
npm run check:release-notes
npx prettier --check README.md docs/requirements-design.md docs/cloudbase-schema.md \
  miniprogram/pages/settings/index.ts
```

Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add docs/requirements-design.md docs/cloudbase-schema.md README.md \
  miniprogram/pages/settings/index.ts
git commit -m "docs(activity): record home timeline filters"
```

---

### Task 9: 全量门禁、冻结审查和 Draft PR

**Files:** all task files, read-only review after formatting

- [ ] **Step 1: 机械格式化后重跑 focused**

```bash
npx prettier --write \
  cloudfunctions/activity-read/list-page.js \
  cloudfunctions/activity-read/list-page.node-test.js \
  cloudfunctions/activity-read/index.js \
  miniprogram/repositories/types.ts \
  miniprogram/repositories/cloud.ts \
  miniprogram/repositories/mock.ts \
  miniprogram/pages/activities/timeline-state.ts \
  miniprogram/pages/activities/index.ts \
  miniprogram/pages/activities/index.wxml \
  miniprogram/pages/activities/index.wxss \
  tests/activity-home-timeline.test.ts
npm --prefix cloudfunctions/activity-read test
npx vitest run tests/cloud-repository.test.ts tests/activity-home-timeline.test.ts \
  tests/tab-page-refresh.test.ts tests/theme-accessibility-regressions.test.ts
```

Expected: all PASS。

- [ ] **Step 2: 完整门禁**

```bash
npm run validate
BASE_SHA=$(git merge-base origin/main HEAD)
git diff --check "$BASE_SHA"...HEAD
git status --short
```

Expected: validate exit 0；diff check exit 0；只有预期文件。

- [ ] **Step 3: 独立审查**

冻结 diff，审查者逐项复核旧 list 兼容、cursor、read budget、四流归并、legacy delete、日志、两视图 volatile 收敛、release notes、planner 证据和部署包。任何 P0–P2 先 RED→GREEN，再重新跑完整门禁。

- [ ] **Step 4: 创建 Draft PR 并等待原始 CI**

提交仅包含本任务文件，推送普通分支并创建 Draft PR；不得 Ready、merge 或 deploy。只接受该不可变 head SHA 的原始 `validate` SUCCESS；旧 SHA 或本地通过不能替代。

---

### Task 10: 测试环境部署与真实页面 smoke

**Owner:** Aime 个人助理；执行者提供不可变 PR head 和部署清单，审判者验收证据。

- [ ] **Step 1: 应用并验证索引**

环境负责人先审查 `npm run cloudbase:plan`，再显式执行：

```bash
npm run cloudbase:apply
npm run cloudbase:verify
```

Expected: 两条新索引可见且定义一致；记录 requestId，不修改业务活动。

- [ ] **Step 2: 部署 activity-read 与微信开发版**

只部署不可变 PR head 生成的 `activity-read` 包和微信开发版。记录云函数更新时间、代码 SHA、开发版版本号和上传 job。

- [ ] **Step 3: 真实 smoke**

用测试身份验证：默认 future；进行中仍在 future；history 同时有 finished/自然结束 published；21+ 历史可 loadMore；快速切换不串列表/永久 loading；loadMore 失败可同 cursor 重试；空态/错误文案正确；历史详情可打开但报名 CTA 不开放。

- [ ] **Step 4: 回读与交付结论**

证据包含不可变 SHA、索引 verify、云函数版本、真实页面截图/录屏、请求摘要和 smoke。缺失项标记 `PENDING (missing evidence)`；测试环境验收前不转 Ready、不合并、不发布生产。

---

## 执行交接

用户已指定由 TraeX 执行者实施、TraeX 审判者独立复核、Aime 负责测试环境部署，因此不再等待执行方式选择。执行者必须从 Task 0 开始逐项勾选，Task 2 planner 未通过即停止；不得跳到生产 GREEN。
