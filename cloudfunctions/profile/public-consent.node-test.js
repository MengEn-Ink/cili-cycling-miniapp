'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { privacyDatabase } = require('./privacy-fixture');
const { createPrivacyService } = require('./privacy');
const { buildUpdate, response, mediaOwnerPrefix, mediaDocumentId } = require('./core');
const { createProfileStore } = require('./store');
const { buildCapabilityCard } = require('./capability-card');
const contract = require('./privacy-contract');
const { publicAvatarSource, publicBackgroundSource } = require('../activity-read/public-avatar');

const key = Buffer.alloc(32, 1).toString('base64');
const now = new Date('2026-10-21T10:00:00Z');
const secret = 'profile-media-secret-for-tests-32-bytes';
const avatar = `cloud://env/${mediaOwnerPrefix('owner', secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174000.jpg`;
const profile = {
  _id: 'owner',
  generation: 2,
  nickname: 'Private rider',
  gender: '男',
  avatar_file_id: avatar,
  avatar_source: 'wechat',
  avatar_revision: 1,
  avatar_visibility: 'public',
  background_photo: { file_id: 'cloud://env/private-background.jpg', category: 'ride' },
};

async function consent(service, choices = { nickname: true, media: true }) {
  const status = await service.publicConsentStatus('owner');
  return service.setPublicConsent(
    'owner',
    {
      generation: status.generation,
      policyVersion: status.policyVersion,
      ...Object.fromEntries(
        Object.entries(choices).map(([field, consented]) => [
          field,
          { consented, version: status[field].version },
        ]),
      ),
    },
    now,
  );
}

test('legacy public flag does not constitute consent or authorize media', () => {
  assert.equal(publicAvatarSource(profile), '');
  assert.equal(publicBackgroundSource(profile), undefined);
  assert.equal(response(profile).avatar_visibility, 'private');
});

test('explicit choices default false and consent writes require trusted identity/current bindings', async () => {
  const fixture = privacyDatabase({ profiles: [profile] });
  const service = createPrivacyService(fixture.db);
  assert.equal(typeof service.publicConsentStatus, 'function');
  assert.equal(typeof service.setPublicConsent, 'function');
  const initial = await service.publicConsentStatus('owner');
  assert.equal(initial.nickname.consented, false);
  assert.equal(initial.media.consented, false);
  await assert.rejects(service.publicConsentStatus('', {}), { code: 'UNAUTHENTICATED' });
  await assert.rejects(
    service.setPublicConsent('owner', {
      generation: 2,
      policyVersion: initial.policyVersion,
      nickname: { consented: true, version: initial.nickname.version },
      openid: 'other',
    }),
    { code: 'FORBIDDEN_FIELD' },
  );
  await assert.rejects(
    service.setPublicConsent('owner', {
      generation: 2,
      policyVersion: 'old',
      nickname: { consented: true, version: initial.nickname.version },
    }),
    { code: 'PUBLIC_CONSENT_POLICY_MISMATCH' },
  );
  await assert.rejects(
    service.setPublicConsent('owner', {
      generation: 2,
      policyVersion: initial.policyVersion,
      nickname: { consented: true, version: 'stale' },
    }),
    { code: 'PUBLIC_CONSENT_VERSION_MISMATCH' },
  );
  const nicknameOnly = await consent(service, { nickname: true });
  assert.equal(nicknameOnly.nickname.consented, true);
  assert.equal(nicknameOnly.media.consented, false);
  const mediaOnly = await consent(service, { nickname: false, media: true });
  assert.equal(mediaOnly.nickname.consented, false);
  assert.equal(mediaOnly.media.consented, true);
  assert.doesNotMatch(JSON.stringify(mediaOnly), /Private rider|cloud:|owner_openid/);
});

