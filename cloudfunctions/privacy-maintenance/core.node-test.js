'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { privacyDatabase } = require('../profile/privacy-fixture');
const { mediaDocumentId, mediaOwnerPrefix } = require('../profile/core');
let core = {};
let persistence = {};
let privacy = {};
try {
  core = require('./core');
  persistence = require('./store');
  privacy = require('../profile/privacy');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const now = new Date('2026-10-21T10:00:00Z');
const secret = 'profile-media-secret-for-tests-32-bytes';
const confirmation = {
  requestId: 'delete_request_123',
  policyVersion: '2026-10-21',
  scope: 'self-profile-and-personal-media',
  confirmed: true,
};
async function setup(seed = {}) {
  assert.equal(typeof persistence.createPrivacyStore, 'function');
  const fixture = privacyDatabase({
    profiles: [
      {
        _id: 'owner',
        generation: 2,
        nickname: 'old',
        phone_cipher: { ciphertext: 'contact' },
        id_number_cipher: { ciphertext: 'old-id' },
        role: 'admin',
      },
    ],
    ...seed,
  });
  const service = privacy.createPrivacyService(fixture.db);
  const request = await service.requestDeletion('owner', { ...confirmation, generation: 2 }, now);
  const store = persistence.createPrivacyStore(fixture.db, secret);
  return { ...fixture, service, store, id: request.requestId };
}
async function tick(fixture, time = now) {
  return core.drainPrivacy({
    store: fixture.store,
    now: time,
    limit: 2,
    randomUUID: () => 'lease-test',
  });
}
async function settle(fixture, time = now) {
  for (let index = 0; index < 40; index += 1) await tick(fixture, time);
  return fixture.state.privacy_requests.get(fixture.id);
}

test('worker accepts only the configured Timer and no user identity or client deletion actions', () => {
  assert.equal(typeof core.authorizePrivacy, 'function');
  for (const [event, openid] of [
    [{ Type: 'Timer', TriggerName: 'privacy-maintenance-worker' }, 'owner'],
    [{ action: 'delete' }, undefined],
    [{ Type: 'Timer', TriggerName: 'profile-media-cleanup-worker' }, undefined],
  ])
    assert.throws(() => core.authorizePrivacy(event, openid), {
      code: 'SERVICE_IDENTITY_REQUIRED',
    });
  assert.equal(
    core.authorizePrivacy({ Type: 'Timer', TriggerName: 'privacy-maintenance-worker' }),
    'timer-worker',
  );
});

test('real snapshots and legacy PII are erased without deleting roles, activities, occupancy or audits', async () => {
  const f = await setup({
    registrations: ['a', 'b', 'c', 'd', 'e'].map((_id) => ({
      _id,
      openid: 'owner',
      activity_id: 'event',
      status: 'cancelled',
      profile_snapshot: { nickname: 'old', emergency_name: 'private' },
    })),
    activities: [{ _id: 'event', created_by: 'owner', occupied_count: 3 }],
    audit_logs: [{ _id: 'audit', actor_openid: 'owner' }],
  });
  const result = await settle(f);
  assert.equal(result.status, 'completed');
  for (const r of f.state.registrations.values()) assert.deepEqual(r.profile_snapshot, {});
  assert.equal(f.state.profiles.get('owner').phone_cipher, undefined);
  assert.equal(f.state.profiles.get('owner').id_number_cipher, undefined);
  assert.equal(f.state.profiles.get('owner').role, 'admin');
  assert.equal(f.state.activities.get('event').occupied_count, 3);
  assert.equal(f.state.audit_logs.size, 1);
  assert.equal(result.cursors.registrations, 'e');
});

test('active and unknown-end registrations are restricted with encrypted necessary contact until trusted end', async () => {
  const f = await setup({
    registrations: [
      {
        _id: 'r',
        openid: 'owner',
        activity_id: 'event',
        status: 'checked_in',
        profile_snapshot: { nickname: 'old', phone_masked: '123' },
      },
    ],
    activities: [{ _id: 'event', status: 'published' }],
  });
  assert.equal((await settle(f)).status, 'restricted');
  const registration = f.state.registrations.get('r');
  assert.deepEqual(registration.profile_snapshot, {});
  assert.equal(registration.status, 'checked_in');
  assert.equal(registration.privacy_contact.phone_cipher.ciphertext, 'contact');
  assert.equal(f.state.profiles.get('owner').phone_cipher, undefined);
  await f.db
    .collection('activities')
    .doc('event')
    .update({ data: { event_end: new Date('2026-10-21T09:00:00Z') } });
  assert.equal((await settle(f, new Date('2026-10-21T11:00:00Z'))).status, 'completed');
  assert.equal(f.state.registrations.get('r').privacy_contact, undefined);
});

test('personal media wait for trusted deleted state; same-owner business media are untouched', async () => {
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const id = mediaDocumentId(source);
  const f = await setup({
    profile_media: [
      {
        _id: id,
        owner_openid: 'owner',
        file_id: source,
        category: 'profile-avatar',
        status: 'active',
      },
      {
        _id: 'business',
        owner_openid: 'owner',
        file_id: 'cloud://env/business.jpg',
        category: 'activity-image',
        status: 'active',
      },
    ],
  });
  assert.equal((await settle(f)).status, 'awaiting_media');
  assert.equal(f.state.profile_media.get(id).status, 'unreferenced');
  assert.equal(f.state.profile_media.get('business').status, 'active');
  await f.db
    .collection('profile_media')
    .doc(id)
    .update({ data: { status: 'deleted' } });
  assert.equal((await settle(f, new Date('2026-10-21T11:00:00Z'))).status, 'completed');
});

test('cross-business references and lost legacy intents go to manual review without losing targets', async () => {
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const id = mediaDocumentId(source);
  const f = await setup({
    profile_media: [
      { _id: id, owner_openid: 'owner', file_id: source, category: 'other', status: 'active' },
    ],
    activities: [{ _id: 'event', images: [source] }],
    profile_media_imports: [{ _id: 'lost', owner_openid: 'owner', status: 'aborted' }],
  });
  assert.equal((await settle(f)).status, 'manual_review');
  assert.equal(f.state.profile_media.get(id).status, 'privacy_manual_review');
  assert.equal(f.state.profile_media.get(id).file_id, source);
  assert.equal(f.state.profile_media_imports.get('lost').privacy_request_id, f.id);
  assert.equal(f.state.activities.get('event').images[0], source);
});

test('fencing rejects stale leases and delayed original worker cannot erase a recreated generation', async () => {
  const f = await setup();
  await f.store.claim(f.id, { leaseId: 'old', now });
  const later = new Date(now.getTime() + 6 * 60 * 1000);
  await f.store.claim(f.id, { leaseId: 'new', now: later });
  assert.equal(await f.store.process(f.id, { leaseId: 'old', now: later }, 2), false);
  await settle(f, new Date(later.getTime() + 6 * 60 * 1000));
  await f.service.recreate('owner', { ...confirmation, requestId: f.id, generation: 2 }, later);
  await f.db
    .collection('profiles')
    .doc('owner')
    .update({ data: { nickname: 'new' } });
  assert.equal(await f.store.process(f.id, { leaseId: 'new', now: later }, 2), false);
  assert.equal(f.state.profiles.get('owner').nickname, 'new');
  assert.equal(f.state.profiles.get('owner').generation, 3);
});

test('failures persist safe classifications, retry phase, and eventually require manual review', async () => {
  const f = await setup();
  const original = f.store.process;
  f.store.process = async () => {
    throw new Error('phone=13812345678 internal secret');
  };
  for (let i = 0; i < 4; i += 1) await tick(f, new Date(now.getTime() + i * 60 * 60 * 1000));
  const result = f.state.privacy_requests.get(f.id);
  assert.equal(result.status, 'manual_review');
  assert.equal(result.phase, 'registrations');
  assert.doesNotMatch(JSON.stringify(result), /13812345678|internal secret/);
  f.store.process = original;
});

test('controlled restore replay scrubs restored snapshots but never a newer profile generation', async () => {
  const f = await setup({
    registrations: [
      { _id: 'r', openid: 'owner', status: 'cancelled', profile_snapshot: { nickname: 'old' } },
    ],
  });
  await settle(f);
  await f.db
    .collection('registrations')
    .doc('r')
    .update({ data: { profile_snapshot: { nickname: 'restored' } } });
  await f.store.replayDeletion(f.id, now);
  assert.equal((await settle(f)).status, 'completed');
  assert.deepEqual(f.state.registrations.get('r').profile_snapshot, {});
  await f.service.recreate('owner', { ...confirmation, requestId: f.id, generation: 2 }, now);
  assert.deepEqual(await f.store.replayDeletion(f.id, now), { status: 'queued', generation: 2 });
  assert.equal(f.state.profiles.get('owner').generation, 3);
});

test('older restored data is replayed without touching a newer profile, registrations or media', async () => {
  const { createCleanupStore } = require('./media-store');
  const { drainMediaCleanup } = require('./media-core');
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const fresh = source.replace('4000.jpg', '4002.jpg');
  const id = mediaDocumentId(source);
  const f = await setup({
    registrations: [
      {
        _id: 'old',
        openid: 'owner',
        profile_generation: 2,
        status: 'cancelled',
        profile_snapshot: {},
      },
    ],
    profile_media: [
      { _id: id, owner_openid: 'owner', generation: 2, file_id: source, status: 'deleted' },
    ],
  });
  await settle(f);
  await f.service.recreate('owner', { ...confirmation, requestId: f.id, generation: 2 }, now);
  await f.db
    .collection('profiles')
    .doc('owner')
    .update({
      data: { nickname: 'new', phone_cipher: { ciphertext: 'new-contact' }, avatar_file_id: fresh },
    });
  await f.db
    .collection('registrations')
    .doc('old')
    .update({
      data: {
        profile_snapshot: { nickname: 'restored', avatar_file_id: source },
        options: { remark: 'old-private' },
      },
    });
  await f.db
    .collection('registrations')
    .doc('new')
    .set({
      data: {
        openid: 'owner',
        profile_generation: 3,
        status: 'approved',
        profile_snapshot: { nickname: 'new', avatar_file_id: fresh },
        options: { remark: 'new-private' },
      },
    });
  await f.db
    .collection('profile_media')
    .doc(mediaDocumentId(fresh))
    .set({
      data: { owner_openid: 'owner', generation: 3, file_id: fresh, status: 'active' },
    });
  const protectedProfile = structuredClone(f.state.profiles.get('owner'));
  const protectedRegistration = structuredClone(f.state.registrations.get('new'));
  const protectedMedia = structuredClone(f.state.profile_media.get(mediaDocumentId(fresh)));
  const later = new Date('2026-10-23T10:00:00Z');
  await f.store.replayDeletion(f.id, later);
  assert.equal((await settle(f, later)).status, 'awaiting_media');
  assert.deepEqual(f.state.registrations.get('old').profile_snapshot, {});
  assert.deepEqual(f.state.privacy_requests.get(f.id).media_targets, [source]);
  const storage = new Set([source, fresh]);
  await drainMediaCleanup({
    store: createCleanupStore(f.db, secret),
    now: later,
    deleteFile: async ({ fileList }) => {
      for (const target of fileList) storage.delete(target);
      return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) };
    },
  });
  assert.deepEqual([...storage], [fresh]);
  assert.equal((await settle(f, new Date(later.getTime() + 60 * 60 * 1000))).status, 'completed');
  assert.deepEqual(f.state.profiles.get('owner'), protectedProfile);
  assert.deepEqual(f.state.registrations.get('new'), protectedRegistration);
  assert.deepEqual(f.state.profile_media.get(mediaDocumentId(fresh)), protectedMedia);
});

