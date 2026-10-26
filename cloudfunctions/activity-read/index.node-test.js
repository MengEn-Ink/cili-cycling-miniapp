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
  const queryCalls = [];
  const database = {
    command: {
      in: (values) => ({ $in: values }),
      lte: (value) => ({ $lte: value }),
      gt: (value) => ({ $gt: value }),
    },
    collection(name) {
      assert.ok(['activities', 'registrations', 'profiles', 'profile_media'].includes(name));
      return {
        where(condition) {
          calls.push({ type: 'where', name, condition });
          queryCalls.push({ type: 'where', name, condition });
          let data =
            name === 'activities'
              ? list
              : name === 'registrations'
                ? options.registrations || []
                : name === 'profiles'
                  ? options.profiles || []
                  : options.mediaRecords || [];
          if (name === 'activities') {
            if (typeof condition.status === 'string')
              data = data.filter((item) => item.status === condition.status);
            if (condition.event_end?.$lte)
              data = data.filter(
                (item) => new Date(item.event_end).getTime() <= condition.event_end.$lte.getTime(),
              );
            if (condition.event_end?.$gt)
              data = data.filter(
                (item) => new Date(item.event_end).getTime() > condition.event_end.$gt.getTime(),
              );
          }
          if (name === 'registrations' && typeof condition.status === 'string')
            data = data.filter((item) => item.status === condition.status);
          if ((name === 'profiles' || name === 'profile_media') && condition._id?.$in)
            data = data.filter((item) => condition._id.$in.includes(item._id));
          if (name === 'profile_media' && condition.canonical_file_id?.$in)
            data = data.filter((item) =>
              condition.canonical_file_id.$in.includes(item.canonical_file_id),
            );
          let offset = 0;
          const query = {
            count: async () => {
              if (name === 'registrations' && options.beforeRegistrationQuery)
                await options.beforeRegistrationQuery({ type: 'count', status: condition.status });
              return { total: data.length };
            },
            orderBy(field, direction) {
              queryCalls.push({ type: 'orderBy', name, field, direction });
              return query;
            },
            skip(value) {
              offset = value;
              return query;
            },
            limit(value) {
              queryCalls.push({ type: 'limit', name, value });
              return {
                get: async () => {
                  if (options.beforeQueryGet)
                    await options.beforeQueryGet({ name, condition, offset, limit: value });
                  return { data: data.slice(offset, offset + value) };
                },
              };
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
    async downloadFile(payload) {
      calls.push({ type: 'downloadFile', payload });
      if (!options.downloadFile) throw new Error('unexpected download');
      return options.downloadFile(payload);
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
      queryCalls,
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

test('详情解析资料已保存的 canonical 头像和背景，并拒绝重复绑定', async () => {
  const activity = { _id: 'canonical-detail', status: 'published', created_by: 'member-openid' };
  const avatar = canonicalMedia('cloud://env/profiles/avatar.jpg', 'member-openid', {
    category: 'profile-avatar',
    origin: 'wechat',
    canonical_category: 'profile-avatar',
  });
  avatar.canonical_file_id = avatar.canonical_file_id.replace(
    `/${avatar._id}/`,
    `/profile-avatar/${avatar._id}/`,
  );
  const background = canonicalMedia('cloud://env/profiles/background.jpg', 'member-openid', {
    category: 'profile-background',
    canonical_category: 'profile-background',
  });
  background.canonical_file_id = background.canonical_file_id.replace(
    `/${background._id}/`,
    `/profile-background/${background._id}/`,
  );
  const profile = {
    _id: 'member-openid',
    nickname: '测试骑友',
    avatar_file_id: avatar.canonical_file_id,
    avatar_revision: 1,
    avatar_source: 'wechat',
    background_photo: { file_id: background.canonical_file_id, category: 'ride' },
  };
  for (const duplicate of [false, true]) {
    const { main, calls } = loadMain(activity, [], {
      profiles: [profile],
      mediaSecret: MEDIA_SECRET,
      registrations: [
        {
          _id: 'reg-canonical',
          openid: profile._id,
          activity_id: activity._id,
          status: 'approved',
        },
      ],
      mediaRecords: [avatar, background, ...(duplicate ? [{ ...avatar, _id: 'forged' }] : [])],
      getTempFileURL: async ({ fileList }) => ({
        fileList: fileList.map((fileID) => ({
          fileID,
          status: 0,
          tempFileURL:
            fileID === avatar.canonical_file_id
              ? 'https://temp.example/avatar.jpg'
              : 'https://temp.example/background.jpg',
        })),
      }),
    });
    const result = await main({ action: 'detail', activityId: activity._id });
    assert.equal(result.ok, true);
    assert.equal(
      result.data.attendees[0].avatar_url,
      duplicate ? '' : 'https://temp.example/avatar.jpg',
    );
    assert.equal(result.data.attendees[0].background_url, 'https://temp.example/background.jpg');
    assert.equal(
      result.data.publisher.avatar_url,
      duplicate ? '' : 'https://temp.example/avatar.jpg',
    );
    assert.equal(JSON.stringify(result.data).includes('cloud://'), false);
    assert.ok(
      calls.some((call) => call.name === 'profile_media' && call.condition.canonical_file_id),
    );
  }
});

test('详情返回服务端发布者身份且活动图签名不等待报名读取', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const activity = {
    _id: 'parallel-detail',
    status: 'published',
    created_by: 'member-openid',
    cover_image: 'cloud://env/cover.jpg',
  };
  const { main, calls } = loadMain(activity, [], {
    beforeRegistrationQuery: () => gate,
  });
  const pending = main({ action: 'detail', activityId: activity._id });
  await new Promise((resolve) => setImmediate(resolve));
  const started = calls.some((call) => call.type === 'getTempFileURL');
  release();
  const result = await pending;
  assert.equal(started, true);
  assert.equal(result.data.is_organizer, true);
  assert.equal(Object.hasOwn(result.data, 'created_by'), false);
  const other = await loadMain({ ...activity, created_by: 'other-owner' }).main({
    action: 'detail',
    activityId: activity._id,
  });
  assert.equal(other.data.is_organizer, false);
});

test('未来列表只查询尚未结束的 published 活动并由同一服务端时间裁决报名状态', async () => {
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
      occupancy_partition_ready: true,
      support_vehicle_capacity: 1,
      self_drive_capacity: 1,
      support_vehicle_occupied_count: 1,
      self_drive_occupied_count: 1,
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
  ];
  const { main, calls, queryCalls } = loadMain(undefined, list);

  const result = await main({ action: 'list' });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].condition.status, 'published');
  assert.ok(calls[0].condition.event_end.$gt instanceof Date);
  assert.deepEqual(queryCalls, [
    { type: 'where', name: 'activities', condition: calls[0].condition },
    {
      type: 'orderBy',
      name: 'activities',
      field: 'event_start',
      direction: 'asc',
    },
    { type: 'limit', name: 'activities', value: 20 },
  ]);
  assert.deepEqual(
    result.data.map((item) => [item.registration_state, item.closed_reason]),
    [
      ['open', null],
      ['open', null],
    ],
  );
  assert.equal(result.data[1].waitlist_only, true);
  assert.equal(result.data[0].server_now, result.data[1].server_now);
});

test('历史列表合并已下架和已结束活动并按开始时间倒序', async () => {
  const list = [
    {
      _id: 'finished-older',
      title: '已归档活动',
      status: 'finished',
      event_start: '2025-01-01T00:00:00.000Z',
      event_end: '2025-01-01T08:00:00.000Z',
    },
    {
      _id: 'published-ended',
      title: '已结束活动',
      status: 'published',
      event_start: '2026-01-01T00:00:00.000Z',
      event_end: '2026-01-01T08:00:00.000Z',
    },
    {
      _id: 'published-future',
      title: '未来活动',
      status: 'published',
      event_start: '2999-01-01T00:00:00.000Z',
      event_end: '2999-01-01T08:00:00.000Z',
    },
  ];
  const { main, calls } = loadMain(undefined, list);

  const result = await main({ action: 'list', filter: 'history' });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.map((item) => item._id),
    ['published-ended', 'finished-older'],
  );
  assert.deepEqual(
    calls.map((call) => call.condition.status),
    ['finished', 'published'],
  );
  assert.ok(calls[1].condition.event_end.$lte instanceof Date);
  assert.equal(
    result.data.every((item) => item.closed_reason === 'finished'),
    true,
  );
});

test('历史列表跳过软删除记录后继续分页补足有效活动', async () => {
  const deleted = Array.from({ length: 20 }, (_, index) => ({
    _id: `deleted-${index}`,
    title: `已删除活动 ${index}`,
    status: 'published',
    is_deleted: true,
    event_start: `2026-01-${String(31 - index).padStart(2, '0')}T00:00:00.000Z`,
    event_end: `2026-01-${String(31 - index).padStart(2, '0')}T08:00:00.000Z`,
  }));
  const visible = {
    _id: 'visible-history',
    title: '有效历史活动',
    status: 'published',
    event_start: '2025-12-01T00:00:00.000Z',
    event_end: '2025-12-01T08:00:00.000Z',
  };
  const { main } = loadMain(undefined, [...deleted, visible]);

  const result = await main({ action: 'list', filter: 'history', limit: 20 });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.map((item) => item._id),
    ['visible-history'],
  );
});

test('活动列表拒绝未知筛选条件且不查询数据库', async () => {
  const { main, calls } = loadMain(undefined, []);

  const result = await main({ action: 'list', filter: 'all' });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'VALIDATION_FAILED');
  assert.deepEqual(calls, []);
});

