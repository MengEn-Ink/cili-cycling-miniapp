'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { canonicalizeClientMedia } = require('./media-upload');
const {
  canonicalMediaBinding,
  canonicalMediaPath,
  mediaDocumentId,
  mediaOwnerPrefix,
} = require('./core');

const owner = 'owner';
const secret = 'profile-media-secret-for-tests-32-bytes';
const sourceFileId = `cloud://env/${mediaOwnerPrefix(owner, secret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const verified = {
  bytes,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  size: bytes.length,
  mime: 'image/jpeg',
  extension: 'jpg',
};
const canonicalPath = canonicalMediaPath(
  owner,
  sourceFileId,
  verified.sha256,
  verified.extension,
  secret,
);
const canonicalFileId = `cloud://env/${canonicalPath}`;
const binding = canonicalMediaBinding(owner, sourceFileId, canonicalFileId, verified, secret);

test('首次登记先持久化 canonical intent，再上传并原子完成 registry', async () => {
  const calls = [];
  const store = {
    getMedia: async () => undefined,
    prepareCanonicalUpload: async (...args) => calls.push(['prepare', ...args]),
    completeClientMedia: async (...args) => {
      calls.push(['complete', ...args]);
      return args[6](undefined);
    },
  };

  const record = await canonicalizeClientMedia({
    openid: owner,
    fileId: sourceFileId,
    category: 'other',
    origin: 'custom',
    mediaSecret: secret,
    getTempFileURL: async () => ({
      fileList: [
        { fileID: sourceFileId, status: 0, tempFileURL: 'https://storage.example/source' },
      ],
    }),
    verifyImage: async () => verified,
    uploadFile: async ({ cloudPath, fileContent }) => {
      calls.push(['upload', cloudPath, fileContent]);
      return { fileID: canonicalFileId };
    },
    store,
    now: new Date('2026-09-30T00:00:00.000Z'),
  });

  assert.equal(record.canonical_file_id, canonicalFileId);
  assert.equal(calls[0][0], 'prepare');
  assert.deepEqual(calls[1], ['upload', canonicalPath, bytes]);
  assert.equal(calls[2][0], 'complete');
});

test('canonical upload 响应未知时 intent 已持久化且 registry 不落地', async () => {
  let prepared = false;
  let completed = false;
  await assert.rejects(
    canonicalizeClientMedia({
      openid: owner,
      fileId: sourceFileId,
      category: 'other',
      origin: 'custom',
      mediaSecret: secret,
      getTempFileURL: async () => ({
        fileList: [
          { fileID: sourceFileId, status: 0, tempFileURL: 'https://storage.example/source' },
        ],
      }),
      verifyImage: async () => verified,
      uploadFile: async () => {
        throw Object.assign(new Error('response lost'), { code: 'ETIMEDOUT' });
      },
      store: {
        getMedia: async () => undefined,
        prepareCanonicalUpload: async () => {
          prepared = true;
        },
        completeClientMedia: async () => {
          completed = true;
        },
      },
    }),
    { code: 'ETIMEDOUT' },
  );
  assert.equal(prepared, true);
  assert.equal(completed, false);
});

test('重复 register 复用已绑定 canonical，不再读取或复制可覆盖 source', async () => {
  const existing = {
    _id: mediaDocumentId(sourceFileId),
    file_id: sourceFileId,
    owner_openid: owner,
    category: 'other',
    origin: 'custom',
    status: 'unreferenced',
    ...binding,
  };
  let storageReads = 0;
  let uploads = 0;
  const result = await canonicalizeClientMedia({
    openid: owner,
    fileId: sourceFileId,
    category: 'other',
    origin: 'custom',
    mediaSecret: secret,
    getTempFileURL: async () => {
      storageReads += 1;
      return { fileList: [] };
    },
    uploadFile: async () => {
      uploads += 1;
      return {};
    },
    store: { getMedia: async () => existing },
  });

  assert.deepEqual(result, existing);
  assert.equal(storageReads, 0);
  assert.equal(uploads, 0);
});