test('recovery never borrows newer contact data and retry exhaustion never locks the newer profile', async () => {
  const f = await setup({
    registrations: [{ _id: 'old', openid: 'owner', profile_generation: 2, status: 'cancelled' }],
  });
  await settle(f);
  await f.service.recreate('owner', { ...confirmation, requestId: f.id, generation: 2 }, now);
  await f.db
    .collection('profiles')
    .doc('owner')
    .update({ data: { phone_cipher: { ciphertext: 'new-private' } } });
  await f.db
    .collection('registrations')
    .doc('old')
    .update({ data: { status: 'approved', profile_snapshot: { nickname: 'restored' } } });
  const protectedProfile = structuredClone(f.state.profiles.get('owner'));
  await f.store.replayDeletion(f.id, now);
  assert.equal((await settle(f)).status, 'restricted');
  assert.doesNotMatch(JSON.stringify(f.state.registrations.get('old')), /new-private|restored/);
  for (let index = 1; index <= 5; index += 1) {
    await f.store.claim(f.id, {
      leaseId: `timeout-${index}`,
      now: new Date(now.getTime() + index * 60 * 60 * 1000),
    });
  }
  assert.equal(f.state.privacy_requests.get(f.id).status, 'manual_review');
  assert.deepEqual(f.state.profiles.get('owner'), protectedProfile);
});

