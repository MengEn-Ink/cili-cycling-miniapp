# 报名与活动信息简化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除报名条码与管理员扫码核销，性别由个人资料维护并在报名链路只读展示，活动编辑补齐日程与费用明细，同时清理所有用户可见的骑手称号。

**Architecture:** 采用方案 A 最小闭环改造：不新增集合、不批量迁移数据、不改变报名/候补/审批/通知/签到状态机。性别规范化逻辑分别落在云函数共享领域与客户端工具层；云函数共享源码改动后通过 `npm run cloud:prepare` 生成部署副本。

**Tech Stack:** 原生微信小程序（TypeScript + WXML/WXSS）、微信云开发云函数（CommonJS + node:test）、Vitest、Prettier/ESLint。

---

## 全局约束（每个任务都必须遵守）

- 工作区存在三份**不得覆盖、删除或提交**的既有改动：
  - `docs/verification/README.md`（modified）
  - `docs/verification/p0-real-registration-journey.md`（modified）
  - `docs/verification/2026-10-09-core-flow-e2e.md`（untracked）
- 所有提交必须使用精确路径 `git add <path>`，严禁 `git add -A` / `git add .`。
- 只能在 `main` 分支当前 HEAD 之后新增提交，不得 rebase / amend / force push。
- 修改 `cloudfunctions/shared/` 后必须运行 `npm run cloud:prepare` 同步部署副本。
- 不得删除后端 `checkInRegistration` 能力；不得弱化四类路线操作（复制 Strava 路线、复制活动链接、保存分享海报、导出 GPX）。
- 性别视觉不得只依赖颜色，所有卡片必须始终显示文字：`男` / `女` / `未标注`。
- 历史数据缺失性别时显示“未标注/未填写”，不得阻断审批、签到或查看。

## 文件结构总览

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `cloudfunctions/shared/domain.js` | 性别规范化、报名资料校验、公开报名投影 | 修改 |
| `cloudfunctions/shared/use-cases.js` | 报名提交快照写入性别 | 修改 |
| `cloudfunctions/shared/domain.node-test.js` | 共享领域测试 | 修改 |
| `cloudfunctions/{activity-read,registration,admin-review}/domain/*` | 共享代码部署副本 | 脚本生成 |
| `cloudfunctions/admin-review/capability-card.js` | 管理员能力卡投影去 title 增 gender | 修改 |
| `cloudfunctions/admin-review/capability-card.node-test.js` | 管理能力卡测试 | 修改 |
| `cloudfunctions/activity-read/index.js` | 公开骑友投影去 title 增 gender | 修改 |
| `cloudfunctions/activity-read/index.node-test.js` | 公开骑友测试 | 修改 |
| `cloudfunctions/profile/capability-card.js` | 个人名片云函数去 title 增 gender | 修改 |
| `cloudfunctions/profile/capability-card.node-test.js` | 个人名片云函数测试 | 修改 |
| `miniprogram/utils/gender.ts` | 客户端性别规范化与展示视图 | 新建 |
| `tests/gender.test.ts` | 客户端性别工具测试 | 新建 |
| `miniprogram/models/index.ts` | `ActivityAttendee`、`PersonalCapabilityCard` 字段更新 | 修改 |
| `miniprogram/repositories/cloud.ts` | 云端 DTO 映射去 title 增 gender | 修改 |
| `tests/cloud-repository.test.ts` | 云仓库映射测试 | 修改 |
| `miniprogram/utils/validation.ts` | 报名校验新增性别门禁 | 修改 |
| `miniprogram/utils/check-in-code.ts` | 条码生成/解析 | 删除 |
| `miniprogram/pages/credential/index.{ts,wxml}` | 凭证页去条码、增性别 | 修改 |
| `miniprogram/pages/admin/reviews/index.{ts,wxml}` | 审批列表去扫码、增性别 | 修改 |
| `miniprogram/pages/admin/review-detail/index.wxml` | 审批详情增性别 | 修改 |
| `miniprogram/utils/capability-card.ts` | 管理员能力卡 VM 增性别展示 | 修改 |
| `miniprogram/pages/registration-form/index.{ts,wxml}` | 报名确认页增只读性别行 | 修改 |
| `miniprogram/utils/personal-card.ts` | 个人名片 VM 去 title 增性别 | 修改 |
| `miniprogram/pages/capability-card/index.{wxml,wxss}` | 个人名片页去称号增性别 | 修改 |
| `miniprogram/pages/profile/index.wxml` | 个人中心去称号 | 修改 |
| `miniprogram/pages/activity-detail/index.{ts,wxml,wxss}` | 费用明细、骑友卡性别 | 修改 |
| `miniprogram/pages/admin/activity-edit/index.{ts,wxml,wxss}` | 日程与费用明细编辑 | 修改 |
| `tests/registration-experience.test.ts` | 删除条码/扫码测试 | 修改 |
| `tests/domain.test.ts` | 报名校验性别测试 | 修改 |
| `tests/capability-card.test.ts` | 管理员能力卡 VM 测试 | 修改 |
| `tests/personal-card.test.ts` | 个人名片 VM 测试 | 修改 |
| `tests/personal-card-page.test.ts` | 个人名片页契约测试 | 修改 |
| `tests/activity-admin-edit.test.ts` | 活动编辑测试 | 修改 |
| `tests/activity-detail-design.test.ts` | 活动详情契约测试 | 修改 |
| `miniprogram/pages/settings/index.ts` | 功能升级日志 | 修改 |

---

## Task 1: 共享领域性别规范化与报名校验

**Files:**
- Modify: `cloudfunctions/shared/domain.js`
- Modify: `cloudfunctions/shared/use-cases.js`
- Test: `cloudfunctions/shared/domain.node-test.js`

- [ ] **Step 1: 在共享领域测试中加入性别测试入口**

在 `cloudfunctions/shared/domain.node-test.js` 第 5-24 行的解构中，于 `DomainError,` 下一行加入 `normalizeGender,`：

```js
const {
  DomainError,
  normalizeGender,
  assertNoForbiddenFields,
  registrationId,
  isOccupying,
  assertActivityOpen,
  assertProfileReady,
  selectStrava,
  validateOptions,
  assertCanSubmit,
  assertCanCancel,
  assertReviewTransition,
  isEnabledAdmin,
  publicActivity,
  publicRegistration,
  buildAudit,
  submitRegistration,
  cancelRegistration,
  reviewRegistration,
} = require('./index');
```

- [ ] **Step 2: 给共享 profile 测试夹具补性别**

将 `cloudfunctions/shared/domain.node-test.js` 第 51-65 行的 `profile` 常量替换为：

```js
const profile = {
  _id: openid,
  nickname: '骑手',
  gender: '男',
  real_name_masked: '曹*',
  phone_masked: '138****5678',
  phone_source: 'wechat',
  phone_verified: true,
  real_name_cipher: { ciphertext: 'x' },
  emergency_name: '联系人',
  sensitive_status: {
    phone_verified: true,
    emergency_phone: true,
  },
  strava: { status: 'connected', snapshot: { activities_90d: 10, weighted_avg_speed_kmh: 25 } },
};
```

- [ ] **Step 3: 更新两处合法 profile 断言夹具并新增非法性别断言**

将 `cloudfunctions/shared/domain.node-test.js` 第 199-216 行两个 `assert.doesNotThrow` 块替换为以下内容（两处均补 `gender: '男'`，随后新增缺失性别与非法性别两个断言）：

```js
  assert.doesNotThrow(() =>
    assertProfileReady({
      nickname: '骑手',
      gender: '男',
      phone_cipher: { ciphertext: 'x' },
      real_name_cipher: { ciphertext: 'x' },
      emergency_name: '联系人',
      emergency_phone_cipher: { ciphertext: 'x' },
    }),
  );
  assert.doesNotThrow(() =>
    assertProfileReady({
      nickname: '骑手',
      gender: '男',
      phone_cipher: { ciphertext: 'x' },
      real_name_cipher: { ciphertext: 'x' },
      emergency_name: '联系人',
      sensitive_status: { emergency_phone: true },
    }),
  );
  expectCode(
    () =>
      assertProfileReady({
        nickname: '骑手',
        phone_cipher: { ciphertext: 'x' },
        real_name_cipher: { ciphertext: 'x' },
        emergency_name: '联系人',
        emergency_phone_cipher: { ciphertext: 'x' },
      }),
    'PROFILE_INCOMPLETE',
  );
  expectCode(
    () =>
      assertProfileReady({
        nickname: '骑手',
        gender: '其他',
        phone_cipher: { ciphertext: 'x' },
        real_name_cipher: { ciphertext: 'x' },
        emergency_name: '联系人',
        emergency_phone_cipher: { ciphertext: 'x' },
      }),
    'PROFILE_INCOMPLETE',
  );
```

- [ ] **Step 4: 在文件末尾追加性别白名单测试**

在 `cloudfunctions/shared/domain.node-test.js` 文件末尾追加：

```js
test('性别规范化为男或女，公开报名快照按白名单输出', () => {
  assert.equal(normalizeGender('男'), '男');
  assert.equal(normalizeGender('女'), '女');
  assert.equal(normalizeGender('其他'), '');
  assert.equal(normalizeGender(undefined), '');

  const withGender = publicRegistration({
    _id: 'r1',
    activity_id: 'a1',
    status: 'pending',
    profile_snapshot: {
      nickname: '骑手',
      gender: '女',
      real_name_masked: '曹**',
      phone_masked: '138****5678',
      phone_source: 'wechat',
      phone_verified: true,
    },
  });
  assert.equal(withGender.profile_snapshot.gender, '女');

  const invalid = publicRegistration({
    _id: 'r2',
    activity_id: 'a1',
    status: 'pending',
    profile_snapshot: { nickname: '骑手', gender: '未知' },
  });
  assert.equal(invalid.profile_snapshot.gender, '');

  const missing = publicRegistration({
    _id: 'r3',
    activity_id: 'a1',
    status: 'pending',
  });
  assert.equal(missing.profile_snapshot.gender, '');
});
```

- [ ] **Step 5: 运行测试确认失败**

Run: `npm --prefix cloudfunctions/shared test`

