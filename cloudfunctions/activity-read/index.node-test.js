'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');

const MEDIA_SECRET = 'activity-read-test-media-secret-32-bytes';

function mediaDocumentId(fileId) {
  return crypto.createHash('sha256').update(fileId).digest('hex');
}

function canonicalMedia(fileId, ownerOpenid, overrides = {}) {
  const sha256 = crypto.createHash('sha256').update(`bytes:${fileId}`).digest('hex');
  const ownerAlias = crypto
    .createHmac('sha256', MEDIA_SECRET)
    .update(ownerOpenid)
    .digest('hex')
    .slice(0, 32);
  return {
    _id: mediaDocumentId(fileId),
    file_id: fileId,
    source_file_id: fileId,
    canonical_file_id: `cloud://env/profile-canonical/${ownerAlias}/${mediaDocumentId(fileId)}/${sha256}.jpg`,
    sha256,
    size: 1024,
    mime: 'image/jpeg',
    owner_openid: ownerOpenid,
    category: 'other',
    origin: 'custom',
    status: 'active',
    ...overrides,
  };
}

function loadMain(activity, list = [], options = {}) {
  const calls = [];
  const database = {
    command: { in: (values) => ({ $in: values }) },
    collection(name) {
      assert.ok(['activities', 'registrations', 'profiles', 'profile_media'].includes(name));
      return {
        where(condition) {
          calls.push({ type: 'where', name, condition });
          let data =
            name === 'activities'
              ? list
              : name === 'registrations'
                ? options.registrations || []
                : name === 'profiles'
                  ? options.profiles || []
                  : options.mediaRecords || [];
          if (name === 'registrations' && typeof condition.status === 'string')
            data = data.filter((item) => item.status === condition.status);
          if ((name === 'profiles' || name === 'profile_media') && condition._id?.$in)
            data = data.filter((item) => condition._id.$in.includes(item._id));
          let offset = 0;
          const query = {
            orderBy() {
              return query;
            },
            skip(value) {
              offset = value;
              return query;
            },
            limit(value) {
              return { get: async () => ({ data: data.slice(offset, offset + value) }) };
            },
          };
          return query;
        },
        doc() {
          assert.equal(name, 'activities');
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
    async getTempFileURL(payload) {
      calls.push({ type: 'getTempFileURL', payload });
      return options.getTempFileURL ? options.getTempFileURL(payload) : { fileList: [] };
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('./index')];
    const invoke = require('./index').main;
    return {
      calls,
      async main(event) {
        const originalSecret = process.env.PROFILE_MEDIA_PATH_SECRET;
        if (Object.prototype.hasOwnProperty.call(options, 'mediaSecret')) {
          if (options.mediaSecret) process.env.PROFILE_MEDIA_PATH_SECRET = options.mediaSecret;
          else delete process.env.PROFILE_MEDIA_PATH_SECRET;
        }
        try {
          return await invoke(event);
        } finally {
          if (originalSecret === undefined) delete process.env.PROFILE_MEDIA_PATH_SECRET;
          else process.env.PROFILE_MEDIA_PATH_SECRET = originalSecret;
        }
      },
    };
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
  assert.deepEqual(calls, [
    { type: 'where', name: 'activities', condition: { status: 'published' } },
  ]);
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

test('列表批量将活动云存储图片解析为 HTTPS 临时地址并去重请求', async () => {
  const shared = 'cloud://bucket/shared.jpg';
  const second = 'cloud://bucket/second.jpg';
  const external = 'https://images.example/third.jpg';
  const list = [
    {
      _id: 'a1',
      title: '活动一',
      status: 'published',
      cover_image: shared,
      images: [shared, second],
    },
    { _id: 'a2', title: '活动二', status: 'published', cover_image: shared, images: [external] },
  ];
  const { main, calls } = loadMain(undefined, list, {
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({
        fileID,
        status: 0,
        tempFileURL: `https://temp.example/${fileID.endsWith('shared.jpg') ? 'shared' : 'second'}.jpg`,
      })),
    }),
  });

  const result = await main({ action: 'list' });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.find((call) => call.type === 'getTempFileURL').payload.fileList, [
    shared,
    second,
  ]);
  assert.equal(result.data[0].cover_image, 'https://temp.example/shared.jpg');
  assert.deepEqual(result.data[0].images, [
    'https://temp.example/shared.jpg',
    'https://temp.example/second.jpg',
  ]);
  assert.deepEqual(result.data[1].images, [external]);
});

test('详情临时地址解析失败时保留原始 fileID 供客户端继续降级', async () => {
  const fileID = 'cloud://bucket/cover.jpg';
  const activity = {
    _id: 'a-media',
    title: '图集活动',
    status: 'published',
    cover_image: fileID,
    images: [fileID],
  };
  const { main } = loadMain(activity, [], {
    getTempFileURL: async () => {
      throw new Error('storage unavailable');
    },
  });

  const result = await main({ action: 'detail', activityId: activity._id });

  assert.equal(result.ok, true);
  assert.equal(result.data.cover_image, fileID);
  assert.deepEqual(result.data.images, [fileID]);
});

test('详情成员执行状态、上限、稳定排序和隐私白名单', async () => {
  const registrations = Array.from({ length: 27 }, (_, index) => ({
    _id: `r-${String(index).padStart(2, '0')}`,
    activity_id: 'a1',
    openid: `o-${index}`,
    status: index === 26 ? 'pending' : index % 2 ? 'checked_in' : 'approved',
    updated_at: `2026-09-01T00:${String(index).padStart(2, '0')}:00.000Z`,
    checked_in_at:
      index % 2 ? `2026-09-02T00:${String(index).padStart(2, '0')}:00.000Z` : undefined,
    profile_snapshot: { nickname: `旧昵称${index}`, real_name: '实名', phone: '13812345678' },
    strava_snapshot: {
      activities_90d: index,
      longest_km: 100 + index,
      total_elevation_m: 1000 + index,
      weighted_avg_speed_kmh: 20 + index,
      total_km: 99999,
      token: 'secret',
    },
    emergency_contact: 'private',
  }));
  const profiles = registrations.map((item, index) => ({
    _id: item.openid,
    nickname: `骑手${index}`,
    title: index === 0 ? '公开称号' : '',
    avatar_file_id: `cloud://avatar-${index}.jpg`,
    phone: '13812345678',
  }));
  const { main, calls } = loadMain({ _id: 'a1', title: '活动', status: 'published' }, [], {
    registrations,
    profiles,
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({
        fileID,
        status: 0,
        tempFileURL: `https://temp.example/${fileID.slice(8)}`,
      })),
    }),
  });
  const result = await main({ action: 'detail', activityId: 'a1' });
  assert.equal(result.ok, true);
  assert.equal(result.data.attendees.length, 24);
  assert.deepEqual(Object.keys(result.data.attendees[0]).sort(), [
    'avatar_url',
    'card',
    'display_name',
    'id',
    'status',
    'title',
  ]);
  assert.deepEqual(Object.keys(result.data.attendees[0].card).sort(), [
    'elevationM',
    'longestKm',
    'rides90d',
    'speedKmh',
  ]);
  assert.equal(
    result.data.attendees.some((item) => item.id === 'r-26'),
    false,
  );
  assert.doesNotMatch(JSON.stringify(result.data.attendees), /13812345678|secret|private|openid/);
  assert.deepEqual(
    calls.filter((call) => call.name === 'registrations').map((call) => call.condition.status),
    ['approved', 'checked_in'],
  );
});

