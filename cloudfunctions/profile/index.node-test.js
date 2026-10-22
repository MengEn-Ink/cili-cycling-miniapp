'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const {
  canonicalMediaPath,
  clientUploadIntentId,
  mediaDocumentId,
  mediaOwnerPrefix,
} = require('./core');

function statefulDatabase({ throwRuntimeMissing = false } = {}) {
  const state = {};
  const ensure = (name) => (state[name] ||= new Map());
  const collection = (name) => ({
    where: (conditions) => ({
      limit: () => ({
        get: async () => ({
          data: [...ensure(name).values()].filter((item) =>
            Object.entries(conditions).every(([key, value]) => item[key] === value),
          ),
        }),
      }),
    }),
    doc: (id) => ({
      get: async () => {
        const data = ensure(name).get(id);
        if (throwRuntimeMissing && data === undefined)
          throw { errCode: -1, errMsg: `document with _id ${id} does not exist` };
        return { data };
      },
      set: async ({ data }) => ensure(name).set(id, { _id: id, ...data }),
      update: async ({ data }) =>
        ensure(name).set(id, { ...(ensure(name).get(id) || { _id: id }), ...data }),
    }),
  });
  return {
    state,
    db: {
      command: { remove: () => Symbol('remove') },
      serverDate: () => new Date('2026-09-30T00:00:00.000Z'),
      collection,
      runTransaction: (work) => work({ collection }),
    },
  };
}