test('公开活动详情完整返回后援车师傅手机号并保留容量拆分', () => {
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
  // 后援车司机电话面向全部骑友公开，必须完整显示，不能打星号。
  assert.equal(result.support_vehicle_driver.contact_phone, '13812345678');
});

test('公开活动白名单透出图集与路线坐标并继续过滤私有字段', () => {
  const { publicActivity } = require('./domain/domain');
  const activity = {
    _id: 'a-media',
    title: '图集活动',
    status: 'published',
    images: ['cloud://one.jpg', 'cloud://two.jpg'],
    cover_image: 'cloud://one.jpg',
    group_qr_code: 'cloud://group-qr.jpg',
    group_qr_code_uploaded_at: '2026-10-10T08:00:00.000Z',
    route: {
      start: '集合点',
      end: '终点',
      start_location: { name: '集合点', address: '湖滨路', latitude: 30.2, longitude: 120.1 },
      end_location: { name: '终点', address: '环山路', latitude: 30.3, longitude: 120.2 },
      route_name: '周末环湖',
      preview_image_url: 'https://images.example/route.jpg',
      strava_gpx_available: false,
    },
    private_token: 'secret',
  };
  const result = publicActivity(activity, new Date('2026-09-29T04:00:00.000Z'));
  assert.deepEqual(result.images, activity.images);
  assert.equal(result.group_qr_code, activity.group_qr_code);
  assert.equal(result.group_qr_code_uploaded_at, activity.group_qr_code_uploaded_at);
  assert.deepEqual(result.route.start_location, activity.route.start_location);
  assert.equal(result.route.route_name, '周末环湖');
  assert.equal(result.route.preview_image_url, 'https://images.example/route.jpg');
  assert.equal(result.route.strava_gpx_available, false);
  assert.equal(result.private_token, undefined);
});

