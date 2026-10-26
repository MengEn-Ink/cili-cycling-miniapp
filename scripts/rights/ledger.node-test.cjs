'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { privacyDatabase } = require('./fixture.cjs');

function ledger() {
  assert.ok(existsSync(join(__dirname, 'ledger.cjs')), 'Task1 ledger contract not implemented');
  return require('./ledger.cjs');
}

const target = (index) => `cloud://synthetic-env/profiles/owner-a/ride/${index}.jpg`;

test('snapshot target retention preserves exact source canonical and legacy identifiers', () => {
  const { retainSnapshotTargets, MAX_MEDIA_TARGETS } = ledger();
  assert.equal(MAX_MEDIA_TARGETS, 256);
  const source = 'cloud://synthetic-env/profiles/owner-a/profile-avatar/source.jpg';
  const canonical = 'cloud://synthetic-env/profile-canonical/owner-a/profile-avatar/canonical.jpg';
  const background = 'cloud://synthetic-env/profile-background/owner-a/background.jpg';
  const photo = target('photo');
  const request = { media_targets: [source, canonical], generation: 1, cursors: { targets: '2' } };
  const snapshot = {
    avatar_file_id: source,
    background_photo: { file_id: background },
    photos: [{ file_id: photo }],
  };
  const before = structuredClone(snapshot);
  assert.deepEqual(retainSnapshotTargets(request, snapshot), { ok: true, added: 2, total: 4 });
  assert.deepEqual(request.media_targets, [source, canonical, background, photo]);
  assert.deepEqual(snapshot, before);
  assert.equal(request.generation, 1);
  assert.deepEqual(request.cursors, { targets: '2' });
});

test('target retention deduplicates in first-seen order without rewriting file IDs', () => {
  const { retainSnapshotTargets } = ledger();
  const encoded = 'cloud://synthetic-env/profiles/owner-a/ride/%2f.jpg';
  const distinct = 'cloud://synthetic-env/profiles/owner-a/ride/%2F.jpg';
  const request = { media_targets: [encoded, encoded] };
  const snapshot = {
    avatar_file_id: encoded,
    photos: [{ file_id: distinct }, { file_id: distinct }],
  };
  assert.deepEqual(retainSnapshotTargets(request, snapshot), { ok: true, added: 1, total: 2 });
  assert.deepEqual(request.media_targets, [encoded, distinct]);
  assert.deepEqual(retainSnapshotTargets(request, snapshot), { ok: true, added: 0, total: 2 });
});

test('empty optional snapshots retain existing targets and initialize an empty ledger', () => {
  const { retainSnapshotTargets } = ledger();
  for (const snapshot of [
    undefined,
    null,
    {},
    { avatar_file_id: '', background_photo: null, photos: [] },
  ]) {
    const request = {};
    assert.deepEqual(retainSnapshotTargets(request, snapshot), { ok: true, added: 0, total: 0 });
    assert.deepEqual(request.media_targets, []);
  }
  const request = { media_targets: [target(1)] };
  assert.deepEqual(retainSnapshotTargets(request, {}), { ok: true, added: 0, total: 1 });
  assert.deepEqual(request.media_targets, [target(1)]);
});

test('exactly 256 unique targets are retained including the last snapshot target', () => {
  const { retainSnapshotTargets } = ledger();
  const request = { media_targets: Array.from({ length: 255 }, (_, index) => target(index)) };
  assert.deepEqual(retainSnapshotTargets(request, { photos: [{ file_id: target(255) }] }), {
    ok: true,
    added: 1,
    total: 256,
  });
  assert.equal(request.media_targets.length, 256);
  assert.equal(request.media_targets.at(-1), target(255));
  assert.deepEqual(retainSnapshotTargets(request, { avatar_file_id: target(255) }), {
    ok: true,
    added: 0,
    total: 256,
  });
});

test('257th target returns explicit overflow without truncating or replacing the ledger', () => {
  const { retainSnapshotTargets } = ledger();
  const original = Array.from({ length: 256 }, (_, index) => target(index));
  const request = { media_targets: original, lease_id: 'lease-a', replay_epoch: 2 };
  const snapshot = { avatar_file_id: target(256) };
  assert.deepEqual(retainSnapshotTargets(request, snapshot), {
    ok: false,
    code: 'MEDIA_TARGET_ACCOUNTING_LIMIT',
    total: 257,
  });
  assert.equal(request.media_targets, original);
  assert.equal(request.media_targets.length, 256);
  assert.equal(snapshot.avatar_file_id, target(256));
  assert.equal(request.manual_required, true);
  assert.equal(request.lease_id, 'lease-a');
  assert.equal(request.replay_epoch, 2);
});

