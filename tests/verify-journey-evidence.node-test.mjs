import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const verifierPath = resolve('scripts/verify-journey-evidence.mjs');
const validFixturePath = resolve('tests/fixtures/p0-journey-evidence.valid.json');
const validEvidence = JSON.parse(readFileSync(validFixturePath, 'utf8'));

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

async function runVerifier(evidence) {
  return runVerifierSource(JSON.stringify(evidence));
}

async function runVerifierSource(source) {
  const directory = await mkdtemp(join(tmpdir(), 'ride-event-evidence-'));
  const fixturePath = join(directory, 'evidence.json');

  try {
    writeFileSync(fixturePath, source);
    return spawnSync(process.execPath, [verifierPath, fixturePath], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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

test('accepts a legal marker containing the word HEADPHONE', async () => {
  const evidence = structuredClone(validEvidence);
  setAliasesForRunId(evidence, 'HEADPHONE_RIDE_001');

  const result = await runVerifier(evidence);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /P0 真实旅程证据校验通过/);
});

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
