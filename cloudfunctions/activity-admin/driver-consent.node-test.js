'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { saveActivity, reviewActivity } = require('./domain-index');
const { publicActivity } = require('../shared/domain');
const privacy = require('../shared/privacy');
const now = new Date('2026-10-21T10:00:00Z');
const driver = { nickname: 'Driver', license_plate: 'AB123', contact_phone: '13812345678' };
const draft = {
  _id: 'a1',
  title: 'Ride',
  status: 'draft',
  version: 1,
  created_by: 'organizer',
  route: { start: 'Start', end: 'End', distance_km: 20, elevation_m: 200 },
  event_start: '2026-11-01T02:00:00Z',
  event_end: '2026-11-01T08:00:00Z',
  capacity: 4,
  occupied_count: 0,
  support_vehicle_capacity: 2,
  self_drive_capacity: 2,
  support_vehicle_occupied_count: 0,
  self_drive_occupied_count: 0,
  occupancy_partition_ready: true,
  support_vehicle_driver: driver,
  fee: 'Free',
  registration_mode: 'open',
};
function store(current = draft) {
  const state = { current: structuredClone(current), audits: [] };
  return {
    state,
    msgSecCheck: async () => ({ errCode: 0, result: { suggest: 'pass' } }),
    transaction: (work) =>
      work({
        getAdmin: async (id) => ({ _id: id, enabled: true }),
        getActivity: async () => state.current,
        getClub: async () => ({
          _id: 'club',
          status: 'active',
          approval_status: 'approved',
          name: 'Club',
        }),
        putActivity: async (_id, value) => {
          state.current = value;
        },
        addAudit: async (audit) => state.audits.push(audit),
      }),
  };
}
function request(current, fields = driver) {
  return {
    confirmed: true,
    policyVersion: '2026-10-21',
    activityVersion: current.version,
    fieldsVersion: privacy.driverFieldsVersion(fields),
  };
}
const publish = (fixture, extra = {}) =>
  saveActivity(
    fixture,
    {
      openid: 'organizer',
      activityId: 'a1',
      expectedVersion: fixture.state.current.version,
      activity: { status: 'published' },
      ...extra,
    },
    now,
  );

test('publishing driver public fields requires explicit organizer attestation', async () => {
  const fixture = store();
  await assert.rejects(publish(fixture), { code: 'DRIVER_CONSENT_REQUIRED' });
  assert.equal(fixture.state.current.status, 'draft');
  assert.deepEqual(fixture.state.audits, []);
});

test('driver attestation binds exact fields/activity version and generates controlled internal record', async () => {
  assert.equal(typeof privacy.driverFieldsVersion, 'function');
  const fixture = store();
  const confirmation = request(fixture.state.current);
  for (const forged of [
    { ...confirmation, confirmed: false },
    { ...confirmation, policyVersion: 'old' },
    { ...confirmation, activityVersion: 0 },
    { ...confirmation, fieldsVersion: 'stale' },
    { ...confirmation, evidenceRef: 'uncontrolled-client-reference' },
  ])
    await assert.rejects(publish(fixture, { driverConsent: forged }), {
      code: 'DRIVER_CONSENT_INVALID',
    });
  const dto = await publish(fixture, { driverConsent: confirmation });
  assert.equal(dto.support_vehicle_driver.contact_phone, driver.contact_phone);
  const record = fixture.state.current.driver_public_attestation;
  assert.equal(record.kind, 'organizer_attestation');
  assert.equal(record.attested_by, 'organizer');
  assert.equal(record.policy_version, '2026-10-21');
  assert.equal(record.fields_version, confirmation.fieldsVersion);
  assert.equal(record.confirmed_activity_version, 1);
  assert.equal(record.activity_version, 2);
  assert.match(record.record_id, /^[a-f0-9]{64}$/);
  assert.equal(
    publicActivity(fixture.state.current, now).support_vehicle_driver.contact_phone,
    driver.contact_phone,
  );
  assert.doesNotMatch(
    JSON.stringify(dto),
    /attested_by|record_id|driver_public_attestation|signature/,
  );
  assert.doesNotMatch(
    JSON.stringify(fixture.state.audits),
    /13812345678|AB123|fields_version|record_id/,
  );
});

