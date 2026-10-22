'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { privacyDatabase } = require('./privacy-fixture');
const { createProfileStore } = require('./store');
const { clientUploadIntent, mediaOwnerPrefix } = require('./core');
let subject = {};
try {
  subject = require('./privacy');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const createPrivacyService = subject.createPrivacyService || (() => ({}));
const confirmation = {
  requestId: 'delete_request_123',
  policyVersion: '2026-10-21',
  scope: 'self-profile-and-personal-media',
  confirmed: true,
};
const now = new Date('2026-10-21T10:00:00Z');

test('deletion requires trusted self and rejects arbitrary owner, collections and media IDs', async () => {
  const fixture = privacyDatabase();
  const service = createPrivacyService(fixture.db);
  assert.equal(typeof service.requestDeletion, 'function');
  await assert.rejects(service.requestDeletion('', confirmation, now), { code: 'UNAUTHENTICATED' });
  for (const extra of [
    { owner: 'other' },
    { openid: 'other' },
    { mediaIds: [] },
    { collections: [] },
  ]) {
    await assert.rejects(service.requestDeletion('owner', { ...confirmation, ...extra }, now), {
      code: 'FORBIDDEN_FIELD',
    });
  }
  await assert.rejects(
    service.requestDeletion('owner', { ...confirmation, confirmed: false }, now),
    {
      code: 'DELETION_CONFIRMATION_REQUIRED',
    },
  );
  assert.equal(fixture.state.privacy_requests?.size || 0, 0);
});

test('request is durable and idempotent, locks missing profiles, and DTO contains no PII or leases', async () => {
  const fixture = privacyDatabase({
    profiles: [{ _id: 'owner', nickname: 'private', phone_cipher: { ciphertext: 'secret' } }],
  });
  const service = createPrivacyService(fixture.db);
  assert.equal(typeof service.requestDeletion, 'function');
  const first = await service.requestDeletion('owner', confirmation, now);
  const repeat = await service.requestDeletion(
    'owner',
    { ...confirmation, requestId: 'another_request' },
    now,
  );
  assert.equal(first.requestId, repeat.requestId);
  assert.equal(first.status, 'requested');
  assert.equal(first.complete, false);
  assert.equal(fixture.state.privacy_requests.size, 1);
  assert.equal(fixture.state.profiles.get('owner').nickname, undefined);
  assert.equal(fixture.state.profiles.get('owner').deletion_status, 'requested');
  assert.doesNotMatch(JSON.stringify(first), /private|secret|owner_openid|lease/);
  await service.requestDeletion('missing', confirmation, now);
  await assert.rejects(createProfileStore(fixture.db).mergePhone('missing', { phone_cipher: {} }), {
    code: 'PROFILE_DELETION_LOCKED',
  });
});

test('explicit recreation increments generation and original deletion retries cannot lock new profile', async () => {
  const fixture = privacyDatabase({ profiles: [{ _id: 'owner', generation: 2, nickname: 'old' }] });
  const service = createPrivacyService(fixture.db);
  assert.equal(typeof service.recreate, 'function');
  const requested = await service.requestDeletion('owner', { ...confirmation, generation: 2 }, now);
  await fixture.db
    .collection('privacy_requests')
    .doc(requested.requestId)
    .update({ data: { status: 'completed', phase: 'done' } });
  await fixture.db
    .collection('profiles')
    .doc('owner')
    .update({ data: { deletion_status: 'completed' } });
  const recreated = await service.recreate(
    'owner',
    {
      requestId: requested.requestId,
      generation: 2,
      policyVersion: confirmation.policyVersion,
      scope: confirmation.scope,
      confirmed: true,
    },
    now,
  );
  assert.equal(recreated.generation, 3);
  await createProfileStore(fixture.db).mergePhone('owner', { phone_cipher: {} }, 3);
  const retry = await service.requestDeletion('owner', confirmation, now);
  assert.equal(retry.status, 'completed');
  assert.equal(fixture.state.profiles.get('owner').generation, 3);
  assert.equal(fixture.state.profiles.get('owner').deletion_status, 'active');
  await assert.rejects(
    createProfileStore(fixture.db).mergePhone('owner', { phone_cipher: {} }, 2),
    { code: 'PROFILE_GENERATION_MISMATCH' },
  );
  await assert.rejects(createProfileStore(fixture.db).mergePhone('owner', { phone_cipher: {} }), {
    code: 'PROFILE_GENERATION_MISMATCH',
  });
});

test('old client upload and late avatar cannot write while deletion is locked', async () => {
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const fileId = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const fixture = privacyDatabase({
    profiles: [{ _id: 'owner', generation: 1, deletion_status: 'requested' }],
  });
  const store = createProfileStore(fixture.db);
  await assert.rejects(
    store.prepareClientUpload(
      'owner',
      clientUploadIntent('owner', fileId.split('env/')[1], secret, now),
      secret,
    ),
    { code: 'PROFILE_DELETION_LOCKED' },
  );
  await assert.rejects(store.setAvatar('owner', 'wechat', fileId, secret), {
    code: 'PROFILE_DELETION_LOCKED',
  });
});

test('deletion racing a real canonical upload preserves intents but cannot restore media registry', async () => {
  const { canonicalizeClientMedia } = require('./media-upload');
  const { mediaPath, clientUploadIntentId } = require('./core');
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const fileId = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const fixture = privacyDatabase({ profiles: [{ _id: 'owner', generation: 2 }] });
  const store = createProfileStore(fixture.db);
  await store.prepareClientUpload(
    'owner',
    clientUploadIntent('owner', mediaPath(fileId), secret, now, {
      category: 'profile-avatar',
      requestId: 'request_late_upload',
    }),
    secret,
    2,
  );
  await assert.rejects(
    canonicalizeClientMedia({
      openid: 'owner',
      fileId,
      category: 'profile-avatar',
      origin: 'custom',
      requestId: 'request_late_upload',
      generation: 2,
      mediaSecret: secret,
      store,
      now,
      getTempFileURL: async () => ({
        fileList: [{ fileID: fileId, status: 0, tempFileURL: 'https://storage.example/source' }],
      }),
      verifyImage: async () => ({
        bytes: Buffer.from([1]),
        sha256: 'a'.repeat(64),
        size: 1,
        mime: 'image/jpeg',
        extension: 'jpg',
      }),
      transformImage: async (verified) => verified,
      uploadFile: async ({ cloudPath }) => {
        await createPrivacyService(fixture.db).requestDeletion(
          'owner',
          { ...confirmation, generation: 2 },
          now,
        );
        return { fileID: `cloud://env/${cloudPath}` };
      },
    }),
    { code: 'PROFILE_DELETION_LOCKED' },
  );
  assert.equal(fixture.state.profile_media?.size || 0, 0);
  assert.equal(fixture.state.profile_media_imports.size, 2);
  assert.equal(
    fixture.state.profile_media_imports.get(clientUploadIntentId(mediaPath(fileId))).generation,
    2,
  );
  assert.equal(fixture.state.profiles.get('owner').deletion_status, 'requested');
});

test('recreated profile cannot reissue an upload authorization from an older generation', async () => {
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const path = `${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const intent = clientUploadIntent('owner', path, secret, now);
  const fixture = privacyDatabase({
    profiles: [{ _id: 'owner', generation: 3, deletion_status: 'active' }],
    profile_media_imports: [{ ...intent, generation: 2 }],
  });
  await assert.rejects(
    createProfileStore(fixture.db).prepareClientUpload('owner', intent, secret, 3),
    {
      code: 'PROFILE_GENERATION_MISMATCH',
    },
  );
});

test('old-generation recovery reports pending status without locking or recreating newer profile data', async () => {
  const { createPrivacyStore } = require('../privacy-maintenance/store');
  const { drainPrivacy } = require('../privacy-maintenance/core');
  const fixture = privacyDatabase({ profiles: [{ _id: 'owner', generation: 2, nickname: 'old' }] });
  const service = createPrivacyService(fixture.db);
  const request = await service.requestDeletion('owner', { ...confirmation, generation: 2 }, now);
  const worker = createPrivacyStore(fixture.db, 'profile-media-secret-for-tests-32-bytes');
  for (let index = 0; index < 20; index += 1) await drainPrivacy({ store: worker, now });
  await service.recreate(
    'owner',
    { ...confirmation, requestId: request.requestId, generation: 2 },
    now,
  );
  await createProfileStore(fixture.db).mergePhone(
    'owner',
    { phone_cipher: { ciphertext: 'new' } },
    3,
  );
  const protectedProfile = structuredClone(fixture.state.profiles.get('owner'));
  await fixture.db
    .collection('registrations')
    .doc('old')
    .set({
      data: {
        openid: 'owner',
        profile_generation: 2,
        status: 'cancelled',
        profile_snapshot: { nickname: 'restored' },
      },
    });
  await worker.replayDeletion(request.requestId, now);
  const retry = await service.requestDeletion('owner', { ...confirmation, generation: 2 }, now);
  assert.equal(retry.complete, false);
  assert.equal(retry.completedAt, null);
  await assert.rejects(
    service.recreate(
      'owner',
      { ...confirmation, requestId: request.requestId, generation: 2 },
      now,
    ),
    { code: 'DELETION_NOT_COMPLETED' },
  );
  for (let index = 0; index < 20; index += 1) await drainPrivacy({ store: worker, now });
  assert.deepEqual(fixture.state.registrations.get('old').profile_snapshot, {});
  assert.equal(
    (await service.deletionStatus('owner', { requestId: request.requestId })).complete,
    true,
  );
  assert.deepEqual(fixture.state.profiles.get('owner'), protectedProfile);
});

test('unavailable profile lookup cannot publish an unenrolled snapshot after the durable deletion lock', async () => {
  const { projectPrivateRegistration } = require('../shared/privacy');
  const fixture = privacyDatabase({
    profiles: [{ _id: 'owner', nickname: 'private', gender: 'male' }],
    registrations: [
      {
        _id: 'r',
        openid: 'owner',
        status: 'approved',
        profile_snapshot: { nickname: 'private', gender: 'male' },
      },
    ],
  });
  await createPrivacyService(fixture.db).requestDeletion('owner', confirmation, now);
  const stored = fixture.state.registrations.get('r');
  assert.equal(stored.privacy_generation, undefined);
  assert.equal(fixture.state.profiles.get('owner').deletion_status, 'requested');
  assert.deepEqual(projectPrivateRegistration(stored, undefined).profile_snapshot, {});
  assert.equal(stored.profile_snapshot.nickname, 'private');
});

module.exports = { confirmation, now };