test('Timer replay returns explicit queued, already-running and blocked outcomes without private details', async () => {
  const Module = require('node:module');
  const f = await setup();
  await settle(f);
  const originalLoad = Module._load;
  Module._load = function (name, ...args) {
    if (name === 'wx-server-sdk')
      return {
        init() {},
        database: () => f.db,
        getWXContext: () => ({}),
      };
    return originalLoad.call(this, name, ...args);
  };
  let main;
  try {
    delete require.cache[require.resolve('./index')];
    main = require('./index').main;
  } finally {
    Module._load = originalLoad;
  }
  const event = { Type: 'Timer', TriggerName: 'privacy-maintenance-worker', ReplayRequestId: f.id };
  const first = await main(event);
  assert.deepEqual(first.data.replay, { status: 'queued', generation: 2 });
  const epoch = f.state.privacy_requests.get(f.id).replay_epoch;
  const repeat = await main(event);
  assert.deepEqual(repeat.data.replay, { status: 'already_running', generation: 2 });
  assert.equal(f.state.privacy_requests.get(f.id).replay_epoch, epoch);
  const blocked = await main({ ...event, ReplayRequestId: `deletion-${'a'.repeat(64)}` });
  assert.deepEqual(blocked.data.replay, { status: 'blocked', code: 'DELETION_NOT_FOUND' });
  assert.doesNotMatch(
    JSON.stringify([first, repeat, blocked]),
    /owner_openid|lease|replay_epoch|phone/,
  );
});