test('详情成员超过单页时完整读取候选集后再选最早 24 人', async () => {
  const late = Array.from({ length: 105 }, (_, index) => ({
    _id: `late-${index}`,
    activity_id: 'a1',
    openid: `late-openid-${index}`,
    status: 'approved',
    updated_at: `2026-09-20T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
    created_at: `2026-09-20T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
    profile_snapshot: { nickname: `晚报名${index}` },
  }));
  const early = Array.from({ length: 25 }, (_, index) => ({
    _id: `early-${String(index).padStart(2, '0')}`,
    activity_id: 'a1',
    openid: `early-openid-${index}`,
    status: 'approved',
    updated_at: `2026-09-01T00:${String(index).padStart(2, '0')}:00.000Z`,
    created_at: `2026-09-01T00:${String(index).padStart(2, '0')}:00.000Z`,
    profile_snapshot: { nickname: `早报名${index}` },
  }));
  const { main } = loadMain({ _id: 'a1', title: '活动', status: 'published' }, [], {
    registrations: [...late, ...early],
  });

  const result = await main({ action: 'detail', activityId: 'a1' });

  assert.equal(result.ok, true);
  assert.equal(result.data.attendees.length, 24);
  assert.deepEqual(
    result.data.attendees.map((item) => item.id),
    early.slice(0, 24).map((item) => item._id),
  );
});

