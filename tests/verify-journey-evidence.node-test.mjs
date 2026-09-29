import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const verifierPath = resolve('scripts/verify-journey-evidence.mjs');
const issuerPath = resolve('scripts/issue-journey-run.mjs');
const validFixturePath = resolve('tests/fixtures/p0-journey-evidence.valid.json');
const keyFilePath = resolve('tests/fixtures/p0-journey-evidence.test-key');
const validEvidence = JSON.parse(readFileSync(validFixturePath, 'utf8'));
const testKey = readFileSync(keyFilePath);
const testKeySentinel = testKey.toString('utf8').trim();
const signatureDomain = 'ride-event:p0-journey-run:v1';

const forbiddenKeyVariants = [
  'openid',
  'open_id',
  'openId',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'id_number',
  'idNumber',
  'oauth_code',
  'oauthCode',
  'oauth_state',
  'oauthState',
  'ciphertext',
  'cipher_text',
  'cipherText',
];
const invalidExportedIdentifiers = [
  {
    label: 'provider-style openid',
    value: 'ou_7e85e54f2c2d4c24a650db90',
  },
  {
    label: 'raw hash',
    value: '7e85e54f2c2d4c24a650db90ef6b123b7e85e54f2c2d4c24a650db90ef6b123b',
  },
  {
    label: 'arbitrary identifier',
    value: 'production-rider-42',
  },
];
const invalidSynchronizedRunIds = [
  {
    label: 'sensitive-key text',
    value: 'access_token_SECRET_123',
  },
  {
    label: 'phone-shaped value',
    value: '13800138000',
  },
  {
    label: 'provider identifier',
    value: 'oUpF8uMuAJO_M2pxb1Q9zNjWeS6o',
  },
];
const invalidStrictRunIds = [
  {
    label: 'phone-shaped 12-hex nonce',
    value: 'P0_20260929_13800138000A',
  },
  {
    label: 'predictable 12-hex nonce',
    value: 'P0_20260929_DEADBEEFCAFE',
  },
  {
    label: 'invalid calendar date',
    value: 'P0_20261399_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6',
  },
];

async function runVerifier(evidence) {
  return runVerifierSource(JSON.stringify(evidence));
}