test('restore replay requires fresh physical deletion for historically deleted registry and intent rows', async () => {
  const { clientUploadIntent, mediaPath } = require('../profile/core');
  const { createCleanupStore } = require('../profile-media-cleanup/store');
  const { drainMediaCleanup } = require('../profile-media-cleanup/core');
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const imported = source.replace('4000.jpg', '4001.jpg');
  const intent = clientUploadIntent('owner', mediaPath(imported), secret, now);
  const f = await setup({
    profile_media: [
      {
        _id: mediaDocumentId(source),
        owner_openid: 'owner',
        generation: 2,
        file_id: source,
        category: 'profile-avatar',
        status: 'deleted',
        deleted_at: now,
      },
    ],
    profile_media_imports: [{ ...intent, generation: 2, file_id: imported, status: 'deleted' }],
  });
  assert.equal((await settle(f)).status, 'completed');
  const storage = new Set([source, imported]);
  const later = new Date('2026-10-23T10:00:00Z');
  await f.store.replayDeletion(f.id, later);
  assert.equal((await settle(f, later)).status, 'awaiting_media');
  const epoch = f.state.privacy_requests.get(f.id).replay_epoch;
  assert.ok(epoch);
  await drainMediaCleanup({
    store: createCleanupStore(f.db, secret),
    now: later,
    deleteFile: async ({ fileList }) => {
      for (const target of fileList) storage.delete(target);
      return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) };
    },
  });
  assert.equal(storage.size, 0);
  assert.equal(f.state.profile_media.get(mediaDocumentId(source)).privacy_deleted_epoch, epoch);
  assert.equal(f.state.profile_media_imports.get(intent._id).privacy_deleted_epoch, epoch);
  assert.equal((await settle(f, new Date(later.getTime() + 60 * 60 * 1000))).status, 'completed');
});