test('changing driver fields rejects old confirmation; unchanged fields preserve attestation', async () => {
  assert.equal(typeof privacy.driverFieldsVersion, 'function');
  const fixture = store();
  await publish(fixture, { driverConsent: request(fixture.state.current) });
  const changed = { ...driver, contact_phone: '13900000000' };
  const staleRecord = { ...fixture.state.current, support_vehicle_driver: changed };
  assert.deepEqual(publicActivity(staleRecord, now).support_vehicle_driver, {
    nickname: '',
    license_plate: '',
    contact_phone: '',
  });
  await assert.rejects(
    publish(fixture, { activity: { status: 'published', support_vehicle_driver: changed } }),
    { code: 'DRIVER_CONSENT_REQUIRED' },
  );
  await publish(fixture, { activity: { status: 'published', title: 'New title' } });
  assert.equal(
    publicActivity(fixture.state.current, now).support_vehicle_driver.contact_phone,
    driver.contact_phone,
  );
  await publish(fixture, {
    activity: { status: 'published', support_vehicle_driver: changed },
    driverConsent: request(fixture.state.current, changed),
  });
  assert.equal(
    publicActivity(fixture.state.current, now).support_vehicle_driver.contact_phone,
    changed.contact_phone,
  );
});

test('legacy public driver fields are suppressed without evidence while review cannot bypass attestation', async () => {
  assert.deepEqual(publicActivity({ ...draft, status: 'published' }, now).support_vehicle_driver, {
    nickname: '',
    license_plate: '',
    contact_phone: '',
  });
  const fixture = store({
    ...draft,
    status: 'pending_review',
    review_scope: 'club',
    review_target_id: 'club',
    review_version: 1,
  });
  await assert.rejects(
    reviewActivity(
      fixture,
      {
        openid: 'organizer',
        activityId: 'a1',
        decision: 'approve',
        requestId: 'review_driver_123',
        expectedReviewVersion: 1,
      },
      now,
    ),
    { code: 'DRIVER_CONSENT_REQUIRED' },
  );
});

test('management DTO exposes current binding without exposing attestation evidence', async () => {
  const fixture = store();
  const dto = await publish(fixture, { driverConsent: request(fixture.state.current) });
  assert.deepEqual(dto.driver_consent_status, {
    policyVersion: '2026-10-21',
    activityVersion: 2,
    fieldsVersion: privacy.driverFieldsVersion(driver),
    attested: true,
  });
  assert.doesNotMatch(JSON.stringify(dto), /attested_by|record_id|recorded_at|signature/);
});

test('review carries submitted organizer attestation to the approved activity version', async () => {
  const fixture = store({ ...draft, club_id: 'club' });
  await publish(fixture, {
    activity: { status: 'pending_review' },
    driverConsent: request(fixture.state.current),
  });
  const dto = await reviewActivity(
    fixture,
    {
      openid: 'organizer',
      activityId: 'a1',
      decision: 'approve',
      requestId: 'review_driver_bound',
      expectedReviewVersion: 1,
    },
    now,
  );
  assert.equal(dto.status, 'published');
  assert.equal(
    publicActivity(fixture.state.current, now).support_vehicle_driver.contact_phone,
    driver.contact_phone,
  );
  assert.equal(fixture.state.current.driver_public_attestation.confirmed_activity_version, 1);
  assert.equal(fixture.state.current.driver_public_attestation.activity_version, 3);
});

test('runtime save forwards explicit driver confirmation but ignores client actor identity', async () => {
  const cloud = require('wx-server-sdk');
  const { privacyDatabase } = require('../profile/privacy-fixture');
  const fixture = privacyDatabase({
    activities: [draft],
    admins: [{ _id: 'organizer', enabled: true }],
  });
  const runTransaction = fixture.db.runTransaction;
  fixture.db.runTransaction = (work) =>
    runTransaction((tx) =>
      work({
        collection: (name) => ({
          ...tx.collection(name),
          add: async ({ data }) => tx.collection(name).doc('runtime-audit').set({ data }),
        }),
      }),
    );
  cloud.init = () => undefined;
  cloud.database = () => fixture.db;
  cloud.getWXContext = () => ({ OPENID: 'organizer' });
  cloud.openapi = {
    security: {
      msgSecCheck: async () => ({ errCode: 0, result: { suggest: 'pass' } }),
    },
  };
  delete require.cache[require.resolve('./index')];
  const main = require('./index').main;
  const input = {
    action: 'save',
    activityId: 'a1',
    expectedVersion: 1,
    activity: { status: 'published' },
    openid: 'forged',
  };
  assert.equal((await main(input)).error.code, 'DRIVER_CONSENT_REQUIRED');
  const result = await main({ ...input, driverConsent: request(draft) });
  assert.equal(result.ok, true);
  assert.equal(
    fixture.state.activities.get('a1').driver_public_attestation.attested_by,
    'organizer',
  );
  assert.doesNotMatch(JSON.stringify(result.data), /forged|attested_by|record_id/);
});
