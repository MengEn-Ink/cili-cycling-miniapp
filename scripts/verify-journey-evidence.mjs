#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const SUCCESS_MESSAGE = 'P0 真实旅程证据校验通过';
const FAILURE_PREFIX = 'P0 真实旅程证据校验失败';
const ROOT_KEYS = new Set([
  'marker',
  'subjectAlias',
  'registrationId',
  'statuses',
  'occupiedCounts',
  'audits',
]);
const AUDIT_KEYS = new Set(['action', 'target_id', 'created_at']);
const FORBIDDEN_NORMALIZED_KEYS = new Set([
  'phone',
  'openid',
  'accesstoken',
  'refreshtoken',
  'idnumber',
  'oauthcode',
  'oauthstate',
  'ciphertext',
]);
const MARKER_PREFIX = 'E2E_RESULT:';
const PROVIDER_IDENTIFIER = /^ou_[A-Za-z0-9_-]+$/i;
const RAW_HASH = /^[a-f0-9]{32,}$/i;
const EXPECTED_STATUSES = ['pending', 'approved', 'cancelled', 'pending'];
const REQUIRED_AUDIT_ACTIONS = [
  'strava.sync.succeeded',
  'registration.submitted',
  'registration.approved',
  'registration.cancelled',
  'registration.resubmitted',
];

class EvidenceError extends Error {}
class DuplicateKeyError extends Error {}
class JsonScanError extends Error {}

function fail(reason) {
  throw new EvidenceError(reason);
}

function normalizeKeyName(key) {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function containsForbiddenKey(value) {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenKey);
  }

  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, nestedValue]) =>
        FORBIDDEN_NORMALIZED_KEYS.has(normalizeKeyName(key)) || containsForbiddenKey(nestedValue),
    );
  }

  return false;
}

function skipWhitespace(source, index) {
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }
  return index;
}

function scanJsonString(source, start) {
  if (source[start] !== '"') {
    throw new JsonScanError();
  }

  let decoded = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      return { value: decoded, next: index + 1 };
    }

    if (character === '\\') {
      index += 1;
      const escape = source[index];
      const simpleEscapes = {
        '"': '"',
        '\\': '\\',
        '/': '/',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
      };

      if (escape === 'u') {
        const codePoint = source.slice(index + 1, index + 5);
        if (!/^[a-f0-9]{4}$/i.test(codePoint)) {
          throw new JsonScanError();
        }
        decoded += String.fromCharCode(Number.parseInt(codePoint, 16));
        index += 4;
      } else if (Object.hasOwn(simpleEscapes, escape)) {
        decoded += simpleEscapes[escape];
      } else {
        throw new JsonScanError();
      }
      continue;
    }

    if (character.charCodeAt(0) < 0x20) {
      throw new JsonScanError();
    }
    decoded += character;
  }

  throw new JsonScanError();
}

function scanJsonObject(source, start) {
  const keys = new Set();
  let index = skipWhitespace(source, start + 1);
  if (source[index] === '}') {
    return index + 1;
  }

  while (index < source.length) {
    const keyToken = scanJsonString(source, index);
    if (keys.has(keyToken.value)) {
      throw new DuplicateKeyError();
    }
    keys.add(keyToken.value);

    index = skipWhitespace(source, keyToken.next);
    if (source[index] !== ':') {
      throw new JsonScanError();
    }

    index = scanJsonValue(source, skipWhitespace(source, index + 1));
    index = skipWhitespace(source, index);
    if (source[index] === '}') {
      return index + 1;
    }
    if (source[index] !== ',') {
      throw new JsonScanError();
    }
    index = skipWhitespace(source, index + 1);
  }

  throw new JsonScanError();
}

function scanJsonArray(source, start) {
  let index = skipWhitespace(source, start + 1);
  if (source[index] === ']') {
    return index + 1;
  }

  while (index < source.length) {
    index = scanJsonValue(source, index);
    index = skipWhitespace(source, index);
    if (source[index] === ']') {
      return index + 1;
    }
    if (source[index] !== ',') {
      throw new JsonScanError();
    }
    index = skipWhitespace(source, index + 1);
  }

  throw new JsonScanError();
}

function scanJsonValue(source, start) {
  const index = skipWhitespace(source, start);
  if (source[index] === '{') {
    return scanJsonObject(source, index);
  }
  if (source[index] === '[') {
    return scanJsonArray(source, index);
  }
  if (source[index] === '"') {
    return scanJsonString(source, index).next;
  }

  const primitive = source
    .slice(index)
    .match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];
  if (primitive === undefined) {
    throw new JsonScanError();
  }
  return index + primitive.length;
}

function assertNoDuplicateKeys(source) {
  const end = skipWhitespace(source, scanJsonValue(source, 0));
  if (end !== source.length) {
    throw new JsonScanError();
  }
}

function arraysEqual(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function isValidTimestamp(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function hasExactKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.size && actualKeys.every((key) => expectedKeys.has(key))
  );
}

