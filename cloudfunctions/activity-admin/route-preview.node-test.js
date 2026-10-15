'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const { previewRouteGpx, bindRoutePreviewImage, routePreviewId } = require('./route-preview');
const { saveActivity } = require('./use-cases');

const now = new Date('2026-10-13T07:30:00.000Z');
const owner = 'owner-openid';
const requestId = 'preview-request-123';
const gpx = Buffer.from(`<?xml version="1.0"?>
  <gpx>
    <metadata><name>服务端可信路线</name></metadata>
    <trk><trkseg>
      <trkpt lat="22" lon="114"><ele>10</ele></trkpt>
      <trkpt lat="22.01" lon="114.01"><ele>40</ele></trkpt>
      <trkpt lat="22.02" lon="114.02"><ele>25</ele></trkpt>
    </trkseg></trk>
  </gpx>`);
const digest = crypto.createHash('sha256').update(gpx).digest('hex');
const gpxFileId = `cloud://env/activity-routes/${owner}/${digest}.gpx`;
const generatedFileId = `cloud://env/activity-routes/${owner}/${digest}.png`;

function previewFixture(overrides = {}) {
  return {
    _id: routePreviewId(owner, digest, requestId),
    owner_openid: owner,
    gpx_sha256: digest,
    source_file_id: gpxFileId,
    file_name: 'weekend.gpx',
    generated_file_id: generatedFileId,
    summary: {
      route_name: '服务端可信路线',
      distance_km: 3.04,
      elevation_m: 8,
      elevation_loss_m: 0,
      elevation_min_m: 10,
      elevation_max_m: 40,
      estimated_moving_time_seconds: 540,
      estimation_source: 'cili',
      elevation_profile: [
        { distance_km: 0, elevation_m: 10 },
        { distance_km: 3.04, elevation_m: 25 },
      ],
      route_outline: [
        { latitude: 22, longitude: 114 },
        { latitude: 22.02, longitude: 114.02 },
      ],
      route_bounds: { south: 22, west: 114, north: 22.02, east: 114.02 },
    },
    created_at: now,
    expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1000),
    consumed_at: null,
    attached_activity_id: '',
    ...overrides,
  };
}

test('预览校验管理员、所有者路径与摘要后写入两小时可信记录', async () => {
  let saved;
  const result = await previewRouteGpx(
    {
      getAdmin: async () => ({ _id: owner, enabled: true }),
      downloadFile: async () => ({ fileContent: gpx }),
      getPreview: async () => undefined,
      putPreview: async (_id, value) => {
        saved = value;
      },
    },
    {
      openid: owner,
      gpxFileId,
      gpxSha256: digest,
      fileName: 'weekend.gpx',
      requestId,
    },
    now,
  );

  assert.equal(result.preview_id, routePreviewId(owner, digest, requestId));
  assert.equal(result.gpx_file_id, gpxFileId);
  assert.equal(result.gpx_sha256, digest);
  assert.equal(result.route_name, '服务端可信路线');
  assert.equal(result.elevation_profile.length >= 2, true);
  assert.equal(saved.owner_openid, owner);
  assert.equal(saved.expires_at.getTime(), now.getTime() + 2 * 60 * 60 * 1000);
  assert.equal(saved.consumed_at, null);
});

test('相同摘要的有效预览幂等复用且不重新下载', async () => {
  const existing = previewFixture();
  let downloads = 0;
  const result = await previewRouteGpx(
    {
      getAdmin: async () => ({ _id: owner, enabled: true }),
      downloadFile: async () => {
        downloads += 1;
        return { fileContent: gpx };
      },
      getPreview: async () => existing,
      putPreview: async () => assert.fail('有效预览不应重复写入'),
    },
    {
      openid: owner,
      gpxFileId,
      gpxSha256: digest,
      fileName: 'weekend.gpx',
      requestId,
    },
    now,
  );

  assert.equal(downloads, 0);
  assert.equal(result.preview_id, existing._id);
  assert.equal(result.generated_preview_file_id, generatedFileId);
});

