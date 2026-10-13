'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDraftInput } = require('./domain');
const { saveActivity } = require('./use-cases');
const preview = {
  owner_openid: 'admin',
  strava_route_id: '42',
  strava_route_url: 'https://www.strava.com/routes/42',
  route_name: '服务端可信路线',
  preview_image_url: 'https://images.example/route.jpg',
  strava_gpx_available: false,
  distance_km: 10,
  elevation_m: 200,
  estimated_moving_time_seconds: 5400,
  elevation_profile: [
    { distance_km: 0, elevation_m: 10 },
    { distance_km: 10, elevation_m: 20 },
  ],
  route_bounds: { south: 22, west: 113, north: 23, east: 114 },
  popular_climbs: [
    {
      id: '7',
      name: '坡',
      distance_km: 1,
      elevation_gain_m: 100,
      average_grade: 10,
      max_grade: 15,
      climb_category: 2,
      popularity: 9,
      popularity_label: '9 收藏',
    },
  ],
  expires_at: new Date('2026-10-01T00:00:00Z'),
};
const input = {
  title: '活动',
  description: '',
  schedule: [],
  notices: [],
  equipment: [],
  status: 'draft',
  route: {
    start: 'A',
    end: 'B',
    distance_km: 999,
    elevation_m: 999,
    level: '',
    gpx_file_id: '',
    ...preview,
  },
};
delete input.route.owner_openid;
delete input.route.expires_at;
test('活动领域严格校验 Strava 路线字段列表与范围', () => {
  assert.equal(validateDraftInput(input).route.popular_climbs.length, 1);
  assert.throws(
    () =>
      validateDraftInput({
        ...input,
        route: { ...input.route, route_bounds: { ...input.route.route_bounds, extra: 1 } },
      }),
    { code: 'VALIDATION_FAILED' },
  );
  assert.throws(
    () =>
      validateDraftInput({
        ...input,
        route: {
          ...input.route,
          elevation_profile: Array(81).fill({ distance_km: 0, elevation_m: 0 }),
        },
      }),
    { code: 'VALIDATION_FAILED' },
  );
});
test('保存活动忽略客户端伪造曲线并采用服务端预览', async () => {
  let written;
  const store = {
    transaction: (work) =>
      work({
        getAdmin: async () => ({ _id: 'admin', enabled: true }),
        getActivity: async () => undefined,
        getRoutePreview: async () => preview,
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
      openid: 'admin',
      activity: {
        ...input,
        route: {
          ...input.route,
          route_name: '客户端伪造路线',
          preview_image_url: 'https://evil.example/fake.jpg',
          strava_gpx_available: true,
        },
      },
    },
    new Date('2026-09-30T12:00:00Z'),
  );
  assert.equal(result.route.distance_km, 10);
  assert.equal(result.route.elevation_m, 200);
  assert.equal(result.route.estimated_moving_time_seconds, 5400);
  assert.equal(result.route.route_name, '服务端可信路线');
  assert.equal(result.route.preview_image_url, 'https://images.example/route.jpg');
  assert.equal(result.route.strava_gpx_available, false);
  assert.deepEqual(result.route.elevation_profile, preview.elevation_profile);
  assert.equal(written.route.strava_route_id, '42');
  assert.equal(written.strava_route_owner_openid, 'admin');
  assert.equal(Object.hasOwn(result, 'strava_route_owner_openid'), false);
});