async function runVerifierSource(source, keyPath = keyFilePath) {
  const directory = await mkdtemp(join(tmpdir(), 'ride-event-evidence-'));
  const fixturePath = join(directory, 'evidence.json');

  try {
    writeFileSync(fixturePath, source);
    const args =
      keyPath === null
        ? [verifierPath, fixturePath]
        : [verifierPath, '--key-file', keyPath, fixturePath];
    return spawnSync(process.execPath, args, {
      encoding: 'utf8',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function runVerifierWithoutKey(evidence) {
  return runVerifierSource(JSON.stringify(evidence), null);
}

function runIssuer(args = ['--key-file', keyFilePath]) {
  return spawnSync(process.execPath, [issuerPath, ...args], {
    encoding: 'utf8',
  });
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

function setAliasesForRunId(evidence, runId) {
  evidence.marker = `E2E_RESULT:${runId}`;
  evidence.subjectAlias = `user_test_${runId}`;
  evidence.registrationId = `reg_test_${runId}`;

  for (const audit of evidence.audits) {
    audit.target_id = audit.action.startsWith('registration.')
      ? evidence.registrationId
      : evidence.subjectAlias;
  }
}

function signRun(runId, issuedAt) {
  return createHmac('sha256', testKey)
    .update(signatureDomain)
    .update('\0')
    .update(runId)
    .update('\0')
    .update(issuedAt)
    .digest('hex')
    .toUpperCase();
}

function addSignedIssuance(evidence, issuedAt = '2026-09-29T04:00:00.000Z') {
  const runId = evidence.marker.slice('E2E_RESULT:'.length);
  evidence.issuedAt = issuedAt;
  evidence.runSignature = signRun(runId, issuedAt);
  return evidence;
}

function assertRejectedWithoutSentinel(result, sentinel) {
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, new RegExp(sentinel));
  assert.equal(result.status, 1, `expected rejection, got output: ${output}`);
  assert.match(result.stderr, /P0 真实旅程证据校验失败/);
}

function assertDuplicateRejectedWithoutSentinels(result, sentinels) {
  const output = `${result.stdout}${result.stderr}`;

  for (const sentinel of sentinels) {
    assert.equal(output.includes(sentinel), false);
  }
  assert.equal(result.status, 1, `expected duplicate-key rejection, got output: ${output}`);
  assert.match(result.stderr, /JSON 包含重复字段/);
}

test('issuer creates a signed 128-bit run template without printing the key', () => {
  const result = runIssuer();
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(output.includes(testKeySentinel), false);
  assert.equal(result.status, 0, result.stderr);

  const template = JSON.parse(result.stdout);
  const runId = template.marker.slice('E2E_RESULT:'.length);
  assert.match(runId, /^P0_\d{8}_[A-F0-9]{32}$/);
  assert.equal(runId.slice(3, 11), shanghaiDateSegment(template.issuedAt));
  assert.equal(template.subjectAlias, `user_test_${runId}`);
  assert.equal(template.registrationId, `reg_test_${runId}`);
  assert.match(template.runSignature, /^[A-F0-9]{64}$/);
});

test('issuer requires --key-file', () => {
  const result = runIssuer([]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /请通过 --key-file 提供签发密钥/);
});

test('issuer rejects a key shorter than 32 bytes without printing it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ride-event-short-key-'));
  const shortKeyPath = join(directory, 'key');
  const shortKey = 'SHORT_TEST_KEY_SENTINEL';

  try {
    writeFileSync(shortKeyPath, shortKey);
    const result = runIssuer(['--key-file', shortKeyPath]);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(output.includes(shortKey), false);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /签发密钥至少需要 32 字节/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('issuer rejects caller-supplied run identifiers', () => {
  const callerValue = 'P0_20260929_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const result = runIssuer(['--key-file', keyFilePath, '--run-id', callerValue]);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(output.includes(callerValue), false);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /只允许 --key-file 参数/);
});

test('verifier accepts evidence signed by the trusted key', async () => {
  const evidence = addSignedIssuance(structuredClone(validEvidence));

  const result = await runVerifier(evidence);

  assert.equal(`${result.stdout}${result.stderr}`.includes(testKeySentinel), false);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /P0 真实旅程证据校验通过/);
});

test('verifier requires --key-file for signed evidence', async () => {
  const evidence = addSignedIssuance(structuredClone(validEvidence));

  const result = await runVerifierWithoutKey(evidence);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /请通过 --key-file 提供签发密钥/);
});

test('verifier rejects a bad signature without printing it', async () => {
  const badSignature = 'A'.repeat(64);
  const evidence = addSignedIssuance(structuredClone(validEvidence));
  evidence.runSignature = badSignature;

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, badSignature);
  assert.match(result.stderr, /运行签名无效/);
});

test('verifier rejects an edited RUN_ID with its stale signature', async () => {
  const evidence = addSignedIssuance(structuredClone(validEvidence));
  const editedRunId = 'P0_20260929_FEDCBA9876543210FEDCBA9876543210';
  setAliasesForRunId(evidence, editedRunId);

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, editedRunId);
  assert.match(result.stderr, /运行签名无效/);
});

test('verifier rejects a marker date that differs from issuedAt in Shanghai', async () => {
  const evidence = structuredClone(validEvidence);
  const mismatchedRunId = 'P0_20260930_0123456789ABCDEF0123456789ABCDEF';
  setAliasesForRunId(evidence, mismatchedRunId);
  addSignedIssuance(evidence, '2026-09-29T04:00:00.000Z');

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, mismatchedRunId);
  assert.match(result.stderr, /RUN_ID 日期与 issuedAt 不一致/);
});

test('accepts the documented subjectAlias, registrationId, and target_id schema', async () => {
  const result = await runVerifier(validEvidence);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /P0 真实旅程证据校验通过/);
});

test('requires a root subjectAlias', async () => {
  const evidence = structuredClone(validEvidence);
  delete evidence.subjectAlias;

  const result = await runVerifier(evidence);

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /P0 真实旅程证据校验失败/);
});

