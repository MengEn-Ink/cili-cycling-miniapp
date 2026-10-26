'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  DELETION_STATES,
  fileId,
  profile,
  registration,
  optionalContract,
  referenceFixture,
} = require('./fixture.cjs');
const subject = optionalContract('privacy.cjs');
const api = (name) => {
  assert.equal(typeof subject[name], 'function', `${name} contract is not implemented`);
  return subject[name];
};
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('profileGeneration preserves legacy g1 and rejects malformed stored generations', () => {
  const generation = api('profileGeneration');
  for (const value of [undefined, null, {}, { generation: undefined }])
    assert.equal(generation(value), 1);
  for (const value of [1, 2, Number.MAX_SAFE_INTEGER])
    assert.equal(generation({ generation: value }), value);
  for (const value of [null, 0, -1, 1.5, '1', false, NaN, Infinity, 2 ** 53])
    assert.throws(() => generation({ generation: value }), {
      code: 'PROFILE_GENERATION_INVALID',
    });
});

test('assertProfileWritable accepts legacy g1 and requires an exact explicit g2 match', () => {
  const writable = api('assertProfileWritable');
  assert.equal(writable({}, undefined), 1);
  assert.equal(writable(undefined, 1), 1);
  assert.equal(writable(profile(), 1), 1);
  for (const generation of [undefined, 1, 3, '2', null, false, NaN])
    assert.throws(() => writable(profile({ generation: 2 }), generation), {
      code: 'PROFILE_GENERATION_MISMATCH',
    });
  assert.equal(writable(profile({ generation: 2 }), 2), 2);
  assert.throws(() => writable(profile(), 2), { code: 'PROFILE_GENERATION_MISMATCH' });
  assert.throws(() => writable({ generation: 0 }), { code: 'PROFILE_GENERATION_INVALID' });
});

test('every non-active deletion state locks writes before generation checks', () => {
  const writable = api('assertProfileWritable');
  const deleted = api('isProfileDeleted');
  for (const state of [...DELETION_STATES, 'unknown-state']) {
    const value = profile({ deletion_status: state, generation: 0 });
    assert.equal(deleted(value), true, state);
    assert.throws(() => writable(value, 1), { code: 'PROFILE_DELETION_LOCKED' }, state);
  }
  for (const state of [undefined, null, '', false, 'active'])
    assert.equal(deleted({ deletion_status: state }), false);
});

test('scrubProfile removes every source personal field without removing durable identity', () => {
  const scrub = api('scrubProfile');
  const fields = [
    'real_name_cipher',
    'phone_cipher',
    'emergency_phone_cipher',
    'emergency_name',
    'nickname',
    'nickname_revision',
    'media_revision',
    'public_consent',
    'title',
    'gender',
    'avatar_file_id',
    'avatar_source',
    'avatar_revision',
    'avatar_visibility',
    'avatar_visibility_revision',
    'background_photo',
    'photos',
    'real_name',
    'phone',
    'emergency_phone',
    'real_name_masked',
    'phone_masked',
    'emergency_phone_masked',
    'phone_source',
    'phone_verified',
    'sensitive_status',
    'id_type',
    'id_number',
    'id_number_cipher',
    'id_number_masked',
    'has_completed_guidance',
    'strava',
    'strava_snapshot',
  ];
  assert.deepEqual(subject.PERSONAL_FIELDS, fields);
  assert.deepEqual(subject.CONTACT_FIELDS, fields.slice(0, 4));
  const value = {
    ...Object.fromEntries(fields.map((field) => [field, `synthetic-${field}`])),
    _id: 'owner-a',
    generation: 2,
    deletion_status: 'restricted',
    roles: ['member'],
  };
  const before = structuredClone(value);
  const retained = {
    _id: 'owner-a',
    generation: 2,
    deletion_status: 'restricted',
    roles: ['member'],
  };
  assert.deepEqual(scrub(value), retained);
  assert.deepEqual(scrub(value, true), {
    ...retained,
    ...Object.fromEntries(fields.slice(0, 4).map((field) => [field, value[field]])),
  });
  assert.deepEqual(value, before);
  assert.deepEqual(
    api('contactFields')({ ...value, phone_cipher: undefined }),
    Object.fromEntries(
      fields
        .slice(0, 4)
        .filter((field) => field !== 'phone_cipher')
        .map((field) => [field, value[field]]),
    ),
  );
});