test('群二维码是否可能过期只由服务端按时间戳判断，旧数据缺时间戳不误报', () => {
  const { publicActivity, groupQrMayBeExpired } = require('./domain/domain');
  const now = new Date('2026-10-20T00:00:00.000Z');
  const withQr = (uploadedAt) => ({
    _id: 'a-qr',
    title: '二维码活动',
    status: 'published',
    group_qr_code: 'cloud://group-qr.jpg',
    ...(uploadedAt ? { group_qr_code_uploaded_at: uploadedAt } : {}),
  });
  // 1 天内为新码；超过 7 天判为可能过期。
  assert.equal(groupQrMayBeExpired(withQr('2026-10-19T00:00:00.000Z'), now), false);
  assert.equal(groupQrMayBeExpired(withQr('2026-10-12T00:00:00.000Z'), now), true);
  // 兼容 Date 实例。
  assert.equal(groupQrMayBeExpired(withQr(new Date('2026-10-01T00:00:00.000Z')), now), true);
  // 旧数据有二维码但缺时间戳、或时间戳非法时 fail closed，不凭空提示过期。
  assert.equal(groupQrMayBeExpired(withQr(undefined), now), false);
  assert.equal(groupQrMayBeExpired(withQr('not-a-date'), now), false);
  // 没有二维码时不可能过期。
  assert.equal(groupQrMayBeExpired({ _id: 'a', status: 'published' }, now), false);
  // DTO 明确输出布尔字段供客户端直接渲染。
  assert.equal(
    publicActivity(withQr('2026-10-12T00:00:00.000Z'), now).group_qr_may_be_expired,
    true,
  );
  assert.equal(publicActivity(withQr(undefined), now).group_qr_may_be_expired, false);
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
  const groupQr = 'cloud://bucket/group-qr.jpg';
  const external = 'https://images.example/third.jpg';
  const list = [
    {
      _id: 'a1',
      title: '活动一',
      status: 'published',
      event_start: '2999-01-01T00:00:00.000Z',
      event_end: '2999-01-01T08:00:00.000Z',
      cover_image: shared,
      images: [shared, second],
    },
    {
      _id: 'a2',
      title: '活动二',
      status: 'published',
      event_start: '2999-02-01T00:00:00.000Z',
      event_end: '2999-02-01T08:00:00.000Z',
      cover_image: shared,
      group_qr_code: groupQr,
      images: [external],
    },
  ];
  const { main, calls } = loadMain(undefined, list, {
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({
        fileID,
        status: 0,
        tempFileURL: `https://temp.example/${fileID.endsWith('shared.jpg') ? 'shared' : fileID.endsWith('group-qr.jpg') ? 'group-qr' : 'second'}.jpg`,
      })),
    }),
  });

  const result = await main({ action: 'list' });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.find((call) => call.type === 'getTempFileURL').payload.fileList, [
    shared,
    second,
    groupQr,
  ]);
  assert.equal(result.data[0].cover_image, 'https://temp.example/shared.jpg');
  assert.deepEqual(result.data[0].images, [
    'https://temp.example/shared.jpg',
    'https://temp.example/second.jpg',
  ]);
  assert.deepEqual(result.data[1].images, [external]);
  assert.equal(result.data[1].group_qr_code, 'https://temp.example/group-qr.jpg');
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

