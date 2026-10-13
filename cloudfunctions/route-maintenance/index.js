'use strict';

const TIMER_TRIGGER = 'route-maintenance-worker';
const MAINTENANCE_STATE_ID = '__route_maintenance_v1__';
const MAX_BATCH = 20;
const ROUTE_FILE_GRACE_MS = 24 * 60 * 60 * 1000;
const RETIRED_COLLECTIONS = Object.freeze([
  'oauth_states',
  'oauth_attempts',
  'strava_credentials',
  'strava_snapshots',
  'strava_route_previews',
]);
const MIGRATION_COLLECTIONS = Object.freeze([
  'activities',
  'profiles',
  'registrations',
  'profile_media',
  'route_previews',
]);
const LEGACY_NATIVE_ROUTE_FIELDS = Object.freeze([
  'gpx_file_id',
  'gpx_preview_id',
  'gpx_sha256',
  'generated_preview_file_id',
  'route_name',
  'elevation_loss_m',
  'elevation_min_m',
  'elevation_max_m',
  'estimated_moving_time_seconds',
  'estimation_source',
  'elevation_profile',
  'route_outline',
  'route_bounds',
]);
const PROFILE_STRAVA_FIELDS = Object.freeze([
  'strava',
  'strava_status',
  'strava_snapshot',
  'strava_profile_url',
  'years_on_strava',
  'athlete_created_at',
]);
const REGISTRATION_STRAVA_FIELDS = Object.freeze([
  'strava_status',
  'strava_snapshot',
  'strava_profile_url',
  'years_on_strava',
  'athlete_created_at',
  'exemption',
]);

function coded(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function authorizeMaintenance(event, openid) {
  if (openid || !event || event.Type !== 'Timer' || event.TriggerName !== TIMER_TRIGGER)
    coded('SERVICE_IDENTITY_REQUIRED', '仅允许配置的定时触发器执行路线维护');
  return 'timer-worker';
}

function own(record, field) {
  return Boolean(record && Object.prototype.hasOwnProperty.call(record, field));
}

function strictStravaRouteId(route) {
  const rawUrl = typeof route?.strava_route_url === 'string' ? route.strava_route_url.trim() : '';
  if (!rawUrl) return undefined;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  const match = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?routes\/([1-9]\d{0,19})\/?$/i.exec(url.pathname);
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'www.strava.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match
  )
    return undefined;
  const declared =
    route.strava_route_id === undefined ? match[1] : String(route.strava_route_id).trim();
  return declared === match[1] ? match[1] : undefined;
}

function trustedGpxRoute(route) {
  if (
    !route ||
    typeof route.gpx_preview_id !== 'string' ||
    !/^[a-f0-9]{64}$/.test(route.gpx_preview_id) ||
    typeof route.gpx_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(route.gpx_sha256) ||
    typeof route.gpx_file_id !== 'string'
  )
    return false;
  const match = /^cloud:\/\/[^/]+\/activity-routes\/[^/]+\/([a-f0-9]{64})\.gpx$/.exec(
    route.gpx_file_id,
  );
  return Boolean(match && match[1] === route.gpx_sha256);
}

function migrateActivityRecord(record) {
  if (!record?.route || typeof record.route !== 'object' || Array.isArray(record.route))
    return undefined;
  const route = { ...record.route };
  const original = JSON.stringify(route);
  const legacyPreviewImage =
    typeof route.preview_image_url === 'string' ? route.preview_image_url : '';
  const routeId = strictStravaRouteId(route);
  if (
    routeId &&
    !own(route, 'external_provider') &&
    !own(route, 'external_route_id') &&
    !own(route, 'external_route_url')
  ) {
    route.external_provider = 'strava';
    route.external_route_id = routeId;
    route.external_route_url = `https://www.strava.com/routes/${routeId}`;
  }
  for (const field of [
    'strava_route_id',
    'strava_route_url',
    'preview_image_url',
    'strava_gpx_available',
    'popular_climbs',
  ])
    delete route[field];
  if (!trustedGpxRoute(route)) for (const field of LEGACY_NATIVE_ROUTE_FIELDS) delete route[field];

  const set = {};
  if (JSON.stringify(route) !== original) set.route = route;
  if (legacyPreviewImage && record.cover_image === legacyPreviewImage)
    set.cover_image =
      Array.isArray(record.images) && typeof record.images[0] === 'string' ? record.images[0] : '';
  return Object.keys(set).length ? { set, remove: [] } : undefined;
}