test('预览拒绝非管理员、跨所有者路径、摘要不符与客户端扩展字段', async () => {
  const baseDeps = {
    getAdmin: async () => ({ _id: owner, enabled: true }),
    downloadFile: async () => ({ fileContent: gpx }),
    getPreview: async () => undefined,
    putPreview: async () => {},
  };
  const request = {
    openid: owner,
    gpxFileId,
    gpxSha256: digest,
    fileName: 'weekend.gpx',
    requestId,
  };

  await assert.rejects(
    previewRouteGpx({ ...baseDeps, getAdmin: async () => undefined }, request, now),
    { code: 'ADMIN_REQUIRED' },
  );
  await assert.rejects(
    previewRouteGpx(
      baseDeps,
      {
        ...request,
        gpxFileId: `cloud://env/activity-routes/other/${digest}.gpx`,
      },
      now,
    ),
    { code: 'GPX_FILE_INVALID' },
  );
  await assert.rejects(
    previewRouteGpx(
      baseDeps,
      {
        ...request,
        gpxFileId: `cloud://env/activity-routes/${owner}/${'a'.repeat(64)}.gpx`,
        gpxSha256: 'a'.repeat(64),
      },
      now,
    ),
    { code: 'GPX_DIGEST_MISMATCH' },
  );
  await assert.rejects(previewRouteGpx(baseDeps, { ...request, distanceKm: 999 }, now), {
    code: 'FORBIDDEN_FIELD',
  });
});

test('生成路线图必须与预览所有者和摘要路径匹配', async () => {
  let updated;
  const result = await bindRoutePreviewImage(
    {
      getAdmin: async () => ({ _id: owner, enabled: true }),
      getPreview: async () => previewFixture({ generated_file_id: '' }),
      updatePreview: async (_id, value) => {
        updated = value;
      },
    },
    {
      openid: owner,
      previewId: routePreviewId(owner, digest, requestId),
      generatedPreviewFileId: generatedFileId,
    },
    now,
  );

  assert.equal(result.generated_preview_file_id, generatedFileId);
  assert.equal(updated.generated_file_id, generatedFileId);
  await assert.rejects(
    bindRoutePreviewImage(
      {
        getAdmin: async () => ({ _id: owner, enabled: true }),
        getPreview: async () => previewFixture({ generated_file_id: '' }),
        updatePreview: async () => {},
      },
      {
        openid: owner,
        previewId: routePreviewId(owner, digest, requestId),
        generatedPreviewFileId: `cloud://env/activity-routes/other/${digest}.png`,
      },
      now,
    ),
    { code: 'ROUTE_PREVIEW_IMAGE_INVALID' },
  );
});