test('nickname and media changes invalidate only their binding, including change back', async () => {
  const fixture = privacyDatabase({ profiles: [profile] });
  const service = createPrivacyService(fixture.db);
  assert.equal(typeof service.setPublicConsent, 'function');
  await consent(service);
  const current = fixture.state.profiles.get('owner');
  const updated = { ...current, ...buildUpdate({ nickname: 'New name' }, key, current) };
  await fixture.db.collection('profiles').doc('owner').set({ data: updated });
  let status = await service.publicConsentStatus('owner');
  assert.equal(status.nickname.consented, false);
  assert.equal(status.media.consented, true);
  const restored = { ...updated, ...buildUpdate({ nickname: profile.nickname }, key, updated) };
  await fixture.db.collection('profiles').doc('owner').set({ data: restored });
  assert.equal((await service.publicConsentStatus('owner')).nickname.consented, false);
  const next = { ...restored, ...buildUpdate({ background_photo: null }, key, restored) };
  await fixture.db.collection('profiles').doc('owner').set({ data: next });
  status = await service.publicConsentStatus('owner');
  assert.equal(status.media.consented, false);
  assert.equal(publicBackgroundSource(next), undefined);
});

test('withdrawal suppresses public sources and card signing without deleting private profile', async () => {
  const fixture = privacyDatabase({ profiles: [profile] });
  const service = createPrivacyService(fixture.db);
  assert.equal(typeof service.setPublicConsent, 'function');
  await consent(service);
  assert.equal(publicAvatarSource(fixture.state.profiles.get('owner')), avatar);
  await consent(service, { nickname: false, media: false });
  const withdrawn = fixture.state.profiles.get('owner');
  assert.equal(publicAvatarSource(withdrawn), '');
  assert.equal(publicBackgroundSource(withdrawn), undefined);
  const signed = [];
  const card = await buildCapabilityCard(
    { profile: withdrawn },
    {
      openid: 'owner',
      mediaSecret: secret,
      now,
      getTempFileURL: async (input) => signed.push(input),
    },
  );
  assert.equal(card.profile.display_name, '匿名骑友');
  assert.equal(card.profile.avatar_url, '');
  assert.deepEqual(card.backgrounds, []);
  assert.deepEqual(signed, []);
  assert.equal(response(withdrawn).nickname, profile.nickname);
  assert.equal(response(withdrawn).avatar_file_id, avatar);
});

test('consent cannot resurrect missing/deleted profiles or bind an older generation', async () => {
  const fixture = privacyDatabase({ profiles: [profile] });
  const service = createPrivacyService(fixture.db);
  assert.equal(typeof service.setPublicConsent, 'function');
  const status = await service.publicConsentStatus('owner');
  const event = {
    policyVersion: status.policyVersion,
    generation: 1,
    media: { consented: true, version: status.media.version },
  };
  await assert.rejects(service.setPublicConsent('owner', event), {
    code: 'PROFILE_GENERATION_MISMATCH',
  });
  await fixture.db
    .collection('profiles')
    .doc('owner')
    .update({ data: { deletion_status: 'requested' } });
  await assert.rejects(service.setPublicConsent('owner', { ...event, generation: 2 }), {
    code: 'PROFILE_DELETION_LOCKED',
  });
  await assert.rejects(service.setPublicConsent('missing', { ...event, generation: 1 }), {
    code: 'PROFILE_NOT_FOUND',
  });
  assert.equal(fixture.state.profiles.has('missing'), false);
  assert.equal((await service.publicConsentStatus('owner')).media.consented, false);
  assert.equal(
    contract.scrubProfile({ ...profile, public_consent: { media: {} } }).public_consent,
    undefined,
  );
});

test('ordinary save cannot grant public consent and optional private photo cannot block saving', () => {
  assert.throws(() => buildUpdate({ avatar_visibility: 'public' }, key, profile), {
    code: 'PUBLIC_CONSENT_ACTION_REQUIRED',
  });
  assert.throws(() => buildUpdate({ public_consent: {} }, key, profile), {
    code: 'FORBIDDEN_FIELD',
  });
  assert.doesNotThrow(() => buildUpdate({ gender: '男', background_photo: null }, key, profile));
});

test('avatar selection keeps self avatar usable but never auto-grants disclosure', async () => {
  const fixture = privacyDatabase({
    profiles: [{ _id: 'owner', generation: 2 }],
    profile_media: [
      {
        _id: mediaDocumentId(avatar),
        file_id: avatar,
        owner_openid: 'owner',
        category: 'profile-avatar',
        origin: 'wechat',
        status: 'unreferenced',
        security_status: 'pass',
        generation: 2,
      },
    ],
  });
  const saved = await createProfileStore(fixture.db).setAvatar(
    'owner',
    'wechat',
    avatar,
    secret,
    now,
    2,
  );
  assert.equal(saved.avatar_file_id, avatar);
  assert.equal(saved.avatar_visibility, 'private');
  assert.equal(saved.avatar_visibility_revision, null);
  assert.equal(publicAvatarSource(saved), '');
});

