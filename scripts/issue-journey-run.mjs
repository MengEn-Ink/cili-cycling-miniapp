#!/usr/bin/env node

import { createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const FAILURE_PREFIX = 'P0 真实旅程签发失败';
const SIGNATURE_DOMAIN = 'ride-event:p0-journey-run:v1';

class IssuanceError extends Error {}

function fail(reason) {
  throw new IssuanceError(reason);
}

function shanghaiDateSegment(issuedAt) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(issuedAt));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}`;
}

function signRun(key, runId, issuedAt) {
  return createHmac('sha256', key)
    .update(SIGNATURE_DOMAIN)
    .update('\0')
    .update(runId)
    .update('\0')
    .update(issuedAt)
    .digest('hex')
    .toUpperCase();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    fail('请通过 --key-file 提供签发密钥');
  }
  if (args.length !== 2 || args[0] !== '--key-file' || args[1].length === 0) {
    fail('只允许 --key-file 参数');
  }

  let key;
  try {
    key = await readFile(args[1]);
  } catch {
    fail('无法读取签发密钥');
  }
  if (key.length < 32) {
    fail('签发密钥至少需要 32 字节');
  }

  const issuedAt = new Date().toISOString();
  const runId = `P0_${shanghaiDateSegment(issuedAt)}_${randomBytes(16).toString('hex').toUpperCase()}`;
  const template = {
    marker: `E2E_RESULT:${runId}`,
    issuedAt,
    subjectAlias: `user_test_${runId}`,
    registrationId: `reg_test_${runId}`,
    runSignature: signRun(key, runId, issuedAt),
  };

  console.log(JSON.stringify(template, null, 2));
}

main().catch((error) => {
  const reason = error instanceof IssuanceError ? error.message : '发生未预期的签发错误';
  console.error(`${FAILURE_PREFIX}: ${reason}`);
  process.exitCode = 1;
});