test('保存活动只采用匹配可信预览的原生指标并原子消费记录', async () => {
  const preview = previewFixture();
  let written;
  let consumed;
  const store = {
    transaction: (work) =>
      work({
        getAdmin: async () => ({ _id: owner, enabled: true }),
        getActivity: async () => undefined,
        getRoutePreviewById: async () => preview,
        consumeRoutePreview: async (previewId, activityId, consumedAt) => {
          consumed = { previewId, activityId, consumedAt };
        },
        createActivityId: async () => 'activity_1',
        putActivity: async (_id, value) => {
          written = value;
        },
        addAudit: async () => {},
      }),
  };

  const result = await saveActivity(
    store,
    {
      openid: owner,
      activity: {
        title: '活动',
        images: [`cloud://env/profiles/activity-media/${owner}/activity-photo.jpg`],
        cover_image: generatedFileId,
        description: '',
        schedule: [],
        notices: [],
        equipment: [],
        status: 'draft',
        route: {
          start: '集合点',
          end: '',
          distance_km: 999,
          elevation_m: 999,
          elevation_loss_m: 999,
          elevation_min_m: -999,
          elevation_max_m: 9999,
          level: '',
          gpx_preview_id: preview._id,
          gpx_file_id: gpxFileId,
          gpx_sha256: digest,
          generated_preview_file_id: generatedFileId,
          external_provider: 'strava',
          external_route_id: '42',
          external_route_url: 'https://www.strava.com/routes/42',
        },
      },
    },
    now,
  );

  assert.equal(result.route.distance_km, preview.summary.distance_km);
  assert.equal(result.route.elevation_m, preview.summary.elevation_m);
  assert.equal(result.route.elevation_loss_m, preview.summary.elevation_loss_m);
  assert.equal(result.route.elevation_min_m, preview.summary.elevation_min_m);
  assert.equal(result.route.elevation_max_m, preview.summary.elevation_max_m);
  assert.deepEqual(result.route.elevation_profile, preview.summary.elevation_profile);
  assert.deepEqual(result.route.route_outline, preview.summary.route_outline);
  assert.equal(result.route.external_provider, 'strava');
  assert.equal(result.cover_image, generatedFileId);
  assert.equal(written.strava_route_owner_openid, undefined);
  assert.deepEqual(consumed, {
    previewId: preview._id,
    activityId: 'activity_1',
    consumedAt: now,
  });
});

test('保存拒绝其他所有者、摘要不匹配、过期和已绑定其他活动的预览', async () => {
  const baseActivity = {
    title: '活动',
    description: '',
    schedule: [],
    notices: [],
    equipment: [],
    status: 'draft',
    route: {
      start: '集合点',
      end: '',
      distance_km: 0,
      elevation_m: 0,
      level: '',
      gpx_preview_id: routePreviewId(owner, digest, requestId),
      gpx_file_id: gpxFileId,
      gpx_sha256: digest,
      generated_preview_file_id: generatedFileId,
    },
  };
  const cases = [
    [previewFixture({ owner_openid: 'other' }), 'ROUTE_PREVIEW_REQUIRED'],
    [previewFixture({ gpx_sha256: 'a'.repeat(64) }), 'ROUTE_PREVIEW_REQUIRED'],
    [previewFixture({ expires_at: new Date(now.getTime() - 1) }), 'ROUTE_PREVIEW_EXPIRED'],
    [
      previewFixture({ consumed_at: now, attached_activity_id: 'other-activity' }),
      'ROUTE_PREVIEW_CONSUMED',
    ],
  ];

  for (const [preview, code] of cases) {
    const store = {
      transaction: (work) =>
        work({
          getAdmin: async () => ({ _id: owner, enabled: true }),
          getActivity: async () => undefined,
          getRoutePreviewById: async () => preview,
          createActivityId: async () => 'activity_1',
          putActivity: async () => {},
          consumeRoutePreview: async () => {},
          addAudit: async () => {},
        }),
    };
    await assert.rejects(saveActivity(store, { openid: owner, activity: baseActivity }, now), {
      code,
    });
  }
});

test('已绑定同一活动的可信预览过期后仍允许编辑其他活动字段', async () => {
  const preview = previewFixture({
    consumed_at: new Date(now.getTime() - 60 * 60 * 1000),
    attached_activity_id: 'activity_1',
    expires_at: new Date(now.getTime() - 1),
  });
  const route = {
    start: '集合点',
    end: '',
    distance_km: preview.summary.distance_km,
    elevation_m: preview.summary.elevation_m,
    level: '',
    gpx_preview_id: preview._id,
    gpx_file_id: gpxFileId,
    gpx_sha256: digest,
    generated_preview_file_id: generatedFileId,
    ...preview.summary,
  };
  const current = {
    _id: 'activity_1',
    title: '原活动',
    description: '',
    schedule: [],
    notices: [],
    equipment: [],
    status: 'draft',
    route,
    occupied_count: 0,
    version: 1,
    created_by: owner,
    created_at: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  };
  const store = {
    transaction: (work) =>
      work({
        getAdmin: async () => ({ _id: owner, enabled: true }),
        getActivity: async () => current,
        getRoutePreviewById: async () => preview,
        consumeRoutePreview: async () => {},
        putActivity: async () => {},
        addAudit: async () => {},
      }),
  };

  const result = await saveActivity(
    store,
    {
      openid: owner,
      activityId: current._id,
      expectedVersion: 1,
      activity: {
        title: '新标题',
        description: '',
        schedule: [],
        notices: [],
        equipment: [],
        status: 'draft',
        route,
      },
    },
    now,
  );

  assert.equal(result.title, '新标题');
  assert.equal(result.route.gpx_sha256, digest);
});