test('an oversized snapshot and an existing oversized ledger both fail without data loss', () => {
  const { retainSnapshotTargets } = ledger();
  const snapshot = {
    photos: Array.from({ length: 257 }, (_, index) => ({ file_id: target(index) })),
  };
  const request = { media_targets: [] };
  assert.deepEqual(retainSnapshotTargets(request, snapshot), {
    ok: false,
    code: 'MEDIA_TARGET_ACCOUNTING_LIMIT',
    total: 257,
  });
  assert.deepEqual(request.media_targets, []);
  assert.equal(snapshot.photos.length, 257);
  const oversized = { media_targets: snapshot.photos.map((photo) => photo.file_id) };
  const original = oversized.media_targets;
  assert.deepEqual(retainSnapshotTargets(oversized, {}), {
    ok: false,
    code: 'MEDIA_TARGET_ACCOUNTING_LIMIT',
    total: 257,
  });
  assert.equal(oversized.media_targets, original);
});

test('malformed target accounting returns explicit failure rather than silently discarding values', () => {
  const { retainSnapshotTargets } = ledger();
  for (const request of [undefined, null, [], 'request'])
    assert.deepEqual(retainSnapshotTargets(request, {}), {
      ok: false,
      code: 'MEDIA_TARGET_ACCOUNTING_INVALID',
    });
  for (const media_targets of [null, {}, target(1), [target(1), 42]]) {
    const request = { media_targets };
    assert.deepEqual(retainSnapshotTargets(request, {}), {
      ok: false,
      code: 'MEDIA_TARGET_ACCOUNTING_INVALID',
    });
    assert.equal(request.media_targets, media_targets);
    assert.equal(request.manual_required, true);
  }
  for (const snapshot of [
    [],
    'snapshot',
    { photos: {} },
    { photos: [42] },
    { photos: [{ file_id: 42 }] },
    { background_photo: 'file' },
    { background_photo: { file_id: 42 } },
    { avatar_file_id: 42 },
  ]) {
    const request = { media_targets: [target(1)] };
    assert.deepEqual(retainSnapshotTargets(request, snapshot), {
      ok: false,
      code: 'MEDIA_TARGET_ACCOUNTING_INVALID',
    });
    assert.deepEqual(request.media_targets, [target(1)]);
  }
});

test('transactional target handoff keeps the sole snapshot target before physical removal', async () => {
  const { retainSnapshotTargets } = ledger();
  const { db, state } = privacyDatabase({
    privacy_requests: [{ _id: 'request-a', media_targets: [] }],
    registrations: [{ _id: 'row-a', profile_snapshot: { avatar_file_id: target('sole') } }],
    audits: [],
  });
  await db.runTransaction(async (tx) => {
    const row = (await tx.collection('registrations').doc('row-a').get()).data;
    const request = (await tx.collection('privacy_requests').doc('request-a').get()).data;
    assert.equal(retainSnapshotTargets(request, row.profile_snapshot).ok, true);
    await tx.collection('privacy_requests').doc('request-a').update({ data: request });
    await tx
      .collection('audits')
      .doc('audit-a')
      .set({ data: { action: 'synthetic-remove' } });
    await tx.collection('registrations').doc('row-a').remove();
  });
  assert.deepEqual(state.privacy_requests.get('request-a').media_targets, [target('sole')]);
  assert.equal(state.registrations.has('row-a'), false);
  assert.equal(state.audits.size, 1);
});

test('overflow aborts a fixture transaction leaving ledger snapshot and audit unchanged', async () => {
  const { retainSnapshotTargets } = ledger();
  const { db, state } = privacyDatabase({
    privacy_requests: [
      { _id: 'request-a', media_targets: Array.from({ length: 256 }, (_, index) => target(index)) },
    ],
    registrations: [{ _id: 'row-a', profile_snapshot: { avatar_file_id: target(256) } }],
    audits: [],
  });
  const before = structuredClone(state);
  await assert.rejects(
    db.runTransaction(async (tx) => {
      const row = (await tx.collection('registrations').doc('row-a').get()).data;
      const request = (await tx.collection('privacy_requests').doc('request-a').get()).data;
      const result = retainSnapshotTargets(request, row.profile_snapshot);
      if (!result.ok) throw Object.assign(new Error(result.code), { code: result.code });
      await tx.collection('privacy_requests').doc('request-a').update({ data: request });
      await tx.collection('registrations').doc('row-a').remove();
    }),
    { code: 'MEDIA_TARGET_ACCOUNTING_LIMIT' },
  );
  assert.deepEqual(state, before);
});

test('ledger write failure rolls back prior writes without losing the registration snapshot', async () => {
  const { retainSnapshotTargets } = ledger();
  const { db, state } = privacyDatabase({
    privacy_requests: [{ _id: 'request-a', media_targets: [] }],
    registrations: [{ _id: 'row-a', profile_snapshot: { avatar_file_id: target('sole') } }],
    audits: [],
  });
  const before = structuredClone(state);
  await assert.rejects(
    db.runTransaction(async (tx) => {
      const row = (await tx.collection('registrations').doc('row-a').get()).data;
      const request = (await tx.collection('privacy_requests').doc('request-a').get()).data;
      assert.equal(retainSnapshotTargets(request, row.profile_snapshot).ok, true);
      await tx
        .collection('audits')
        .doc('audit-a')
        .set({ data: { action: 'synthetic-remove' } });
      await tx.collection('registrations').doc('row-a').remove();
      await tx.collection('privacy_requests').doc('missing-ledger').update({ data: request });
    }),
    /document does not exist/,
  );
  assert.deepEqual(state, before);
});