Expected: FAIL，报错包含 `normalizeGender is not a function`，且 `PROFILE_INCOMPLETE` 相关断言失败。

- [ ] **Step 6: 实现 normalizeGender 与资料校验**

在 `cloudfunctions/shared/domain.js` 的 `assertProfileReady` 函数之前（第 138 行 `assertActivityOpen` 函数结束之后）插入：

```js
function normalizeGender(value) {
  return value === '男' || value === '女' ? value : '';
}
```

将同文件第 139-158 行的 `assertProfileReady` 替换为：

```js
function assertProfileReady(profile) {
  const sensitive = profile && profile.sensitive_status;
  // 存量证件密文保持只读兼容：报名判定不读取、不解密，也不要求资料更新时删除。
  const realNameReady = sensitive?.real_name === true || !!profile?.real_name_cipher;
  const phoneReady = sensitive?.phone_verified === true || !!profile?.phone_cipher;
  const emergencyReady =
    typeof profile?.emergency_name === 'string' &&
    !!profile.emergency_name.trim() &&
    (sensitive?.emergency_phone === true || !!profile?.emergency_phone_cipher);
  if (
    !profile ||
    typeof profile.nickname !== 'string' ||
    !profile.nickname.trim() ||
    !phoneReady ||
    !realNameReady ||
    !emergencyReady
  ) {
    fail('PROFILE_INCOMPLETE', '请先完成并安全保存实名资料');
  }
  if (!normalizeGender(profile.gender)) {
    fail('PROFILE_INCOMPLETE', '请先在个人资料中选择性别');
  }
}
```

- [ ] **Step 7: 公开报名投影输出性别**

将 `cloudfunctions/shared/domain.js` 第 420-429 行 `output.profile_snapshot = { ... }` 替换为：

```js
  output.profile_snapshot = {
    nickname: snapshot.nickname,
    gender: normalizeGender(snapshot.gender),
    real_name_masked: snapshot.real_name_masked,
    phone_masked: maskPhone(snapshot.phone_masked),
    phone_source: ['wechat', 'manual', 'legacy'].includes(snapshot.phone_source)
      ? snapshot.phone_source
      : '',
    phone_verified: snapshot.phone_verified === true,
  };
```

- [ ] **Step 8: 导出 normalizeGender**

在 `cloudfunctions/shared/domain.js` 的 `module.exports = { ... }` 中，于 `toErrorResponse,` 下一行加入 `normalizeGender,`：

```js
module.exports = {
  DomainError,
  fail,
  ok,
  toErrorResponse,
  normalizeGender,
  assertTrustedOpenid,
  assertNoForbiddenFields,
  registrationId,
  isOccupying,
  assertActivityOpen,
  assertProfileReady,
  selectStrava,
  selectCanonicalStrava,
  validateOptions,
  validateTeamInput,
  createTeamId,
  assertCanSubmit,
  assertCanCancel,
  assertCheckInTransition,
  assertReviewTransition,
  isEnabledAdmin,
  registrationDecision,
  registrationSetupReady,
  publicActivity,
  publicRegistration,
  buildAudit,
};
```

- [ ] **Step 9: 报名提交快照写入性别**

将 `cloudfunctions/shared/use-cases.js` 第 3-20 行的解构替换为（新增 `normalizeGender,`）：

```js
const {
  fail,
  normalizeGender,
  assertNoForbiddenFields,
  assertActivityOpen,
  assertProfileReady,
  selectCanonicalStrava,
  validateOptions,
  validateTeamInput,
  createTeamId,
  assertCanSubmit,
  assertCanCancel,
  assertCheckInTransition,
  assertReviewTransition,
  isEnabledAdmin,
  registrationId,
  publicRegistration,
  buildAudit,
} = require('./domain');
```

将同文件第 162-172 行提交值中的 `profile_snapshot` 替换为：

```js
      profile_snapshot: {
        nickname: profile.nickname,
        gender: normalizeGender(profile.gender),
        real_name_masked: profile.real_name_masked,
        phone_masked: profile.phone_masked,
        phone_source: ['wechat', 'manual'].includes(profile.phone_source)
          ? profile.phone_source
          : profile.phone_cipher
            ? 'legacy'
            : '',
        phone_verified: profile.phone_verified === true,
      },
```

- [ ] **Step 10: 运行共享领域测试确认通过**

Run: `npm --prefix cloudfunctions/shared test`

Expected: PASS，所有测试通过。

- [ ] **Step 11: 同步云函数部署副本并校验**

Run: `npm run cloud:prepare`

Expected: 无报错输出；随后运行 `npm run verify:cloud-packages`，输出包含校验通过。

- [ ] **Step 12: 提交**

```bash
git add cloudfunctions/shared/domain.js cloudfunctions/shared/use-cases.js cloudfunctions/shared/domain.node-test.js cloudfunctions/activity-read/domain cloudfunctions/registration/domain cloudfunctions/admin-review/domain
git commit -m "feat(domain): 报名校验与快照新增规范化性别"
```

---

## Task 2: 管理员能力卡投影性别并移除称号

**Files:**
- Modify: `cloudfunctions/admin-review/capability-card.js`
- Test: `cloudfunctions/admin-review/capability-card.node-test.js`

- [ ] **Step 1: 更新测试夹具与预期**

将 `cloudfunctions/admin-review/capability-card.node-test.js` 第 13-29 行的 `profile` 常量替换为（`title` 改为 `gender`）：

```js
const profile = {
  nickname: '山野骑手',
  gender: '男',
  avatar_file_id: 'cloud://avatar',
  photos: [
    { file_id: 'cloud://other', category: 'other' },
    { file_id: 'cloud://ride-1', category: 'ride', location: 'secret' },
    { file_id: 'cloud://ride-2', category: 'bike', token: 'secret-token' },
  ],
  real_name_cipher: { ciphertext: 'secret' },
  phone_cipher: { ciphertext: 'secret' },
  emergency_name: '联系人',
  emergency_phone_cipher: { ciphertext: 'secret' },
  id_type: '身份证',
  id_number_cipher: { ciphertext: 'legacy-secret' },
  openid: 'private-openid',
};
```

将同文件第 335-342 行 `assert.deepEqual(response.capability_profile, { ... })` 替换为：

```js
  assert.deepEqual(response.capability_profile, {
    nickname: '山野骑手',
    gender: '男',
    phone_source: 'wechat',
    phone_verified: true,
    photos: [{ url: 'https://temporary.example/ride-1', category: 'ride', source: 'user' }],
    avatar_url: 'https://temporary.example/avatar',
  });
```

- [ ] **Step 2: 在文件末尾追加快照回退测试**

在 `cloudfunctions/admin-review/capability-card.node-test.js` 文件末尾追加：

```js
test('能力卡性别优先当前资料，其次报名快照，非法值收敛为空', () => {
  const baseRegistration = {
    _id: 'r1',
    activity_id: 'a1',
    status: 'pending',
    options: { gathering_mode: 'self_drive', experience: 'regular' },
    profile_snapshot: {
      nickname: '快照骑手',
      gender: '女',
      phone_source: 'wechat',
      phone_verified: true,
    },
  };

  const fromSnapshot = adminCapabilityView(baseRegistration, {}, undefined);
  assert.equal(fromSnapshot.capability_profile.gender, '女');

  const fromProfile = adminCapabilityView(
    baseRegistration,
    { nickname: '当前骑手', gender: '男' },
    undefined,
  );
  assert.equal(fromProfile.capability_profile.gender, '男');

  const invalid = adminCapabilityView(
    { ...baseRegistration, profile_snapshot: { gender: '保密' } },
    { gender: '未知' },
    undefined,
  );
  assert.equal(invalid.capability_profile.gender, '');
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm --prefix cloudfunctions/admin-review test`

Expected: FAIL，`capability_profile` 中仍为 `title` 且缺少 `gender`。

- [ ] **Step 4: 引入领域工具并扩展快照字段白名单**

在 `cloudfunctions/admin-review/capability-card.js` 第 3 行 `const crypto = require('node:crypto');` 之后加入：

```js
const { normalizeGender } = require('./domain');
```

将同文件第 17-23 行 `ADMIN_PROFILE_FIELDS` 替换为：

```js
const ADMIN_PROFILE_FIELDS = [
  'nickname',
  'gender',
  'real_name_masked',
  'phone_masked',
  'phone_source',
  'phone_verified',
];
```

- [ ] **Step 5: adminCapabilityView 去 title 增 gender**

将 `cloudfunctions/admin-review/capability-card.js` 第 251-265 行 `safe.capability_profile = { ... }` 替换为：

```js
  safe.capability_profile = {
    nickname:
      typeof value.nickname === 'string'
        ? value.nickname
        : typeof safe.profile_snapshot.nickname === 'string'
          ? safe.profile_snapshot.nickname
          : '',
    gender: normalizeGender(
      typeof value.gender === 'string'
        ? value.gender
        : typeof safe.profile_snapshot.gender === 'string'
          ? safe.profile_snapshot.gender
          : '',
    ),
    phone_source: ['wechat', 'manual', 'legacy'].includes(safe.profile_snapshot.phone_source)
      ? safe.profile_snapshot.phone_source
      : '',
    phone_verified: safe.profile_snapshot.phone_verified === true,
    photos: media.photos,
    avatar_url: media.avatar_url,
  };
```

- [ ] **Step 6: socialCapabilityView 去 title 增 gender**

将 `cloudfunctions/admin-review/capability-card.js` 第 286-291 行 socialCapabilityView 的 `return { ... }` 替换为：