test('restore verification rejects historical deletion proof and preserves exhausted targets', async () => {
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const id = mediaDocumentId(source);
  const f = await setup({
    profile_media: [
      { _id: id, owner_openid: 'owner', generation: 2, file_id: source, status: 'deleted' },
    ],
  });
  await settle(f);
  await f.store.replayDeletion(f.id, now);
  await settle(f);
  await f.db
    .collection('profile_media')
    .doc(id)
    .update({
      data: { status: 'deleted', privacy_deleted_epoch: 'historical' },
    });
  assert.equal(
    (await settle(f, new Date(now.getTime() + 60 * 60 * 1000))).status,
    'awaiting_media',
  );
  await f.db
    .collection('profile_media')
    .doc(id)
    .update({
      data: { status: 'delete_failed_terminal', delete_attempts: 3 },
    });
  assert.equal(
    (await settle(f, new Date(now.getTime() + 2 * 60 * 60 * 1000))).status,
    'manual_review',
  );
  assert.equal(f.state.profile_media.get(id).file_id, source);
  assert.equal(f.state.profile_media.get(id).delete_attempts, 3);
});

test('restored profile-only targets are retained before replay scrubs the matching sentinel', async () => {
  const f = await setup();
  await settle(f);
  const target = 'cloud://env/restored-profile-only.jpg';
  await f.db
    .collection('profiles')
    .doc('owner')
    .update({ data: { avatar_file_id: target } });
  await f.store.replayDeletion(f.id, now);
  assert.deepEqual(f.state.privacy_requests.get(f.id).media_targets, [target]);
  assert.equal(f.state.profiles.get('owner').avatar_file_id, undefined);
  assert.equal((await settle(f)).status, 'manual_review');
});

test('unsafe replay explicitly blocks conflicting sentinels and target overflow without mutating data', async () => {
  for (const data of [
    { deletion_request_id: 'another-deletion' },
    {
      photos: Array.from({ length: 257 }, (_, index) => ({
        file_id: `cloud://env/restore-${index}.jpg`,
      })),
    },
  ]) {
    const f = await setup();
    await settle(f);
    await f.db.collection('profiles').doc('owner').update({ data });
    const before = structuredClone(f.state);
    const result = await f.store.replayDeletion(f.id, now);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(f.state, before);
  }
});

test('a previous recovery lease cannot confirm media deletion in a new replay epoch', async (t) => {
  for (const modulePath of ['../profile-media-cleanup/store', './media-store']) {
    await t.test(modulePath, async () => {
      const { createCleanupStore } = require(modulePath);
      const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
      const id = mediaDocumentId(source);
      const f = await setup({
        profile_media: [
          { _id: id, owner_openid: 'owner', generation: 2, file_id: source, status: 'active' },
        ],
      });
      await settle(f);
      const later = new Date('2026-10-23T10:00:00Z');
      const cleanup = createCleanupStore(f.db, secret);
      assert.equal((await cleanup.claim(id, { leaseId: 'old-media', now: later })).claimed, true);
      await f.db
        .collection('privacy_requests')
        .doc(f.id)
        .update({ data: { status: 'completed' } });
      await f.db
        .collection('profiles')
        .doc('owner')
        .update({ data: { deletion_status: 'completed' } });
      await f.store.replayDeletion(f.id, later);
      assert.equal(
        await cleanup.isMediaDeleteLeaseCurrent(id, { leaseId: 'old-media', now: later }),
        false,
      );
      assert.equal(await cleanup.markDeleted(id, { leaseId: 'old-media', now: later }), false);
      assert.equal(
        await cleanup.markFailed(id, {
          leaseId: 'old-media',
          now: later,
          errorCode: 'OLD_FAILURE',
        }),
        false,
      );
      assert.equal(f.state.profile_media.get(id).status, 'deleting');
    });
  }
});

test('previous import leases cannot persist confirmation or failure after replay starts', async (t) => {
  for (const modulePath of ['../profile-media-cleanup/store', './media-store']) {
    await t.test(modulePath, async () => {
      const { createCleanupStore } = require(modulePath);
      const { clientUploadIntent, mediaPath } = require('../profile/core');
      const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
      const intent = clientUploadIntent('owner', mediaPath(source), secret, now);
      const f = await setup({
        profile_media_imports: [{ ...intent, generation: 2, file_id: source }],
      });
      await settle(f);
      const later = new Date('2026-10-23T10:00:00Z');
      const cleanup = createCleanupStore(f.db, secret);
      assert.equal(
        (await cleanup.claimImportIntent(intent._id, { leaseId: 'old-import', now: later }))
          .claimed,
        true,
      );
      await f.db
        .collection('privacy_requests')
        .doc(f.id)
        .update({ data: { status: 'completed' } });
      await f.store.replayDeletion(f.id, later);
      const fence = { leaseId: 'old-import', now: later, fileId: source };
      assert.equal(await cleanup.isImportDeleteLeaseCurrent(intent._id, fence), false);
      assert.equal(await cleanup.markImportDeleted(intent._id, fence), false);
      assert.equal(
        await cleanup.markImportFailed(intent._id, { ...fence, errorCode: 'OLD_FAILURE' }),
        false,
      );
      assert.equal(f.state.profile_media_imports.get(intent._id).status, 'deleting');
    });
  }
});