test('详情将已绑定的生成路线图解析为临时地址', async () => {
  const generatedFileId = `cloud://env/activity-routes/owner/${'a'.repeat(64)}.png`;
  const activity = {
    _id: 'a-route-media',
    title: '路线图活动',
    status: 'published',
    route: { generated_preview_file_id: generatedFileId },
  };
  const { main, calls } = loadMain(activity, [], {
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({
        fileID,
        status: 0,
        tempFileURL: 'https://temp.example/route.png',
      })),
    }),
  });

  const result = await main({ action: 'detail', activityId: activity._id });

  assert.equal(result.ok, true);
  assert.equal(result.data.route.generated_preview_url, 'https://temp.example/route.png');
  assert.deepEqual(calls.find((call) => call.type === 'getTempFileURL').payload.fileList, [
    generatedFileId,
  ]);
});

test('downloadRouteGpx 在服务端校验摘要后签发 HTTPS 临时地址且响应不含文件内容', async () => {
  const fileContent = Buffer.alloc(2 * 1024 * 1024);
  const digest = crypto.createHash('sha256').update(fileContent).digest('hex');
  const fileId = `cloud://env/activity-routes/owner/${digest}.gpx`;
  const activity = {
    _id: 'a-download',
    title: '路线活动',
    status: 'published',
    route: {
      route_name: '周末 环湖.v2',
      gpx_file_id: fileId,
      gpx_sha256: digest,
    },
  };
  const { main, calls } = loadMain(activity, [], {
    downloadFile: async () => ({ fileContent }),
    getTempFileURL: async ({ fileList }) => ({
      fileList: [
        {
          fileID: fileList[0],
          status: 0,
          tempFileURL: 'https://temp.example/large-route.gpx?token=signed',
        },
      ],
    }),
  });

  const result = await main({ action: 'downloadRouteGpx', activityId: activity._id });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    temp_file_url: 'https://temp.example/large-route.gpx?token=signed',
    filename: '周末 环湖.v2.gpx',
    content_type: 'application/gpx+xml',
    gpx_md5: crypto.createHash('md5').update(fileContent).digest('hex'),
  });
  assert.deepEqual(calls.find((call) => call.type === 'downloadFile').payload, {
    fileID: fileId,
  });
  assert.deepEqual(calls.find((call) => call.type === 'getTempFileURL').payload, {
    fileList: [fileId],
  });
  assert.equal(Object.hasOwn(result.data, 'base64'), false);
  assert.equal(Object.hasOwn(result.data, 'gpx_sha256'), false);
});

test('downloadRouteGpx 为无 SHA-256 的历史 GPX 做大小门禁并返回实际内容 MD5', async () => {
  const fileContent = Buffer.from('<gpx>legacy</gpx>');
  const fileId = 'cloud://env/activity-routes/owner/legacy.gpx';
  const activity = {
    _id: 'legacy-download',
    status: 'published',
    route: { route_name: '历史路线', gpx_file_id: fileId },
  };
  const { main } = loadMain(activity, [], {
    downloadFile: async () => ({ fileContent }),
    getTempFileURL: async () => ({
      fileList: [{ fileID: fileId, status: 0, tempFileURL: 'https://temp.example/legacy.gpx' }],
    }),
  });

  const result = await main({ action: 'downloadRouteGpx', activityId: activity._id });
  assert.equal(result.ok, true);
  assert.equal(result.data.gpx_md5, crypto.createHash('md5').update(fileContent).digest('hex'));
});

