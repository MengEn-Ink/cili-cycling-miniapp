# 个人中心近 90 天数据与 Strava 年限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 个人中心只展示近 90 天骑行指标，并按 Strava 注册时间显示“加入 STRAVA N 年”文案。

**Architecture:** 在 Strava 同步流程中并行请求 `GET /athlete` 获取 `created_at`，可选写入 `strava_snapshots.athlete_created_at`；个人能力名片投影该字段；客户端按 `generated_at` 与 `stravaJoinedAt` 计算完整周年；个人中心模板移除累计指标区块、新增年限文案。所有变更走 `cloudfunctions/strava-shared` 源，经 `cloud:prepare` 同步到 `strava-auth` 与 `strava-callback`。

**Tech Stack:** Node.js cloud functions (strava-shared, strava-auth, strava-callback, profile), TypeScript miniprogram, Vitest, `@cloudbase/cli` for deployment, wechatwebdevtools CLI for dev build.

---

## File Structure

| Action | File | Responsibility |
| --- | --- | --- |
| Modify | `cloudfunctions/strava-shared/api.js` | 新增 `athlete(token)` 客户端方法 |
| Modify | `cloudfunctions/strava-shared/core.js` | 新增 `optionalAthleteProfile`、`buildSyncResult` 写入/保留 `athlete_created_at` |
| Modify | `cloudfunctions/shared/domain.js` | `STRAVA_FIELDS` 加入 `athlete_created_at` |
| Modify | `cloudfunctions/activity-read/domain/domain.js` | 同上（副本） |
| Modify | `cloudfunctions/admin-review/domain/domain.js` | 同上（副本） |
| Modify | `cloudfunctions/registration/domain/domain.js` | 同上（副本） |
| Modify | `cloudfunctions/profile/capability-card.js` | 投影 `strava_joined_at` |
| Modify | `miniprogram/models/index.ts` | `PersonalCapabilityCard` 新增 `stravaJoinedAt?` |
| Modify | `miniprogram/repositories/cloud.ts` | 映射 `strava_joined_at` → `stravaJoinedAt` |
| Modify | `miniprogram/utils/personal-card.ts` | 新增 `stravaTenureText` / `hasStravaTenure` |
| Modify | `miniprogram/pages/profile/index.wxml` | 移除累计区块、新增年限文案 |
| Test | `cloudfunctions/strava-shared/core.node-test.js` | API、同步降级、旧值保留、骑手变化、非法时间 |
| Test | `cloudfunctions/profile/capability-card.node-test.js` | 投影注册时间 |
| Test | `tests/personal-card.test.ts` | 周年边界文案 |
| Test | `tests/profile-page.test.ts` | 个人中心无累计、有年限 |
| Test | `tests/cloud-repository.test.ts` | 仓库映射 |

---

## Task 1: Strava API 客户端新增 athlete 方法

**Files:**
- Modify: `cloudfunctions/strava-shared/api.js:97-106`
- Test: `cloudfunctions/strava-shared/api.node-test.js`

- [ ] **Step 1: 写失败测试**

在 `api.node-test.js` 新增测试，断言 `createStravaApi` 返回对象包含 `athlete` 方法，且调用时请求 `GET https://www.strava.com/api/v3/athlete` 并附带 `Authorization: Bearer <token>`。

- [ ] **Step 2: 运行确认失败**

`npm --prefix cloudfunctions/strava-shared test`
预期：`athlete is not a function` 或类似失败。

- [ ] **Step 3: 最小实现**

在 `api.js` 的 `athleteStats` 旁新增：

```js
athlete: (token) => json(`${API_ROOT}/athlete`, { headers: { authorization: `Bearer ${token}` } }),
```

- [ ] **Step 4: 运行确认通过**