test('repeated worker timeouts exhaust a durable lease budget', async () => {
  const f = await setup();
  for (let i = 0; i < 5; i += 1)
    await f.store.claim(f.id, {
      leaseId: `timeout-${i}`,
      now: new Date(now.getTime() + i * 60 * 60 * 1000),
    });
  assert.equal(f.state.privacy_requests.get(f.id).status, 'manual_review');
  assert.equal(f.state.profiles.get('owner').deletion_status, 'manual_review');
});

test('a worker invocation bounds expensive registration and reference work to small batches', async () => {
  const f = await setup({
    registrations: Array.from({ length: 25 }, (_, i) => ({
      _id: `r${String(i).padStart(2, '0')}`,
      openid: 'owner',
      status: 'cancelled',
      profile_snapshot: { nickname: 'old' },
    })),
  });
  await tick(f);
  assert.ok(
    [...f.state.registrations.values()].filter((row) => row.privacy_generation).length <= 3,
  );
});

test('due compensation is not starved by new requests or unexpired processing leases', async () => {
  const f = await setup();
  await f.db
    .collection('privacy_requests')
    .doc('older')
    .set({
      data: {
        status: 'awaiting_media',
        retry_at: new Date(now.getTime() - 60 * 60 * 1000),
      },
    });
  assert.deepEqual(await f.store.listEligible(now, 1), ['older']);
  await f.store.claim(f.id, { leaseId: 'busy', now });
  const later = new Date(now.getTime() + 60 * 1000);
  assert.deepEqual(await f.store.listEligible(later, 2), ['older']);
});

test('unknown legacy media categories are preserved for manual classification', async () => {
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const f = await setup({
    profile_media: [
      {
        _id: mediaDocumentId(source),
        owner_openid: 'owner',
        file_id: source,
        category: 'unknown-legacy',
        status: 'active',
      },
    ],
  });
  assert.equal((await settle(f)).status, 'manual_review');
});

test('route preview source and generated references protect personal-category media', async () => {
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const f = await setup({
    profile_media: [
      {
        _id: mediaDocumentId(source),
        owner_openid: 'owner',
        file_id: source,
        category: 'other',
        status: 'active',
      },
    ],
    route_previews: [{ _id: 'preview', generated_file_id: source }],
  });
  assert.equal((await settle(f)).status, 'manual_review');
});

test('real media cleanup rechecks cross-business references added after privacy enrollment', async () => {
  const { createCleanupStore } = require('../profile-media-cleanup/store');
  const { drainMediaCleanup } = require('../profile-media-cleanup/core');
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const id = mediaDocumentId(source);
  const f = await setup({
    profile_media: [
      {
        _id: id,
        owner_openid: 'owner',
        file_id: source,
        category: 'profile-avatar',
        status: 'active',
      },
    ],
  });
  await settle(f);
  await f.db
    .collection('activities')
    .doc('business')
    .set({ data: { images: [source] } });
  const deleted = [];
  await drainMediaCleanup({
    store: createCleanupStore(f.db, secret),
    now: new Date('2026-10-23T10:00:00Z'),
    deleteFile: async ({ fileList }) => {
      deleted.push(...fileList);
      return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) };
    },
  });
  assert.deepEqual(deleted, []);
  assert.equal(f.state.profile_media.get(id).status, 'privacy_manual_review');
});