test('does not reject HEADPHONE text in an allowed audit action', async () => {
  const evidence = structuredClone(validEvidence);
  evidence.audits.push({
    action: 'journey.HEADPHONE.observed',
    target_id: evidence.subjectAlias,
    created_at: '2026-09-29T04:05:00.000Z',
  });

  const result = await runVerifier(evidence);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /P0 真实旅程证据校验通过/);
});

for (const { label, value } of invalidSynchronizedRunIds) {
  test(`rejects a synchronized chain using ${label} as RUN_ID`, async () => {
    const evidence = structuredClone(validEvidence);
    setAliasesForRunId(evidence, value);

    const result = await runVerifier(evidence);

    assertRejectedWithoutSentinel(result, value);
  });
}

for (const { label, value } of invalidStrictRunIds) {
  test(`rejects a synchronized chain using ${label}`, async () => {
    const evidence = structuredClone(validEvidence);
    setAliasesForRunId(evidence, value);

    const result = await runVerifier(evidence);

    assertRejectedWithoutSentinel(result, value);
  });
}

test('rejects a provider identifier wrapped in a user_test alias', async () => {
  const wrappedIdentifier = 'user_test_ou_wrapped_identifier_7e85e5';
  const evidence = structuredClone(validEvidence);
  evidence.subjectAlias = wrappedIdentifier;
  const syncAudit = evidence.audits.find((audit) => audit.action === 'strava.sync.succeeded');
  syncAudit.target_id = wrappedIdentifier;

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, wrappedIdentifier);
});

test('rejects a raw hash wrapped in a reg_test alias', async () => {
  const wrappedIdentifier =
    'reg_test_7e85e54f2c2d4c24a650db90ef6b123b7e85e54f2c2d4c24a650db90ef6b123b';
  const evidence = structuredClone(validEvidence);
  evidence.registrationId = wrappedIdentifier;
  for (const audit of evidence.audits) {
    if (audit.action.startsWith('registration.')) {
      audit.target_id = wrappedIdentifier;
    }
  }

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, wrappedIdentifier);
});

test('rejects a provider identifier used as the marker run ID', async () => {
  const runId = 'ou_marker_wrapped_identifier_4620bb';
  const evidence = structuredClone(validEvidence);
  setAliasesForRunId(evidence, runId);

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, `user_test_${runId}`);
});

test('rejects a raw hash used as the marker run ID', async () => {
  const runId = '7e85e54f2c2d4c24a650db90ef6b123b7e85e54f2c2d4c24a650db90ef6b123b';
  const evidence = structuredClone(validEvidence);
  setAliasesForRunId(evidence, runId);

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, `reg_test_${runId}`);
});

test('rejects a different run alias reused as the subject alias', async () => {
  const mismatchedAlias = 'user_test_DIFFERENT_RUN_002';
  const evidence = structuredClone(validEvidence);
  evidence.subjectAlias = mismatchedAlias;
  const syncAudit = evidence.audits.find((audit) => audit.action === 'strava.sync.succeeded');
  syncAudit.target_id = mismatchedAlias;

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, mismatchedAlias);
});

test('rejects a different run alias reused as the registration identifier', async () => {
  const mismatchedAlias = 'reg_test_DIFFERENT_RUN_002';
  const evidence = structuredClone(validEvidence);
  evidence.registrationId = mismatchedAlias;
  for (const audit of evidence.audits) {
    if (audit.action.startsWith('registration.')) {
      audit.target_id = mismatchedAlias;
    }
  }

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, mismatchedAlias);
});

test('rejects duplicate marker keys in raw JSON before parsing', async () => {
  const duplicateValue = 'E2E_RESULT:DUPLICATE_MARKER_SENTINEL_4620bb';
  const markerEntry = `"marker":"${validEvidence.marker}"`;
  const source = JSON.stringify(validEvidence).replace(
    markerEntry,
    `${markerEntry},"mark\\u0065r":"${duplicateValue}"`,
  );

  const result = await runVerifierSource(source);

  assertDuplicateRejectedWithoutSentinels(result, [duplicateValue]);
});