`npm --prefix cloudfunctions/strava-shared test`
预期：全部通过。

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/strava-shared/api.js cloudfunctions/strava-shared/api.node-test.js
git commit -m "test(strava): add athlete client"
```

---

## Task 2: 同步流程可选获取 Strava 注册时间并写入快照

**Files:**
- Modify: `cloudfunctions/strava-shared/core.js`
- Test: `cloudfunctions/strava-shared/core.node-test.js`

- [ ] **Step 1: 写失败测试**

在 `core.node-test.js` 新增测试：
1. `buildSyncResult` 调用 `api.athlete`，成功时把 `created_at` 写入 `snapshot.athlete_created_at`（ISO 字符串）。
2. `api.athlete` 抛错时不抛异常，快照仍包含 90 天统计；若传入的 `previousSnapshot` 有同 `athlete_id` 的合法 `athlete_created_at`，则保留该值。
3. `api.athlete` 返回未来时间或非字符串时不写入；若有旧值则保留旧值。
4. `api.athlete` 成功但 `athlete_id` 与 `previousSnapshot.athlete_id` 不同时，不继承旧值。

- [ ] **Step 2: 运行确认失败**

`npm --prefix cloudfunctions/strava-shared test`
预期：`athlete_created_at` 相关断言失败。

- [ ] **Step 3: 最小实现**

在 `core.js` 新增辅助函数与修改 `buildSyncResult`：

```js
function validAthleteCreatedAt(value, now) {
  const date = validDate(value);
  if (!date) return null;
  if (date.getTime() > now.getTime()) return null;
  return date.toISOString();
}

async function optionalAthleteProfile(api, accessToken, now) {
  try {
    const athlete = await api.athlete(accessToken);
    const createdAt = validAthleteCreatedAt(athlete && athlete.created_at, now);
    return createdAt ? { athlete_created_at: createdAt } : {};
  } catch {
    return {};
  }
}
```

修改 `buildSyncResult` 签名加入 `previousSnapshot`，并在 `Promise.all` 中加入 athlete 请求：

```js
const [window, stats, athleteProfile] = await Promise.all([
  fetchActivityWindow(...),
  optionalLifetimeStatistics(...),
  optionalAthleteProfile(api, refreshed.accessToken, now),
]);
const previousCreatedAt =
  previousSnapshot &&
  previousSnapshot.athlete_id === refreshed.document.athlete_id
    ? validAthleteCreatedAt(previousSnapshot.athlete_created_at, now)
    : null;
const athleteCreatedAt = athleteProfile.athlete_created_at || previousCreatedAt;
const snapshot = {
  ...statistics(...),
  ...stats,
  ...(athleteCreatedAt ? { athlete_created_at: athleteCreatedAt } : {}),
};
```

在 `ensureReadyFlow` 中把 `claim.snapshot` 作为 `previousSnapshot` 传入 `buildSyncResult`。

- [ ] **Step 4: 运行确认通过**

`npm --prefix cloudfunctions/strava-shared test`
预期：全部通过。

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/strava-shared/core.js cloudfunctions/strava-shared/core.node-test.js
git commit -m "feat(strava): capture Strava join time in snapshot"
```

---

## Task 3: 快照字段白名单加入 athlete_created_at

**Files:**
- Modify: `cloudfunctions/shared/domain.js:165-189`
- Modify: `cloudfunctions/activity-read/domain/domain.js`
- Modify: `cloudfunctions/admin-review/domain/domain.js`
- Modify: `cloudfunctions/registration/domain/domain.js`

- [ ] **Step 1: 写失败测试**

在 `cloudfunctions/shared/domain.node-test.js` 已有快照测试的 fixture 加入 `athlete_created_at`，断言 `safeStravaSnapshot` 输出包含该字段且不包含未白名单字段。

- [ ] **Step 2: 运行确认失败**

`node --test cloudfunctions/shared/domain.node-test.js`
预期：`athlete_created_at` 被剥离。

- [ ] **Step 3: 最小实现**

在四个文件的 `STRAVA_FIELDS` 数组中加入 `'athlete_created_at'`（放在 `synced_at` 附近）。

- [ ] **Step 4: 运行确认通过**

