import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLLECTIONS, INDEXES, DENY_RULE } from './bootstrap-cloudbase.mjs';
import { CLOUD_PACKAGES } from './run-cloud-packages.mjs';
import { createAffectedPlan } from './affected-ci.mjs';
import { createCloudBaseDeployDecision } from './cloudbase-deploy-decision.mjs';
import { MEDIA_SECRET_CONSUMERS } from './cloudbase-function-env.mjs';
const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('cloudbaserc.json', root), 'utf8'));

test('privacy collection, stable batch indexes and client deny ACL are bootstrapped', () => {
  assert.ok(COLLECTIONS.includes('privacy_requests'));
  assert.deepEqual(DENY_RULE, { read: false, write: false });
  for (const [collection, fields] of [
    ['privacy_requests', ['status', 'retry_at', '_id']],
    ['registrations', ['openid', '_id']],
    ['profile_media', ['owner_openid', '_id']],
    ['profile_media_imports', ['owner_openid', '_id']],
    ['profile_media', ['privacy_request_id', '_id']],
    ['profile_media_imports', ['privacy_request_id', '_id']],
  ])
    assert.ok(
      INDEXES.some(
        (index) =>
          index.collection === collection &&
          JSON.stringify(index.keys.map(([field]) => field)) === JSON.stringify(fields),
      ),
    );
});

test('worker has a Timer, all-package and affected-package selection and runtime media secret', () => {
  const worker = config.functions.find(({ name }) => name === 'privacy-maintenance');
  assert.ok(worker);
  assert.deepEqual(
    worker.triggers.map(({ name, type }) => ({ name, type })),
    [{ name: 'privacy-maintenance-worker', type: 'timer' }],
  );
  assert.ok(CLOUD_PACKAGES.includes('privacy-maintenance'));
  assert.ok(MEDIA_SECRET_CONSUMERS.includes('privacy-maintenance'));
  assert.equal(createAffectedPlan(['cloudfunctions/privacy-maintenance/core.js']).mode, 'targeted');
});

test('shared privacy and cleanup source changes select every generated deployment consumer', () => {
  for (const source of [
    'cloudfunctions/shared/privacy.js',
    'cloudfunctions/profile-media-cleanup/store.js',
  ]) {
    const decision = createCloudBaseDeployDecision([source], config);
    assert.ok(decision.functions.includes('privacy-maintenance'));
  }
  const decision = createCloudBaseDeployDecision(['cloudfunctions/shared/privacy.js'], config);
  assert.ok(decision.functions.includes('profile'));
  assert.ok(decision.functions.includes('profile-media-cleanup'));
});