test('详情默认隐藏未授权、私有、旧版本和外部头像且不签 source URL', async () => {
  const cases = [
    {
      id: 'no-consent',
      profile: {
        avatar_file_id: 'cloud://env/profiles/no-consent.jpg',
        avatar_source: 'custom',
        avatar_revision: 1,
      },
    },
    {
      id: 'private',
      profile: {
        avatar_file_id: 'cloud://env/profiles/private.jpg',
        avatar_source: 'custom',
        avatar_revision: 1,
        avatar_visibility: 'private',
        avatar_visibility_revision: 1,
      },
    },
    {
      id: 'stale-consent',
      profile: {
        avatar_file_id: 'cloud://env/profiles/stale.jpg',
        avatar_source: 'custom',
        avatar_revision: 2,
        avatar_visibility: 'public',
        avatar_visibility_revision: 1,
      },
    },
    {
      id: 'external-source',
      profile: {
        avatar_file_id: 'https://images.example/avatar.jpg',
        avatar_source: 'custom',
        avatar_revision: 1,
        avatar_visibility: 'public',
        avatar_visibility_revision: 1,
      },
    },
  ];
  const registrations = cases.map(({ id }, index) => ({
    _id: id,
    activity_id: 'a1',
    openid: id,
    status: 'approved',
    approved_at: `2026-09-01T00:0${index}:00.000Z`,
  }));
  const profiles = cases.map(({ id, profile }) => ({ _id: id, nickname: id, ...profile }));
  const { main, calls } = loadMain({ _id: 'a1', title: '活动', status: 'published' }, [], {
    registrations,
    profiles,
    mediaSecret: MEDIA_SECRET,
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({
        fileID,
        status: 0,
        tempFileURL: 'https://temporary.example/avatar.jpg',
      })),
    }),
  });

  const result = await main({ action: 'detail', activityId: 'a1' });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.attendees.map((attendee) => attendee.avatar_url),
    ['', '', '', ''],
  );
  assert.equal(
    calls.some((call) => call.type === 'getTempFileURL'),
    false,
  );
});

test('详情只为公开当前版本且 registry 合法的 canonical 头像签发地址', async () => {
  const definitions = [
    ['missing', 'cloud://env/profiles/missing.jpg', 'custom'],
    ['inactive', 'cloud://env/profiles/inactive.jpg', 'custom'],
    ['wrong-owner', 'cloud://env/profiles/wrong-owner.jpg', 'custom'],
    ['forged', 'cloud://env/profiles/forged.jpg', 'custom'],
    ['missing-source', 'cloud://env/profiles/missing-source.jpg', undefined],
    ['invalid-source', 'cloud://env/profiles/invalid-source.jpg', 'forged'],
    ['origin-mismatch', 'cloud://env/profiles/origin-mismatch.jpg', 'wechat'],
    ['valid', 'cloud://env/profiles/valid.jpg', 'custom'],
  ];
  const registrations = definitions.map(([id], index) => ({
    _id: id,
    activity_id: 'a1',
    openid: id,
    status: 'approved',
    approved_at: `2026-09-01T00:0${index}:00.000Z`,
  }));
  const profiles = definitions.map(([id, avatar, source]) => ({
    _id: id,
    nickname: id,
    avatar_file_id: avatar,
    ...(source ? { avatar_source: source } : {}),
    avatar_revision: 3,
    avatar_visibility: 'public',
    avatar_visibility_revision: 3,
  }));
  const inactive = canonicalMedia(definitions[1][1], 'inactive', { status: 'unreferenced' });
  const wrongOwner = canonicalMedia(definitions[2][1], 'another-owner');
  const forged = canonicalMedia(definitions[3][1], 'forged', {
    canonical_file_id: 'cloud://env/profile-canonical/forged/avatar.jpg',
  });
  const missingSource = canonicalMedia(definitions[4][1], 'missing-source');
  const invalidSource = canonicalMedia(definitions[5][1], 'invalid-source');
  const originMismatch = canonicalMedia(definitions[6][1], 'origin-mismatch');
  const valid = canonicalMedia(definitions[7][1], 'valid');
  const { main, calls } = loadMain({ _id: 'a1', title: '活动', status: 'published' }, [], {
    registrations,
    profiles,
    mediaRecords: [
      inactive,
      wrongOwner,
      forged,
      missingSource,
      invalidSource,
      originMismatch,
      valid,
    ],
    mediaSecret: MEDIA_SECRET,
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({
        fileID,
        status: 0,
        tempFileURL: 'https://temporary.example/canonical.jpg',
      })),
    }),
  });

  const result = await main({ action: 'detail', activityId: 'a1' });

  assert.equal(result.ok, true);
  const avatars = Object.fromEntries(
    result.data.attendees.map((attendee) => [attendee.id, attendee.avatar_url]),
  );
  assert.deepEqual(avatars, {
    missing: '',
    inactive: '',
    'wrong-owner': '',
    forged: '',
    'missing-source': '',
    'invalid-source': '',
    'origin-mismatch': '',
    valid: 'https://temporary.example/canonical.jpg',
  });
  assert.deepEqual(
    calls.filter((call) => call.type === 'getTempFileURL').map((call) => call.payload.fileList),
    [[valid.canonical_file_id]],
  );
});

