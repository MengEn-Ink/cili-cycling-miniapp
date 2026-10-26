# PR341 媒体兼容与本人预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复当前引用和 canonical 路径兼容，独立交付本人预览与用途边界。

**Architecture:** 公开校验按登记的原始 source 绑定版本，路径只消费明确 canonical_category。批量查询原始和 canonical 引用，重复、失败与截断拒绝受影响批次。本人预览仍是认证的私人 DTO，原接口保留兼容。

**Tech Stack:** CommonJS、node:test、wx-server-sdk、当前 CloudBase 发布和证据门禁。

执行记录：Tasks 1–3 实现和 RED/GREEN 回归完成，四个七步单测流程及 flush 完成。独立规格、三组代码与跨组复审通过；严格同步、治理、全量 validate（1297 项 Vitest、13 个云包、三宽度）与安全审计通过。Task 4 剩余提交、PR/main、部署和上传回执核验；现场失败与 P0 见本片交付报告。

---

## Task 1：公开校验兼容

Files: 修改 `cloudfunctions/activity-read/public-avatar.js`；补充 `public-avatar.node-test.js`。

- [ ] 写入 source/canonical × other/profile-avatar × 旧/明确 profile-avatar 路径矩阵，并覆盖背景、伪造路径和 null。

```js
for (const category of ['other', 'profile-avatar'])
  for (const canonical_category of [undefined, 'profile-avatar'])
    for (const canonicalReference of [false, true]) {
      const { profile, record } = canonicalFixture();
      record.category = category;
      record.canonical_category = canonical_category;
      if (canonical_category)
        record.canonical_file_id = record.canonical_file_id.replace(
          `/${mediaDocumentId(record.file_id)}/`,
          `/profile-avatar/${mediaDocumentId(record.file_id)}/`,
        );
      if (canonicalReference) profile.avatar_file_id = record.canonical_file_id;
      assert.equal(canonicalPublicAvatar(profile, record, OWNER_OPENID, MEDIA_SECRET),
        record.canonical_file_id);
    }
```

- [ ] RED：`perl -e 'alarm shift; exec @ARGV' 120 node --test cloudfunctions/activity-read/public-avatar.node-test.js`，新矩阵失败。
- [ ] 实现原始源与当前引用区分，保留所有完整元数据校验。

```js
const sourceFileId = record && record.file_id;
const canonicalCategory = record && record.canonical_category;
const categoryPath = canonicalCategory ? `${canonicalCategory}/` : '';
const expectedPath = `profile-canonical/${ownerAlias}/${categoryPath}${mediaDocumentId(sourceFileId)}/${record.sha256}.${extension}`;
```

使用 `sourceFileId` 校验 `_id`、`source_file_id`；当前引用必须等于 source 或 canonical。明确类别只能为对应头像/背景用途，undefined/空字符串代表旧路径；其它类型拒绝。有 `background_photo` 字段时只消费该槽位：

```js
const value = profile && Object.prototype.hasOwnProperty.call(profile, 'background_photo')
  ? profile.background_photo : legacy;
return validPhoto(value) ? { fileId: value.file_id, category: value.category } : undefined;
```

- [ ] GREEN：同一命令通过；保留 #358 业务类别映射，不从 record.category 猜测路径。

## Task 2：批量唯一反查

Files: 新建 `cloudfunctions/activity-read/profile-media.js`；修改 `index.js`、`index.node-test.js`。新增读取器通过真实入口的数据库 fixture 覆盖。

- [ ] 在现有详情测试 fixture 加 canonical_file_id 过滤；写 source/canonical 详情、双绑定、失败与 100 条截断测试。
- [ ] RED：逐个文件运行 `perl -e 'alarm shift; exec @ARGV' 120 node --test <上述测试文件>`，确认 canonical 详情失败。
- [ ] 提取以下接口；20 引用一批，分别查询 `_id in hash(batch)` / `canonical_file_id in batch`，反查 limit100 且返回 >=100 拒绝该批，任一读取失败也拒绝该批。