test('profile 入口把运行时 -1 的精确缺文档语义用于首次资料与 intent', async () => {
  const owner = 'owner-runtime';
  const fixture = statefulDatabase({ throwRuntimeMissing: true });
  const main = loadMain(owner, fixture.db);

  const profile = await main({ action: 'get' });
  const uploadPath = await main({
    action: 'mediaUploadPath',
    category: 'profile-avatar',
    requestId: 'request_runtime_123',
  });

  assert.equal(profile.ok, true);
  assert.deepEqual(profile.data.club_memberships, []);
  assert.equal(uploadPath.ok, true);
  assert.match(uploadPath.data.cloud_path, /^profiles\/[a-f0-9]{32}\//);
  assert.equal((fixture.state.profile_media_imports || new Map()).size, 1);
});

function loadMain(owner, db) {
  cloud.init = () => undefined;
  cloud.database = () => db;
  cloud.getWXContext = () => ({ OPENID: owner });
  process.env.PII_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.PROFILE_MEDIA_PATH_SECRET = 'profile-media-secret-for-tests-32-bytes';
  delete require.cache[require.resolve('./index')];
  return require('./index').main;
}

test('registerMedia 在任何特权存储读取前拒绝跨 owner fileID', async () => {
  const owner = 'owner-a';
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const fileId = `cloud://env/${mediaOwnerPrefix('owner-b', secret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  let tempUrlCalls = 0;
  let downloadCalls = 0;
  let uploadCalls = 0;
  const fixture = statefulDatabase();
  const cloudPath = fileId.slice(fileId.indexOf('/', 'cloud://'.length) + 1);
  const intentId = clientUploadIntentId(cloudPath);
  fixture.state.profile_media_imports = new Map([
    [
      intentId,
      {
        _id: intentId,
        category: 'profile-avatar',
        request_id: 'request_owner_check_123',
      },
    ],
  ]);
  cloud.getTempFileURL = async ({ fileList }) => {
    tempUrlCalls += 1;
    return {
      fileList: fileList.map((candidate) => ({
        fileID: candidate,
        status: 0,
        tempFileURL: 'https://storage.example/object.jpg',
      })),
    };
  };
  cloud.downloadFile = async () => {
    downloadCalls += 1;
    return { fileContent: Buffer.from([0xff, 0xd8, 0xff]) };
  };
  cloud.uploadFile = async () => {
    uploadCalls += 1;
    return { fileID: 'cloud://env/profile-canonical/forbidden' };
  };
  const main = loadMain(owner, fixture.db);

  const result = await main({
    action: 'registerMedia',
    fileId,
    origin: 'custom',
    category: 'profile-avatar',
    requestId: 'request_owner_check_123',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'MEDIA_NOT_OWNED');
  assert.equal(tempUrlCalls, 0);
  assert.equal(downloadCalls, 0);
  assert.equal(uploadCalls, 0);
});

test('mediaUploadPath 在把 owner-bound path 返回客户端前持久化 cleanup intent', async () => {
  const owner = 'owner-a';
  const fixture = statefulDatabase();
  const main = loadMain(owner, fixture.db);

  const result = await main({
    action: 'mediaUploadPath',
    category: 'profile-avatar',
    requestId: 'request_cleanup_123',
  });

  assert.equal(result.ok, true);
  const intents = [...(fixture.state.profile_media_imports || new Map()).values()];
  assert.equal(intents.length, 1);
  assert.deepEqual(intents[0], {
    _id: intents[0]._id,
    kind: 'client_upload',
    generation: 1,
    owner_openid: owner,
    cloud_path: result.data.cloud_path,
    category: 'profile-avatar',
    request_id: 'request_cleanup_123',
    status: 'prepared',
    created_at: intents[0].created_at,
    cleanup_after: intents[0].cleanup_after,
  });
  assert.ok(new Date(intents[0].cleanup_after) > new Date(intents[0].created_at));
});

test('nickname update checks normalized public field outside the guarded transaction', async () => {
  const owner = 'owner-content';
  const fixture = statefulDatabase();
  const runTransaction = fixture.db.runTransaction;
  let inTransaction = false;
  fixture.db.runTransaction = (work) =>
    runTransaction(async (transaction) => {
      inTransaction = true;
      try {
        return await work(transaction);
      } finally {
        inTransaction = false;
      }
    });
  fixture.state.profiles = new Map([
    [owner, { _id: owner, generation: 4, deletion_status: 'active', nickname: '旧昵称' }],
  ]);
  const requests = [];
  cloud.openapi = {
    security: {
      msgSecCheck: async (request) => {
        assert.equal(inTransaction, false);
        requests.push(request);
        return { errCode: 0, result: { suggest: 'pass' }, traceId: 'nickname-trace' };
      },
    },
  };
  const main = loadMain(owner, fixture.db);

  const result = await main({
    action: 'update',
    generation: 4,
    nickname: '  山海骑手  ',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(requests, [
    {
      openid: owner,
      scene: 1,
      version: 2,
      content: '{"nickname":"山海骑手"}',
    },
  ]);
  const stored = fixture.state.profiles.get(owner);
  assert.equal(stored.nickname, '山海骑手');
  assert.match(stored.content_check.digest, /^[a-f0-9]{64}$/);
  assert.equal(stored.content_check.version, 4);
  assert.equal(stored.content_check.trace_id, 'nickname-trace');
});

test('nickname review blocks persistence even for a trusted logged-in profile owner', async () => {
  const owner = 'owner-review';
  const fixture = statefulDatabase();
  fixture.state.profiles = new Map([
    [owner, { _id: owner, generation: 2, deletion_status: 'active', nickname: '旧昵称' }],
  ]);
  cloud.openapi = {
    security: {
      msgSecCheck: async () => ({ errCode: 0, result: { suggest: 'review' } }),
    },
  };
  const main = loadMain(owner, fixture.db);
  const result = await main({ action: 'update', generation: 2, nickname: '待人工判断' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CONTENT_REVIEW_REQUIRED');
  assert.equal(fixture.state.profiles.get(owner).nickname, '旧昵称');
});

test('显式背景更新保留存量多图并只激活新槽位媒体', async () => {
  const owner = 'owner-background';
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const prefix = mediaOwnerPrefix(owner, secret);
  const fileId = (suffix) => `cloud://env/${prefix}123e4567-e89b-42d3-a456-4266141740${suffix}.jpg`;
  const photos = [
    { file_id: fileId('00'), category: 'ride' },
    { file_id: fileId('01'), category: 'bike' },
    { file_id: fileId('02'), category: 'other' },
  ];
  const next = { file_id: fileId('03'), category: 'ride' };
  const fixture = statefulDatabase();
  fixture.state.profiles = new Map([
    [
      owner,
      {
        _id: owner,
        nickname: '骑手',
        gender: '男',
        avatar_file_id: fileId('04'),
        avatar_source: 'custom',
        photos,
      },
    ],
  ]);
  fixture.state.profile_media = new Map(
    [...photos, next].map((photo) => [
      mediaDocumentId(photo.file_id),
      {
        _id: mediaDocumentId(photo.file_id),
        file_id: photo.file_id,
        owner_openid: owner,
        category: photo.category,
        status: photo === next ? 'unreferenced' : 'active',
        ...(photo === next ? { security_status: 'pass' } : {}),
      },
    ]),
  );
  const main = loadMain(owner, fixture.db);

  const result = await main({ action: 'update', background_photo: next });

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.state.profiles.get(owner).photos, photos);
  assert.deepEqual(fixture.state.profiles.get(owner).background_photo, next);
  assert.equal(fixture.state.profile_media.get(mediaDocumentId(next.file_id)).status, 'active');
  assert.deepEqual(result.data.photos, photos);
  assert.deepEqual(result.data.background_photo, next);
});