test('visibleProfile never exposes restored personal fields in any deletion state', () => {
  const visible = api('visibleProfile');
  const active = profile();
  assert.equal(visible(active), active);
  assert.equal(visible(undefined), undefined);
  for (const state of DELETION_STATES) {
    const value = visible(profile({ deletion_status: state, phone: 'synthetic-private' }));
    assert.equal(value.nickname, undefined, state);
    assert.equal(value.avatar_file_id, undefined, state);
    assert.equal(value.phone, undefined, state);
    assert.equal(value.generation, 1);
    assert.equal(value.deletion_status, state);
  }
});

test('private registration snapshots retain source projection semantics', () => {
  const project = api('projectPrivateRegistration');
  const row = registration();
  assert.equal(project(null, {}), null);
  assert.equal(project(undefined, {}), undefined);
  assert.equal(project(row, {}), row);
  assert.equal(project(row, profile()), row);
  for (const value of [
    undefined,
    null,
    profile({ generation: 2 }),
    ...DELETION_STATES.map((state) => profile({ deletion_status: state })),
  ])
    assert.deepEqual(project(row, value).profile_snapshot, {});
  for (const metadata of [{ privacy_generation: 1 }, { privacy_public_suppressed: true }])
    assert.deepEqual(project(registration(metadata), profile()).profile_snapshot, {});
  assert.equal(
    project({ ...row, profile_generation: 0 }, {}).profile_snapshot,
    row.profile_snapshot,
  );
  assert.throws(() => project(row, { generation: 0 }), { code: 'PROFILE_GENERATION_INVALID' });
});

test('registration contacts retain only necessary source contact fields', () => {
  const contacts = api('registrationContactProfile');
  const value = profile({
    generation: 2,
    deletion_status: 'restricted',
    phone_cipher: { ciphertext: 'synthetic-current' },
  });
  assert.deepEqual(contacts({}, value), {});
  assert.deepEqual(
    contacts(
      registration({
        privacy_generation: 2,
        privacy_contact: { phone_cipher: { ciphertext: 'synthetic-retained' }, nickname: 'hidden' },
      }),
      value,
    ),
    { phone_cipher: { ciphertext: 'synthetic-retained' } },
  );
  assert.deepEqual(contacts(registration({ profile_generation: 2 }), value), {
    phone_cipher: { ciphertext: 'synthetic-current' },
  });
  assert.deepEqual(
    contacts(registration({ profile_generation: 2, status: 'cancelled' }), value),
    {},
  );
  assert.deepEqual(
    contacts(registration({ profile_generation: 1 }), profile({ generation: 2 })),
    {},
  );
  const active = profile();
  assert.equal(contacts(registration(), active), active);
  assert.deepEqual(contacts(registration(), undefined), {});
});

test('registrationNeedsContact handles every status and untrusted event-end boundaries', () => {
  const needs = api('registrationNeedsContact');
  const now = new Date('2026-10-26T08:00:00Z');
  for (const status of ['waiting', 'pending', 'approved', 'checked_in']) {
    assert.equal(needs({ status }, undefined, now), true);
    assert.equal(needs({ status }, { event_end: 'invalid' }, now), true);
    assert.equal(needs({ status }, { event_end: '2026-10-26T08:00:01Z' }, now), true);
    assert.equal(needs({ status }, { event_end: now }, now), false);
    assert.equal(needs({ status }, { event_end: '2026-10-25T08:00:00Z' }, now), false);
  }
  for (const status of ['cancelled', 'rejected', 'completed', undefined])
    assert.equal(needs({ status }, undefined, now), false);
});