```js
async function loadProfileMediaRecords(fileIds, { collection, inValues }) {
  const records = new Map();
  const references = [...new Set(fileIds)];
  for (let offset = 0; offset < references.length; offset += 20) {
    const batch = references.slice(offset, offset + 20);
    const candidates = new Map(batch.map((id) => [id, []]));
    try {
      const direct = await collection.where({
        _id: inValues(batch.map(mediaDocumentId)),
      }).limit(20).get();
      const canonical = await collection.where({
        canonical_file_id: inValues(batch),
      }).limit(100).get();
      if (!Array.isArray(direct.data) || !Array.isArray(canonical.data) ||
          canonical.data.length >= 100) continue;
      for (const record of direct.data)
        if (candidates.has(record.file_id) &&
            record._id === mediaDocumentId(record.file_id))
          candidates.get(record.file_id).push(record);
      for (const record of canonical.data)
        if (candidates.has(record.canonical_file_id))
          candidates.get(record.canonical_file_id).push(record);
      for (const [reference, matches] of candidates)
        if (matches.length === 1) records.set(reference, matches[0]);
    } catch {
      // 未能证实唯一绑定的批次拒绝签名。
    }
  }
  return records;
}
```

详情以引用取 Map，不再 `hash(reference)`。调用参数 `collection: db.collection('profile_media'), inValues: (values) => _.in(values)`。

- [ ] GREEN：逐个文件同命令通过；公开 DTO 仍不泄露内部 file ID。

## Task 3：认证本人预览

Files: 修改 `cloudfunctions/profile/core.js`、`capability-card.js`、`index.js`；补充 `capability-card.node-test.js` 与 `index.node-test.js`。

- [ ] 增加未提供公开同意仍可看自己、source/canonical 与双路径矩阵、头像错误用途及重复登记拒绝测试。
- [ ] RED：`perl -e 'alarm shift; exec @ARGV' 120 node --test cloudfunctions/profile/capability-card.node-test.js`，用途场景失败。
- [ ] 本人头像和背景查询采用唯一匹配，头像 registeredMedia 期望 category 固定 `other`；明确路径类别只接受相符的 profile-avatar/profile-background。

```js
function uniqueMediaRecord(mediaRecords, fileId) {
  const matches = mediaRecords.filter((record) => recordReferencesFile(record, fileId));
  return matches.length === 1 ? matches[0] : undefined;
}
```

原实现函数命名为 `buildOwnerMediaPreview`，原接口兼容同一函数：

```js
module.exports = {
  buildOwnerMediaPreview,
  buildCapabilityCard: buildOwnerMediaPreview,
};
```

- [ ] GREEN：同一命令通过；不启用未来的公开同意锁，不改变当前页面调用。

规格审查补齐本人真实消费者：显式背景 null 时 `ownerMedia` 不追加历史 photos，缺字段时仍兼容；本人预览的读取器总是查询 source 和 canonical，保留冲突候选，由唯一匹配校验拒绝歧义引用。其它槽位的合法别名不能恢复该引用。

```js
async function getOwnerPreviewMediaRecords(collection, profile) {
  const records = await Promise.all(
    profileMediaIds(profile).map(async (fileId) => {
      const direct = await maybeGet(collection, mediaDocumentId(fileId));
      const canonical = await collection.where({ canonical_file_id: fileId }).limit(2).get();
      if (!Array.isArray(canonical?.data)) throw new Error('无法验证媒体登记');
      return [direct, ...canonical.data].filter(Boolean);
    }),
  );
  return [...new Map(records.flat().map((record) => [record._id, record])).values()];
}
```

`main` 的 capabilityCard 分支消费该读取器；资料写入仍使用既有读取器。两组回归先失败，再独立修复并通过。

## Task 4：独立交付

- [ ] 单测流程 Step6 按既有配置决定覆盖率统计，Step7 执行 utree flush；保留 RED 事实与修复后 GREEN。
- [ ] 新代理做规格和代码两阶段审查；按 code-guard 过滤有效业务文件并生成脱敏报告。
- [ ] `npm run check:ui-sync -- --strict`、`npm run check:governance`、`perl -e 'alarm shift; exec @ARGV' 300 npm run validate`，全部成功后执行精确 staging。
- [ ] 更新客户端版本、高优清单和本片报告，提交 `fix(media): bind current profile media to canonical registry`。
- [ ] 独立 PR 正常 squash 合并，核对 PR/main CI、CodeQL、Pages、真实部署及上传 receipt 或可信累计范围 SKIPPED；部署成功后更新交付状态，现场 P0 保留。