test('新媒体协议授权与 finalize 都拒绝缺半字段及非法 requestId', async () => {
  const fixture = statefulDatabase();
  const main = loadMain('owner-protocol', fixture.db);
  const actions = ['mediaUploadPath', 'registerMedia'];
  for (const action of actions) {
    for (const fields of [{ category: 'club-avatar' }, { requestId: 'request_12345678' }]) {
      const result = await main({ action, ...fields });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'MEDIA_PROTOCOL_INCOMPLETE');
    }
    const invalid = await main({ action, category: 'club-avatar', requestId: 'short' });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, 'MEDIA_REQUEST_ID_INVALID');
  }
  assert.equal((fixture.state.profile_media_imports || new Map()).size, 0);
});

test('mediaStatus reports durable check state and mediaRetry resubmits retryable current binding', async () => {
  const owner = 'owner-media-check';
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const fixture = statefulDatabase();
  const sourceFileId = `cloud://env/${mediaOwnerPrefix(owner, secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174010.jpg`;
  const sha256 = '2'.repeat(64);
  const { canonicalMediaPath } = require('./core');
  const canonicalFileId = `cloud://env/${canonicalMediaPath(
    owner,
    sourceFileId,
    sha256,
    'jpg',
    secret,
    'profile-avatar',
  )}`;
  const mediaId = mediaDocumentId(sourceFileId);
  fixture.state.profiles = new Map([
    [owner, { _id: owner, generation: 5, deletion_status: 'active' }],
  ]);
  fixture.state.profile_media = new Map([
    [
      mediaId,
      {
        _id: mediaId,
        file_id: sourceFileId,
        owner_openid: owner,
        category: 'profile-avatar',
        origin: 'wechat',
        status: 'unreferenced',
        generation: 5,
        source_file_id: sourceFileId,
        canonical_file_id: canonicalFileId,
        canonical_category: 'profile-avatar',
        sha256,
        size: 5,
        mime: 'image/jpeg',
        security_status: 'retryable',
        security_trace_id: 'trace-initial',
        security_error_code: 'MEDIA_CHECK_RETRY',
      },
    ],
  ]);
  fixture.state.content_media_checks = new Map([
    [
      'trace-initial',
      {
        _id: 'trace-initial',
        trace_id: 'trace-initial',
        media_id: mediaId,
        owner_openid: owner,
        category: 'profile-avatar',
        generation: 5,
        canonical_file_id: canonicalFileId,
        sha256,
        status: 'retryable',
        attempts: 1,
      },
    ],
  ]);
  const main = loadMain(owner, fixture.db);
  const calls = [];
  cloud.getTempFileURL = async ({ fileList }) => ({
    fileList: fileList.map((candidate) => ({
      fileID: candidate,
      status: 0,
      tempFileURL: `https://storage.example/${encodeURIComponent(candidate)}.jpg`,
    })),
  });
  cloud.uploadFile = async ({ cloudPath }) => ({ fileID: `cloud://env/${cloudPath}` });
  cloud.openapi = {
    security: {
      mediaCheckAsync: async (request) => {
        calls.push(request);
        return { errCode: 0, traceId: 'trace-retry' };
      },
    },
  };
  const status = await main({ action: 'mediaStatus', fileId: canonicalFileId });
  assert.equal(status.ok, true);
  assert.equal(status.data.securityStatus, 'retryable');
  assert.equal(status.data.traceId, 'trace-initial');
  assert.equal(status.data.retryable, true);
  const missingGeneration = await main({ action: 'mediaRetry', fileId: canonicalFileId });
  assert.equal(missingGeneration.ok, false);
  assert.equal(missingGeneration.error.code, 'PROFILE_GENERATION_MISMATCH');
  assert.equal(calls.length, 0);

  fixture.state.profile_media.get(mediaId).security_status = 'pending';
  fixture.state.content_media_checks.get('trace-initial').status = 'pending';
  const pending = await main({
    action: 'mediaRetry',
    fileId: canonicalFileId,
    generation: 5,
  });
  assert.equal(pending.ok, false);
  assert.equal(pending.error.code, 'MEDIA_RETRY_NOT_ALLOWED');
  assert.equal(calls.length, 0);

  fixture.state.profile_media.get(mediaId).security_status = 'retryable';
  fixture.state.content_media_checks.get('trace-initial').status = 'retryable';
  fixture.state.content_media_checks.get('trace-initial').attempts = 2;
  const exhausted = await main({
    action: 'mediaRetry',
    fileId: canonicalFileId,
    generation: 5,
  });
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.error.code, 'MEDIA_RETRY_EXHAUSTED');
  assert.equal(calls.length, 0);

  fixture.state.content_media_checks.get('trace-initial').attempts = 1;
  const retry = await main({
    action: 'mediaRetry',
    fileId: canonicalFileId,
    generation: 5,
  });

  assert.equal(retry.ok, true);
  assert.equal(retry.data.securityStatus, 'pending');
  assert.equal(retry.data.traceId, 'trace-retry');
  assert.equal(fixture.state.content_media_checks.get('trace-retry').attempts, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].openid, owner);
  assert.equal(calls[0].scene, 1);
  assert.equal(calls[0].version, 2);
});

