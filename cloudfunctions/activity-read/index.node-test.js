'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadMain(activity, list = []) {
  const calls = [];
  const database = {
    collection(name) {
      assert.equal(name, 'activities');
      return {
        where(condition) {
          calls.push({ type: 'where', condition });
          return {
            orderBy() {
              return {
                limit() {
                  return { get: async () => ({ data: list }) };
                },
              };
            },
          };
        },
        doc() {
          return { get: async () => ({ data: activity }) };
        },
      };
    },
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => database,
    getWXContext: () => ({ OPENID: 'member-openid' }),
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('./index')];
    return { main: require('./index').main, calls };
  } finally {
    Module._load = originalLoad;
  }
}

test('详情允许读取已结束活动', async () => {
  const activity = {
    _id: 'finished-activity',
    title: '已结束骑行',
    status: 'finished',
    is_deleted: false,
  };
  const { main } = loadMain(activity);

  const result = await main({ action: 'detail', activityId: activity._id });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, 'finished');
  assert.equal(result.data.registration_state, 'closed');
  assert.equal(result.data.closed_reason, 'finished');
  assert.equal(typeof result.data.server_now, 'string');
  assert.equal(Number.isFinite(Date.parse(result.data.server_now)), true);
});

test('列表仍只查询 published 并由同一服务端时间裁决报名状态', async () => {
  const list = [
    {
      _id: 'open',
      title: '开放',
      status: 'published',
      capacity: 2,
      occupied_count: 0,
      occupancy_partition_ready: true,
      support_vehicle_capacity: 1,
      self_drive_capacity: 1,
      support_vehicle_occupied_count: 0,
      self_drive_occupied_count: 0,
      support_vehicle_driver: {
        nickname: '王师傅',
        license_plate: '粤B12345',
        contact_phone: '13812345678',
      },
      fee: { remark: 'AA', included: [], excluded: [] },
      signup_deadline: '2999-01-01T00:00:00.000Z',
      event_start: '2999-01-01T08:00:00.000Z',
      event_end: '2999-01-02T00:00:00.000Z',
    },
    {
      _id: 'full',
      title: '满员',
      status: 'published',
      capacity: 2,
      occupied_count: 2,
      signup_deadline: '2999-01-01T00:00:00.000Z',
      event_end: '2999-01-02T00:00:00.000Z',
    },
  ];
  const { main, calls } = loadMain(undefined, list);

  const result = await main({ action: 'list' });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ type: 'where', condition: { status: 'published' } }]);
  assert.deepEqual(
    result.data.map((item) => [item.registration_state, item.closed_reason]),
    [
      ['open', null],
      ['closed', 'full'],
    ],
  );
  assert.equal(result.data[0].server_now, result.data[1].server_now);
});

test('公开活动详情脱敏后援车师傅手机号并保留容量拆分', () => {
  const { publicActivity } = require('./domain/domain');
  const result = publicActivity(
    {
      _id: 'a1',
      status: 'published',
      capacity: 20,
      occupied_count: 0,
      support_vehicle_capacity: 8,
      self_drive_capacity: 12,
      support_vehicle_driver: {
        nickname: '王师傅',
        license_plate: '粤B12345',
        contact_phone: '13812345678',
      },
      signup_deadline: '2026-10-10T00:00:00.000Z',
      event_end: '2026-10-11T08:00:00.000Z',
    },
    new Date('2026-09-29T04:00:00.000Z'),
  );
  assert.equal(result.support_vehicle_capacity + result.self_drive_capacity, result.capacity);
  assert.match(result.support_vehicle_driver.contact_phone, /\*{4}/);
});

test('公开活动白名单透出图集与路线坐标并继续过滤私有字段', () => {
  const { publicActivity } = require('./domain/domain');
  const activity = {
    _id: 'a-media',
    title: '图集活动',
    status: 'published',
    images: ['cloud://one.jpg', 'cloud://two.jpg'],
    cover_image: 'cloud://one.jpg',
    route: {
      start: '集合点',
      end: '终点',
      start_location: { name: '集合点', address: '湖滨路', latitude: 30.2, longitude: 120.1 },
      end_location: { name: '终点', address: '环山路', latitude: 30.3, longitude: 120.2 },
    },
    private_token: 'secret',
  };
  const result = publicActivity(activity, new Date('2026-09-29T04:00:00.000Z'));
  assert.deepEqual(result.images, activity.images);
  assert.deepEqual(result.route.start_location, activity.route.start_location);
  assert.equal(result.private_token, undefined);
});

test('公开活动兼容只有旧封面且路线无坐标的数据', () => {
  const { publicActivity } = require('./domain/domain');
  const result = publicActivity(
    { _id: 'legacy', title: '旧活动', status: 'finished', cover_image: 'cloud://legacy.jpg' },
    new Date('2026-09-29T04:00:00.000Z'),
  );
  assert.equal(result.cover_image, 'cloud://legacy.jpg');
  assert.equal(result.images, undefined);
});