test('privacy cleanup revalidates the enrolled owner-bound source before any physical deletion', async () => {
  const { createCleanupStore } = require('../profile-media-cleanup/store');
  const { drainMediaCleanup } = require('../profile-media-cleanup/core');
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const id = mediaDocumentId(source);
  const f = await setup({
    profile_media: [
      {
        _id: id,
        owner_openid: 'owner',
        file_id: source,
        category: 'profile-avatar',
        status: 'active',
      },
    ],
  });
  await settle(f);
  await f.db
    .collection('profile_media')
    .doc(id)
    .update({ data: { file_id: 'cloud://env/other-owner/business.jpg' } });
  const targets = [];
  await drainMediaCleanup({
    store: createCleanupStore(f.db, secret),
    now: new Date('2026-10-23T10:00:00Z'),
    deleteFile: async ({ fileList }) => {
      targets.push(...fileList);
      return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) };
    },
  });
  assert.deepEqual(targets, []);
  assert.equal(f.state.profile_media.get(id).status, 'privacy_manual_review');
});

test('real cleanup keeps deletion pending until exact storage confirmation', async () => {
  const { createCleanupStore } = require('../profile-media-cleanup/store');
  const { drainMediaCleanup } = require('../profile-media-cleanup/core');
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const id = mediaDocumentId(source);
  const f = await setup({
    profile_media: [
      {
        _id: id,
        owner_openid: 'owner',
        file_id: source,
        category: 'profile-avatar',
        status: 'active',
      },
    ],
  });
  await settle(f);
  const later = new Date('2026-10-23T10:00:00Z');
  const store = createCleanupStore(f.db, secret);
  await drainMediaCleanup({ store, now: later, deleteFile: async () => ({ fileList: [] }) });
  assert.equal(f.state.profile_media.get(id).status, 'delete_failed');
  assert.equal((await settle(f, later)).status, 'awaiting_media');
  const retry = new Date(later.getTime() + 60 * 60 * 1000);
  await drainMediaCleanup({
    store,
    now: retry,
    deleteFile: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({ fileID, status: 0 })),
    }),
  });
  assert.equal((await settle(f, retry)).status, 'completed');
});

test('self-contained copied cleanup store resolves its media core inside the worker package', async () => {
  const { createCleanupStore } = require('./media-store');
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const id = mediaDocumentId(source);
  const f = await setup({
    profile_media: [
      {
        _id: id,
        owner_openid: 'owner',
        file_id: source,
        category: 'profile-avatar',
        status: 'active',
      },
    ],
  });
  await settle(f);
  const claimed = await createCleanupStore(f.db, secret).claim(id, {
    now: new Date('2026-10-23T10:00:00Z'),
    leaseId: 'media',
  });
  assert.equal(claimed.claimed, true);
});

test('missing registries retain original personal targets for controlled manual recovery', async () => {
  const target = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const f = await setup({
    profiles: [{ _id: 'owner', generation: 2, avatar_file_id: target, nickname: 'old' }],
  });
  assert.equal((await settle(f)).status, 'manual_review');
  assert.deepEqual(f.state.privacy_requests.get(f.id).media_targets, [target]);
  assert.equal(f.state.profiles.get('owner').avatar_file_id, undefined);
});

test('snapshot-only legacy personal targets are durable before scrubbing and cannot complete unaccounted', async () => {
  const avatar = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const background = 'cloud://env/legacy-background.jpg';
  const photo = 'cloud://env/legacy-photo.jpg';
  const f = await setup({
    registrations: [
      {
        _id: 'r',
        openid: 'owner',
        status: 'cancelled',
        profile_snapshot: {
          avatar_file_id: avatar,
          background_photo: { file_id: background },
          photos: [{ file_id: photo }, { file_id: avatar }],
        },
      },
    ],
  });
  await tick(f);
  assert.deepEqual(f.state.privacy_requests.get(f.id).media_targets, [avatar, background, photo]);
  assert.deepEqual(f.state.registrations.get('r').profile_snapshot, {});
  assert.equal((await settle(f)).status, 'manual_review');
  assert.deepEqual(f.state.privacy_requests.get(f.id).media_targets, [avatar, background, photo]);
});