test('public consent is independently default-false and bound to source digests', () => {
  const consent = api('publicConsentStatus');
  const value = profile();
  const status = consent(value);
  assert.equal(subject.PUBLIC_POLICY_VERSION, '2026-10-21');
  assert.deepEqual(status, {
    generation: 1,
    policyVersion: '2026-10-21',
    nickname: { consented: false, version: digest([1, 1, 'Rider A']) },
    media: {
      consented: false,
      version: digest([
        1,
        1,
        1,
        value.avatar_file_id,
        'custom',
        value.background_photo,
        value.photos,
      ]),
    },
  });
  value.public_consent = {
    nickname: {
      consented: true,
      generation: 1,
      policy_version: '2026-10-21',
      version: status.nickname.version,
    },
  };
  assert.equal(consent(value).nickname.consented, true);
  assert.equal(consent(value).media.consented, false);
  for (const overrides of [
    { nickname: 'Rider B' },
    { nickname_revision: 2 },
    { generation: 2 },
    ...DELETION_STATES.map((state) => ({ deletion_status: state })),
  ])
    assert.equal(consent({ ...value, ...overrides }).nickname.consented, false);
  for (const overrides of [
    { consented: 'true' },
    { generation: 2 },
    { policy_version: 'old' },
    { version: 'old' },
  ])
    assert.equal(
      consent({
        ...value,
        public_consent: {
          nickname: {
            ...value.public_consent.nickname,
            ...overrides,
          },
        },
      }).nickname.consented,
      false,
    );
  assert.equal(consent({ generation: null }).generation, null);
  assert.equal(consent(undefined).generation, 1);
  assert.equal(consent(undefined).nickname.consented, false);
});

test('media consent expires for every bound media change and remains independent of nickname', () => {
  const consent = api('publicConsentStatus');
  const value = profile();
  const status = consent(value);
  value.public_consent = {
    media: {
      consented: true,
      generation: 1,
      policy_version: '2026-10-21',
      version: status.media.version,
    },
  };
  assert.equal(consent(value).media.consented, true);
  assert.equal(consent({ ...value, nickname: 'Rider B' }).media.consented, true);
  for (const overrides of [
    { avatar_revision: 2 },
    { media_revision: 2 },
    { avatar_file_id: fileId('new.png') },
    { avatar_source: 'wechat' },
    { background_photo: null },
    { photos: [] },
    { generation: 2 },
    ...DELETION_STATES.map((state) => ({ deletion_status: state })),
  ])
    assert.equal(consent({ ...value, ...overrides }).media.consented, false);
});

test('driver attestation remains exactly bound to the public fields and activity version', () => {
  const version = api('driverFieldsVersion');
  const attested = api('hasDriverAttestation');
  const driver = {
    nickname: 'Driver A',
    license_plate: 'synthetic-plate',
    contact_phone: 'synthetic-phone',
  };
  assert.equal(version(driver), digest(['driver-public-fields-v1', ...Object.values(driver)]));
  assert.equal(version({ nickname: 1 }), digest(['driver-public-fields-v1', '', '', '']));
  const activity = {
    _id: 'activity-a',
    version: 2,
    support_vehicle_driver: driver,
    driver_public_attestation: {
      kind: 'organizer_attestation',
      policy_version: '2026-10-21',
      attested_by: 'organizer-a',
      activity_id: 'activity-a',
      confirmed_activity_version: 1,
      activity_version: 2,
      record_id: 'a'.repeat(64),
      fields_version: version(driver),
    },
  };
  assert.equal(attested(activity), true);
  assert.equal(attested(undefined), false);
  for (const overrides of [
    { kind: 'other' },
    { policy_version: 'old' },
    { attested_by: '' },
    { activity_id: 'activity-b' },
    { confirmed_activity_version: -1 },
    { confirmed_activity_version: 2 },
    { activity_version: 1 },
    { record_id: 'invalid' },
    { fields_version: 'stale' },
  ])
    assert.equal(
      attested({
        ...activity,
        driver_public_attestation: {
          ...activity.driver_public_attestation,
          ...overrides,
        },
      }),
      false,
    );
  assert.equal(
    attested({ ...activity, support_vehicle_driver: { ...driver, nickname: 'B' } }),
    false,
  );
});

test('safeClubMedia refuses personal snapshot paths and preserves source business paths', () => {
  const safe = api('safeClubMedia');
  for (const value of [
    undefined,
    1,
    'not-a-url',
    'https://assets.invalid/%zz',
    'https://assets.invalid/profile-canonical/owner-a/profile-avatar/a.png',
    'https://assets.invalid/profiles/owner-a/ride/a.png',
    'https://assets.invalid/profile-avatar/a.png',
    'https://assets.invalid/profile-background/a.png',
    'https://assets.invalid/%70rofiles/owner-a/profile-background/a.png',
  ])
    assert.equal(safe(value), '');
  for (const category of ['club-avatar', 'club-cover', 'activity-image', 'activity-group-qr'])
    for (const root of ['profiles', 'profile-canonical']) {
      const value = `https://assets.invalid/${root}/owner-a/${category}/a.png`;
      assert.equal(safe(value), value);
    }
});