test('downloadRouteGpx 拒绝摘要不一致并且不签发临时地址', async () => {
  const expectedDigest = crypto.createHash('sha256').update('expected').digest('hex');
  const fileId = `cloud://env/activity-routes/owner/${expectedDigest}.gpx`;
  const route = { gpx_file_id: fileId, gpx_sha256: expectedDigest };
  const { main, calls } = loadMain({ _id: 'mismatch', status: 'published', route }, [], {
    downloadFile: async () => ({ fileContent: Buffer.from('tampered') }),
  });

  const result = await main({ action: 'downloadRouteGpx', activityId: 'mismatch' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'GPX_DIGEST_MISMATCH');
  assert.equal(
    calls.some((call) => call.type === 'getTempFileURL'),
    false,
  );
});

test('downloadRouteGpx 对无摘要历史文件仍拒绝超过 4MB 且不签发临时地址', async () => {
  const fileContent = Buffer.alloc(4 * 1024 * 1024 + 1);
  const fileId = 'cloud://env/activity-routes/owner/legacy-large.gpx';
  const route = { gpx_file_id: fileId };
  const { main, calls } = loadMain({ _id: 'too-large', status: 'published', route }, [], {
    downloadFile: async () => ({ fileContent }),
  });

  const result = await main({ action: 'downloadRouteGpx', activityId: 'too-large' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'GPX_TOO_LARGE');
  assert.equal(
    calls.some((call) => call.type === 'getTempFileURL'),
    false,
  );
});

test('downloadRouteGpx 明确处理云存储读取失败', async () => {
  const digest = crypto.createHash('sha256').update('route').digest('hex');
  const fileId = `cloud://env/activity-routes/owner/${digest}.gpx`;
  const route = { gpx_file_id: fileId, gpx_sha256: digest };
  const { main, calls } = loadMain({ _id: 'read-failed', status: 'published', route }, [], {
    downloadFile: async () => {
      throw new Error('storage unavailable');
    },
  });

  const result = await main({ action: 'downloadRouteGpx', activityId: 'read-failed' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'GPX_DOWNLOAD_FAILED');
  assert.equal(
    calls.some((call) => call.type === 'getTempFileURL'),
    false,
  );
});

test('downloadRouteGpx 拒绝不可见活动，并明确区分临时地址状态与 URL 缺失', async () => {
  const digest = crypto.createHash('sha256').update('<gpx/>').digest('hex');
  const fileId = `cloud://env/activity-routes/owner/${digest}.gpx`;
  const route = { gpx_file_id: fileId, gpx_sha256: digest };
  for (const activity of [
    { _id: 'draft', status: 'draft', route },
    { _id: 'deleted', status: 'published', is_deleted: true, route },
  ]) {
    const { main } = loadMain(activity);
    const result = await main({ action: 'downloadRouteGpx', activityId: activity._id });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'ACTIVITY_NOT_FOUND');
  }

  for (const [getTempFileURL, code] of [
    [
      async () => {
        throw new Error('storage unavailable');
      },
      'GPX_TEMP_URL_FAILED',
    ],
    [
      async () => ({ fileList: [{ fileID: fileId, status: -1, errMsg: 'denied' }] }),
      'GPX_TEMP_URL_FAILED',
    ],
    [async () => ({ fileList: [{ fileID: fileId, status: 0 }] }), 'GPX_TEMP_URL_MISSING'],
  ]) {
    const { main } = loadMain({ _id: 'published', status: 'published', route }, [], {
      downloadFile: async () => ({ fileContent: Buffer.from('<gpx/>') }),
      getTempFileURL,
    });
    const result = await main({ action: 'downloadRouteGpx', activityId: 'published' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
  }
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
    profile_snapshot: {
      nickname: `旧昵称${index}`,
      ...(index === 0 ? { gender: '男' } : index === 2 ? { gender: '未知' } : {}),
      real_name: '实名',
      real_name_masked: '实*',
      phone: '13812345678',
      phone_masked: '138****5678',
      emergency_name: '紧急联系人',
      emergency_phone: '13987654321',
      emergency_phone_masked: '139****4321',
    },
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
    gender: index === 0 ? '女' : index === 1 ? '女' : index === 2 ? '未知' : '',
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
  assert.equal(result.data.approved_registration_count, 26);
  assert.equal(result.data.attendees.length, 24);
  assert.deepEqual(Object.keys(result.data.attendees[0]).sort(), [
    'avatar_url',
    'background_url',
    'display_name',
    'gender',
    'id',
    'is_self',
    'status',
  ]);
  assert.equal(
    result.data.attendees.some((item) => item.id === 'r-26'),
    false,
  );
  const attendeesById = Object.fromEntries(
    result.data.attendees.map((attendee) => [attendee.id, attendee]),
  );
  assert.equal(attendeesById['r-00'].gender, '男');
  assert.equal(attendeesById['r-01'].gender, '女');
  assert.equal(attendeesById['r-02'].gender, '');
  assert.equal('title' in attendeesById['r-00'], false);
  assert.doesNotMatch(JSON.stringify(result.data.attendees), /13812345678|secret|private|openid/);
  // 其他骑友可见的报名名单只给昵称：不返回真实姓名、手机号、紧急联系人，也不返回打星号版本。
  assert.doesNotMatch(
    JSON.stringify(result.data.attendees),
    /实名|实\*|1398765|\*{4}|紧急联系人|real_name|phone|emergency/,
  );
  assert.deepEqual(
    calls.filter((call) => call.name === 'registrations').map((call) => call.condition.status),
    ['approved', 'checked_in', 'approved', 'checked_in'],
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
  assert.equal(result.data.approved_registration_count, 130);
  assert.equal(result.data.attendees.length, 24);
  assert.deepEqual(
    result.data.attendees.map((item) => item.id),
    early.slice(0, 24).map((item) => item._id),
  );
});

test('详情首批 24 人始终保留当前用户自己的已通过卡片', async () => {
  const registrations = Array.from({ length: 25 }, (_, index) => ({
    _id: `r-${String(index).padStart(2, '0')}`,
    activity_id: 'a1',
    openid: index === 24 ? 'member-openid' : `openid-${index}`,
    status: 'approved',
    updated_at: `2026-09-01T00:${String(index).padStart(2, '0')}:00.000Z`,
    profile_snapshot: { nickname: `骑友${index}` },
  }));
  const { main } = loadMain({ _id: 'a1', title: '活动', status: 'published' }, [], {
    registrations,
  });

  const result = await main({ action: 'detail', activityId: 'a1' });

  assert.equal(result.ok, true);
  assert.equal(result.data.attendees.length, 24);
  assert.equal(result.data.attendees.at(-1).id, 'r-24');
  assert.equal(result.data.attendees.at(-1).is_self, true);
  assert.equal(
    result.data.attendees.some((item) => item.id === 'r-23'),
    false,
  );
});

test('详情展示历史可见性状态下的有效头像，但仍拒绝外部头像', async () => {
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
  const mediaRecords = cases
    .slice(0, 3)
    .map(({ id, profile }) => canonicalMedia(profile.avatar_file_id, id));
  const { main, calls } = loadMain({ _id: 'a1', title: '活动', status: 'published' }, [], {
    registrations,
    profiles,
    mediaRecords,
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
    [
      'https://temporary.example/avatar.jpg',
      'https://temporary.example/avatar.jpg',
      'https://temporary.example/avatar.jpg',
      '',
    ],
  );
  assert.deepEqual(
    calls.filter((call) => call.type === 'getTempFileURL').map((call) => call.payload.fileList),
    [mediaRecords.map((record) => record.canonical_file_id)],
  );
});

test('详情成员骑行名片使用本人上传背景而不是头像', async () => {
  const openid = 'rider-background';
  const avatarFileId = 'cloud://env/profiles/avatar.jpg';
  const backgroundFileId = 'cloud://env/profiles/background.jpg';
  const mediaRecords = [
    canonicalMedia(avatarFileId, openid),
    canonicalMedia(backgroundFileId, openid, { category: 'ride' }),
  ];
  const { main } = loadMain({ _id: 'a1', title: '活动', status: 'published' }, [], {
    registrations: [
      { _id: 'r1', activity_id: 'a1', openid, status: 'approved', approved_at: '2026-09-01' },
    ],
    profiles: [
      {
        _id: openid,
        nickname: '山野骑手',
        avatar_file_id: avatarFileId,
        avatar_source: 'custom',
        avatar_revision: 1,
        background_photo: { file_id: backgroundFileId, category: 'ride' },
      },
    ],
    mediaRecords,
    mediaSecret: MEDIA_SECRET,
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({
        fileID,
        status: 0,
        tempFileURL:
          fileID === mediaRecords[0].canonical_file_id
            ? 'https://temporary.example/avatar.jpg'
            : 'https://temporary.example/background.jpg',
      })),
    }),
  });

  const result = await main({ action: 'detail', activityId: 'a1' });

  assert.equal(result.ok, true);
  assert.equal(result.data.attendees[0].avatar_url, 'https://temporary.example/avatar.jpg');
  assert.equal(result.data.attendees[0].background_url, 'https://temporary.example/background.jpg');
  assert.equal(result.data.attendees[0].avatar_file_id, undefined);
  assert.equal(result.data.attendees[0].background_file_id, undefined);
});

test('详情媒体按当前引用反查唯一登记并拒绝失败或截断批次', async (t) => {
  const owner = 'current-reference-owner';
  const source = 'cloud://env/profiles/current-reference.jpg';
  const record = canonicalMedia(source, owner);
  const cases = [
    { name: 'source', reference: source, records: [record], expected: true },
    {
      name: 'canonical',
      reference: record.canonical_file_id,
      records: [record],
      expected: true,
    },
    {
      name: '重复 canonical',
      reference: record.canonical_file_id,
      records: [
        record,
        { ...record, _id: 'another-binding', file_id: 'cloud://env/another-source.jpg' },
      ],
      expected: false,
    },
    {
      name: 'canonical 查询失败不签 source',
      reference: source,
      records: [record],
      rejectCanonical: true,
      expected: false,
    },
    {
      name: 'canonical 查询100条不使用部分结果',
      reference: record.canonical_file_id,
      records: Array.from({ length: 100 }, (_, index) => ({
        ...record,
        _id: index === 0 ? record._id : `extra-${index}`,
      })),
      expected: false,
    },
  ];
  for (const scenario of cases)
    await t.test(scenario.name, async () => {
      const { main, calls } = loadMain({ _id: 'a1', title: '活动', status: 'published' }, [], {
        profiles: [
          {
            _id: owner,
            avatar_file_id: scenario.reference,
            avatar_source: 'custom',
            avatar_revision: 1,
            background_photo: null,
            photos: [{ file_id: source, category: 'ride' }],
          },
        ],
        registrations: [{ _id: 'r1', activity_id: 'a1', openid: owner, status: 'approved' }],
        mediaRecords: scenario.records,
        mediaSecret: MEDIA_SECRET,
        beforeQueryGet: ({ name, condition }) => {
          if (scenario.rejectCanonical && name === 'profile_media' && condition.canonical_file_id)
            throw new Error('media registry unavailable');
        },
        getTempFileURL: async ({ fileList }) => ({
          fileList: fileList.map((fileID) => ({
            fileID,
            status: 0,
            tempFileURL: 'https://temporary.example/current-reference.jpg',
          })),
        }),
      });
      const result = await main({ action: 'detail', activityId: 'a1' });
      assert.equal(result.ok, true);
      assert.equal(
        result.data.attendees[0].avatar_url,
        scenario.expected ? 'https://temporary.example/current-reference.jpg' : '',
      );
      assert.equal(result.data.attendees[0].background_url, '');
      assert.equal(result.data.attendees[0].avatar_file_id, undefined);
      assert.equal(
        calls.filter((call) => call.type === 'getTempFileURL').length,
        scenario.expected ? 1 : 0,
      );
    });
});

test('详情只为 registry 合法的 canonical 头像签发地址', async () => {
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

test('列表为每个活动解析发布人昵称与头像', async () => {
  const ownerA = 'owner-a';
  const ownerB = 'owner-b';
  const avatarA = 'cloud://env/profiles/a.jpg';
  const avatarB = 'cloud://env/profiles/b.jpg';
  const recordA = canonicalMedia(avatarA, ownerA);
  const backgroundA = 'cloud://env/profiles/a-background.jpg';
  const backgroundRecordA = canonicalMedia(backgroundA, ownerA, { category: 'ride' });
  const recordB = canonicalMedia(avatarB, ownerB);
  const tempFileRequests = [];
  const list = [
    {
      _id: 'a1',
      title: '活动一',
      status: 'published',
      created_by: ownerA,
      event_start: '2999-01-01T08:00:00.000Z',
      event_end: '2999-01-02T00:00:00.000Z',
    },
    {
      _id: 'a2',
      title: '活动二',
      status: 'published',
      created_by: ownerB,
      event_start: '2999-02-01T08:00:00.000Z',
      event_end: '2999-02-02T00:00:00.000Z',
    },
  ];
  const { main } = loadMain(undefined, list, {
    profiles: [
      {
        _id: ownerA,
        nickname: '阿强',
        avatar_file_id: avatarA,
        avatar_source: 'custom',
        avatar_revision: 1,
        avatar_visibility: 'public',
        avatar_visibility_revision: 1,
        background_photo: { file_id: backgroundA, category: 'ride' },
      },
      {
        _id: ownerB,
        nickname: '阿敏',
        avatar_file_id: avatarB,
        avatar_source: 'custom',
        avatar_revision: 1,
        avatar_visibility: 'public',
        avatar_visibility_revision: 1,
      },
    ],
    mediaRecords: [recordA, backgroundRecordA, recordB],
    mediaSecret: MEDIA_SECRET,
    getTempFileURL: async ({ fileList }) => {
      tempFileRequests.push([...fileList]);
      return {
        fileList: fileList.map((fileID) => ({
          fileID,
          status: 0,
          tempFileURL: `https://temp.example/${fileID === recordA.canonical_file_id ? 'a' : 'b'}.jpg`,
        })),
      };
    },
  });

  const result = await main({ action: 'list' });

  assert.equal(result.ok, true);
  assert.equal(tempFileRequests.flat().includes(backgroundRecordA.canonical_file_id), false);
  assert.deepEqual(
    result.data.map((item) => item.publisher),
    [
      { nickname: '阿强', avatar_url: 'https://temp.example/a.jpg' },
      { nickname: '阿敏', avatar_url: 'https://temp.example/b.jpg' },
    ],
  );
});

test('发布人资料缺失时统一兜底为骑友与空头像，不影响列表返回', async () => {
  const list = [
    {
      _id: 'a1',
      title: '无资料活动',
      status: 'published',
      created_by: 'ghost',
      event_start: '2999-01-01T08:00:00.000Z',
      event_end: '2999-01-02T00:00:00.000Z',
    },
  ];
  const { main } = loadMain(undefined, list, { profiles: [], mediaRecords: [] });

  const result = await main({ action: 'list' });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data[0].publisher, { nickname: '骑友', avatar_url: '' });
});

test('详情同样带出发布人信息', async () => {
  const owner = 'owner-a';
  const avatar = 'cloud://env/profiles/a.jpg';
  const record = canonicalMedia(avatar, owner);
  const activity = {
    _id: 'a1',
    title: '活动',
    status: 'published',
    created_by: owner,
    event_start: '2999-01-01T08:00:00.000Z',
    event_end: '2999-01-02T00:00:00.000Z',
  };
  const { main } = loadMain(activity, [], {
    profiles: [
      {
        _id: owner,
        nickname: '阿强',
        avatar_file_id: avatar,
        avatar_source: 'custom',
        avatar_revision: 1,
        avatar_visibility: 'public',
        avatar_visibility_revision: 1,
      },
    ],
    mediaRecords: [record],
    mediaSecret: MEDIA_SECRET,
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map((fileID) => ({
        fileID,
        status: 0,
        tempFileURL: 'https://temp.example/a.jpg',
      })),
    }),
  });

  const result = await main({ action: 'detail', activityId: 'a1' });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.publisher, {
    nickname: '阿强',
    avatar_url: 'https://temp.example/a.jpg',
  });
});

test('不限人数活动超过一千名通过者时人数使用数据库计数而不被头像读取上限截断', async () => {
  const registrations = Array.from({ length: 1005 }, (_, index) => ({
    _id: `approved-${index}`,
    activity_id: 'a1',
    openid: `openid-${index}`,
    status: 'approved',
    created_at: new Date(2026, 0, 1, 0, 0, index),
    updated_at: new Date(2026, 0, 1, 0, 0, index),
    profile_snapshot: { nickname: `骑友${index}` },
  }));
  const { main } = loadMain(
    { _id: 'a1', title: '不限人数活动', status: 'published', registration_unlimited: true },
    [],
    { registrations },
  );

  const result = await main({ action: 'detail', activityId: 'a1' });

  assert.equal(result.ok, true);
  assert.equal(result.data.approved_registration_count, 1005);
  assert.equal(result.data.attendees.length, 24);
});

test('详情并行读取发布人、人数计数和两种参与状态且保持稳定结果', async () => {
  const started = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const registrations = [
    {
      _id: 'checked-late',
      activity_id: 'parallel',
      openid: 'checked',
      status: 'checked_in',
      approved_at: '2026-09-02T00:00:00.000Z',
    },
    {
      _id: 'approved-early',
      activity_id: 'parallel',
      openid: 'approved',
      status: 'approved',
      approved_at: '2026-09-01T00:00:00.000Z',
    },
  ];
  const { main } = loadMain(
    { _id: 'parallel', title: '并行活动', status: 'published', created_by: 'owner' },
    [],
    {
      registrations,
      profiles: [
        { _id: 'owner', nickname: '组织者' },
        { _id: 'checked', nickname: '后签到' },
        { _id: 'approved', nickname: '先通过' },
      ],
      beforeRegistrationQuery: async ({ type, status }) => {
        started.push(`${type}:${status}`);
        await gate;
      },
      beforeQueryGet: async ({ name, condition }) => {
        started.push(`get:${name}:${condition.status || 'profile'}`);
        await gate;
      },
    },
  );

  const pending = main({ action: 'detail', activityId: 'parallel' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    new Set(started),
    new Set([
      'get:profiles:profile',
      'count:approved',
      'count:checked_in',
      'get:registrations:approved',
      'get:registrations:checked_in',
    ]),
  );
  release();
  const result = await pending;

  assert.equal(result.ok, true);
  assert.equal(result.data.approved_registration_count, 2);
  assert.deepEqual(
    result.data.attendees.map((item) => item.id),
    ['approved-early', 'checked-late'],
  );
  assert.deepEqual(result.data.publisher, { nickname: '组织者', avatar_url: '' });
});

test('activity-read 批量签名嵌套俱乐部头像且失败项返回空', async () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const list = [
    {
      _id: 'club-avatar-success',
      title: '签名成功',
      status: 'published',
      event_end: future,
      club_id: 'club-success',
      club_identity: {
        id: 'club-success',
        name: '成功俱乐部',
        avatar_url: 'cloud://env/clubs/success.jpg',
      },
    },
    {
      _id: 'club-avatar-failed',
      title: '签名失败',
      status: 'published',
      event_end: future,
      club_id: 'club-failed',
      club_identity: {
        id: 'club-failed',
        name: '失败俱乐部',
        avatar_url: 'cloud://env/clubs/failed.jpg',
      },
    },
  ];
  const { main } = loadMain(undefined, list, {
    getTempFileURL: async () => ({
      fileList: [
        {
          fileID: 'cloud://env/clubs/success.jpg',
          status: 0,
          tempFileURL: 'https://temporary.example/club-success.jpg',
        },
        { fileID: 'cloud://env/clubs/failed.jpg', status: -1 },
      ],
    }),
  });

  const result = await main({ action: 'list', filter: 'upcoming' });
  const byId = new Map(result.data.map((activity) => [activity._id, activity]));

  assert.equal(
    byId.get('club-avatar-success').club_identity.avatar_url,
    'https://temporary.example/club-success.jpg',
  );
  assert.equal(byId.get('club-avatar-failed').club_identity.avatar_url, '');
  assert.equal(JSON.stringify(result.data).includes('cloud://env/clubs/'), false);
});
