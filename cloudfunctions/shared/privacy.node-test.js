'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
let subject = {};
try {
  subject = require('./privacy');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
test('common write guard accepts legacy initial generation but fails closed after deletion/recreation', () => {
  assert.equal(typeof subject.assertProfileWritable, 'function');
  subject.assertProfileWritable({}, undefined);
  assert.throws(() => subject.assertProfileWritable({ deletion_status: 'completed' }), {
    code: 'PROFILE_DELETION_LOCKED',
  });
  assert.throws(
    () => subject.assertProfileWritable({ generation: 3, deletion_status: 'active' }, 2),
    { code: 'PROFILE_GENERATION_MISMATCH' },
  );
  assert.throws(() => subject.assertProfileWritable({ generation: 3, deletion_status: 'active' }), {
    code: 'PROFILE_GENERATION_MISMATCH',
  });
  subject.assertProfileWritable({ generation: 3, deletion_status: 'active' }, 3);
});
test('deleted snapshots never fall back even with restored PII or a newer profile', () => {
  assert.equal(typeof subject.projectPrivateRegistration, 'function');
  const registration = {
    privacy_generation: 2,
    profile_snapshot: { nickname: 'restored', phone_masked: 'private' },
  };
  assert.deepEqual(
    subject.projectPrivateRegistration(registration, { generation: 3 }).profile_snapshot,
    {},
  );
  assert.deepEqual(
    subject.projectPrivateRegistration(
      { profile_snapshot: { nickname: 'old' } },
      { deletion_status: 'requested' },
    ).profile_snapshot,
    {},
  );
});
test('restricted contacts only appear for the matching registration and never as social profile fields', () => {
  assert.equal(typeof subject.registrationContactProfile, 'function');
  const profile = {
    generation: 2,
    deletion_status: 'restricted',
    phone_cipher: { ciphertext: 'global' },
    nickname: 'old',
  };
  assert.deepEqual(subject.registrationContactProfile({}, profile), {});
  const value = subject.registrationContactProfile(
    {
      privacy_generation: 2,
      privacy_contact: { phone_cipher: { ciphertext: 'necessary' }, nickname: 'old' },
    },
    profile,
  );
  assert.deepEqual(value, { phone_cipher: { ciphertext: 'necessary' } });
});

test('public media and admin snapshot fallback suppress restored personal fields during deletion', () => {
  const { publicAvatarSource, publicBackgroundSource } = require('../activity-read/public-avatar');
  const { adminRegistrationListItem } = require('../admin-review/capability-card');
  const profile = {
    generation: 2,
    deletion_status: 'requested',
    nickname: 'restored-profile',
    avatar_file_id: 'cloud://env/avatar',
    avatar_source: 'custom',
    avatar_revision: 1,
    background_photo: { file_id: 'cloud://env/bg', category: 'ride' },
  };
  assert.equal(publicAvatarSource(profile), '');
  assert.equal(publicBackgroundSource(profile), undefined);
  const result = adminRegistrationListItem(
    {
      _id: 'r',
      profile_generation: 2,
      profile_snapshot: { nickname: 'restored-snapshot', phone_masked: 'private' },
    },
    profile,
  );
  assert.doesNotMatch(JSON.stringify(result), /restored|private/);
});

test('an older registration never borrows the recreated profiles contact or nickname', () => {
  const profile = {
    generation: 3,
    deletion_status: 'active',
    nickname: 'new-private',
    phone_cipher: { ciphertext: 'new-contact' },
  };
  assert.deepEqual(subject.registrationContactProfile({ profile_generation: 2 }, profile), {});
});

test('snapshot fallback requires a positively known active generation-compatible profile', () => {
  const registration = { profile_snapshot: { nickname: 'legacy', gender: 'male' } };
  for (const profile of [undefined, null, { deletion_status: 'requested' }, { generation: 2 }])
    assert.deepEqual(
      subject.projectPrivateRegistration(registration, profile).profile_snapshot,
      {},
    );
  for (const profile of [{}, { generation: 1, deletion_status: 'active' }])
    assert.equal(subject.projectPrivateRegistration(registration, profile), registration);
  assert.deepEqual(
    subject.projectPrivateRegistration({ ...registration, privacy_public_suppressed: true }, {})
      .profile_snapshot,
    {},
  );
});