test('hasMediaReferences queries every exact source field with unique original identifiers', async () => {
  const references = api('hasMediaReferences');
  const expected = {
    activities: [
      'images',
      'cover_image',
      'group_qr_code',
      'route.gpx_file_id',
      'route.generated_preview_file_id',
      'club_identity.avatar_url',
    ],
    clubs: ['avatar_url', 'avatar_file_id', 'cover_file_id'],
    club_applications: ['avatar_file_id', 'cover_file_id'],
    route_previews: [
      'file_id',
      'source_file_id',
      'generated_file_id',
      'gpx_file_id',
      'generated_preview_file_id',
      'route.generated_preview_file_id',
    ],
    profiles: ['avatar_file_id', 'background_photo.file_id', 'photos.file_id'],
    registrations: [
      'profile_snapshot.avatar_file_id',
      'profile_snapshot.background_photo.file_id',
      'profile_snapshot.photos.file_id',
    ],
  };
  assert.deepEqual(subject.MEDIA_REFERENCES, expected);
  const f = referenceFixture();
  assert.equal(await references(f.tx, f.command, []), false);
  assert.deepEqual(f.queries, []);
  const targets = [fileId('source.png'), fileId('canonical.png'), fileId('snapshot.png')];
  assert.equal(await references(f.tx, f.command, [...targets, targets[0], '', null]), false);
  assert.deepEqual(
    f.queries,
    Object.entries(expected).map(([name, fields]) => ({
      name,
      limit: 1,
      condition: {
        operator: 'or',
        conditions: fields.map((field) => ({ [field]: { operator: 'in', values: targets } })),
      },
    })),
  );
  for (const name of Object.keys(expected)) {
    const found = referenceFixture(name);
    assert.equal(await references(found.tx, found.command, targets), true);
    assert.equal(found.queries.at(-1).name, name);
  }
});

test('privacyError preserves its explicit code without embedding caller data', () => {
  const fail = api('privacyError');
  assert.throws(() => fail('SYNTHETIC_ERROR', 'synthetic message'), {
    code: 'SYNTHETIC_ERROR',
    message: 'synthetic message',
  });
});

test('registrationPublicEligible allows only known active matching legacy g1 or explicit g2', () => {
  const eligible = api('registrationPublicEligible');
  assert.equal(eligible({}, {}), true);
  assert.equal(eligible(registration(), profile()), true);
  assert.equal(eligible(registration({ profile_generation: 2 }), profile({ generation: 2 })), true);
  assert.equal(eligible(registration({ privacy_public_suppressed: false }), profile()), true);
  for (const value of [undefined, null, false, 'profile', []])
    assert.equal(eligible(registration(), value), false);
  for (const value of [undefined, null, false, 'registration', []])
    assert.equal(eligible(value, profile()), false);
  assert.equal(eligible(registration(), profile({ generation: 2 })), false);
  assert.equal(eligible(registration({ profile_generation: 2 }), profile()), false);
  for (const state of [...DELETION_STATES, 'unknown', '', null, false, 0])
    assert.equal(eligible(registration(), profile({ deletion_status: state })), false);
});

test('registrationPublicEligible denies malformed metadata instead of coercing or throwing', () => {
  const eligible = api('registrationPublicEligible');
  for (const generation of [null, 0, -1, 1.5, '1', false, NaN, Infinity, 2 ** 53]) {
    assert.equal(eligible(registration({ profile_generation: generation }), profile()), false);
    assert.equal(eligible(registration(), profile({ generation })), false);
  }
  for (const privacy_generation of [1, 2, 0, null, false, '1'])
    assert.equal(eligible(registration({ privacy_generation }), profile()), false);
  for (const privacy_public_suppressed of [true, null, 0, '', 'false'])
    assert.equal(eligible(registration({ privacy_public_suppressed }), profile()), false);
  const row = registration();
  const current = profile();
  const before = structuredClone({ row, current });
  assert.equal(eligible(row, current), true);
  assert.deepEqual({ row, current }, before);
});