```js
  return {
    nickname: typeof value.nickname === 'string' ? value.nickname : '',
    gender: normalizeGender(value.gender),
    photos,
    strava: pick(value.strava, SOCIAL_STRAVA_FIELDS),
  };
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm --prefix cloudfunctions/admin-review test`

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add cloudfunctions/admin-review/capability-card.js cloudfunctions/admin-review/capability-card.node-test.js
git commit -m "feat(admin): 能力卡投影移除称号并输出性别"
```

---

## Task 3: 公开骑友投影性别并移除称号

**Files:**
- Modify: `cloudfunctions/activity-read/index.js`
- Test: `cloudfunctions/activity-read/index.node-test.js`

- [ ] **Step 1: 在测试文件末尾追加性别投影测试**

在 `cloudfunctions/activity-read/index.node-test.js` 文件末尾追加：

```js
test('公开骑友性别：报名快照优先、当前资料回退、非法值为空', async () => {
  const activity = {
    _id: 'gender-activity',
    title: '性别骑行',
    status: 'published',
    is_deleted: false,
  };
  const registrations = [
    {
      _id: 'r-snapshot',
      activity_id: activity._id,
      status: 'approved',
      profile_snapshot: { nickname: '快照骑手', gender: '男' },
      strava_snapshot: {},
    },
    {
      _id: 'r-fallback',
      activity_id: activity._id,
      status: 'approved',
      profile_snapshot: { nickname: '回退骑手' },
      strava_snapshot: {},
    },
    {
      _id: 'r-invalid',
      activity_id: activity._id,
      status: 'approved',
      profile_snapshot: { nickname: '非法骑手', gender: '保密' },
      strava_snapshot: {},
    },
  ];
  const profiles = [
    { _id: 'p1', nickname: '快照骑手', gender: '女' },
    { _id: 'p2', nickname: '回退骑手', gender: '女' },
    { _id: 'p3', nickname: '非法骑手', gender: '未知' },
  ];
  const { main } = loadMain(activity, [], { registrations, profiles });

  const result = await main({ action: 'detail', activityId: activity._id });
  assert.equal(result.ok, true);
  const byId = Object.fromEntries(result.data.attendees.map((item) => [item.id, item]));
  assert.equal(byId['r-snapshot'].gender, '男');
  assert.equal(byId['r-fallback'].gender, '女');
  assert.equal(byId['r-invalid'].gender, '');
  assert.ok(!('title' in byId['r-snapshot']));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test cloudfunctions/activity-read/index.node-test.js`

Expected: FAIL，骑友对象中不存在 `gender`（或仍含 `title`）。

- [ ] **Step 3: 引入 normalizeGender**

将 `cloudfunctions/activity-read/index.js` 第 4 行替换为：

```js
const {
  ok,
  toErrorResponse,
  assertTrustedOpenid,
  publicActivity,
  normalizeGender,
  fail,
} = require('./domain');
```

- [ ] **Step 4: publicAttendee 去 title 增 gender**

将 `cloudfunctions/activity-read/index.js` 第 64-85 行 `function publicAttendee` 替换为：

```js
function publicAttendee(registration, profile, avatarUrl) {
  const snapshot = registration && registration.profile_snapshot;
  const strava = registration && registration.strava_snapshot;
  return {
    id: typeof registration._id === 'string' ? registration._id : '',
    display_name:
      profile && typeof profile.nickname === 'string'
        ? profile.nickname
        : snapshot && typeof snapshot.nickname === 'string'
          ? snapshot.nickname
          : '',
    gender: normalizeGender(
      snapshot && typeof snapshot.gender === 'string'
        ? snapshot.gender
        : profile && typeof profile.gender === 'string'
          ? profile.gender
          : '',
    ),
    avatar_url: safeHttpsUrl(avatarUrl),
    status: registration.status,
    card: {
      rides90d: publicMetric(strava && strava.activities_90d),
      longestKm: publicMetric(strava && strava.longest_km),
      elevationM: publicMetric(strava && strava.total_elevation_m),
      speedKmh: publicMetric(strava && strava.weighted_avg_speed_kmh),
    },
  };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test cloudfunctions/activity-read/index.node-test.js`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/activity-read/index.js cloudfunctions/activity-read/index.node-test.js
git commit -m "feat(activity-read): 公开骑友移除称号并输出性别"
```

---

## Task 4: 个人骑行名片云函数输出性别

**Files:**
- Modify: `cloudfunctions/profile/capability-card.js`
- Test: `cloudfunctions/profile/capability-card.node-test.js`

- [ ] **Step 1: 更新现有测试夹具与预期**

将 `cloudfunctions/profile/capability-card.node-test.js` 第 112-125 行 `profile: { ... }` 替换为：

```js
      profile: {
        nickname: '山野骑手',
        gender: '男',
        real_name_masked: '曹**',
        phone_masked: '138****5678',
        emergency_name: '联系人',
        id_number_cipher: { ciphertext: 'legacy-secret' },
        avatar_file_id: 'cloud://env/profiles/legacy/avatar.jpg',
        photos: [
          { file_id: ownedOther, category: 'other' },
          { file_id: ownedRide, category: 'ride' },
          { file_id: 'cloud://env/profiles/legacy/ride.jpg', category: 'ride' },
        ],
      },
```

将同文件第 146-150 行预期中的 `profile` 替换为：

```js
    profile: {
      display_name: '山野骑手',
      gender: '男',
      avatar_url: '',
    },
```

- [ ] **Step 2: 在文件末尾追加非法性别收敛测试**

在 `cloudfunctions/profile/capability-card.node-test.js` 文件末尾追加：

```js
test('个人名片性别非法或缺失时收敛为空字符串', async () => {
  const response = await buildCapabilityCard(
    {
      profile: { nickname: '骑手', gender: '保密', photos: [] },
      credential: undefined,
      snapshot: undefined,
    },
    { openid, mediaSecret, now },
  );
  assert.equal(response.profile.gender, '');
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm --prefix cloudfunctions/profile test`

Expected: FAIL，`profile` 中仍为 `title`。

- [ ] **Step 4: 修改 buildCapabilityCard 投影**

在 `cloudfunctions/profile/capability-card.js` 中找到如下片段：

```js
    profile: {
      display_name: profile?.nickname || '',
      title: profile?.title || '',
      avatar_url: '',
    },
```

将其替换为：

```js
    profile: {
      display_name: profile?.nickname || '',
      gender: profile?.gender === '男' || profile?.gender === '女' ? profile.gender : '',
      avatar_url: '',
    },
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm --prefix cloudfunctions/profile test`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/profile/capability-card.js cloudfunctions/profile/capability-card.node-test.js
git commit -m "feat(profile): 个人名片云函数移除称号并输出性别"
```

---

## Task 5: 新建客户端性别工具

**Files:**
- Create: `miniprogram/utils/gender.ts`
- Create: `tests/gender.test.ts`

- [ ] **Step 1: 编写失败测试**

创建 `tests/gender.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { genderView, normalizeGender } from '../miniprogram/utils/gender';

describe('客户端性别工具', () => {
  it.each([
    ['男', '男'],
    ['女', '女'],
    ['其他', ''],
    [null, ''],
    [undefined, ''],
    [1, ''],
  ])('normalizeGender(%s) → %s', (input, expected) => {
    expect(normalizeGender(input)).toBe(expected);
  });

  it('男骑手展示男与男性样式类', () => {
    expect(genderView('男')).toEqual({ gender: '男', genderLabel: '男', genderClass: 'gender-male' });
  });

  it('女骑手展示女与女性样式类', () => {
    expect(genderView('女')).toEqual({ gender: '女', genderLabel: '女', genderClass: 'gender-female' });
  });

  it('缺失时展示未标注与中性样式类', () => {
    expect(genderView('未知')).toEqual({
      gender: '',
      genderLabel: '未标注',
      genderClass: 'gender-unknown',
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/gender.test.ts`

Expected: FAIL，报错 `Failed to resolve import "../miniprogram/utils/gender"`。

- [ ] **Step 3: 实现性别工具**

创建 `miniprogram/utils/gender.ts`：

```ts
export type GenderValue = '男' | '女';

export function normalizeGender(value: unknown): GenderValue | '' {
  return value === '男' || value === '女' ? value : '';
}

export interface GenderView {
  gender: GenderValue | '';
  genderLabel: string;
  genderClass: string;
}

export function genderView(value: unknown): GenderView {
  const gender = normalizeGender(value);
  return {
    gender,
    genderLabel: gender === '' ? '未标注' : gender,
    genderClass:
      gender === '男' ? 'gender-male' : gender === '女' ? 'gender-female' : 'gender-unknown',
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/gender.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/gender.ts tests/gender.test.ts
git commit -m "feat(client): 新增性别规范化与展示视图工具"
```

---

## Task 6: 客户端模型字段更新

**Files:**
- Modify: `miniprogram/models/index.ts`

- [ ] **Step 1: 更新 ActivityAttendee**

将 `miniprogram/models/index.ts` 第 48-60 行的 `ActivityAttendee` 替换为：

```ts
export interface ActivityAttendee {
  id: string;
  displayName: string;
  gender: string;
  avatarUrl: string;
  status: 'approved' | 'checked_in';
  card: {
    rides90d: number | null;
    longestKm: number | null;
    elevationM: number | null;
    speedKmh: number | null;
  };
}
```

- [ ] **Step 2: 更新 PersonalCapabilityCard.profile**

将 `miniprogram/models/index.ts` 第 206 行替换为：

```ts
  profile: { displayName: string; gender: string; avatarUrl?: string };
```

- [ ] **Step 3: 类型检查确认无新增报错**

Run: `npm run typecheck`

Expected: FAIL，报错集中在 `miniprogram/repositories/cloud.ts` 与引用 attendee.title / profile.title 的位置（将在 Task 7、11、12 修复）；`miniprogram/models/index.ts` 自身无报错。

- [ ] **Step 4: 暂不提交，与 Task 7 合并提交**

---

## Task 7: 云仓库映射去 title 增 gender

**Files:**
- Modify: `miniprogram/repositories/cloud.ts`
- Test: `tests/cloud-repository.test.ts`

- [ ] **Step 1: 更新公开骑友映射测试**

将 `tests/cloud-repository.test.ts` 第 1890-1901 行的 `attendees` 输入夹具替换为：

```ts
        attendees: [
          {
            id: 'r1',
            display_name: '山野骑手',
            gender: '男',
            avatar_url: 'https://temp.example/avatar.jpg',
            status: 'approved',
            card: { rides90d: 20, longestKm: 120, elevationM: 8000, speedKmh: 26.5 },
            openid: 'must-not-map',
            phone: '13812345678',
          },
        ],
```

将同文件第 1914-1923 行的骑友预期替换为：

```ts
    expect(result.attendees).toEqual([
      {
        id: 'r1',
        displayName: '山野骑手',
        gender: '男',
        avatarUrl: 'https://temp.example/avatar.jpg',
        status: 'approved',
        card: { rides90d: 20, longestKm: 120, elevationM: 8000, speedKmh: 26.5 },
      },
    ]);
```

- [ ] **Step 2: 更新非法值收敛测试**

将 `tests/cloud-repository.test.ts` 第 1947-1966 行的 attendee 输入数组替换为：

```ts
    const attendees = [
      null,
      {
        id: 7,
        display_name: false,
        gender: null,
        avatar_url: 'http://unsafe.example/avatar.jpg',
        status: 'checked_in',
        card: null,
        openid: 'secret',
      },
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `r${index}`,
        display_name: `骑手${index}`,
        gender: '女',
        avatar_url: 'https://example.com/avatar.jpg',
        status: 'unexpected',
        card: { rides90d: Number.NaN, longestKm: '120', elevationM: undefined, speedKmh: 0 },
      })),
    ];
```

将同文件第 1970-1977 行 `result.attendees[0]` 预期替换为：

```ts
    expect(result.attendees[0]).toEqual({
      id: '',
      displayName: '',
      gender: '',
      avatarUrl: '',
      status: 'checked_in',
      card: { rides90d: null, longestKm: null, elevationM: null, speedKmh: null },
    });
```

- [ ] **Step 3: 给管理员详情测试增加性别断言**

将 `tests/cloud-repository.test.ts` 第 720-739 行 `capability_profile` 输入替换为：

```ts
      capability_profile: {
        nickname: '山野骑手',
        gender: '男',
        phone_source: 'manual',
        phone_verified: false,
        avatar_url: 'https://temporary.example/avatar',
        avatar_file_id: 'cloud://raw-avatar',
        photos: [
          {
            url: 'https://temporary.example/training',
            file_id: 'cloud://raw-training',
            category: 'bike',
            source: 'user',
            token: 'secret',
          },
          { url: 'http://temporary.example/insecure', category: 'ride', source: 'user' },
        ],
        access_token: 'secret',
        openid: 'private',
      },
```

将同文件第 744-750 行的断言替换为：

```ts
    expect(result?.profile).toMatchObject({
      nickname: '山野骑手',
      gender: '男',
      avatarId: 'https://temporary.example/avatar',
      photos: [{ id: 'https://temporary.example/training', category: 'bike' }],
      sensitiveStatus: { phoneSource: 'manual', phoneVerified: false },
    });
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npx vitest run tests/cloud-repository.test.ts`

Expected: FAIL，映射结果仍含 `title`、缺少 `gender`。

- [ ] **Step 5: 引入性别工具并更新公开骑友映射**

在 `miniprogram/repositories/cloud.ts` 顶部其他本地 import 之后加入：

```ts
import { normalizeGender } from '../utils/gender';
```

将同文件第 170-183 行 mapPublicAttendees 的返回对象替换为：

```ts
      return {
        id: typeof attendee.id === 'string' ? attendee.id : '',
        displayName: typeof attendee.display_name === 'string' ? attendee.display_name : '',
        gender: normalizeGender(attendee.gender),
        avatarUrl: httpsUrl(attendee.avatar_url),
        status: (attendee.status === 'checked_in' ? 'checked_in' : 'approved') as
          'approved' | 'checked_in',
        card: {
          rides90d: finiteNumberOrNull(card.rides90d),
          longestKm: finiteNumberOrNull(card.longestKm),
          elevationM: finiteNumberOrNull(card.elevationM),
          speedKmh: finiteNumberOrNull(card.speedKmh),
        },
      };
```

- [ ] **Step 6: 更新个人名片映射校验与返回**

将 `miniprogram/repositories/cloud.ts` 第 505-506 行替换为：

```ts
  if (typeof profile.display_name !== 'string') return invalidResponse();
```

将同文件第 542-546 行映射中的 `profile` 替换为：

```ts
    profile: {
      displayName: profile.display_name,
      gender: normalizeGender(profile.gender),
      avatarUrl: httpsUrl(profile.avatar_url),
    },
```

- [ ] **Step 7: 更新报名映射的性别**

将 `miniprogram/repositories/cloud.ts` 第 608 行 `gender: '',` 替换为：

```ts
      gender: normalizeGender(
        typeof capability.gender === 'string'
          ? capability.gender
          : typeof snapshot.gender === 'string'
            ? snapshot.gender
            : '',
      ),
```

注意：同函数第 605 行 `title: typeof capability.title === 'string' ? capability.title : ''` **保留不动**（`Profile.title` 仍是数据库兼容字段，仅展示层移除）。

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run tests/cloud-repository.test.ts`

Expected: PASS。

- [ ] **Step 9: 提交（合并 Task 6 模型改动）**

```bash
git add miniprogram/models/index.ts miniprogram/repositories/cloud.ts tests/cloud-repository.test.ts
git commit -m "feat(client): 模型与云仓库映射移除骑友称号并输出性别"
```

---

## Task 8: 报名表单校验新增性别门禁

**Files:**
- Modify: `miniprogram/utils/validation.ts`
- Test: `tests/domain.test.ts`

- [ ] **Step 1: 在表单校验测试末尾追加性别用例**

在 `tests/domain.test.ts` 的 `describe('表单校验', () => { ... })` 块内、最后一个 `it(...)`（第 186-196 行）之后追加：

```ts
  it('缺少性别时阻断并提示先在个人资料选择', () => {
    expect(
      validateRegistration({
        profile: { ...profile, gender: '' },
        gatheringMode: 'self_drive',
        experience: '常骑',
        readiness: ready,
      }),
    ).toContain('请先在个人资料中选择性别');
  });
  it('性别为非法值时同样阻断', () => {
    expect(
      validateRegistration({
        profile: { ...profile, gender: '保密' },
        gatheringMode: 'self_drive',
        experience: '常骑',
        readiness: ready,
      }),
    ).toContain('请先在个人资料中选择性别');
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/domain.test.ts -t "性别"`

Expected: FAIL，预期错误信息未出现。

- [ ] **Step 3: 实现性别校验**

将 `miniprogram/utils/validation.ts` 第 1 行替换为：

```ts
import type { Profile, StravaReadiness } from '../models';
import { normalizeGender } from './gender';
```

在同文件第 19 行 `if (!v.profile.nickname.trim()) e.push('请填写昵称');` 之后加入：

```ts
  if (normalizeGender(v.profile.gender) === '') e.push('请先在个人资料中选择性别');
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/domain.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/validation.ts tests/domain.test.ts
git commit -m "feat(registration): 报名校验新增性别门禁"
```

---

## Task 9: 删除条形码工具与管理员扫码入口

**Files:**
- Delete: `miniprogram/utils/check-in-code.ts`
- Modify: `miniprogram/pages/credential/index.ts`
- Modify: `miniprogram/pages/admin/reviews/index.ts`
- Modify: `miniprogram/pages/admin/reviews/index.wxml`
- Test: `tests/registration-experience.test.ts`

- [ ] **Step 1: 将报名体验测试精简为仅海报测试**

将 `tests/registration-experience.test.ts` 整个文件替换为：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawActivityPoster } from '../miniprogram/pages/activity-detail/poster';

afterEach(() => vi.unstubAllGlobals());

describe('活动海报', () => {
  const activity: any = {
    title: '环湖骑行',
    startAt: '2026-10-11 08:00',
    route: { start: '湖滨广场', end: '山顶', distanceKm: 80, elevationM: 900 },
  };

  it('包含活动名、时间、地点、路线摘要和小程序进入提示', () => {
    const texts: string[] = [];
    const context: any = {
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      fillText: vi.fn((text: string) => texts.push(text)),
      measureText: (text: string) => ({ width: text.length * 12 }),
    };
    expect(drawActivityPoster(context, 375, 600, activity)).toBe(true);
    expect(texts.join('|')).toContain('环湖骑行');
    expect(texts.join('|')).toContain('时间');
    expect(texts.join('|')).toContain('湖滨广场');
    expect(texts.join('|')).toContain('路线摘要');
    expect(texts.join('|')).toContain('微信搜索「此里」小程序进入活动');
  });

  it('画布或尺寸无效时失败且可由页面按钮重试', () => {
    expect(drawActivityPoster(null, 375, 600, activity)).toBe(false);
    expect(drawActivityPoster({}, 0, 600, activity)).toBe(false);
  });
});

describe('管理员审批页不再提供扫码入口', () => {
  it('页面脚本不包含 scanCheckIn 与 check-in-code 引用', async () => {
    let definition: any;
    vi.stubGlobal('wx', { cloud: {} });
    vi.stubGlobal('Page', (pageDefinition: any) => {
      definition = pageDefinition;
    });
    vi.resetModules();
    await import('../miniprogram/pages/admin/reviews/index');
    expect(definition).not.toHaveProperty('scanCheckIn');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/registration-experience.test.ts`

Expected: FAIL，页面仍定义 `scanCheckIn`。

- [ ] **Step 3: 删除条形码工具文件**

删除 `miniprogram/utils/check-in-code.ts`。

- [ ] **Step 4: 凭证页移除条码逻辑**

将 `miniprogram/pages/credential/index.ts` 第 5 行删除（即删除 `import { buildCheckInCode, drawCode128 } from '../../utils/check-in-code';`），第 1-6 行的 import 区变为：

```ts
import { rideService } from '../../services/ride-service';
import { syncPageTheme } from '../../services/theme-service';
import type { ActivityAction } from '../../utils/activity';
import { resolveActivityAction } from '../../utils/activity';
import { formatChinaDateTime } from '../../utils/date-time';
```

将同文件第 53-68 行的 `this.setData(...)` 调用替换为（删除回调 `() => this.drawCredentialCode()`）：

```ts
      this.setData({
        item: {
          ...item,
          updatedAt: formatChinaDateTime(item.updatedAt),
          checkedInAt: formatChinaDateTime(item.checkedInAt),
        },
        activity: {
          ...activity,
          displayDateTime: formatChinaDateTime(activity.startAt || activity.date),
        },
        statusText,
        activityAction: resolveActivityAction(activity, item),
      });
```

将同文件第 75-96 行整个 `drawCredentialCode()` 方法删除（连同其后逗号一并删除，使 `onLoad` 与 `onShareAppMessage` 之间仅保留正常逗号分隔）。

- [ ] **Step 5: 审批列表页移除扫码方法**

将 `miniprogram/pages/admin/reviews/index.ts` 第 5-6 行删除（即删除空行与 `import { parseCheckInScan } from '../../../utils/check-in-code';`），使文件前 4 行为：

```ts
import { rideService } from '../../../services/ride-service';
import { syncPageTheme } from '../../../services/theme-service';
import { appStore } from '../../../store/app-store';
```

将同文件第 111-129 行整个 `scanCheckIn()` 方法删除（连同方法后逗号，使 `filter` 与 `sendReminders` 之间保持正常逗号分隔）。

- [ ] **Step 6: 审批列表模板移除扫码按钮**

将 `miniprogram/pages/admin/reviews/index.wxml` 第 6 行替换为：

```xml
  <view class="row actions" wx:if="{{activities.length}}"><button class="secondary" bindtap="sendReminders" loading="{{sendingReminders}}" disabled="{{sendingReminders}}">发送活动提醒</button></view>
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run tests/registration-experience.test.ts`

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add miniprogram/utils/check-in-code.ts miniprogram/pages/credential/index.ts miniprogram/pages/admin/reviews/index.ts miniprogram/pages/admin/reviews/index.wxml tests/registration-experience.test.ts
git commit -m "feat(registration): 移除报名条码与管理员扫码核销入口"
```

说明：`git add` 对已删除文件同样生效；若该命令提示文件未跟踪，则改用 `git add -u miniprogram/utils/check-in-code.ts` 并连同其余路径一起提交。

---

## Task 10: 报名确认页、凭证页与审批页展示性别

**Files:**
- Modify: `miniprogram/pages/registration-form/index.ts`
- Modify: `miniprogram/pages/registration-form/index.wxml`
- Modify: `miniprogram/pages/credential/index.wxml`
- Modify: `miniprogram/pages/admin/reviews/index.wxml`
- Modify: `miniprogram/pages/admin/review-detail/index.wxml`
- Modify: `miniprogram/utils/capability-card.ts`
- Modify: `miniprogram/pages/admin/review-detail/index.wxss`
- Test: `tests/capability-card.test.ts`

- [ ] **Step 1: 给管理员能力卡 VM 测试追加性别断言**

在 `tests/capability-card.test.ts` 的 `describe('骑行能力卡状态', () => { ... })` 块内追加：

```ts
  it('输出性别文字与样式类，缺失时为未标注', () => {
    expect(capabilityCard(registration())).toMatchObject({
      gender: '',
      genderLabel: '未标注',
      genderClass: 'gender-unknown',
    });
    expect(
      capabilityCard(registration({ profile: { ...registration().profile, gender: '女' } })),
    ).toMatchObject({ gender: '女', genderLabel: '女', genderClass: 'gender-female' });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/capability-card.test.ts`

Expected: FAIL，缺少 `genderLabel` 等字段。

- [ ] **Step 3: capabilityCard VM 增加性别字段**

将 `miniprogram/utils/capability-card.ts` 第 1-2 行替换为：

```ts
import type { Registration } from '../models';
import { genderView } from './gender';
import { formatChinaDateOnly, formatChinaDateTime } from './date-time';
```

将同文件第 82-103 行 `capabilityCard` 的 `return { ... }` 起始部分替换为（在 `images,` 之前展开性别视图）：

```ts
  return {
    ...genderView(registration.profile.gender),
    images,
    hasMultipleImages: images.length > 1,
    displayName: registration.profile.nickname || registration.profile.realName || '未填写昵称',
    maskedName: maskRealName(registration.profile.realName),
    experience: registration.experience || '未填写',
    remark: registration.remark || '无',
    stravaStatus: status.label,
    statusTone: status.tone,
    totalKm: metric(registration.strava.totalKm, ' km'),
    rides90d: metric(registration.strava.rides90d, ' 次'),
    longestKm: metric(registration.strava.longestKm, ' km'),
    elevationM: metric(registration.strava.elevationM, ' m'),
    speedKmh: metric(registration.strava.speedKmh, ' km/h'),
    coverageRange: coverageFrom && coverageTo ? `${coverageFrom} 至 ${coverageTo}` : '覆盖范围未知',
    coverageState: coverage
      ? coverage.complete
        ? '数据覆盖完整'
        : '数据覆盖不完整'
      : '完整性未知',
    syncedAt,
  };
```

- [ ] **Step 4: 报名确认页 TS 装载性别视图**

在 `miniprogram/pages/registration-form/index.ts` 的 import 区（第 9 行 `import { validateRegistration } ...` 附近）加入：

```ts
import { genderView } from '../../utils/gender';
```

将同文件第 127 行 `profile: profileState.data || null,` 替换为：

```ts
      profile: profileState.data
        ? { ...profileState.data, ...genderView(profileState.data.gender) }
        : null,
```

- [ ] **Step 5: 报名确认页模板增加只读性别行**

将 `miniprogram/pages/registration-form/index.wxml` 第 24-28 行实名信息卡片替换为：

```xml
        <view class="form-card identity-card">
          <view class="identity-main"><view class="identity-label">姓名</view><view class="identity-value">{{profile.realName || '未填写实名'}}</view></view>
          <view class="identity-main"><view class="identity-label">性别</view><view class="identity-value">{{profile.genderLabel}}</view></view>
          <view class="identity-main"><view class="identity-label">手机</view><view class="identity-value">{{profile.phone || '未授权手机号'}}</view></view>
          <button class="text-button identity-action" bindtap="profile" disabled="{{submitting}}">完善资料</button>
        </view>
```

- [ ] **Step 6: 凭证页模板增加性别行并删除条码节点**

将 `miniprogram/pages/credential/index.wxml` 第 13-18 行替换为：

```xml
      <view class="credential-row"><text class="credential-key">骑手</text><text class="credential-value">{{item.profile.realName}}</text></view>
      <view class="credential-row"><text class="credential-key">性别</text><text class="credential-value">{{item.profile.gender || '未标注'}}</text></view>
      <view class="credential-row" wx:if="{{item.gatheringMode}}"><text class="credential-key">集合方式</text><text class="credential-value">{{item.gatheringMode}}</text></view>
      <view wx:if="{{activity.schedule && activity.schedule.length}}" class="meet-info"><view class="meet-label">集合信息</view><view class="meet-value">{{activity.schedule[0].time}} · {{activity.schedule[0].location}}</view></view>
      <view wx:if="{{activity.route.startLocation}}" class="meet-location"><view><view class="meet-label">集合地点</view><view class="meet-value">{{activity.route.startLocation.address || activity.route.start}}</view></view><button bindtap="navigateToMeeting">导航</button></view>
```

（原第 17 行 canvas 与第 18 行条码说明已删除。）

- [ ] **Step 7: 审批列表模板增加性别文本**

将 `miniprogram/pages/admin/reviews/index.wxml` 的数据行（含 `applicant-name` 的第 20 行）替换为：

```xml
    <view class="review-main"><view class="applicant-name">{{item.profile.nickname}}</view><view class="activity-name">{{item.activity.title}}</view><view class="data-line"><text wx:if="{{item.profile.gender}}">{{item.profile.gender}}</text><text>{{item.experience}}</text><text wx:if="{{item.gatheringMode}}">{{item.gatheringMode}}</text><text wx:if="{{item.teamName}}">队伍 {{item.teamName}}{{item.isTeamLeader ? ' · 队长' : ''}}</text><text wx:if="{{item.strava && item.strava.status}}">STRAVA {{item.strava.status}}</text></view></view>
```

- [ ] **Step 8: 审批详情模板能力卡与快照增加性别**

将 `miniprogram/pages/admin/review-detail/index.wxml` 第 6 行替换为：

```xml
    <view class="capability-card {{card.genderClass}}">
```

将同文件第 13 行 facts 行替换为（首位加入性别事实）：

```xml
      <view class="facts"><view class="fact"><text>性别</text><strong>{{card.genderLabel}}</strong></view><view class="fact"><text>骑行经验</text><strong>{{card.experience}}</strong></view><view class="fact" wx:if="{{x.gatheringMode}}"><text>集合方式</text><strong>{{x.gatheringMode}}</strong></view></view>
```

将同文件第 17 行 snapshot-panel 替换为（首位加入性别行）：

```xml
    <view class="snapshot-panel"><view class="panel-code">报名信息</view><view class="title">报名快照</view><view class="detail-line"><text>性别</text><strong>{{x.profile.gender || '未标注'}}</strong></view><view class="detail-line"><text>手机号</text><strong>{{phone}}</strong></view><view class="detail-line"><text>验证来源</text><strong>{{phoneSource}}</strong></view><view class="detail-line"><text>骑行经验</text><strong>{{card.experience}}</strong></view><view class="detail-line" wx:if="{{x.gatheringMode}}"><text>集合方式</text><strong>{{x.gatheringMode}}</strong></view><view class="detail-line" wx:if="{{x.teamName}}"><text>队伍</text><strong>{{x.teamName}}{{x.isTeamLeader ? ' · 队长' : ''}}</strong></view><view class="detail-line"><text>报名备注</text><strong>{{card.remark || '无'}}</strong></view></view>
```

- [ ] **Step 9: 审批详情追加性别样式**

在 `miniprogram/pages/admin/review-detail/index.wxss` 文件末尾追加：

```css
.gender-chip {
  display: inline-flex;
  align-items: center;
  padding: 2rpx 14rpx;
  border: 1rpx solid currentColor;
  border-radius: 4rpx;
  font-size: 22rpx;
  letter-spacing: 4rpx;
}
.capability-card.gender-male .photo-empty {
  box-shadow: inset 0 0 0 2rpx rgba(79, 179, 167, 0.55);
}
.capability-card.gender-female .photo-empty {
  box-shadow: inset 0 0 0 2rpx rgba(239, 128, 114, 0.55);
}
.capability-card.gender-unknown .photo-empty {
  box-shadow: inset 0 0 0 2rpx rgba(233, 116, 63, 0.55);
}
.capability-card.gender-male .fact:first-child strong {
  color: #4fb3a7;
}
.capability-card.gender-female .fact:first-child strong {
  color: #ef8072;
}
.capability-card.gender-unknown .fact:first-child strong {
  color: #e9743f;
}
.theme-light.capability-card,
.theme-light .capability-card.gender-male .fact:first-child strong {
  color: #1f7d72;
}
.theme-light .capability-card.gender-female .fact:first-child strong {
  color: #c54e40;
}
```

- [ ] **Step 10: 运行目标测试确认通过**

Run: `npx vitest run tests/capability-card.test.ts`

Expected: PASS。

- [ ] **Step 11: 提交**

```bash
git add miniprogram/pages/registration-form/index.ts miniprogram/pages/registration-form/index.wxml miniprogram/pages/credential/index.wxml miniprogram/pages/admin/reviews/index.wxml miniprogram/pages/admin/review-detail/index.wxml miniprogram/pages/admin/review-detail/index.wxss miniprogram/utils/capability-card.ts tests/capability-card.test.ts
git commit -m "feat(registration): 报名表单凭证与审批页只读展示性别"
```

---

## Task 11: 个人骑行名片页与个人中心清理称号

**Files:**
- Modify: `miniprogram/utils/personal-card.ts`
- Modify: `miniprogram/pages/capability-card/index.wxml`
- Modify: `miniprogram/pages/capability-card/index.wxss`
- Modify: `miniprogram/pages/profile/index.wxml`
- Test: `tests/personal-card.test.ts`
- Test: `tests/personal-card-page.test.ts`

- [ ] **Step 1: 更新个人名片 VM 测试夹具并新增性别断言**

将 `tests/personal-card.test.ts` 第 6 行替换为：

```ts
  profile: { displayName: '山野骑手', gender: '男' },
```

在同文件 `describe('个人骑行名片 view model', () => { ... })` 块内追加：

```ts
  it('输出性别文字与样式类，缺失时为未标注', async () => {
    const labeled = await build(baseCard);
    expect(labeled).toMatchObject({ gender: '男', genderLabel: '男', genderClass: 'gender-male' });

    const unknown = await build({ ...baseCard, profile: { displayName: '山野骑手', gender: '' } });
    expect(unknown).toMatchObject({
      gender: '',
      genderLabel: '未标注',
      genderClass: 'gender-unknown',
    });
  });
```

- [ ] **Step 2: 更新个人名片页契约测试**

将 `tests/personal-card-page.test.ts` 第 15 行替换为：

```ts
  profile: { displayName: '山野骑手', gender: '男' },
```

将同文件第 281-296 行的样式契约测试替换为：

```ts
  it('长姓名可截断且性别标签与双层指标保持紧凑网格', () => {
    const styles = read('miniprogram/pages/capability-card/index.wxss');
    const riderName = styles.match(/\.rider-name\s*\{([^}]*)\}/)?.[1] || '';
    const genderPill = styles.match(/\.gender-pill\s*\{([^}]*)\}/)?.[1] || '';
    const metricValue = styles.match(/\.metric-value\s*\{([^}]*)\}/)?.[1] || '';

    expect(styles).toMatch(/\.rider-card\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*4/s);
    expect(styles).toContain('.metric-item:nth-child(n + 4)');
    expect(styles).toMatch(/\.metric-item\s*\{[^}]*box-sizing:\s*border-box/s);
    expect(riderName).toContain('-webkit-line-clamp: 2');
    expect(riderName).toMatch(/line-height:\s*1\.[01]/);
    expect(riderName).toContain('text-overflow: ellipsis');
    expect(riderName).not.toContain('white-space: nowrap');
    expect(genderPill).toContain('letter-spacing');
    expect(metricValue).toContain('text-overflow: ellipsis');
  });
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/personal-card.test.ts tests/personal-card-page.test.ts`

Expected: FAIL，VM 仍返回 `title`，且样式中缺少 `.gender-pill`。

- [ ] **Step 4: personalCardViewModel 去 title 增性别**

将 `miniprogram/utils/personal-card.ts` 第 1-2 行替换为：

```ts
import type { PersonalCapabilityCard, PersonalCapabilityCardState } from '../models/index';
import { genderView } from './gender';
import { formatChinaDate, formatChinaDateTime } from './date-time';
```

将同文件第 71-73 行返回对象中的：

```ts
    displayName: card.profile.displayName || '此里骑手',
    title: card.profile.title,
    avatarUrl: card.profile.avatarUrl || '',
```

替换为：

```ts
    ...genderView(card.profile.gender),
    displayName: card.profile.displayName || '此里骑手',
    avatarUrl: card.profile.avatarUrl || '',
```

- [ ] **Step 5: 个人名片页模板替换称号**

将 `miniprogram/pages/capability-card/index.wxml` 第 11 行替换为：

```xml
      <view class="rider-card {{card.genderClass}}">
```

将同文件第 50-54 行 identity-block 替换为：

```xml
          <view class="identity-block">
            <view class="rider-name">{{card.displayName}}</view>
            <view class="gender-pill {{card.genderClass}}">{{card.genderLabel}}</view>
            <view class="privacy-note">仅自己可见 · 不会用于活动报名审核</view>
          </view>
```

- [ ] **Step 6: 个人名片页样式追加性别标签**

在 `miniprogram/pages/capability-card/index.wxss` 文件末尾追加：

```css
.gender-pill {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  margin-top: 12rpx;
  padding: 4rpx 18rpx;
  border: 1rpx solid currentColor;
  border-radius: 6rpx;
  font-size: 24rpx;
  letter-spacing: 6rpx;
}
.rider-card.gender-male .gender-pill {
  color: #4fb3a7;
}
.rider-card.gender-female .gender-pill {
  color: #ef8072;
}
.rider-card.gender-unknown .gender-pill {
  color: #e9743f;
}
.rider-card.gender-male .alpine-fallback .fallback-mark {
  color: #4fb3a7;
}
.rider-card.gender-female .alpine-fallback .fallback-mark {
  color: #ef8072;
}
.theme-light .rider-card.gender-male .gender-pill {
  color: #1f7d72;
}
.theme-light .rider-card.gender-female .gender-pill {
  color: #c54e40;
}
```

- [ ] **Step 7: 个人中心移除称号展示**

将 `miniprogram/pages/profile/index.wxml` 第 48 行整行删除：

```xml
        <view class="profile-title" wx:if="{{heroCard && heroCard.title}}">{{heroCard.title}}</view>
```

删除后第 47 行 `profile-name` 与第 49 行 `auth-line` 相邻，其余结构不变。

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run tests/personal-card.test.ts tests/personal-card-page.test.ts tests/profile-page.test.ts`

Expected: PASS。

- [ ] **Step 9: 提交**

```bash
git add miniprogram/utils/personal-card.ts miniprogram/pages/capability-card/index.wxml miniprogram/pages/capability-card/index.wxss miniprogram/pages/profile/index.wxml tests/personal-card.test.ts tests/personal-card-page.test.ts
git commit -m "feat(profile): 个人名片按性别展示并清理骑友称号"
```

---

## Task 12: 活动详情费用明细展示与公开骑友卡性别

**Files:**
- Modify: `miniprogram/pages/activity-detail/index.ts`
- Modify: `miniprogram/pages/activity-detail/index.wxml`
- Modify: `miniprogram/pages/activity-detail/index.wxss`
- Test: `tests/activity-detail-design.test.ts`

- [ ] **Step 1: 更新活动详情契约测试**

将 `tests/activity-detail-design.test.ts` 第 145-153 行所在的骑友卡模板契约块替换为以下断言（保留原头像断言，新增性别与去称号断言）：

```ts
    expect(template).toContain('src="{{selectedAttendee.avatarUrl || defaultAttendeeAvatar}}"');
    expect(template).toContain('binderror="selectedAttendeeAvatarError"');
    expect(template).toContain('class="gender-pill {{selectedAttendee.genderClass}}"');
    expect(template).toContain('{{selectedAttendee.genderLabel}}');
    expect(template).not.toContain('selectedAttendee.title');
    expect(template).not.toContain('骑行爱好者');
    expect(
      template.match(/<text wx:if="\{\{selectedAttendee\.card\.[a-zA-Z0-9]+ !== null\}\}">/g),
    ).toBeTruthy();
```

在同文件中新增一个费用明细模板断言（放在该 `it(...)` 块之后）：

```ts
  it('费用卡支持费用说明、包含与不包含三段', () => {
    const template = readFileSync('miniprogram/pages/activity-detail/index.wxml', 'utf8');
    expect(template).toContain('fee-block-title">费用包含');
    expect(template).toContain('fee-block-title">费用不包含');
    expect(template).toContain('wx:for="{{item.feeIncluded}}"');
    expect(template).toContain('wx:for="{{item.feeExcluded}}"');
  });
```

确认该文件顶部已导入 `readFileSync`（现有测试已使用，无需新增 import）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/activity-detail-design.test.ts`

Expected: FAIL，模板缺少性别与费用明细断言对应内容。

- [ ] **Step 3: 页面 TS 打开骑友卡时补充性别视图**

在 `miniprogram/pages/activity-detail/index.ts` 顶部 import 区加入：

```ts
import { genderView } from '../../utils/gender';
```

将同文件第 179-183 行 `openAttendeeCard` 替换为：

```ts
  openAttendeeCard(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const attendee = this.data.attendees[index];
    if (attendee)
      this.safeSetData({ selectedAttendee: { ...attendee, ...genderView(attendee.gender) } });
  },
```

- [ ] **Step 4: 费用卡模板扩展**

将 `miniprogram/pages/activity-detail/index.wxml` 第 83 行替换为：

```xml
        <view class="card fee-card" wx:if="{{item.fee || (item.feeIncluded && item.feeIncluded.length) || (item.feeExcluded && item.feeExcluded.length)}}">
          <view class="card-index">04</view>
          <view class="title">费用说明</view>
          <view class="body-text" wx:if="{{item.fee}}">{{item.fee}}</view>
          <view class="fee-block" wx:if="{{item.feeIncluded && item.feeIncluded.length}}">
            <view class="fee-block-title">费用包含</view>
            <view class="fee-item" wx:for="{{item.feeIncluded}}" wx:for-item="fee" wx:key="*this"><text class="fee-mark fee-included">+</text><text>{{fee}}</text></view>
          </view>
          <view class="fee-block" wx:if="{{item.feeExcluded && item.feeExcluded.length}}">
            <view class="fee-block-title">费用不包含</view>
            <view class="fee-item" wx:for="{{item.feeExcluded}}" wx:for-item="fee" wx:key="*this"><text class="fee-mark fee-excluded">−</text><text>{{fee}}</text></view>
          </view>
        </view>
```

- [ ] **Step 5: 骑友卡弹层替换称号为性别标签**

将 `miniprogram/pages/activity-detail/index.wxml` 第 96 行替换为：

```xml
      <view class="rider-identity"><view class="rider-name">{{selectedAttendee.displayName || '此里骑手'}}</view><view class="gender-pill {{selectedAttendee.genderClass}}">{{selectedAttendee.genderLabel}}</view><view class="rider-status">{{selectedAttendee.status === 'checked_in' ? '已签到' : '已报名'}}</view></view>
```

- [ ] **Step 6: 页面样式追加费用与性别样式**

在 `miniprogram/pages/activity-detail/index.wxss` 文件末尾追加：

```css
.fee-block {
  margin-top: 16rpx;
}
.fee-block-title {
  font-size: 26rpx;
  letter-spacing: 4rpx;
  margin-bottom: 8rpx;
}
.fee-item {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  font-size: 26rpx;
  line-height: 1.5;
}
.fee-mark {
  font-weight: 700;
}
.fee-included {
  color: #2f8f83;
}
.fee-excluded {
  color: #d55b1f;
}
.rider-card .gender-pill {
  display: inline-flex;
  align-items: center;
  padding: 2rpx 14rpx;
  border: 1rpx solid currentColor;
  border-radius: 4rpx;
  font-size: 22rpx;
  letter-spacing: 4rpx;
  margin: 8rpx 0;
}
.rider-card .gender-pill.gender-male {
  color: #4fb3a7;
}
.rider-card .gender-pill.gender-female {
  color: #ef8072;
}
.rider-card .gender-pill.gender-unknown {
  color: #e9743f;
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run tests/activity-detail-design.test.ts`

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add miniprogram/pages/activity-detail/index.ts miniprogram/pages/activity-detail/index.wxml miniprogram/pages/activity-detail/index.wxss tests/activity-detail-design.test.ts
git commit -m "feat(activity): 详情展示费用明细并为公开骑友卡标注性别"
```

---

## Task 13: 活动编辑页日程编辑器

**Files:**
- Modify: `miniprogram/pages/admin/activity-edit/index.ts`
- Modify: `miniprogram/pages/admin/activity-edit/index.wxml`
- Modify: `miniprogram/pages/admin/activity-edit/index.wxss`
- Test: `tests/activity-admin-edit.test.ts`

- [ ] **Step 1: 新增日程编辑测试**

在 `tests/activity-admin-edit.test.ts` 的顶层 `describe(...)` 块内追加以下两个用例：

```ts
  it('日程支持新增、编辑、删除并在保存时输出规范化结果', async () => {
    await page.onLoad({ id: activity.id });
    page.addScheduleRow();
    page.data.schedule = [{ time: '', title: '', location: '', remark: '' }];

    const scheduleEvent = (field: string, value: string) => ({
      currentTarget: { dataset: { index: 0, field } },
      detail: { value },
    });
    page.scheduleField(scheduleEvent('time', '07:30'));
    page.scheduleField(scheduleEvent('title', '集合整备'));
    page.scheduleField(scheduleEvent('location', '北门'));
    // 测试桩 setData 不展开 bracket key，这里手工对齐页面数据。
    page.data.schedule[0] = { time: '07:30', title: '集合整备', location: '北门', remark: '' };

    await page.save({ currentTarget: { dataset: {} } });
    const submitted = rideService.saveActivity.mock.calls[0][0];
    expect(submitted.schedule).toEqual([
      { time: '07:30', title: '集合整备', location: '北门' },
    ]);
  });

  it('日程不完整时阻止保存并指出具体行号与缺失字段', async () => {
    await page.onLoad({ id: activity.id });
    page.data.schedule = [{ time: '', title: '', location: '', remark: '' }];

    await page.save({ currentTarget: { dataset: {} } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(page.data.error).toContain('第 1 行日程缺少时间、事项');
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/activity-admin-edit.test.ts`

Expected: FAIL，`page.addScheduleRow is not a function`。

- [ ] **Step 3: 实现日程规范化函数**

在 `miniprogram/pages/admin/activity-edit/index.ts` 中，将第 57-61 行的 `lines` 函数之后加入：

```ts
type ScheduleRow = {
  time: string;
  title: string;
  location: string;
  remark?: string;
};

function validatedSchedule(rows: ScheduleRow[]): ScheduleRow[] {
  if (rows.length > 50) throw new Error('日程最多 50 行');
  return rows.map((row, index) => {
    const time = row.time.trim();
    const title = row.title.trim();
    const location = row.location.trim();
    const remark = typeof row.remark === 'string' ? row.remark.trim() : '';
    if (!time || !title) {
      const missing = [!time ? '时间' : '', !title ? '事项' : ''].filter(Boolean).join('、');
      throw new Error(`第 ${index + 1} 行日程缺少${missing}`);
    }
    return {
      time: time.slice(0, 20),
      title: title.slice(0, 100),
      location: location.slice(0, 200),
      ...(remark ? { remark: remark.slice(0, 500) } : {}),
    };
  });
}
```

- [ ] **Step 4: 实现日程交互方法**

在 `miniprogram/pages/admin/activity-edit/index.ts` 的 Page 定义中，于 `assetField(event: any) { ... }` 方法之后加入：

```ts
  addScheduleRow() {
    if (this.data.schedule.length >= 50) {
      this.setData({ error: '日程最多 50 行' });
      return;
    }
    this.setData({
      schedule: [
        ...this.data.schedule,
        { time: '', title: '', location: '', remark: '' } as ScheduleRow,
      ],
    });
  },
  removeScheduleRow(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.schedule.length) return;
    this.setData({
      schedule: this.data.schedule.filter(
        (_: ScheduleRow, itemIndex: number) => itemIndex !== index,
      ),
    });
  },
  scheduleField(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    const fieldName = String(event.currentTarget.dataset.field || '');
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.data.schedule.length ||
      !['time', 'title', 'location', 'remark'].includes(fieldName)
    )
      return;
    this.setData({ [`schedule[${index}].${fieldName}`]: event.detail.value });
  },
```

- [ ] **Step 5: save 流程接入日程校验**

在 `miniprogram/pages/admin/activity-edit/index.ts` 的 `save` 方法中，将第 379-381 行 `const hasFee = ...` 之前加入：

```ts
    let schedule: ScheduleRow[];
    try {
      schedule = validatedSchedule(this.data.schedule);
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '日程校验失败' });
      return;
    }
```

将同方法第 423 行 `schedule: this.data.schedule,` 替换为：

```ts
      schedule,
```

将保存成功回填（第 454 行）`schedule: saved.schedule,` 替换为：

```ts
        schedule,
```

- [ ] **Step 6: 模板新增日程编辑区**

在 `miniprogram/pages/admin/activity-edit/index.wxml` 第 76 行（`03 · 时间与路线` form-card 的闭合 `</view>`）之后、第 78 行 `04 · 补充说明` 之前插入：

```xml
    <view class="section-label">04 · 日程安排</view>
    <view class="form-card">
      <view class="hint">按时间顺序填写，时间与事项必填；最多 50 行</view>
      <view class="schedule-edit-row" wx:for="{{schedule}}" wx:key="index">
        <view class="schedule-edit-head">
          <text class="schedule-edit-index">{{index + 1}}</text>
          <button size="mini" data-index="{{index}}" bindtap="removeScheduleRow">删除</button>
        </view>
        <input value="{{item.time}}" data-index="{{index}}" data-field="time" bindinput="scheduleField" maxlength="20" placeholder="时间（必填）" />
        <input value="{{item.title}}" data-index="{{index}}" data-field="title" bindinput="scheduleField" maxlength="100" placeholder="事项（必填）" />
        <input value="{{item.location}}" data-index="{{index}}" data-field="location" bindinput="scheduleField" maxlength="200" placeholder="地点（选填）" />
        <input value="{{item.remark}}" data-index="{{index}}" data-field="remark" bindinput="scheduleField" maxlength="500" placeholder="备注（选填）" />
      </view>
      <button class="media-add" disabled="{{saving || schedule.length >= 50}}" bindtap="addScheduleRow">添加日程行</button>
    </view>
```

将原第 78 行 `<view class="section-label">04 · 补充说明</view>` 改为：

```xml
    <view class="section-label">05 · 补充说明</view>
```

- [ ] **Step 7: 样式追加日程编辑器**

在 `miniprogram/pages/admin/activity-edit/index.wxss` 文件末尾追加：

```css
.schedule-edit-row {
  border: 1rpx solid rgba(255, 255, 255, 0.12);
  border-radius: 8rpx;
  padding: 16rpx;
  margin-bottom: 16rpx;
}
.schedule-edit-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}
.schedule-edit-index {
  font-size: 26rpx;
  letter-spacing: 4rpx;
  opacity: 0.7;
}
.schedule-edit-row input {
  margin-bottom: 10rpx;
}
.theme-light .schedule-edit-row {
  border-color: rgba(0, 0, 0, 0.12);
}
```

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run tests/activity-admin-edit.test.ts`

Expected: PASS。

- [ ] **Step 9: 提交**

```bash
git add miniprogram/pages/admin/activity-edit/index.ts miniprogram/pages/admin/activity-edit/index.wxml miniprogram/pages/admin/activity-edit/index.wxss tests/activity-admin-edit.test.ts
git commit -m "feat(activity-edit): 支持活动日程行编辑与保存校验"
```

---

## Task 14: 活动编辑页费用包含与不包含编辑

**Files:**
- Modify: `miniprogram/pages/admin/activity-edit/index.ts`
- Modify: `miniprogram/pages/admin/activity-edit/index.wxml`
- Modify: `miniprogram/pages/admin/activity-edit/index.wxss`
- Test: `tests/activity-admin-edit.test.ts`

- [ ] **Step 1: 新增费用明细编辑测试**

在 `tests/activity-admin-edit.test.ts` 的顶层 `describe(...)` 块内追加：

```ts
  it('费用包含与不包含按多行文本拆分、trim 并过滤空行', async () => {
    await page.onLoad({ id: activity.id });
    page.feeField({
      currentTarget: { dataset: { name: 'feeIncludedText' } },
      detail: { value: '保险\n\n 交通 \n' },
    });
    page.feeField({
      currentTarget: { dataset: { name: 'feeExcludedText' } },
      detail: { value: '午餐' },
    });
    page.data.feeIncludedText = '保险\n\n 交通 \n';
    page.data.feeExcludedText = '午餐';

    await page.save({ currentTarget: { dataset: {} } });
    const submitted = rideService.saveActivity.mock.calls[0][0];
    expect(submitted.feeIncluded).toEqual(['保险', '交通']);
    expect(submitted.feeExcluded).toEqual(['午餐']);
  });

  it('费用明细超过 50 项或单项超长时阻止保存', async () => {
    await page.onLoad({ id: activity.id });
    page.data.feeIncludedText = Array.from({ length: 51 }, (_, index) => `项目${index}`).join('\n');

    await page.save({ currentTarget: { dataset: {} } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(page.data.error).toContain('费用包含最多 50 项');
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/activity-admin-edit.test.ts -t "费用"`

Expected: FAIL，`page.feeField is not a function`。

- [ ] **Step 3: 实现费用行规范化函数**

在 `miniprogram/pages/admin/activity-edit/index.ts` 中，于 Task 13 新增的 `validatedSchedule` 函数之后加入：

```ts
function validatedFeeLines(text: string, label: string): string[] {
  const items = lines(text);
  if (items.length > 50) throw new Error(`${label}最多 50 项`);
  return items.map((item) => {
    if (item.length > 200) throw new Error(`${label}每项不能超过 200 字`);
    return item;
  });
}
```

- [ ] **Step 4: data 与加载映射补充文本字段**

将 `miniprogram/pages/admin/activity-edit/index.ts` 第 98-99 行：

```ts
    feeIncluded: [] as string[],
    feeExcluded: [] as string[],
```

替换为：

```ts
    feeIncluded: [] as string[],
    feeExcluded: [] as string[],
    feeIncludedText: '',
    feeExcludedText: '',
```

将 onLoad 回填的第 171-173 行：

```ts
        feeIncluded: activity.feeIncluded || [],
        feeExcluded: activity.feeExcluded || [],
        form,
```

替换为：

```ts
        feeIncluded: activity.feeIncluded || [],
        feeExcluded: activity.feeExcluded || [],
        feeIncludedText: (activity.feeIncluded || []).join('\n'),
        feeExcludedText: (activity.feeExcluded || []).join('\n'),
        form,
```

- [ ] **Step 5: 实现 feeField 方法**

在 `miniprogram/pages/admin/activity-edit/index.ts` Page 定义中，于 Task 13 新增的 `scheduleField(event: any) { ... }` 方法之后加入：

```ts
  feeField(event: any) {
    const name = String(event.currentTarget.dataset.name || '');
    if (name !== 'feeIncludedText' && name !== 'feeExcludedText') return;
    this.setData({ [name]: event.detail.value });
  },
```

- [ ] **Step 6: save 流程接入费用明细规范化**

在 `miniprogram/pages/admin/activity-edit/index.ts` 的 `save` 方法中，将 Task 13 加入的日程校验块之后加入：

```ts
    let feeIncluded: string[];
    let feeExcluded: string[];
    try {
      feeIncluded = validatedFeeLines(this.data.feeIncludedText, '费用包含');
      feeExcluded = validatedFeeLines(this.data.feeExcludedText, '费用不包含');
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '费用明细校验失败' });
      return;
    }
```

将第 379-381 行 `const hasFee = ...` 替换为：

```ts
    const hasFee = Boolean(f.fee.trim() || feeIncluded.length || feeExcluded.length);
```

将第 426-432 行费用输出替换为：

```ts
      ...(hasFee
        ? {
            fee: f.fee,
            feeIncluded,
            feeExcluded,
          }
        : {}),
```

将保存成功回填的第 462-463 行：

```ts
        feeIncluded: saved.feeIncluded || [],
        feeExcluded: saved.feeExcluded || [],
```

替换为：

```ts
        feeIncluded,
        feeExcluded,
        feeIncludedText: feeIncluded.join('\n'),
        feeExcludedText: feeExcluded.join('\n'),
```

- [ ] **Step 7: 模板新增费用包含/不包含多行编辑**

将 `miniprogram/pages/admin/activity-edit/index.wxml`（编号已改为 `05 · 补充说明` 的 form-card）中的费用说明行：

```xml
      <view class="field"><text>费用说明</text><input value="{{form.fee}}" data-name="fee" bindinput="field" /></view>
```

替换为：

```xml
      <view class="field"><text>费用说明</text><input value="{{form.fee}}" data-name="fee" bindinput="field" /></view>
      <view class="field">
        <view class="field-heading"><text>费用包含</text><text class="counter">{{feeIncludedText.length}}/10000</text></view>
        <view class="hint">每行一项，最多 50 项，每项不超过 200 字</view>
        <textarea value="{{feeIncludedText}}" data-name="feeIncludedText" bindinput="feeField" maxlength="10000" />
      </view>
      <view class="field">
        <view class="field-heading"><text>费用不包含</text><text class="counter">{{feeExcludedText.length}}/10000</text></view>
        <textarea value="{{feeExcludedText}}" data-name="feeExcludedText" bindinput="feeField" maxlength="10000" />
      </view>
```

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run tests/activity-admin-edit.test.ts`

Expected: PASS。

- [ ] **Step 9: 提交**

```bash
git add miniprogram/pages/admin/activity-edit/index.ts miniprogram/pages/admin/activity-edit/index.wxml tests/activity-admin-edit.test.ts
git commit -m "feat(activity-edit): 支持费用包含与不包含清单编辑"
```

---

## Task 15: 路线操作回归契约、功能升级日志与全量门禁

**Files:**
- Modify: `tests/activity-detail-design.test.ts`
- Modify: `miniprogram/pages/settings/index.ts`

- [ ] **Step 1: 新增四类路线操作回归契约**

在 `tests/activity-detail-design.test.ts` 中新增一个 `it` 块（与现有 `it` 同级）：

```ts
  it('路线操作完整保留复制 Strava 路线、活动链接、海报与 GPX 四项', () => {
    const template = readFileSync('miniprogram/pages/activity-detail/index.wxml', 'utf8');
    expect(template).toContain('bindtap="openStravaRoute"');
    expect(template).toContain('复制 Strava 路线');
    expect(template).toContain('bindtap="copyActivityLink"');
    expect(template).toContain('复制活动链接');
    expect(template).toContain('bindtap="generatePoster"');
    expect(template).toContain('保存分享海报');
    expect(template).toContain('bindtap="exportGpx"');
    expect(template).toContain('导出 GPX');
  });
```

- [ ] **Step 2: 运行契约确认通过（不变量已保留）**

Run: `npx vitest run tests/activity-detail-design.test.ts`

Expected: PASS。若失败，说明某步误删路线操作，必须恢复后再继续。

- [ ] **Step 3: 更新功能升级日志**

将 `miniprogram/pages/settings/index.ts` 第 4-15 行当前第一条记录（`version: '2026.10.08.5'`）的 `latest: true,` 改为 `latest: false,`。

在 `const RELEASE_NOTES = [` 之后、原第一条记录之前插入新记录：

```ts
  {
    version: '2026.10.09.1',
    date: '2026-10-09',
    title: '报名与活动信息简化',
    summary: '移除条码与扫码核销，报名明确标注性别，活动编辑补齐日程与费用明细。',
    latest: true,
    features: [
      '报名凭证与审批详情均展示性别，现场由管理员手动确认签到',
      '活动编辑支持日程行编辑与费用包含、费用不包含清单',
      '个人名片与骑友卡按性别区分视觉，且始终保留文字标签',
    ],
  },
```

- [ ] **Step 4: 重新生成部署副本并执行全量门禁**

Run: `npm run cloud:prepare && npm run validate`

Expected: 全部通过，包含：prettier、eslint、typecheck、前端 vitest、云函数 node:test、云包 hash 校验、功能升级日志校验、构建。若有任一失败，就地修复后重跑该命令，直到全绿。

- [ ] **Step 5: 核对 git 状态未混入验证文档**

Run: `git status --short`

Expected: `docs/verification/README.md`、`docs/verification/p0-real-registration-journey.md`、`docs/verification/2026-10-09-core-flow-e2e.md` 仍保持未提交状态；没有其他意外文件。

- [ ] **Step 6: 提交**

```bash
git add tests/activity-detail-design.test.ts miniprogram/pages/settings/index.ts
git commit -m "chore(release): 记录报名与活动简化升级日志并补路线回归契约"
```

---

## 计划自审结论

- **规格覆盖**：移除条码（Task 9）、保留手工签到（Task 10 未改动 checkIn 流程，Task 15 回归）、性别个人资料维护并只读带入（Task 1、7、8、10）、性别文字标签与差异化背景（Task 10、11、12）、schedule 编辑（Task 13）、feeIncluded/feeExcluded 编辑（Task 14）与展示（Task 12）、清理 title 展示但保留模型字段（Task 2、3、4、7、11）、四类路线操作保留（Task 15）均有对应任务。
- **占位符**：所有代码步骤均给出完整代码，无 TBD/TODO。
- **命名一致性**：云函数统一 `normalizeGender`，客户端统一 `normalizeGender`/`genderView`/`genderLabel`/`genderClass`，样式类统一 `gender-male`/`gender-female`/`gender-unknown`；快照字段统一 `gender`。
- **不变量保护**：`Profile.title`、`mapRegistration.title` 保留；`checkInRegistration` 保留；四类路线操作有显式契约；验证文档有显式保护步骤。