test('媒体 secret 缺失时隐藏头像但保留公开活动详情', async () => {
  const avatar = 'cloud://env/profiles/valid.jpg';
  const record = canonicalMedia(avatar, 'o1');
  const { main, calls } = loadMain({ _id: 'a1', title: '活动', status: 'published' }, [], {
    registrations: [
      {
        _id: 'r1',
        activity_id: 'a1',
        openid: 'o1',
        status: 'approved',
        approved_at: '2026-09-01T00:00:00.000Z',
      },
    ],
    profiles: [
      {
        _id: 'o1',
        nickname: '骑手',
        avatar_file_id: avatar,
        avatar_source: 'custom',
        avatar_revision: 1,
        avatar_visibility: 'public',
        avatar_visibility_revision: 1,
      },
    ],
    mediaRecords: [record],
    mediaSecret: '',
  });

  const result = await main({ action: 'detail', activityId: 'a1' });

  assert.equal(result.ok, true);
  assert.equal(result.data.title, '活动');
  assert.equal(result.data.attendees[0].avatar_url, '');
  assert.equal(
    calls.some((call) => call.type === 'getTempFileURL'),
    false,
  );
});

test('头像批量解析失败时详情仍返回空头像，列表不查询成员', async () => {
  const avatar = 'cloud://env/profiles/avatar.jpg';
  const options = {
    registrations: [
      {
        _id: 'r1',
        activity_id: 'a1',
        openid: 'o1',
        status: 'approved',
        approved_at: '2026-09-01T00:00:00.000Z',
        profile_snapshot: { nickname: '骑手' },
      },
    ],
    profiles: [
      {
        _id: 'o1',
        nickname: '骑手',
        avatar_file_id: avatar,
        avatar_source: 'custom',
        avatar_revision: 1,
        avatar_visibility: 'public',
        avatar_visibility_revision: 1,
      },
    ],
    mediaRecords: [canonicalMedia(avatar, 'o1')],
    mediaSecret: MEDIA_SECRET,
    getTempFileURL: async () => {
      throw new Error('storage unavailable');
    },
  };
  const detail = loadMain({ _id: 'a1', title: '活动', status: 'published' }, [], options);
  const result = await detail.main({ action: 'detail', activityId: 'a1' });
  assert.equal(result.ok, true);
  assert.equal(result.data.title, '活动');
  assert.equal(result.data.attendees[0].avatar_url, '');
  const list = loadMain(undefined, [{ _id: 'a1', title: '活动', status: 'published' }], options);
  await list.main({ action: 'list' });
  assert.deepEqual(
    list.calls.map((call) => call.name),
    ['activities'],
  );
});