test('snapshot target accounting is bounded and retains a suppressed snapshot on overflow', async () => {
  const targets = Array.from({ length: 256 }, (_, i) => `cloud://env/legacy-${i}.jpg`);
  const snapshot = { photos: targets.map((file_id) => ({ file_id })) };
  const f = await setup({
    profiles: [{ _id: 'owner', generation: 2, avatar_file_id: 'cloud://env/current.jpg' }],
    registrations: [{ _id: 'r', openid: 'owner', status: 'cancelled', profile_snapshot: snapshot }],
  });
  await tick(f);
  assert.deepEqual(f.state.registrations.get('r').profile_snapshot, snapshot);
  assert.equal(f.state.registrations.get('r').privacy_public_suppressed, true);
  assert.equal(f.state.privacy_requests.get(f.id).media_targets.length, 1);
  assert.equal((await settle(f)).status, 'manual_review');
});

test('a canonical intent does not count as deletion coverage for its orphaned source object', async () => {
  const { canonicalUploadIntent, canonicalMediaPath } = require('../profile/core');
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const verified = { sha256: 'a'.repeat(64), size: 1, mime: 'image/jpeg', extension: 'jpg' };
  const canonical = `cloud://env/${canonicalMediaPath('owner', source, verified.sha256, verified.extension, secret, 'profile-avatar')}`;
  const intent = canonicalUploadIntent('owner', source, verified, secret, now, 'profile-avatar');
  const f = await setup({
    registrations: [
      {
        _id: 'r',
        openid: 'owner',
        status: 'cancelled',
        profile_snapshot: { avatar_file_id: source },
      },
    ],
    profile_media_imports: [{ ...intent, generation: 2, file_id: canonical, status: 'deleted' }],
  });
  assert.equal((await settle(f)).status, 'manual_review');
  assert.deepEqual(f.state.privacy_requests.get(f.id).media_targets, [source]);
});

test('completed canonical intents delete the canonical object rather than misclassifying the source file', async () => {
  const {
    canonicalMediaBinding,
    canonicalMediaPath,
    canonicalUploadIntent,
    clientUploadIntent,
    mediaPath,
  } = require('../profile/core');
  const { createProfileStore } = require('../profile/store');
  const { createCleanupStore } = require('../profile-media-cleanup/store');
  const { drainMediaCleanup } = require('../profile-media-cleanup/core');
  const source = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
  const verified = { sha256: 'a'.repeat(64), size: 1, mime: 'image/jpeg', extension: 'jpg' };
  const canonical = `cloud://env/${canonicalMediaPath('owner', source, verified.sha256, verified.extension, secret, 'profile-avatar')}`;
  const initial = privacyDatabase({ profiles: [{ _id: 'owner', generation: 2 }] });
  const profileStore = createProfileStore(initial.db);
  const sourceIntent = clientUploadIntent('owner', mediaPath(source), secret, now);
  await profileStore.prepareClientUpload('owner', sourceIntent, secret, 2);
  const intent = {
    ...canonicalUploadIntent('owner', source, verified, secret, now, 'profile-avatar'),
    generation: 2,
  };
  await profileStore.prepareCanonicalUpload('owner', sourceIntent._id, intent, secret, now);
  const binding = canonicalMediaBinding(
    'owner',
    source,
    canonical,
    verified,
    secret,
    'profile-avatar',
  );
  await profileStore.completeClientMedia(
    'owner',
    source,
    sourceIntent._id,
    intent._id,
    binding,
    secret,
    () => ({
      _id: mediaDocumentId(source),
      file_id: source,
      owner_openid: 'owner',
      category: 'profile-avatar',
      status: 'active',
      ...binding,
    }),
    now,
  );
  const service = privacy.createPrivacyService(initial.db);
  const request = await service.requestDeletion('owner', { ...confirmation, generation: 2 }, now);
  const f = {
    ...initial,
    service,
    store: persistence.createPrivacyStore(initial.db, secret),
    id: request.requestId,
  };
  await settle(f);
  const later = new Date('2026-10-23T10:00:00Z');
  const targets = [];
  for (let i = 0; i < 3; i += 1)
    await drainMediaCleanup({
      store: createCleanupStore(f.db, secret),
      now: new Date(later.getTime() + i * 60 * 60 * 1000),
      deleteFile: async ({ fileList }) => {
        targets.push(...fileList);
        return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) };
      },
    });
  assert.equal(
    (await settle(f, new Date(later.getTime() + 4 * 60 * 60 * 1000))).status,
    'completed',
  );
  assert.ok(targets.includes(source));
  assert.ok(targets.includes(canonical));
  assert.equal(f.state.profile_media_imports.get(intent._id).status, 'deleted');
});