test('rejects duplicate accessToken keys in a nested audit before parsing', async () => {
  const firstSecret = 'DUPLICATE_ACCESS_SENTINEL_63d6a1';
  const secondSecret = 'DUPLICATE_ACCESS_SENTINEL_9c2f41';
  const auditsStart = '"audits":[{';
  const source = JSON.stringify(validEvidence).replace(
    auditsStart,
    `${auditsStart}"accessToken":"${firstSecret}","access\\u0054oken":"${secondSecret}",`,
  );

  const result = await runVerifierSource(source);

  assertDuplicateRejectedWithoutSentinels(result, [firstSecret, secondSecret]);
});

test('rejects an unknown root key before its sentinel can reach output', async () => {
  const sentinel = 'ROOT_SCHEMA_SENTINEL_7e85e5';
  const evidence = structuredClone(validEvidence);
  evidence.debug_note = sentinel;

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, sentinel);
});

test('rejects an unknown audit key before its sentinel can reach output', async () => {
  const sentinel = 'AUDIT_SCHEMA_SENTINEL_4620bb';
  const evidence = structuredClone(validEvidence);
  evidence.audits[0].debug_note = sentinel;

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, sentinel);
});

for (const [index, key] of forbiddenKeyVariants.entries()) {
  test(`rejects the forbidden evidence key variant ${key}`, async () => {
    const sentinel = `FORBIDDEN_KEY_SENTINEL_${index}_63d6a1`;
    const evidence = structuredClone(validEvidence);
    evidence[key] = sentinel;

    const result = await runVerifier(evidence);

    assertRejectedWithoutSentinel(result, sentinel);
  });
}

for (const { label, value } of invalidExportedIdentifiers) {
  test(`rejects ${label} used as the subject alias`, async () => {
    const evidence = structuredClone(validEvidence);
    evidence.subjectAlias = value;

    const result = await runVerifier(evidence);

    assertRejectedWithoutSentinel(result, value);
  });

  test(`rejects ${label} used as the registration identifier`, async () => {
    const evidence = structuredClone(validEvidence);
    evidence.registrationId = value;
    for (const audit of evidence.audits) {
      if (audit.action.startsWith('registration.')) {
        audit.target_id = value;
      }
    }

    const result = await runVerifier(evidence);

    assertRejectedWithoutSentinel(result, value);
  });

  test(`rejects ${label} used as the Strava sync target`, async () => {
    const evidence = structuredClone(validEvidence);
    const syncAudit = evidence.audits.find((audit) => audit.action === 'strava.sync.succeeded');
    syncAudit.target_id = value;

    const result = await runVerifier(evidence);

    assertRejectedWithoutSentinel(result, value);
  });
}

test('rejects a reg_test alias used as the subject alias', async () => {
  const invalidAlias = 'reg_test_wrong_subject_role';
  const evidence = structuredClone(validEvidence);
  evidence.subjectAlias = invalidAlias;

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, invalidAlias);
});

test('rejects a Strava target from a different synthetic subject', async () => {
  const mismatchedAlias = 'user_test_different_subject';
  const evidence = structuredClone(validEvidence);
  const syncAudit = evidence.audits.find((audit) => audit.action === 'strava.sync.succeeded');
  syncAudit.target_id = mismatchedAlias;

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, mismatchedAlias);
});

test('rejects a registration audit target that differs from registrationId', async () => {
  const mismatchedAlias = 'reg_test_different_registration';
  const evidence = structuredClone(validEvidence);
  const registrationAudit = evidence.audits.find((audit) =>
    audit.action.startsWith('registration.'),
  );
  registrationAudit.target_id = mismatchedAlias;

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, mismatchedAlias);
});

test('rejects a user_test alias used as the registration identifier', async () => {
  const invalidAlias = 'user_test_wrong_registration_role';
  const evidence = structuredClone(validEvidence);
  evidence.registrationId = invalidAlias;
  for (const audit of evidence.audits) {
    if (audit.action.startsWith('registration.')) {
      audit.target_id = invalidAlias;
    }
  }

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, invalidAlias);
});

test('rejects a reg_test alias used as the Strava sync target', async () => {
  const invalidAlias = 'reg_test_wrong_strava_role';
  const evidence = structuredClone(validEvidence);
  const syncAudit = evidence.audits.find((audit) => audit.action === 'strava.sync.succeeded');
  syncAudit.target_id = invalidAlias;

  const result = await runVerifier(evidence);

  assertRejectedWithoutSentinel(result, invalidAlias);
});
