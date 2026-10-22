'use strict';

const { publicConsentStatus, driverFieldsVersion, PUBLIC_POLICY_VERSION } = require('./privacy');

// Explicit synthetic evidence for tests that exercise unrelated public-media behavior.
function withPublicConsent(profile, choices = { nickname: true, media: true }) {
  const status = publicConsentStatus(profile);
  return {
    ...profile,
    public_consent: Object.fromEntries(
      Object.entries(choices).map(([field, consented]) => [
        field,
        {
          consented,
          version: status[field].version,
          generation: status.generation,
          policy_version: status.policyVersion,
        },
      ]),
    ),
  };
}
function withDriverAttestation(activity) {
  if (!Number.isSafeInteger(activity?.version) || activity.version < 1) return activity;
  const version = activity.version;
  const driver = activity.support_vehicle_driver;
  const normalized =
    driver &&
    Object.fromEntries(
      Object.entries(driver).map(([field, value]) => [
        field,
        typeof value === 'string'
          ? field === 'license_plate'
            ? value.trim().toUpperCase()
            : value.trim()
          : value,
      ]),
    );
  return {
    ...activity,
    ...(driver ? { support_vehicle_driver: normalized } : {}),
    driver_public_attestation: {
      kind: 'organizer_attestation',
      attested_by: 'synthetic-organizer',
      policy_version: PUBLIC_POLICY_VERSION,
      fields_version: driverFieldsVersion(normalized),
      activity_id: activity._id,
      confirmed_activity_version: version - 1,
      activity_version: version,
      record_id: 'a'.repeat(64),
    },
  };
}
module.exports = { withPublicConsent, withDriverAttestation };