test('media consent binds every exported legacy photo even with a current background slot', async () => {
  const fixture = privacyDatabase({
    profiles: [
      {
        ...profile,
        photos: [{ file_id: 'cloud://env/old.jpg', category: 'ride' }],
      },
    ],
  });
  const service = createPrivacyService(fixture.db);
  await consent(service, { media: true });
  await fixture.db
    .collection('profiles')
    .doc('owner')
    .update({
      data: { photos: [{ file_id: 'cloud://env/replaced.jpg', category: 'ride' }] },
    });
  assert.equal((await service.publicConsentStatus('owner')).media.consented, false);
});

test('withdrawal needs no stale version and malformed choices are rejected atomically', async () => {
  const fixture = privacyDatabase({ profiles: [profile] });
  const service = createPrivacyService(fixture.db);
  const before = await consent(service);
  await assert.rejects(
    service.setPublicConsent('owner', {
      generation: 2,
      policyVersion: before.policyVersion,
      nickname: { consented: false },
      media: { consented: 'true' },
    }),
    { code: 'PUBLIC_CONSENT_INVALID' },
  );
  assert.equal((await service.publicConsentStatus('owner')).nickname.consented, true);
  const result = await service.setPublicConsent('owner', {
    generation: 2,
    policyVersion: before.policyVersion,
    media: { consented: false },
  });
  assert.equal(result.nickname.consented, true);
  assert.equal(result.media.consented, false);
});

test('public card cannot sign a previous generation registry while private assets remain stored', async () => {
  const { canonicalMediaPath } = require('./core');
  const sha256 = 'a'.repeat(64);
  const current = { ...profile, avatar_source: 'wechat', generation: 2 };
  const fixture = privacyDatabase({ profiles: [current] });
  const service = createPrivacyService(fixture.db);
  await consent(service, { media: true });
  const calls = [];
  const card = await buildCapabilityCard(
    {
      profile: fixture.state.profiles.get('owner'),
      mediaRecords: [
        {
          _id: mediaDocumentId(avatar),
          file_id: avatar,
          source_file_id: avatar,
          canonical_file_id: `cloud://env/${canonicalMediaPath('owner', avatar, sha256, 'jpg', secret, 'profile-avatar')}`,
          owner_openid: 'owner',
          generation: 1,
          origin: 'wechat',
          category: 'profile-avatar',
          canonical_category: 'profile-avatar',
          status: 'active',
          size: 1024,
          sha256,
          mime: 'image/jpeg',
        },
      ],
    },
    {
      openid: 'owner',
      mediaSecret: secret,
      now,
      getTempFileURL: async (input) => {
        calls.push(input);
        return { fileList: [] };
      },
    },
  );
  assert.deepEqual(calls, []);
  assert.equal(card.profile.avatar_url, '');
});

test('explicit consent requires generation even for a first-generation profile', async () => {
  const fixture = privacyDatabase({ profiles: [{ ...profile, generation: 1 }] });
  const service = createPrivacyService(fixture.db);
  const status = await service.publicConsentStatus('owner');
  await assert.rejects(
    service.setPublicConsent('owner', {
      policyVersion: status.policyVersion,
      nickname: { consented: true, version: status.nickname.version },
    }),
    { code: 'PROFILE_GENERATION_MISMATCH' },
  );
});

test('disclosure revisions cannot overflow and accidentally reuse an old binding', () => {
  assert.throws(
    () =>
      buildUpdate({ nickname: 'Changed' }, key, {
        ...profile,
        nickname_revision: Number.MAX_SAFE_INTEGER,
      }),
    { code: 'PUBLIC_CONSENT_REVISION_INVALID' },
  );
  assert.throws(
    () =>
      buildUpdate({ background_photo: null }, key, {
        ...profile,
        media_revision: Number.MAX_SAFE_INTEGER,
      }),
    { code: 'PUBLIC_CONSENT_REVISION_INVALID' },
  );
});