test('replayed registerMedia returns an existing pass decision without resubmitting', async () => {
  const owner = 'owner-media-replay';
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const requestId = 'request_media_replay_123';
  const sourceFileId = `cloud://env/${mediaOwnerPrefix(owner, secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174011.jpg`;
  const sourcePath = sourceFileId.slice(sourceFileId.indexOf('/', 'cloud://'.length) + 1);
  const sha256 = '3'.repeat(64);
  const canonicalFileId = `cloud://env/${canonicalMediaPath(
    owner,
    sourceFileId,
    sha256,
    'jpg',
    secret,
    'profile-avatar',
  )}`;
  const mediaId = mediaDocumentId(sourceFileId);
  const fixture = statefulDatabase();
  fixture.state.profiles = new Map([
    [owner, { _id: owner, generation: 5, deletion_status: 'active' }],
  ]);
  fixture.state.profile_media_imports = new Map([
    [
      clientUploadIntentId(sourcePath),
      {
        _id: clientUploadIntentId(sourcePath),
        kind: 'client_upload',
        owner_openid: owner,
        cloud_path: sourcePath,
        category: 'profile-avatar',
        request_id: requestId,
        generation: 5,
        status: 'completed',
      },
    ],
  ]);
  fixture.state.profile_media = new Map([
    [
      mediaId,
      {
        _id: mediaId,
        file_id: sourceFileId,
        source_file_id: sourceFileId,
        canonical_file_id: canonicalFileId,
        canonical_category: 'profile-avatar',
        owner_openid: owner,
        category: 'profile-avatar',
        origin: 'wechat',
        generation: 5,
        sha256,
        size: 5,
        mime: 'image/jpeg',
        status: 'unreferenced',
        security_status: 'pass',
        security_trace_id: 'trace-pass',
      },
    ],
  ]);
  fixture.state.content_media_checks = new Map([
    [
      'trace-pass',
      {
        _id: 'trace-pass',
        trace_id: 'trace-pass',
        media_id: mediaId,
        owner_openid: owner,
        category: 'profile-avatar',
        generation: 5,
        canonical_file_id: canonicalFileId,
        sha256,
        status: 'pass',
        attempts: 1,
      },
    ],
  ]);
  let submissions = 0;
  cloud.openapi = {
    security: {
      mediaCheckAsync: async () => {
        submissions += 1;
        return { errCode: 0, traceId: 'unexpected-trace' };
      },
    },
  };
  const main = loadMain(owner, fixture.db);

  const result = await main({
    action: 'registerMedia',
    fileId: sourceFileId,
    origin: 'wechat',
    category: 'profile-avatar',
    requestId,
    generation: 5,
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.status.securityStatus, 'pass');
  assert.equal(result.data.status.traceId, 'trace-pass');
  assert.equal(submissions, 0);
  assert.equal(fixture.state.content_media_checks.size, 1);
});

test('runtime consent actions use trusted caller and preserve deletion/generation locks', async () => {
  const fixture = statefulDatabase();
  fixture.state.profiles = new Map([
    ['owner-consent', { _id: 'owner-consent', generation: 2, nickname: 'Private' }],
    ['other', { _id: 'other', generation: 2, nickname: 'Other' }],
  ]);
  const main = loadMain('owner-consent', fixture.db);
  const status = await main({ action: 'publicConsentStatus' });
  assert.equal(status.ok, true);
  assert.equal(status.data.nickname.consented, false);
  const input = {
    action: 'setPublicConsent',
    generation: 2,
    policyVersion: status.data.policyVersion,
    nickname: { consented: true, version: status.data.nickname.version },
  };
  assert.equal((await main({ ...input, openid: 'other' })).error.code, 'FORBIDDEN_FIELD');
  assert.equal((await main(input)).data.nickname.consented, true);
  assert.equal(fixture.state.profiles.get('other').public_consent, undefined);
  fixture.state.profiles.get('owner-consent').deletion_status = 'requested';
  assert.equal(
    (await main({ ...input, nickname: { consented: false } })).error.code,
    'PROFILE_DELETION_LOCKED',
  );
  assert.equal((await main({ action: 'publicConsentStatus' })).data.nickname.consented, false);
});
