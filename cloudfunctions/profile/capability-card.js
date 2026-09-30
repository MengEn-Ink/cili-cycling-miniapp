'use strict';

const { ProfileError, ownerAvatarMedia, ownerMedia } = require('./core');
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SUMMARY_FIELDS = [
  ['total_km_90d', 'total_km'],
  ['rides_90d', 'activities_90d'],
  ['longest_km', 'longest_km'],
  ['elevation_m_90d', 'total_elevation_m'],
  ['weighted_avg_speed_kmh', 'weighted_avg_speed_kmh'],
];

function validDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function validEnvelope(value) {
  return Boolean(
    value &&
    value.alg === 'A256GCM' &&
    ['iv', 'tag', 'ciphertext'].every(
      (field) => typeof value[field] === 'string' && value[field].trim(),
    ),
  );
}

function usableCredential(credential) {
  return Boolean(
    credential &&
    typeof credential.athlete_id === 'string' &&
    credential.athlete_id &&
    validEnvelope(credential.access_token_cipher) &&
    validEnvelope(credential.refresh_token_cipher),
  );
}

function canonicalSnapshot(credential, snapshot) {
  return Boolean(
    usableCredential(credential) &&
    snapshot &&
    snapshot.athlete_id === credential.athlete_id &&
    validDate(snapshot.synced_at),
  );
}

function summary(snapshot) {
  return SUMMARY_FIELDS.reduce((output, [target, source]) => {
    output[target] =
      snapshot && typeof snapshot[source] === 'number' && Number.isFinite(snapshot[source])
        ? snapshot[source]
        : null;
    return output;
  }, {});
}

function coverage(snapshot) {
  const from = validDate(snapshot && snapshot.coverage_from);
  const to = validDate(snapshot && snapshot.coverage_to);
  if (!from || !to || typeof snapshot.coverage_complete !== 'boolean') return null;
  return { from: from.toISOString(), to: to.toISOString(), complete: snapshot.coverage_complete };
}

function deriveCapabilityState({ credential, snapshot }, now = new Date()) {
  if (!usableCredential(credential)) return 'disconnected';
  if (canonicalSnapshot(credential, snapshot)) {
    const snapshotSummary = summary(snapshot);
    const snapshotCoverage = coverage(snapshot);
    const syncedAt = validDate(snapshot.synced_at);
    const fresh = now.getTime() - syncedAt.getTime() < SNAPSHOT_MAX_AGE_MS;
    const completeMetrics = Object.values(snapshotSummary).every((value) => value !== null);
    return fresh && snapshotCoverage && snapshotCoverage.complete && completeMetrics
      ? 'ready'
      : 'partial';
  }
  return credential.sync_status === 'failed' ? 'failed' : 'syncing';
}

function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

async function resolveBackgrounds(media, getTempFileURL) {
  if (!media.length) return [];
  const storageFileId = (item) => item.storage_file_id;
  let response;
  try {
    response = await getTempFileURL({ fileList: media.map(storageFileId) });
  } catch {
    return [];
  }
  const byId = new Map(media.map((item) => [storageFileId(item), item]));
  const resolved = new Map();
  for (const item of Array.isArray(response && response.fileList) ? response.fileList : []) {
    const source = byId.get(item && item.fileID);
    const url = item && Number(item.status) === 0 ? safeHttpsUrl(item.tempFileURL) : '';
    if (source && url && !resolved.has(storageFileId(source)))
      resolved.set(storageFileId(source), url);
  }
  return media
    .filter((item) => resolved.has(storageFileId(item)))
    .map((item) => ({
      url: resolved.get(storageFileId(item)),
      source: item.source,
      category: item.category,
    }));
}

async function buildCapabilityCard(
  { profile, credential, snapshot, mediaRecords = [] },
  { openid, mediaSecret, now = new Date(), getTempFileURL },
) {
  if (typeof openid !== 'string' || !openid)
    throw new ProfileError('UNAUTHENTICATED', '无法取得微信身份');
  const hasSnapshot = canonicalSnapshot(credential, snapshot);
  const snapshotSummary = summary(hasSnapshot ? snapshot : undefined);
  const snapshotCoverage = hasSnapshot ? coverage(snapshot) : null;
  const syncedAt = hasSnapshot ? validDate(snapshot.synced_at).toISOString() : null;
  const [backgrounds, avatar] = await Promise.all([
    resolveBackgrounds(ownerMedia(profile, openid, mediaSecret, mediaRecords), getTempFileURL),
    resolveBackgrounds(
      [ownerAvatarMedia(profile, openid, mediaSecret, mediaRecords)].filter(Boolean),
      getTempFileURL,
    ),
  ]);
  const avatarUrl = avatar[0]?.url || '';
  return {
    state: deriveCapabilityState({ credential, snapshot }, now),
    generated_at: now.toISOString(),
    profile: {
      display_name: typeof profile?.nickname === 'string' ? profile.nickname : '',
      title: typeof profile?.title === 'string' ? profile.title : '',
      avatar_url: avatarUrl,
    },
    backgrounds,
    summary: snapshotSummary,
    coverage: snapshotCoverage,
    synced_at: syncedAt,
    needs_strava_reauth: profile?.avatar_source === 'strava' && !avatarUrl,
  };
}

module.exports = {
  SNAPSHOT_MAX_AGE_MS,
  deriveCapabilityState,
  buildCapabilityCard,
};