test('短期预览记录清理后仍从当前活动继承可信 GPX 指标', async () => {
  const preview = previewFixture();
  const route = {
    start: '集合点',
    end: '',
    distance_km: preview.summary.distance_km,
    elevation_m: preview.summary.elevation_m,
    level: '',
    gpx_preview_id: preview._id,
    gpx_file_id: gpxFileId,
    gpx_sha256: digest,
    generated_preview_file_id: generatedFileId,
    ...preview.summary,
  };
  const current = {
    _id: 'activity_1',
    title: '原活动',
    description: '',
    schedule: [],
    notices: [],
    equipment: [],
    status: 'draft',
    route,
    occupied_count: 0,
    version: 1,
    created_by: owner,
    created_at: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  };
  let saved;
  const store = {
    transaction: (work) =>
      work({
        getAdmin: async () => ({ _id: owner, enabled: true }),
        getActivity: async () => current,
        getRoutePreviewById: async () => undefined,
        consumeRoutePreview: async () => assert.fail('存量可信路线不应再次消费预览'),
        putActivity: async (_id, value) => {
          saved = value;
        },
        addAudit: async () => {},
      }),
  };

  const result = await saveActivity(
    store,
    {
      openid: owner,
      activityId: current._id,
      expectedVersion: 1,
      activity: {
        title: '新标题',
        description: '',
        schedule: [],
        notices: [],
        equipment: [],
        status: 'draft',
        route: {
          ...route,
          distance_km: 999,
          elevation_m: 999,
          elevation_loss_m: 999,
        },
      },
    },
    now,
  );

  assert.equal(result.title, '新标题');
  assert.equal(result.route.distance_km, preview.summary.distance_km);
  assert.equal(result.route.elevation_m, preview.summary.elevation_m);
  assert.equal(result.route.elevation_loss_m, preview.summary.elevation_loss_m);
  assert.equal(saved.route.gpx_sha256, digest);
});

test('云函数 previewRouteGpx action 下载文件并持久化可信预览', async () => {
  const previews = new Map();
  const database = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              if (name === 'admins') return { data: { _id: id, enabled: true } };
              if (name === 'route_previews') {
                if (!previews.has(id))
                  throw Object.assign(new Error('not found'), { errCode: -502001 });
                return { data: previews.get(id) };
              }
              throw new Error(`unexpected collection: ${name}`);
            },
            async set({ data }) {
              assert.equal(name, 'route_previews');
              previews.set(id, { _id: id, ...data });
            },
          };
        },
      };
    },
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => database,
    getWXContext: () => ({ OPENID: owner }),
    downloadFile: async ({ fileID }) => {
      assert.equal(fileID, gpxFileId);
      return { fileContent: gpx };
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  let main;
  try {
    delete require.cache[require.resolve('./index')];
    main = require('./index').main;
  } finally {
    Module._load = originalLoad;
  }

  const result = await main({
    action: 'previewRouteGpx',
    openid: 'attacker-controlled',
    userInfo: { openId: owner, appId: 'platform-injected' },
    tcbContext: { requestId: 'platform-injected' },
    gpxFileId,
    gpxSha256: digest,
    fileName: 'weekend.gpx',
    requestId,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.gpx_sha256, digest);
  assert.equal([...previews.values()][0].owner_openid, owner);
  assert.equal(previews.size, 1);
});
