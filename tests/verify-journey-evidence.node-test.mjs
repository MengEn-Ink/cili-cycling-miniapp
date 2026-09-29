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
  const directory = await mkdtemp(join(tmpdir(), 'ride-event-evidence-'));
  const fixturePath = join(directory, 'evidence.json');

  try {
    writeFileSync(fixturePath, JSON.stringify(evidence));
    return spawnSync(process.execPath, [verifierPath, fixturePath], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function assertRejectedWithoutSentinel(result, sentinel) {
  const output = `${result.stdout}${result.stderr}`;

  assert.doesNotMatch(output, new RegExp(sentinel));
  assert.equal(result.status, 1, `expected rejection, got output: ${output}`);
  assert.match(result.stderr, /P0 真实旅程证据校验失败/);
}

test('accepts the documented registrationId and target_id schema', async () => {
  const result = await runVerifier(validEvidence);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /P0 真实旅程证据校验通过/);
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
