'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const { mediaOwnerPrefix } = require('./core');

test('registerMedia 在任何特权存储读取前拒绝跨 owner fileID', async () => {
  const owner = 'owner-a';
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const fileId = `cloud://env/${mediaOwnerPrefix('owner-b', secret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  let tempUrlCalls = 0;
  let downloadCalls = 0;
  const collection = () => ({
    doc: () => ({
      get: async () => ({ data: undefined }),
      set: async () => undefined,
      update: async () => undefined,
    }),
  });

  cloud.init = () => undefined;
  cloud.database = () => ({
    command: { remove: () => Symbol('remove') },
    serverDate: () => new Date('2026-09-30T00:00:00.000Z'),
    collection,
    runTransaction: (work) => work({ collection }),
  });
  cloud.getWXContext = () => ({ OPENID: owner });
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
  process.env.PII_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.PROFILE_MEDIA_PATH_SECRET = secret;
  delete require.cache[require.resolve('./index')];
  const { main } = require('./index');

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
});