function retireProfileRecord(record, now = new Date()) {
  if (!record || typeof record !== 'object') return undefined;
  const remove = PROFILE_STRAVA_FIELDS.filter((field) => own(record, field));
  const set = {};
  if (record.avatar_source === 'strava') {
    remove.push('avatar_source', 'avatar_file_id');
    set.avatar_revision =
      Number.isSafeInteger(record.avatar_revision) && record.avatar_revision >= 0
        ? record.avatar_revision + 1
        : 1;
    set.avatar_visibility = 'private';
    set.avatar_visibility_revision = null;
  }
  if (!remove.length && !Object.keys(set).length) return undefined;
  set.updated_at = now;
  return { set, remove: [...new Set(remove)] };
}

function retireRegistrationRecord(record, now = new Date()) {
  if (!record || typeof record !== 'object') return undefined;
  const remove = REGISTRATION_STRAVA_FIELDS.filter((field) => own(record, field));
  if (!remove.length) return undefined;
  return { set: { updated_at: now }, remove };
}

function retireProfileMediaRecord(record, now = new Date(), referenced = false) {
  if (!record || record.origin !== 'strava') return undefined;
  const set = { origin: 'custom', updated_at: now };
  if (!referenced && !['deleting', 'deleted', 'delete_failed_terminal'].includes(record.status)) {
    set.status = 'unreferenced';
    set.referenced_at = null;
    set.cleanup_after = new Date(now.getTime() + ROUTE_FILE_GRACE_MS);
    set.delete_lease_id = '';
  }
  return { set, remove: [] };
}

function validRouteFileId(preview, fileId, extension) {
  if (
    !preview ||
    typeof preview.owner_openid !== 'string' ||
    !preview.owner_openid ||
    typeof preview.gpx_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(preview.gpx_sha256) ||
    typeof fileId !== 'string'
  )
    return false;
  const escapedOwner = preview.owner_openid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedExtension = extension.replace('.', '\\.');
  return new RegExp(
    `^cloud://[^/]+/activity-routes/${escapedOwner}/${preview.gpx_sha256}${escapedExtension}$`,
  ).test(fileId);
}

