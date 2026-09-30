'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const { mediaOwnerPrefix } = require('./core');

function statefulDatabase({ throwRuntimeMissing = false } = {}) {
  const state = {};
  const ensure = (name) => (state[name] ||= new Map());
  const collection = (name) => ({
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
  const uploadPath = await main({ action: 'mediaUploadPath' });

  assert.equal(profile.ok, true);
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
    category: 'other',
    origin: 'custom',
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

  const result = await main({ action: 'mediaUploadPath' });

  assert.equal(result.ok, true);
  const intents = [...(fixture.state.profile_media_imports || new Map()).values()];
  assert.equal(intents.length, 1);
  assert.deepEqual(intents[0], {
    _id: intents[0]._id,
    kind: 'client_upload',
    owner_openid: owner,
    cloud_path: result.data.cloud_path,
    status: 'prepared',
    created_at: intents[0].created_at,
    cleanup_after: intents[0].cleanup_after,
  });
  assert.ok(new Date(intents[0].cleanup_after) > new Date(intents[0].created_at));
});
