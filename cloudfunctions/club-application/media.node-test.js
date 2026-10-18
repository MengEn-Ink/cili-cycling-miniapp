'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveApplicationCover,
  resolveApplicationCovers,
  resolveJoinableClubAvatars,
} = require('./media');

const application = (owner, suffix = 'cover.jpg') => ({
  id: `application-${owner}`,
  applicant_openid: owner,
  cover_file_id: `cloud://env/club-applications/${owner}/${suffix}`,
});

test('本人状态、管理员列表与详情只为申请人目录签发 HTTPS 封面地址', async () => {
  const calls = [];
  const cloud = {
    getTempFileURL: async ({ fileList }) => {
      calls.push(fileList);
      return {
        fileList: fileList.map((fileID) => ({
          fileID,
          tempFileURL: `https://temporary.example/${encodeURIComponent(fileID)}`,
        })),
      };
    },
  };
  const mine = await resolveApplicationCover(cloud, application('user-1'), 'user-1');
  assert.match(mine.cover_url, /^https:\/\//);

  const list = await resolveApplicationCovers(cloud, [
    application('user-1'),
    application('user-2'),
  ]);
  assert.equal(list.length, 2);
  assert.ok(list.every((item) => item.cover_url.startsWith('https://')));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].length, 2);
});

test('申请头像与背景分别签名并保持独立地址', async () => {
  const value = {
    ...application('user-1'),
    avatar_file_id: 'cloud://env/club-applications/user-1/avatar.jpg',
  };
  const result = await resolveApplicationCover(
    {
      getTempFileURL: async ({ fileList }) => ({
        fileList: fileList.map((fileID) => ({
          fileID,
          tempFileURL: fileID.includes('avatar')
            ? 'https://temporary.example/avatar.jpg'
            : 'https://temporary.example/cover.jpg',
        })),
      }),
    },
    value,
    'user-1',
  );
  assert.equal(result.avatar_url, 'https://temporary.example/avatar.jpg');
  assert.equal(result.cover_url, 'https://temporary.example/cover.jpg');
});

test('路径所有者不匹配时不签发且不会向存储 API 泄露资源 ID', async () => {
  let called = false;
  const cloud = {
    getTempFileURL: async () => {
      called = true;
      throw new Error('must not run');
    },
  };
  const forged = {
    ...application('user-1'),
    cover_file_id: 'cloud://env/club-applications/user-2/private.jpg',
  };
  const result = await resolveApplicationCover(cloud, forged, 'user-1');
  assert.equal(result.cover_url, '');
  assert.equal(called, false);
});

test('临时地址服务失败时安全降级为空地址且保留持久 file ID', async () => {
  const value = application('user-1');
  const result = await resolveApplicationCover(
    { getTempFileURL: async () => Promise.reject(new Error('temporary failure')) },
    value,
    'user-1',
  );
  assert.equal(result.cover_url, '');
  assert.equal(result.cover_file_id, value.cover_file_id);
});

test('51 个封面按每批最多 50 个解析', async () => {
  const calls = [];
  const cloud = {
    getTempFileURL: async ({ fileList }) => {
      calls.push(fileList);
      return {
        fileList: fileList.map((fileID) => ({
          fileID,
          tempFileURL: `https://temporary.example/${encodeURIComponent(fileID)}`,
        })),
      };
    },
  };
  const values = Array.from({ length: 51 }, (_, index) =>
    application(`user-${index}`, `cover-${index}.jpg`),
  );

  const result = await resolveApplicationCovers(cloud, values);

  assert.deepEqual(
    calls.map((fileList) => fileList.length),
    [50, 1],
  );
  assert.ok(result.every((item) => item.cover_url.startsWith('https://')));
});

test('单批解析失败只降级该批且后续批次继续解析', async () => {
  const calls = [];
  const cloud = {
    getTempFileURL: async ({ fileList }) => {
      calls.push(fileList);
      if (calls.length === 2) throw new Error('second batch failure');
      return {
        fileList: fileList.map((fileID) => ({
          fileID,
          tempFileURL: `https://temporary.example/${encodeURIComponent(fileID)}`,
        })),
      };
    },
  };
  const values = Array.from({ length: 101 }, (_, index) =>
    application(`user-${index}`, `cover-${index}.jpg`),
  );

  const result = await resolveApplicationCovers(cloud, values);

  assert.deepEqual(
    calls.map((fileList) => fileList.length),
    [50, 50, 1],
  );
  assert.ok(result.slice(0, 50).every((item) => item.cover_url.startsWith('https://')));
  assert.ok(result.slice(50, 100).every((item) => item.cover_url === ''));
  assert.match(result[100].cover_url, /^https:\/\//);
});

test('可加入俱乐部头像只返回 HTTPS，签名失败时 fail closed', async () => {
  const cloudId = 'cloud://env/clubs/private-avatar.jpg';
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const failed = await resolveJoinableClubAvatars(
      { getTempFileURL: async () => Promise.reject(new Error(`secret ${cloudId}`)) },
      [
        { id: 'club-1', avatar_url: cloudId },
        { id: 'club-2', avatar_url: 'http://unsafe.example/avatar.jpg' },
        { id: 'club-3', avatar_url: 'https://safe.example/avatar.jpg' },
      ],
    );
    assert.deepEqual(
      failed.map((item) => item.avatar_url),
      ['', '', 'https://safe.example/avatar.jpg'],
    );
  } finally {
    console.warn = originalWarn;
  }
});