`node --test cloudfunctions/shared/domain.node-test.js`
预期：通过。

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/shared/domain.js cloudfunctions/activity-read/domain/domain.js cloudfunctions/admin-review/domain/domain.js cloudfunctions/registration/domain/domain.js cloudfunctions/shared/domain.node-test.js
git commit -m "feat(strava): whitelist athlete_created_at in snapshots"
```

---

## Task 4: 个人能力名片投影 strava_joined_at

**Files:**
- Modify: `cloudfunctions/profile/capability-card.js`
- Test: `cloudfunctions/profile/capability-card.node-test.js`

- [ ] **Step 1: 写失败测试**

在 capability-card 测试中，给 snapshot 加入合法 `athlete_created_at`，断言 `buildCapabilityCard` 返回值包含 `strava_joined_at`（ISO 字符串）；给非法值断言不包含该字段。

- [ ] **Step 2: 运行确认失败**

`npm --prefix cloudfunctions/profile test`
预期：缺少 `strava_joined_at`。

- [ ] **Step 3: 最小实现**

在 `buildCapabilityCard` 中，`hasSnapshot` 时：

```js
const stravaJoinedAt = hasSnapshot ? validDate(snapshot.athlete_created_at)?.toISOString() : null;
```

在返回对象加入：

```js
...(stravaJoinedAt ? { strava_joined_at: stravaJoinedAt } : {}),
```

- [ ] **Step 4: 运行确认通过**

`npm --prefix cloudfunctions/profile test`
预期：通过。

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/profile/capability-card.js cloudfunctions/profile/capability-card.node-test.js
git commit -m "feat(profile): project Strava join time on capability card"
```

---

## Task 5: 客户端模型与仓库映射

**Files:**
- Modify: `miniprogram/models/index.ts`
- Modify: `miniprogram/repositories/cloud.ts`
- Test: `tests/cloud-repository.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/cloud-repository.test.ts` 的 capability card 响应中加入 `strava_joined_at`，断言映射后为 `stravaJoinedAt`；非法日期断言整个响应被拒绝（`invalidResponse`）。

- [ ] **Step 2: 运行确认失败**

`npx vitest run tests/cloud-repository.test.ts`
预期：`stravaJoinedAt` 未定义。

- [ ] **Step 3: 最小实现**

`models/index.ts` 的 `PersonalCapabilityCard` 加入 `stravaJoinedAt?: string;`。

`cloud.ts` `mapPersonalCapabilityCard` 中：

```ts
...(summary.strava_joined_at === undefined
  ? {}
  : { stravaJoinedAt: strictDateText(summary.strava_joined_at) }),
```

注意 `strava_joined_at` 在响应顶层而非 summary 内；按实际返回结构读取 `value.strava_joined_at`。

- [ ] **Step 4: 运行确认通过**

`npx vitest run tests/cloud-repository.test.ts`
预期：通过。

- [ ] **Step 5: Commit**

```bash
git add miniprogram/models/index.ts miniprogram/repositories/cloud.ts tests/cloud-repository.test.ts
git commit -m "feat(profile): map Strava join time to client model"
```

---

## Task 6: personalCardViewModel 计算年限文案

**Files:**
- Modify: `miniprogram/utils/personal-card.ts`
- Test: `tests/personal-card.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/personal-card.test.ts` 新增测试：
- `stravaJoinedAt` 为 7 年前且已过周年 → `stravaTenureText === '加入 STRAVA 7 年'`
- 未满一年 → `'加入 STRAVA 未满 1 年'`
- 未到当年周年 → 减 1 年
- 闰日注册、非闰年 2/28 视为已过周年
- 缺失 → `hasStravaTenure === false`，`stravaTenureText === ''`

- [ ] **Step 2: 运行确认失败**

`npx vitest run tests/personal-card.test.ts`
预期：年限字段不存在。

- [ ] **Step 3: 最小实现**

新增函数 `stravaTenure(joinedAtIso, nowIso)`：

```ts
function fullYearsBetween(joined: Date, now: Date): number {
  let years = now.getUTCFullYear() - joined.getUTCFullYear();
  const anniversaryThisYear = Date.UTC(
    now.getUTCFullYear(),
    joined.getUTCMonth(),
    joined.getUTCDate(),
  );
  if (now.getTime() < anniversaryThisYear) years -= 1;
  return Math.max(0, years);
}
```

在 `personalCardViewModel` 返回值加入：

