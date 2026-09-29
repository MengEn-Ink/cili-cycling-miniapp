#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const SUCCESS_MESSAGE = 'P0 真实旅程证据校验通过';
const FAILURE_PREFIX = 'P0 真实旅程证据校验失败';
const FORBIDDEN = /(phone|id_number|access_token|refresh_token|ciphertext|oauth_code|oauth_state)/i;
const EXPECTED_STATUSES = ['pending', 'approved', 'cancelled', 'pending'];
const REQUIRED_AUDIT_ACTIONS = [
  'strava.sync.succeeded',
  'registration.submitted',
  'registration.approved',
  'registration.cancelled',
  'registration.resubmitted',
];
const REGISTRATION_AUDIT_ACTIONS = REQUIRED_AUDIT_ACTIONS.filter((action) =>
  action.startsWith('registration.'),
);

class EvidenceError extends Error {}

function fail(reason) {
  throw new EvidenceError(reason);
}

function containsForbiddenData(value) {
  if (typeof value === 'string') {
    return FORBIDDEN.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsForbiddenData);
  }

  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, nestedValue]) => FORBIDDEN.test(key) || containsForbiddenData(nestedValue),
    );
  }

  return false;
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

function validateEvidence(evidence) {
  if (evidence === null || Array.isArray(evidence) || typeof evidence !== 'object') {
    fail('根节点必须是对象');
  }

  if (containsForbiddenData(evidence)) {
    fail('发现敏感字段或敏感字符串');
  }

  if (typeof evidence.marker !== 'string' || !evidence.marker.startsWith('E2E_RESULT:')) {
    fail('marker 必须以 E2E_RESULT: 开头');
  }

  if (typeof evidence.registrationId !== 'string' || evidence.registrationId.length === 0) {
    fail('registrationId 必须是非空字符串');
  }

  if (!arraysEqual(evidence.statuses, EXPECTED_STATUSES)) {
    fail('状态顺序不符合 P0 旅程');
  }

  const counts = evidence.occupiedCounts;
  if (
    !Array.isArray(counts) ||
    counts.length !== 5 ||
    counts.some((count) => !Number.isInteger(count) || count < 0)
  ) {
    fail('occupiedCounts 必须包含五个非负整数');
  }

  const expectedCounts = [counts[0], counts[0] + 1, counts[0] + 1, counts[0], counts[0] + 1];
  if (!arraysEqual(counts, expectedCounts)) {
    fail('名额变化不符合提交、幂等、取消、重报流程');
  }

  if (!Array.isArray(evidence.audits)) {
    fail('audits 必须是数组');
  }

  if (
    evidence.audits.some(
      (audit) =>
        audit === null ||
        typeof audit !== 'object' ||
        typeof audit.action !== 'string' ||
        audit.action.length === 0 ||
        typeof audit.target_id !== 'string' ||
        audit.target_id.length === 0 ||
        !isValidTimestamp(audit.created_at),
    )
  ) {
    fail('审计记录的 action、target_id 或时间戳无效');
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

  const registrationAudits = evidence.audits.filter((audit) =>
    REGISTRATION_AUDIT_ACTIONS.includes(audit?.action),
  );
  if (registrationAudits.some((audit) => audit.target_id !== evidence.registrationId)) {
    fail('报名审计 target_id 与 registrationId 不一致');
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
    evidence = JSON.parse(source);
  } catch {
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
