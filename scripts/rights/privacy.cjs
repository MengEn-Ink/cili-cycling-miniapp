'use strict';

const crypto = require('node:crypto');
const PUBLIC_POLICY_VERSION = '2026-10-21';
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const CONTACT_FIELDS = [
  'real_name_cipher',
  'phone_cipher',
  'emergency_phone_cipher',
  'emergency_name',
];
const PERSONAL_FIELDS = [
  ...CONTACT_FIELDS,
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
const MEDIA_REFERENCES = {
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
async function hasMediaReferences(tx, command, targets) {
  const ids = [...new Set(targets.filter(Boolean))];
  if (!ids.length) return false;
  for (const [name, fields] of Object.entries(MEDIA_REFERENCES)) {
    const result = await tx
      .collection(name)
      .where(command.or(fields.map((field) => ({ [field]: command.in(ids) }))))
      .limit(1)
      .get();
    if (result.data.length) return true;
  }
  return false;
}
function privacyError(code, message) {
  throw Object.assign(new Error(message), { code });
}
function profileGeneration(profile) {
  const value = profile?.generation;
  if (value === undefined) return 1;
  if (!Number.isSafeInteger(value) || value < 1)
    privacyError('PROFILE_GENERATION_INVALID', '资料版本无效');
  return value;
}
function isProfileDeleted(profile) {
  return Boolean(profile?.deletion_status && profile.deletion_status !== 'active');
}
function publicConsentStatus(profile) {
  let generation;
  try {
    generation = profileGeneration(profile);
  } catch {
    generation = null;
  }
  const versions = {
    nickname: digest([generation, profile?.nickname_revision || 0, profile?.nickname || '']),
    media: digest([
      generation,
      profile?.avatar_revision || 0,
      profile?.media_revision || 0,
      profile?.avatar_file_id || '',
      profile?.avatar_source || '',
      profile?.background_photo || null,
      profile?.photos || [],
    ]),
  };
  const choice = (field) => {
    const saved = profile?.public_consent?.[field];
    return {
      consented: Boolean(
        profile &&
        generation &&
        !isProfileDeleted(profile) &&
        saved?.consented === true &&
        saved.generation === generation &&
        saved.policy_version === PUBLIC_POLICY_VERSION &&
        saved.version === versions[field],
      ),
      version: versions[field],
    };
  };
  return {
    generation,
    policyVersion: PUBLIC_POLICY_VERSION,
    nickname: choice('nickname'),
    media: choice('media'),
  };
}
function driverFieldsVersion(driver) {
  return digest([
    'driver-public-fields-v1',
    ...['nickname', 'license_plate', 'contact_phone'].map((field) =>
      typeof driver?.[field] === 'string' ? driver[field] : '',
    ),
  ]);
}
function hasDriverAttestation(activity) {
  const record = activity?.driver_public_attestation;
  return Boolean(
    record?.kind === 'organizer_attestation' &&
    record.policy_version === PUBLIC_POLICY_VERSION &&
    typeof record.attested_by === 'string' &&
    record.attested_by &&
    record.activity_id === activity._id &&
    Number.isSafeInteger(record.confirmed_activity_version) &&
    record.confirmed_activity_version >= 0 &&
    Number.isSafeInteger(record.activity_version) &&
    record.confirmed_activity_version < record.activity_version &&
    record.activity_version === activity.version &&
    /^[a-f0-9]{64}$/.test(record.record_id || '') &&
    record.fields_version === driverFieldsVersion(activity.support_vehicle_driver),
  );
}
function safeClubMedia(value) {
  if (typeof value !== 'string') return '';
  try {
    const path = decodeURIComponent(new URL(value).pathname);
    // Personal canonical assets must not escape consent through a club snapshot.
    if (
      /\/profile-canonical\/[^/]+\/(?!club-avatar\/|club-cover\/|activity-image\/|activity-group-qr\/)/.test(
        path,
      ) ||
      /\/profiles\/[^/]+\/(?!club-avatar\/|club-cover\/|activity-image\/|activity-group-qr\/)/.test(
        path,
      ) ||
      /\/profile-(?:avatar|background)\//.test(path)
    )
      return '';
  } catch {
    return '';
  }
  return value;
}
function assertProfileWritable(profile, generation) {
  if (isProfileDeleted(profile))
    privacyError('PROFILE_DELETION_LOCKED', '资料删除处理中或已删除，请先查看状态');
  const current = profileGeneration(profile);
  if ((current > 1 || generation !== undefined) && generation !== current)
    privacyError('PROFILE_GENERATION_MISMATCH', '资料版本已变化，请重新读取并明确操作');
  return current;
}
function contactFields(profile) {
  return Object.fromEntries(
    CONTACT_FIELDS.filter((field) => profile?.[field] !== undefined).map((field) => [
      field,
      profile[field],
    ]),
  );
}
function scrubProfile(profile, keepContact = false) {
  const next = { ...profile };
  for (const field of PERSONAL_FIELDS)
    if (!keepContact || !CONTACT_FIELDS.includes(field)) delete next[field];
  return next;
}
function visibleProfile(profile) {
  return isProfileDeleted(profile) ? scrubProfile(profile) : profile;
}
function projectPrivateRegistration(registration, profile) {
  if (!registration) return registration;
  const stale =
    !profile ||
    registration.privacy_public_suppressed ||
    registration.privacy_generation ||
    isProfileDeleted(profile) ||
    (registration.profile_generation || 1) !== profileGeneration(profile);
  return stale ? { ...registration, profile_snapshot: {} } : registration;
}
function registrationContactProfile(registration, profile) {
  if (registration?.privacy_generation) return contactFields(registration.privacy_contact);
  if ((registration?.profile_generation || 1) !== profileGeneration(profile)) return {};
  if (
    isProfileDeleted(profile) &&
    registrationNeedsContact(registration || {}, undefined, new Date())
  )
    return contactFields(profile);
  return isProfileDeleted(profile) ? {} : profile || {};
}
function registrationNeedsContact(registration, activity, now) {
  if (!['waiting', 'pending', 'approved', 'checked_in'].includes(registration.status)) return false;
  if (!activity?.event_end) return true;
  const end = new Date(activity.event_end).getTime();
  return !Number.isFinite(end) || end > now.getTime();
}
function registrationPublicEligible(registration, profile) {
  if (
    !registration ||
    typeof registration !== 'object' ||
    Array.isArray(registration) ||
    !profile ||
    typeof profile !== 'object' ||
    Array.isArray(profile) ||
    (profile.deletion_status !== undefined && profile.deletion_status !== 'active') ||
    registration.privacy_generation !== undefined ||
    (registration.privacy_public_suppressed !== undefined &&
      registration.privacy_public_suppressed !== false)
  )
    return false;
  const enrolled = registration.profile_generation ?? 1;
  if (registration.profile_generation === null || !Number.isSafeInteger(enrolled) || enrolled < 1)
    return false;
  try {
    return enrolled === profileGeneration(profile);
  } catch {
    return false;
  }
}
module.exports = {
  CONTACT_FIELDS,
  PERSONAL_FIELDS,
  privacyError,
  profileGeneration,
  isProfileDeleted,
  assertProfileWritable,
  contactFields,
  scrubProfile,
  visibleProfile,
  projectPrivateRegistration,
  registrationContactProfile,
  registrationNeedsContact,
  registrationPublicEligible,
  MEDIA_REFERENCES,
  hasMediaReferences,
  PUBLIC_POLICY_VERSION,
  publicConsentStatus,
  driverFieldsVersion,
  hasDriverAttestation,
  safeClubMedia,
};