function validateEvidenceSchema(evidence) {
  if (evidence === null || Array.isArray(evidence) || typeof evidence !== 'object') {
    fail('根节点必须是对象');
  }

  if (!hasExactKeys(evidence, ROOT_KEYS)) {
    fail('根节点字段不符合证据结构');
  }

  if (typeof evidence.marker !== 'string') {
    fail('marker 必须是字符串');
  }

  if (typeof evidence.subjectAlias !== 'string' || evidence.subjectAlias.length === 0) {
    fail('subjectAlias 必须是非空字符串');
  }

  if (typeof evidence.registrationId !== 'string' || evidence.registrationId.length === 0) {
    fail('registrationId 必须是非空字符串');
  }

  if (
    !Array.isArray(evidence.statuses) ||
    evidence.statuses.some((status) => typeof status !== 'string')
  ) {
    fail('statuses 必须是字符串数组');
  }

  const counts = evidence.occupiedCounts;
  if (
    !Array.isArray(counts) ||
    counts.length !== 5 ||
    counts.some((count) => !Number.isInteger(count) || count < 0)
  ) {
    fail('occupiedCounts 必须包含五个非负整数');
  }

  if (!Array.isArray(evidence.audits)) {
    fail('audits 必须是数组');
  }

  if (
    evidence.audits.some(
      (audit) =>
        audit === null ||
        Array.isArray(audit) ||
        typeof audit !== 'object' ||
        !hasExactKeys(audit, AUDIT_KEYS) ||
        typeof audit.action !== 'string' ||
        audit.action.length === 0 ||
        typeof audit.target_id !== 'string' ||
        audit.target_id.length === 0 ||
        !isValidTimestamp(audit.created_at),
    )
  ) {
    fail('审计记录的 action、target_id 或时间戳无效');
  }
}

function validateSyntheticAliases(evidence) {
  const runId = evidence.marker.slice(MARKER_PREFIX.length);
  if (PROVIDER_IDENTIFIER.test(runId) || RAW_HASH.test(runId)) {
    fail('导出标识符必须使用合成别名');
  }

  const expectedSubjectAlias = `user_test_${runId}`;
  const expectedRegistrationId = `reg_test_${runId}`;
  if (
    evidence.subjectAlias !== expectedSubjectAlias ||
    evidence.registrationId !== expectedRegistrationId
  ) {
    fail('导出标识符必须使用合成别名');
  }

  if (
    evidence.audits.some(
      (audit) =>
        audit.target_id !== expectedRegistrationId && audit.target_id !== expectedSubjectAlias,
    )
  ) {
    fail('导出标识符必须使用合成别名');
  }

  const registrationAudits = evidence.audits.filter((audit) =>
    audit.action.startsWith('registration.'),
  );
  if (registrationAudits.some((audit) => audit.target_id !== expectedRegistrationId)) {
    fail('导出标识符必须使用合成别名');
  }

  const syncAudits = evidence.audits.filter((audit) => audit.action === 'strava.sync.succeeded');
  if (syncAudits.some((audit) => audit.target_id !== expectedSubjectAlias)) {
    fail('导出标识符必须使用合成别名');
  }
}

function validateEvidence(evidence) {
  validateEvidenceSchema(evidence);

  if (containsForbiddenKey(evidence)) {
    fail('发现敏感字段');
  }

  if (
    !evidence.marker.startsWith(MARKER_PREFIX) ||
    evidence.marker.length === MARKER_PREFIX.length
  ) {
    fail('marker 必须以 E2E_RESULT: 开头');
  }

  validateSyntheticAliases(evidence);

  if (!arraysEqual(evidence.statuses, EXPECTED_STATUSES)) {
    fail('状态顺序不符合 P0 旅程');
  }

  const counts = evidence.occupiedCounts;
  const expectedCounts = [counts[0], counts[0] + 1, counts[0] + 1, counts[0], counts[0] + 1];
  if (!arraysEqual(counts, expectedCounts)) {
    fail('名额变化不符合提交、幂等、取消、重报流程');
  }

  const requiredAudits = REQUIRED_AUDIT_ACTIONS.map((action) =>
    evidence.audits.find((audit) => audit?.action === action),
  );
  if (requiredAudits.some((audit) => audit === undefined)) {
    fail('缺少必要审计动作');
  }

  const actionPositions = REQUIRED_AUDIT_ACTIONS.map((action) =>
    evidence.audits.findIndex((audit) => audit?.action === action),
  );
  if (
    actionPositions.some((position, index) => index > 0 && position <= actionPositions[index - 1])
  ) {
    fail('审计动作顺序不符合 P0 旅程');
  }

  const auditTimes = requiredAudits.map((audit) => Date.parse(audit.created_at));
  if (auditTimes.some((time, index) => index > 0 && time < auditTimes[index - 1])) {
    fail('审计时间戳顺序不符合 P0 旅程');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    fail('请提供且仅提供一个 JSON 文件路径');
  }

  let source;
  try {
    source = await readFile(args[0], 'utf8');
  } catch {
    fail('无法读取证据文件');
  }

  let evidence;
  try {
    assertNoDuplicateKeys(source);
    evidence = JSON.parse(source);
  } catch (error) {
    if (error instanceof DuplicateKeyError) {
      fail('JSON 包含重复字段');
    }
    fail('无法解析证据 JSON');
  }

  validateEvidence(evidence);
  console.log(SUCCESS_MESSAGE);
}

main().catch((error) => {
  const reason = error instanceof EvidenceError ? error.message : '发生未预期的校验错误';
  console.error(`${FAILURE_PREFIX}: ${reason}`);
  process.exitCode = 1;
});