function routePreviewFileIds(preview) {
  return [
    validRouteFileId(preview, preview?.source_file_id, '.gpx') ? preview.source_file_id : '',
    validRouteFileId(preview, preview?.generated_file_id, '.png') ? preview.generated_file_id : '',
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function oldRoutePreview(preview, now) {
  if (!preview || preview._id === MAINTENANCE_STATE_ID) return false;
  const createdAt = new Date(preview.created_at).getTime();
  return Number.isFinite(createdAt) && createdAt <= now.getTime() - ROUTE_FILE_GRACE_MS;
}

function trustedObjectMissing(value) {
  if (!value || typeof value !== 'object') return false;
  const codes = [value.status, value.errCode, value.code];
  return (
    codes.some((code) => Number(code) === -503003) ||
    codes.some((code) => String(code || '').trim() === 'STORAGE_FILE_NONEXIST') ||
    String(value.errMsg || '').trim() === 'STORAGE_FILE_NONEXIST'
  );
}

function deletionAccepted(response, fileId) {
  const item =
    response &&
    Array.isArray(response.fileList) &&
    response.fileList.find((entry) => entry?.fileID === fileId);
  return Boolean(item && (Number(item.status) === 0 || trustedObjectMissing(item)));
}

async function deleteRouteFiles(deleteFile, fileIds) {
  if (!fileIds.length) return;
  try {
    const response = await deleteFile({ fileList: fileIds });
    if (fileIds.some((fileId) => !deletionAccepted(response, fileId)))
      coded('DELETE_REJECTED', '路线文件删除未被接受');
  } catch (error) {
    if (trustedObjectMissing(error) && fileIds.length === 1) return;
    throw error;
  }
}

function boundedLimit(value) {
  const numeric = Number(value);
  return Math.max(
    1,
    Math.min(MAX_BATCH, Number.isFinite(numeric) ? Math.floor(numeric) : MAX_BATCH),
  );
}

async function scanStage(store, state, collection, limit, visit) {
  const afterId = typeof state.cursors[collection] === 'string' ? state.cursors[collection] : '';
  const records = await store.listRecords(collection, { afterId, limit });
  for (const record of records) await visit(record);
  state.cursors[collection] =
    records.length >= limit && typeof records.at(-1)?._id === 'string' ? records.at(-1)._id : '';
  return records.length;
}

async function runMaintenance({
  store,
  deleteFile,
  now = new Date(),
  limit = MAX_BATCH,
  purgeEnabled = false,
}) {
  const batchSize = boundedLimit(limit);
  const existingState = (await store.getState()) || {};
  const state = {
    _id: MAINTENANCE_STATE_ID,
    kind: 'route_maintenance_state',
    cursors:
      existingState.cursors &&
      typeof existingState.cursors === 'object' &&
      !Array.isArray(existingState.cursors)
        ? { ...existingState.cursors }
        : {},
    updated_at: now,
  };
  const result = {
    scanned: {},
    migrated: { activities: 0, profiles: 0, registrations: 0, profile_media: 0 },
    route_previews: {
      removed_records: 0,
      deleted_files: 0,
      protected_files: 0,
      failed_records: 0,
    },
    purge: {},
  };

  result.scanned.activities = await scanStage(
    store,
    state,
    'activities',
    batchSize,
    async (record) => {
      const change = migrateActivityRecord(record, now);
      if (change && (await store.patchRecord('activities', record._id, change)))
        result.migrated.activities += 1;
    },
  );
  result.scanned.profiles = await scanStage(store, state, 'profiles', batchSize, async (record) => {
    const change = retireProfileRecord(record, now);
    if (change && (await store.patchRecord('profiles', record._id, change)))
      result.migrated.profiles += 1;
  });
  result.scanned.registrations = await scanStage(
    store,
    state,
    'registrations',
    batchSize,
    async (record) => {
      const change = retireRegistrationRecord(record, now);
      if (change && (await store.patchRecord('registrations', record._id, change)))
        result.migrated.registrations += 1;
    },
  );
  result.scanned.profile_media = await scanStage(
    store,
    state,
    'profile_media',
    batchSize,
    async (record) => {
      if (record.origin !== 'strava') return;
      const references =
        typeof store.getProfileFileReferences === 'function'
          ? await store.getProfileFileReferences(record.owner_openid, record.file_id)
          : {
              stravaAvatar: false,
              retained: await store.isProfileFileReferenced(record.owner_openid, record.file_id),
            };
      if (references.stravaAvatar) return;
      const change = retireProfileMediaRecord(record, now, references.retained);
      if (change && (await store.patchRecord('profile_media', record._id, change)))
        result.migrated.profile_media += 1;
    },
  );
  result.scanned.route_previews = await scanStage(
    store,
    state,
    'route_previews',
    batchSize,
    async (preview) => {
      if (!oldRoutePreview(preview, now)) return;
      const fileIds = routePreviewFileIds(preview);
      const unattached = [];
      const cutoff = new Date(now.getTime() - ROUTE_FILE_GRACE_MS);
      for (const fileId of fileIds) {
        const protectedFile =
          typeof store.isRouteFileProtected === 'function'
            ? await store.isRouteFileProtected(fileId, preview._id, cutoff)
            : await store.isRouteFileAttached(fileId);
        if (protectedFile) result.route_previews.protected_files += 1;
        else unattached.push(fileId);
      }
      try {
        await deleteRouteFiles(deleteFile, unattached);
        result.route_previews.deleted_files += unattached.length;
        await store.removeRecord('route_previews', preview._id);
        result.route_previews.removed_records += 1;
      } catch {
        result.route_previews.failed_records += 1;
      }
    },
  );

  if (purgeEnabled) {
    for (const collection of RETIRED_COLLECTIONS) {
      let removed = 0;
      result.scanned[collection] = await scanStage(
        store,
        state,
        collection,
        batchSize,
        async (record) => {
          await store.removeRecord(collection, record._id);
          removed += 1;
        },
      );
      result.purge[collection] = removed;
    }
  }
  await store.putState(state);
  return result;
}

function missingDocument(error) {
  const code = String(error?.errCode || error?.code || '');
  const message = String(error?.errMsg || error?.message || '');
  return (
    ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(code) ||
    ([-502001, -1].includes(Number(error?.errCode)) &&
      /\bdocument(?:\s+with\s+_id\s+\S+)?\s+(?:(?:does\s+)?not\s+exist|not\s+found)\b/i.test(
        message,
      ))
  );
}

function missingRetiredCollection(error) {
  const code = String(error?.errCode || error?.code || '');
  const message = String(error?.errMsg || error?.message || '');
  return (
    ['DATABASE_COLLECTION_NOT_EXIST', 'COLLECTION_NOT_FOUND'].includes(code) ||
    /collection[^.]{0,80}(?:does not exist|not found)/i.test(message)
  );
}

async function maybeGet(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (missingDocument(error)) return undefined;
    throw error;
  }
}

function createMaintenanceStore(db) {
  const command = db.command;
  const isRouteFileAttached = async (fileId) => {
    for (const field of ['route.gpx_file_id', 'route.generated_preview_file_id']) {
      const result = await db
        .collection('activities')
        .where({ [field]: fileId, is_deleted: false })
        .limit(1)
        .get();
      if (Array.isArray(result?.data) && result.data.length) return true;
    }
    return false;
  };
  return {
    getState: () => maybeGet(db.collection('route_previews'), MAINTENANCE_STATE_ID),
    putState: async (value) => {
      const { _id, ...data } = value;
      await db.collection('route_previews').doc(MAINTENANCE_STATE_ID).set({ data });
    },
    listRecords: async (collectionName, { afterId = '', limit = MAX_BATCH }) => {
      try {
        let query = db.collection(collectionName);
        if (afterId) query = query.where({ _id: command.gt(afterId) });
        const result = await query.orderBy('_id', 'asc').limit(boundedLimit(limit)).get();
        return Array.isArray(result?.data) ? result.data : [];
      } catch (error) {
        if (RETIRED_COLLECTIONS.includes(collectionName) && missingRetiredCollection(error))
          return [];
        throw error;
      }
    },
    patchRecord: async (collectionName, id, change) => {
      const data = { ...(change?.set || {}) };
      for (const field of change?.remove || []) data[field] = command.remove();
      await db.collection(collectionName).doc(id).update({ data });
      return true;
    },
    removeRecord: async (collectionName, id) => {
      try {
        await db.collection(collectionName).doc(id).remove();
      } catch (error) {
        if (!missingDocument(error)) throw error;
      }
    },
    isRouteFileAttached,
    isRouteFileProtected: async (fileId, previewId, cutoff) => {
      if (await isRouteFileAttached(fileId)) return true;
      const match = /^cloud:\/\/[^/]+\/activity-routes\/([^/]+)\/[a-f0-9]{64}\.(?:gpx|png)$/.exec(
        fileId,
      );
      if (!match) return true;
      const result = await db
        .collection('route_previews')
        .where({
          owner_openid: match[1],
          expires_at: command.gt(cutoff),
        })
        .orderBy('expires_at', 'asc')
        .limit(MAX_BATCH)
        .get();
      const previews = Array.isArray(result?.data) ? result.data : [];
      if (
        previews.some(
          (preview) =>
            preview._id !== previewId &&
            (preview.source_file_id === fileId || preview.generated_file_id === fileId) &&
            new Date(preview.created_at).getTime() > cutoff.getTime(),
        )
      )
        return true;
      return previews.length >= MAX_BATCH;
    },
    isProfileFileReferenced: async (openid, fileId) => {
      if (typeof openid !== 'string' || !openid || typeof fileId !== 'string' || !fileId)
        return false;
      const profile = await maybeGet(db.collection('profiles'), openid);
      return Boolean(
        profile &&
        (profile.avatar_file_id === fileId ||
          profile.background_photo?.file_id === fileId ||
          (Array.isArray(profile.photos) ? profile.photos : []).some(
            (photo) => photo?.file_id === fileId,
          )),
      );
    },
    getProfileFileReferences: async (openid, fileId) => {
      if (typeof openid !== 'string' || !openid || typeof fileId !== 'string' || !fileId)
        return { stravaAvatar: false, retained: false };
      const profile = await maybeGet(db.collection('profiles'), openid);
      return {
        stravaAvatar: Boolean(
          profile?.avatar_source === 'strava' && profile.avatar_file_id === fileId,
        ),
        retained: Boolean(
          profile &&
          ((profile.avatar_source !== 'strava' && profile.avatar_file_id === fileId) ||
            profile.background_photo?.file_id === fileId ||
            (Array.isArray(profile.photos) ? profile.photos : []).some(
              (photo) => photo?.file_id === fileId,
            )),
        ),
      };
    },
  };
}

let runtime;
function cloudRuntime() {
  if (runtime) return runtime;
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  runtime = {
    cloud,
    store: createMaintenanceStore(cloud.database()),
  };
  return runtime;
}

exports.main = async (event = {}) => {
  try {
    const { cloud, store } = cloudRuntime();
    authorizeMaintenance(event, cloud.getWXContext().OPENID);
    const data = await runMaintenance({
      store,
      deleteFile: (input) => cloud.deleteFile(input),
      purgeEnabled: process.env.OAUTH_RETIREMENT_PURGE_ENABLED === '1',
    });
    return { ok: true, data };
  } catch (error) {
    console.error(
      'route-maintenance failed',
      typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
    );
    return {
      ok: false,
      error: {
        code: typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
        message: typeof error?.code === 'string' ? error.message : '路线维护暂时不可用',
      },
    };
  }
};

module.exports = {
  TIMER_TRIGGER,
  MAINTENANCE_STATE_ID,
  MAX_BATCH,
  ROUTE_FILE_GRACE_MS,
  RETIRED_COLLECTIONS,
  MIGRATION_COLLECTIONS,
  authorizeMaintenance,
  migrateActivityRecord,
  retireProfileRecord,
  retireRegistrationRecord,
  retireProfileMediaRecord,
  routePreviewFileIds,
  oldRoutePreview,
  runMaintenance,
  createMaintenanceStore,
  missingDocument,
  missingRetiredCollection,
};
