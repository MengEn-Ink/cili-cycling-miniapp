'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const activityInput = {
  title: '分页回填',
  cover_image: '',
  description: '',
  schedule: [],
  route: { start: '甲', end: '乙', distance_km: 80, elevation_m: 500, level: '进阶' },
  notices: [],
  equipment: [],
  fee: '免费',
  capacity: 140,
  support_vehicle_capacity: 60,
  self_drive_capacity: 80,
  support_vehicle_driver: {
    nickname: '王师傅',
    license_plate: '粤B12345',
    contact_phone: '13812345678',
  },
  signup_deadline: '2026-10-10T00:00:00.000Z',
  event_start: '2026-10-11T00:00:00.000Z',
  event_end: '2026-10-11T08:00:00.000Z',
  status: 'draft',
};

function loadMain() {
  const registrations = Array.from({ length: 125 }, (_, index) => ({
    _id: `r${String(index).padStart(3, '0')}`,
    activity_id: 'legacy',
    status: index === 0 ? 'checked_in' : index % 5 === 0 ? 'approved' : 'pending',
    options: { gathering_mode: index < 50 ? 'support_vehicle' : 'self_drive' },
  }));
  const state = {
    activity: {
      _id: 'legacy',
      ...activityInput,
      occupied_count: 125,
      created_by: 'admin',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    },
    registrations,
    registrationCursors: [],
    audits: [],
  };
  function query() {
    return {
      where(condition) {
        this.condition = condition;
        return this;
      },
      orderBy(field, direction) {
        this.orderField = field;
        this.orderDirection = direction;
        return this;
      },
      limit(limit) {
        this.pageLimit = limit;
        return this;
      },
      async get() {
        const cursor = this.condition?._id?.$gt || '';
        state.registrationCursors.push(cursor || null);
        const matching = state.registrations
          .filter((item) => item.status === this.condition.status && (!cursor || item._id > cursor))
          .sort((left, right) => left._id.localeCompare(right._id));
        assert.equal(this.orderField, '_id');
        assert.equal(this.orderDirection, 'asc');
        return { data: matching.slice(0, this.pageLimit) };
      },
    };
  }
  function collection(name) {
    if (name === 'registrations') return query();
    if (name === 'audit_logs') return { add: async ({ data }) => state.audits.push(data) };
    return {
      doc(id) {
        return {
          get: async () => ({
            data:
              name === 'admins'
                ? { _id: id, enabled: true }
                : name === 'activities'
                  ? state.activity
                  : undefined,
          }),
          set: async ({ data }) => {
            state.activity = { _id: id, ...data };
          },
          update: async ({ data }) => {
            state.activity = { ...state.activity, ...data };
          },
        };
      },
    };
  }
  const database = {
    command: {
      in: (values) => ({ $in: values }),
      gt: (value) => ({ $gt: value }),
    },
    collection,
    runTransaction: async (work) => work({ collection }),
    serverDate: () => new Date('2026-09-30T00:00:00.000Z'),
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => database,
    getWXContext: () => ({ OPENID: 'admin' }),
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('./index')];
    return { main: require('./index').main, state };
  } finally {
    Module._load = originalLoad;
  }
}

test('首次分仓回填分页读取超过 100 条占位报名并证明无额外记录', async () => {
  const { main, state } = loadMain();

  const result = await main({
    action: 'save',
    activityId: 'legacy',
    expectedVersion: 0,
    activity: activityInput,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(state.registrationCursors, [null, 'r124', null, null, null]);
  assert.equal(state.activity.occupancy_partition_ready, true);
  assert.equal(state.activity.support_vehicle_occupied_count, 50);
  assert.equal(state.activity.self_drive_occupied_count, 75);
});

test('删除适配器只向领域层传递可信字段，不透传运行时注入字段', async () => {
  const { main, state } = loadMain();
  state.registrations.length = 0;
  state.activity.occupied_count = 0;

  const result = await main({
    action: 'delete',
    id: 'legacy',
    userInfo: { appId: 'runtime-injected' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.deleted, true);
  assert.equal(state.activity.is_deleted, true);
});