```ts
stravaJoinedAt: card.stravaJoinedAt || '',
hasStravaTenure: Boolean(card.stravaJoinedAt),
stravaTenureText: card.stravaJoinedAt
  ? (() => {
      const years = fullYearsBetween(new Date(card.stravaJoinedAt!), new Date(card.generatedAt));
      return years === 0 ? '加入 STRAVA 未满 1 年' : `加入 STRAVA ${years} 年`;
    })()
  : '',
```

- [ ] **Step 4: 运行确认通过**

`npx vitest run tests/personal-card.test.ts`
预期：通过。

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/personal-card.ts tests/personal-card.test.ts
git commit -m "feat(profile): compute Strava tenure label"
```

---

## Task 7: 个人中心模板移除累计指标并展示年限

**Files:**
- Modify: `miniprogram/pages/profile/index.wxml`
- Modify: `miniprogram/pages/profile/index.wxss`（样式微调，可选）
- Test: `tests/profile-page.test.ts`

- [ ] **Step 1: 写失败测试**

更新 `tests/profile-page.test.ts`：
- 断言模板不含 `STRAVA 累计骑行` 和 `heroCard.lifetimeMetrics` 循环。
- 断言模板包含 `heroCard.stravaTenureText` 和 `加入 STRAVA`。
- 断言 `heroCard` 视图中 `lifetimeMetrics` 即使存在也不渲染（保留 viewModel 字段供名片页用）。

- [ ] **Step 2: 运行确认失败**

`npx vitest run tests/profile-page.test.ts`
预期：模板仍含累计区块。

- [ ] **Step 3: 最小实现**

在 `profile/index.wxml`：
- 删除 `<view class="hero-capability-group" wx:if="{{heroCard.lifetimeMetrics.length}}">` 整个累计区块。
- 在头部状态区下方新增：

```xml
<view class="hero-strava-tenure" wx:if="{{heroCard.hasStravaTenure}}">{{heroCard.stravaTenureText}}</view>
```

- 空态条件改为只判断近 90 天指标：`wx:if="{{!heroCard.primaryMetrics.length && !heroCard.secondaryMetrics.length}}"`。

- [ ] **Step 4: 运行确认通过**

`npx vitest run tests/profile-page.test.ts`
预期：通过。

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/profile/index.wxml miniprogram/pages/profile/index.wxss tests/profile-page.test.ts
git commit -m "feat(profile): show recent 90d stats and Strava tenure"
```

---

## Task 8: 同步副本、全量门禁与部署

**Files:** 无源码，运行脚本与部署

- [ ] **Step 1: 同步共享副本**

`npm run cloud:prepare`
预期：`strava-auth/oauth/` 与 `strava-callback/oauth/` 副本更新；`git diff` 仅显示同步产生的副本变更。

- [ ] **Step 2: 全量门禁**

`npm run validate`
预期：全部通过（前端 642+、云函数、证据校验、bootstrap、构建）。

- [ ] **Step 3: 格式检查**

`npm run format:check`
预期：通过。

- [ ] **Step 4: 提交同步副本与门禁结果**

```bash
git add cloudfunctions/strava-auth/oauth cloudfunctions/strava-callback/oauth
git commit -m "chore(strava): sync shared oauth copies"
```

- [ ] **Step 5: 部署云函数**

```bash
npx --yes -p @cloudbase/cli tcb fn deploy strava-auth
npx --yes -p @cloudbase/cli tcb fn deploy strava-callback
npx --yes -p @cloudbase/cli tcb fn deploy profile
```
环境：`cloudbase-d0gizacy77a1ab017`。
预期：三个函数部署成功，版本 Active。

- [ ] **Step 6: 拒绝型 smoke**

对三个函数无身份调用，预期返回 `UNAUTHENTICATED`，未写数据。

- [ ] **Step 7: 真实同步回读**

用已连接 Strava 的测试身份触发同步，回读 `strava_snapshots` 确认 `athlete_created_at` 写入；调用 `profile` 函数确认 `strava_joined_at` 返回。

- [ ] **Step 8: 个人中心验证**

用微信开发者工具预览，确认：仅近 90 天五项指标、年限文案正确、无累计区块、空态仍工作。

- [ ] **Step 9: 发布**

```bash
git push origin main
```
观察 CI 与微信开发版自动上传结果。
