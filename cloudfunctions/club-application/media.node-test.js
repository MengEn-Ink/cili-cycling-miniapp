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

test('俱乐部保存激活不同用途的 staged canonical 媒体', async () => {
  process.env.PROFILE_MEDIA_PATH_SECRET = 'profile-media-secret-for-tests-32-bytes';
  const crypto = require('node:crypto');
  const { activateClubMediaReferences } = require('./media');
  const owner = 'club-owner';
  const alias = crypto
    .createHmac('sha256', process.env.PROFILE_MEDIA_PATH_SECRET)
    .update(owner)
    .digest('hex')
    .slice(0, 32);
  const fileId = (category, hash) =>
    `cloud://env/profile-canonical/${alias}/${category}/${hash.repeat(64)}/${hash.repeat(64)}.jpg`;
  const avatar = fileId('club-avatar', 'a');
  const cover = fileId('club-cover', 'b');
  const activated = [];
  await activateClubMediaReferences(
    {
      getProfileMediaByCanonical: async (canonical, mediaOwner, category) => ({
        _id: category,
        canonical_file_id: canonical,
        owner_openid: mediaOwner,
        category,
        status: 'unreferenced',
      }),
      activateProfileMedia: async (id) => activated.push(id),
    },
    owner,
    { avatar_file_id: avatar, cover_file_id: cover },
    new Date('2026-10-18T00:00:00.000Z'),
  );
  assert.deepEqual(activated, ['club-avatar', 'club-cover']);
});

test('club response cannot re-sign personal profile assets from an old club snapshot or log private errors', async () => {
  const personal =
    'cloud://env/profile-canonical/' +
    'a'.repeat(32) +
    '/profile-avatar/' +
    'b'.repeat(64) +
    '/' +
    'c'.repeat(64) +
    '.jpg';
  const calls = [];
  const result = await resolveJoinableClubAvatars(
    {
      getTempFileURL: async ({ fileList }) => {
        calls.push(fileList);
        return {
          fileList: fileList.map((fileID) => ({
            fileID,
            status: 0,
            tempFileURL: 'https://temporary.example/private.jpg',
          })),
        };
      },
    },
    [{ id: 'club', avatar_url: personal, cover_file_id: personal }],
  );
  assert.deepEqual(calls, []);
  assert.equal(result[0].avatar_url, '');
  assert.equal(result[0].cover_url, '');
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    await resolveJoinableClubAvatars(
      {
        getTempFileURL: async () => {
          throw new Error('private-file-id-and-phone-13812345678');
        },
      },
      [{ id: 'club', avatar_url: 'cloud://env/clubs/avatar.jpg' }],
    );
  } finally {
    console.warn = original;
  }
  assert.doesNotMatch(JSON.stringify(warnings), /13812345678|private-file/);
});

test('club response rejects legacy personal uploads and encoded personal URLs but keeps club media', async () => {
  const alias = 'a'.repeat(32);
  const privatePaths = [
    `cloud://env/profiles/${alias}/123e4567-e89b-42d3-a456-426614174000.jpg`,
    `cloud://env/profiles/${alias}/other/123e4567-e89b-42d3-a456-426614174000.jpg`,
    `https://temporary.example/profiles/${alias}/ride/photo.jpg`,
    `https://temporary.example/%70rofiles/${alias}/profile-avatar/photo.jpg`,
  ];
  const clubMedia = `cloud://env/profiles/${alias}/club-avatar/photo.jpg`;
  const calls = [];
  const result = await resolveJoinableClubAvatars(
    {
      getTempFileURL: async ({ fileList }) => {
        calls.push(fileList);
        return {
          fileList: fileList.map((fileID) => ({
            fileID,
            status: 0,
            tempFileURL: 'https://temporary.example/club.jpg',
          })),
        };
      },
    },
    [
      ...privatePaths.map((value, index) => ({
        id: `private-${index}`,
        avatar_url: value,
        avatar_file_id: value,
        cover_file_id: value,
      })),
      { id: 'club', avatar_url: clubMedia },
    ],
  );
  assert.deepEqual(calls, [[clubMedia]]);
  for (const value of result.slice(0, privatePaths.length)) {
    assert.equal(value.avatar_url, '');
    assert.equal(value.avatar_file_id, '');
    assert.equal(value.cover_file_id, '');
    assert.equal(value.cover_url, '');
  }
  assert.equal(result.at(-1).avatar_url, 'https://temporary.example/club.jpg');
});
