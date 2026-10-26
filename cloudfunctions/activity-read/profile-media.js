'use strict';

const { mediaDocumentId } = require('./public-avatar');

// 两种引用都必须能证实唯一登记；查询失败或截断时整批拒绝签名。
async function loadProfileMediaRecords(fileIds, { collection, inValues }) {
  const records = new Map();
  const references = [...new Set(fileIds)];
  for (let offset = 0; offset < references.length; offset += 20) {
    const batch = references.slice(offset, offset + 20);
    const candidates = new Map(batch.map((id) => [id, []]));
    try {
      const direct = await collection
        .where({ _id: inValues(batch.map(mediaDocumentId)) })
        .limit(20)
        .get();
      const canonical = await collection
        .where({ canonical_file_id: inValues(batch) })
        .limit(100)
        .get();
      if (
        !Array.isArray(direct.data) ||
        !Array.isArray(canonical.data) ||
        canonical.data.length >= 100
      )
        continue;
      for (const record of direct.data)
        if (
          record &&
          candidates.has(record.file_id) &&
          record._id === mediaDocumentId(record.file_id)
        )
          candidates.get(record.file_id).push(record);
      for (const record of canonical.data)
        if (record && candidates.has(record.canonical_file_id))
          candidates.get(record.canonical_file_id).push(record);
      for (const [reference, matches] of candidates)
        if (matches.length === 1) records.set(reference, matches[0]);
    } catch {
      // 受影响图片使用空态，活动主流程仍可读。
    }
  }
  return records;
}

module.exports = { loadProfileMediaRecords };
