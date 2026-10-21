'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

let subject = {};
try {
  subject = require('./index');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const {
  MAINTENANCE_STATE_ID = 'missing-maintenance-state',
  ROUTE_FILE_GRACE_MS = 0,
  authorizeMaintenance = () => {
    throw new Error('route-maintenance is not implemented');
  },
  migrateActivityRecord = () => undefined,
  retireProfileRecord = () => undefined,
  retireRegistrationRecord = () => undefined,
  retireProfileMediaRecord = () => undefined,
  runMaintenance = async () => {
    throw new Error('route-maintenance is not implemented');
  },
} = subject;

const now = new Date('2026-10-13T12:00:00.000Z');
const digest = 'a'.repeat(64);
const owner = 'owner-1';
const gpxFileId = `cloud://env/activity-routes/${owner}/${digest}.gpx`;
const pngFileId = `cloud://env/activity-routes/${owner}/${digest}.png`;
const root = resolve(__dirname, '../..');

function applyChange(record, change) {
  const next = { ...record, ...(change?.set || {}) };
  for (const field of change?.remove || []) delete next[field];
  return next;
}

function memoryStore(seed = {}) {
  const collections = Object.fromEntries(
    Object.entries(seed).map(([name, records]) => [
      name,
      new Map(records.map((record) => [record._id, structuredClone(record)])),
    ]),
  );
  const ensure = (name) => (collections[name] ||= new Map());
  const listCalls = [];
  const patches = [];
  const removals = [];
  return {
    collections,
    listCalls,
    patches,
    removals,
    store: {
      getState: async () => ensure('route_previews').get(MAINTENANCE_STATE_ID),
      putState: async (state) =>
        ensure('route_previews').set(MAINTENANCE_STATE_ID, structuredClone(state)),
      listRecords: async (collection, { afterId = '', limit }) => {
        listCalls.push({ collection, afterId, limit });
        return [...ensure(collection).values()]
          .filter((record) => record._id > afterId)
          .sort((left, right) => left._id.localeCompare(right._id))
          .slice(0, limit)
          .map((record) => structuredClone(record));
      },
      patchRecord: async (collection, id, change) => {
        const current = ensure(collection).get(id);
        if (!current) return false;
        patches.push({ collection, id, change: structuredClone(change) });
        ensure(collection).set(id, applyChange(current, change));
        return true;
      },
      removeRecord: async (collection, id) => {
        removals.push({ collection, id });
        ensure(collection).delete(id);
      },
      isRouteFileAttached: async (fileId) =>
        [...ensure('activities').values()].some(
          (activity) =>
            activity.route?.gpx_file_id === fileId ||
            activity.route?.generated_preview_file_id === fileId,
        ),
      isRouteFileProtected: async (fileId, previewId, cutoff) =>
        [...ensure('activities').values()].some(
          (activity) =>
            activity.route?.gpx_file_id === fileId ||
            activity.route?.generated_preview_file_id === fileId,
        ) ||
        [...ensure('route_previews').values()].some(
          (preview) =>
            preview._id !== previewId &&
            (preview.source_file_id === fileId || preview.generated_file_id === fileId) &&
            new Date(preview.created_at).getTime() > cutoff.getTime(),
        ),
      isProfileFileReferenced: async (openid, fileId) => {
        const profile = ensure('profiles').get(openid);
        return Boolean(
          profile &&
          (profile.avatar_file_id === fileId ||
            profile.background_photo?.file_id === fileId ||
            (profile.photos || []).some((photo) => photo?.file_id === fileId)),
        );
      },
      getProfileFileReferences: async (openid, fileId) => {
        const profile = ensure('profiles').get(openid);
        return {
          stravaAvatar: Boolean(
            profile?.avatar_source === 'strava' && profile.avatar_file_id === fileId,
          ),
          retained: Boolean(
            profile &&
            ((profile.avatar_source !== 'strava' && profile.avatar_file_id === fileId) ||
              profile.background_photo?.file_id === fileId ||
              (profile.photos || []).some((photo) => photo?.file_id === fileId)),
          ),
        };
      },
    },
  };
}

function successfulDelete(log) {
  return async ({ fileList }) => {
    log.push(...fileList);
    return {
      fileList: fileList.map((fileID) => ({ fileID, status: 0 })),
    };
  };
}

test('maintenance 只允许配置的定时触发器调用', () => {
  assert.equal(
    authorizeMaintenance({ Type: 'Timer', TriggerName: 'route-maintenance-worker' }, ''),
    'timer-worker',
  );
  assert.throws(
    () =>
      authorizeMaintenance(
        { Type: 'Timer', TriggerName: 'route-maintenance-worker' },
        'client-openid',
      ),
    (error) => error.code === 'SERVICE_IDENTITY_REQUIRED',
  );
  assert.throws(
    () => authorizeMaintenance({ action: 'run' }, ''),
    (error) => error.code === 'SERVICE_IDENTITY_REQUIRED',
  );
});

test('旧 Strava 路线迁移为公开路线并移除无 GPX 依据的同步详情', () => {
  const record = {
    _id: 'activity-1',
    cover_image: 'https://images.example/route.jpg',
    images: ['cloud://env/covers/ride.jpg'],
    route: {
      start: '起点',
      end: '终点',
      distance_km: 86,
      elevation_m: 1200,
      level: '进阶',
      strava_route_id: '123456789',
      strava_route_url: 'https://www.strava.com/routes/123456789',
      route_name: '旧同步路线',
      preview_image_url: 'https://images.example/route.jpg',
      strava_gpx_available: true,
      estimated_moving_time_seconds: 14400,
      elevation_profile: [
        { distance_km: 0, elevation_m: 10 },
        { distance_km: 86, elevation_m: 100 },
      ],
      route_bounds: { south: 22, west: 113, north: 23, east: 114 },
      popular_climbs: [{ id: '1' }],
    },
  };

  const migrated = applyChange(record, migrateActivityRecord(record, now));

  assert.equal(migrated.route.external_provider, 'strava');
  assert.equal(migrated.route.external_route_id, '123456789');
  assert.equal(migrated.route.external_route_url, 'https://www.strava.com/routes/123456789');
  assert.equal(migrated.route.distance_km, 86);
  assert.equal(migrated.route.elevation_m, 1200);
  for (const field of [
    'strava_route_id',
    'strava_route_url',
    'route_name',
    'preview_image_url',
    'strava_gpx_available',
    'estimated_moving_time_seconds',
    'elevation_profile',
    'route_bounds',
    'popular_climbs',
  ])
    assert.equal(Object.hasOwn(migrated.route, field), false, field);
  assert.equal(migrated.cover_image, 'cloud://env/covers/ride.jpg');
});

test('迁移保留已绑定可信 GPX 的原生路线详情', () => {
  const record = {
    _id: 'activity-gpx',
    route: {
      strava_route_id: '42',
      strava_route_url: 'https://www.strava.com/routes/42',
      preview_image_url: 'https://images.example/route.jpg',
      gpx_preview_id: 'b'.repeat(64),
      gpx_file_id: gpxFileId,
      gpx_sha256: digest,
      route_name: '上传路线',
      elevation_profile: [
        { distance_km: 0, elevation_m: 10 },
        { distance_km: 10, elevation_m: 20 },
      ],
      route_outline: [
        { latitude: 22, longitude: 114 },
        { latitude: 22.1, longitude: 114.1 },
      ],
    },
  };

  const migrated = applyChange(record, migrateActivityRecord(record, now));

  assert.equal(migrated.route.route_name, '上传路线');
  assert.deepEqual(migrated.route.elevation_profile, record.route.elevation_profile);
  assert.deepEqual(migrated.route.route_outline, record.route.route_outline);
  assert.equal(migrated.route.preview_image_url, undefined);
  assert.equal(migrated.route.strava_route_id, undefined);
});

test('资料与报名迁移删除第三方账号兼容字段并让 Strava 头像回退', () => {
  const profile = {
    _id: owner,
    nickname: '骑友',
    avatar_source: 'strava',
    avatar_file_id: 'cloud://env/profiles/strava.jpg',
    avatar_revision: 3,
    avatar_visibility: 'public',
    avatar_visibility_revision: 3,
    strava: { status: 'connected', snapshot: { activities_90d: 12 } },
  };
  const registration = {
    _id: 'registration-1',
    status: 'approved',
    strava_status: 'connected',
    strava_snapshot: { activities_90d: 12 },
    exemption: { reason: 'legacy' },
  };

  const retiredProfile = applyChange(profile, retireProfileRecord(profile, now));
  const retiredRegistration = applyChange(
    registration,
    retireRegistrationRecord(registration, now),
  );

  assert.equal(retiredProfile.nickname, '骑友');
  assert.equal(retiredProfile.avatar_file_id, undefined);
  assert.equal(retiredProfile.avatar_source, undefined);
  assert.equal(retiredProfile.avatar_revision, 4);
  assert.equal(retiredProfile.avatar_visibility, 'private');
  assert.equal(retiredProfile.avatar_visibility_revision, null);
  assert.equal(retiredProfile.strava, undefined);
  assert.equal(retiredRegistration.status, 'approved');
  assert.equal(retiredRegistration.strava_status, undefined);
  assert.equal(retiredRegistration.strava_snapshot, undefined);
  assert.equal(retiredRegistration.exemption, undefined);
});

test('Strava 来源媒体在无资料引用时降级并延迟 24 小时回收', () => {
  const media = {
    _id: 'media-1',
    owner_openid: owner,
    file_id: 'cloud://env/profiles/strava.jpg',
    origin: 'strava',
    status: 'active',
    referenced_at: new Date('2026-10-12T12:00:00.000Z'),
  };

  const retired = applyChange(media, retireProfileMediaRecord(media, now, false));

  assert.equal(retired.origin, 'custom');
  assert.equal(retired.status, 'unreferenced');
  assert.equal(retired.referenced_at, null);
  assert.equal(new Date(retired.cleanup_after).getTime(), now.getTime() + ROUTE_FILE_GRACE_MS);
});

test('媒体游标先于 Strava 头像资料时仍会最终进入延迟回收', async () => {
  const fileId = 'cloud://env/profiles/strava.jpg';
  const fixture = memoryStore({
    profiles: [
      { _id: 'profile-a', nickname: '先扫描的资料' },
      {
        _id: 'profile-z',
        avatar_source: 'strava',
        avatar_file_id: fileId,
        avatar_revision: 1,
      },
    ],
    profile_media: [
      {
        _id: 'media-a',
        owner_openid: 'profile-z',
        file_id: fileId,
        origin: 'strava',
        status: 'active',
      },
    ],
  });

  for (let index = 0; index < 3; index += 1)
    await runMaintenance({
      store: fixture.store,
      deleteFile: successfulDelete([]),
      now,
      limit: 1,
      purgeEnabled: false,
    });

  const profile = fixture.collections.profiles.get('profile-z');
  const media = fixture.collections.profile_media.get('media-a');
  assert.equal(profile.avatar_source, undefined);
  assert.equal(profile.avatar_file_id, undefined);
  assert.equal(media.origin, 'custom');
  assert.equal(media.status, 'unreferenced');
  assert.equal(new Date(media.cleanup_after).getTime(), now.getTime() + ROUTE_FILE_GRACE_MS);
});

test('超过 24 小时的未挂载 GPX 与路线图会删除，预览记录随后移除', async () => {
  const fixture = memoryStore({
    route_previews: [
      {
        _id: 'preview-old',
        owner_openid: owner,
        gpx_sha256: digest,
        source_file_id: gpxFileId,
        generated_file_id: pngFileId,
        created_at: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        expires_at: new Date(now.getTime() - 23 * 60 * 60 * 1000),
        consumed_at: null,
        attached_activity_id: '',
      },
    ],
  });
  const deleted = [];

  const result = await runMaintenance({
    store: fixture.store,
    deleteFile: successfulDelete(deleted),
    now,
    limit: 20,
    purgeEnabled: false,
  });

  assert.deepEqual(deleted.sort(), [gpxFileId, pngFileId].sort());
  assert.equal(fixture.collections.route_previews.has('preview-old'), false);
  assert.equal(result.route_previews.deleted_files, 2);
  assert.equal(result.route_previews.removed_records, 1);
});

test('清理绝不删除活动仍在引用的 GPX 或生成路线图', async () => {
  const fixture = memoryStore({
    activities: [
      {
        _id: 'activity-attached',
        route: {
          gpx_preview_id: 'b'.repeat(64),
          gpx_file_id: gpxFileId,
          gpx_sha256: digest,
          generated_preview_file_id: pngFileId,
        },
      },
    ],
    route_previews: [
      {
        _id: 'preview-attached',
        owner_openid: owner,
        gpx_sha256: digest,
        source_file_id: gpxFileId,
        generated_file_id: pngFileId,
        created_at: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        expires_at: new Date(now.getTime() - 23 * 60 * 60 * 1000),
        consumed_at: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        attached_activity_id: 'activity-attached',
      },
    ],
  });
  const deleted = [];

  const result = await runMaintenance({
    store: fixture.store,
    deleteFile: successfulDelete(deleted),
    now,
    limit: 20,
    purgeEnabled: false,
  });

  assert.deepEqual(deleted, []);
  assert.equal(result.route_previews.protected_files, 2);
  assert.equal(fixture.collections.route_previews.has('preview-attached'), false);
});

test('旧预览不删除同摘要新预览仍在使用的内容寻址文件', async () => {
  const fixture = memoryStore({
    route_previews: [
      {
        _id: 'preview-old',
        owner_openid: owner,
        gpx_sha256: digest,
        source_file_id: gpxFileId,
        generated_file_id: pngFileId,
        created_at: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        expires_at: new Date(now.getTime() - 23 * 60 * 60 * 1000),
      },
      {
        _id: 'preview-new',
        owner_openid: owner,
        gpx_sha256: digest,
        source_file_id: gpxFileId,
        generated_file_id: pngFileId,
        created_at: new Date(now.getTime() - 60 * 60 * 1000),
        expires_at: new Date(now.getTime() + 60 * 60 * 1000),
      },
    ],
  });
  const deleted = [];

  const result = await runMaintenance({
    store: fixture.store,
    deleteFile: successfulDelete(deleted),
    now,
    limit: 20,
    purgeEnabled: false,
  });

  assert.deepEqual(deleted, []);
  assert.equal(result.route_previews.protected_files, 2);
  assert.equal(fixture.collections.route_previews.has('preview-old'), false);
  assert.equal(fixture.collections.route_previews.has('preview-new'), true);
});

test('每个集合使用持久化的 _id 游标推进有界批次', async () => {
  const fixture = memoryStore({
    activities: [
      { _id: 'activity-a', title: 'A', route: {} },
      { _id: 'activity-b', title: 'B', route: {} },
    ],
  });

  await runMaintenance({
    store: fixture.store,
    deleteFile: successfulDelete([]),
    now,
    limit: 1,
    purgeEnabled: false,
  });
  await runMaintenance({
    store: fixture.store,
    deleteFile: successfulDelete([]),
    now,
    limit: 1,
    purgeEnabled: false,
  });

  const calls = fixture.listCalls.filter((call) => call.collection === 'activities');
  assert.deepEqual(calls.slice(0, 2), [
    { collection: 'activities', afterId: '', limit: 1 },
    { collection: 'activities', afterId: 'activity-a', limit: 1 },
  ]);
  const state = fixture.collections.route_previews.get(MAINTENANCE_STATE_ID);
  assert.equal(state.cursors.activities, 'activity-b');
});

test('旧 Strava 账号能力 purge 仅在显式开关开启后按批删除退役集合', async () => {
  const retiredCollections = ['oauth_attempts', 'strava_snapshots', 'strava_route_previews'];
  const fixture = memoryStore(
    Object.fromEntries(
      retiredCollections.map((name) => [
        name,
        [
          { _id: `${name}-a`, secret: 'legacy' },
          { _id: `${name}-b`, secret: 'legacy' },
        ],
      ]),
    ),
  );

  await runMaintenance({
    store: fixture.store,
    deleteFile: successfulDelete([]),
    now,
    limit: 1,
    purgeEnabled: false,
  });
  for (const name of retiredCollections) assert.equal(fixture.collections[name].size, 2);

  const result = await runMaintenance({
    store: fixture.store,
    deleteFile: successfulDelete([]),
    now,
    limit: 1,
    purgeEnabled: true,
  });
  for (const name of retiredCollections) {
    assert.equal(fixture.collections[name].size, 1);
    assert.equal(result.purge[name], 1);
  }
});

test('部署配置包含维护定时器、函数包门禁与 owner 路线存储规则', () => {
  const cloudbase = JSON.parse(readFileSync(resolve(root, 'cloudbaserc.json'), 'utf8'));
  const rootPackage = readFileSync(resolve(root, 'package.json'), 'utf8');
  const verifier = readFileSync(resolve(root, 'scripts/verify-cloud-packages.mjs'), 'utf8');
  const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
  const storage = JSON.parse(readFileSync(resolve(root, 'cloudstorage.rules.json'), 'utf8'));
  const maintenance = cloudbase.functions.find((item) => item.name === 'route-maintenance');
  const timer = maintenance?.triggers?.find(
    (item) => item.name === 'route-maintenance-worker' && item.type === 'timer',
  );

  assert.equal(maintenance.runtime, 'Nodejs20.19');
  assert.equal(maintenance.timeout, 30);
  assert.match(timer.config, /\S/);
  assert.match(rootPackage, /cloudfunctions\/route-maintenance/);
  assert.match(verifier, /pack\('route-maintenance'/);
  assert.match(workflow, /cloudfunctions\/(?:route-maintenance|\*)\/package-lock\.json/);
  assert.match(storage.write, /resource\.openid\s*==\s*auth\.openid/);
  assert.match(storage.write, /profiles/);
  assert.match(storage.write, /activity-routes/);
  assert.match(storage.write, /auth\.openid/);
  assert.doesNotMatch(storage.write, /profile-canonical/);
});
