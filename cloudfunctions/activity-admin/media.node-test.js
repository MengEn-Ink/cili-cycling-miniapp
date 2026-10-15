'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveActivityMedia, validateActivityMediaOwnership } = require('./media');

test('管理端详情由云函数签发活动图片、群二维码与路线图地址', async () => {
  const calls = [];
  const cloud = {
    getTempFileURL: async ({ fileList }) => {
      calls.push(fileList);
      return {
        fileList: fileList.map((fileID) => ({
          fileID,
          tempFileURL: `https://signed.example/${encodeURIComponent(fileID)}`,
        })),
      };
    },
  };
  const activity = {
    status: 'published',
    images: ['cloud://cover.jpg', 'https://public.example/photo.jpg'],
    cover_image: 'cloud://legacy-cover.jpg',
    group_qr_code: 'cloud://group.jpg',
    route: { generated_preview_file_id: 'cloud://route.png' },
  };

  const result = await resolveActivityMedia(cloud, activity);

  assert.deepEqual(calls, [
    ['cloud://cover.jpg', 'cloud://legacy-cover.jpg', 'cloud://group.jpg', 'cloud://route.png'],
  ]);
  assert.deepEqual(result.image_preview_urls, [
    'https://signed.example/cloud%3A%2F%2Fcover.jpg',
    'https://public.example/photo.jpg',
  ]);
  assert.equal(result.cover_preview_url, 'https://signed.example/cloud%3A%2F%2Flegacy-cover.jpg');
  assert.equal(result.group_qr_preview_url, 'https://signed.example/cloud%3A%2F%2Fgroup.jpg');
  assert.equal(
    result.route.generated_preview_url,
    'https://signed.example/cloud%3A%2F%2Froute.png',
  );
  assert.deepEqual(activity, {
    status: 'published',
    images: ['cloud://cover.jpg', 'https://public.example/photo.jpg'],
    cover_image: 'cloud://legacy-cover.jpg',
    group_qr_code: 'cloud://group.jpg',
    route: { generated_preview_file_id: 'cloud://route.png' },
  });
});

test('单个文件未签发或签发接口失败时不阻断管理端详情', async () => {
  const partial = await resolveActivityMedia(
    {
      getTempFileURL: async () => ({
        fileList: [
          { fileID: 'cloud://cover.jpg', tempFileURL: 'https://signed.example/cover.jpg' },
          { fileID: 'cloud://group.jpg', tempFileURL: '' },
        ],
      }),
    },
    {
      status: 'published',
      images: ['cloud://cover.jpg', 'cloud://missing.jpg'],
      group_qr_code: 'cloud://group.jpg',
    },
  );
  assert.deepEqual(partial.image_preview_urls, ['https://signed.example/cover.jpg', '']);
  assert.equal(partial.group_qr_preview_url, '');

  const failed = await resolveActivityMedia(
    { getTempFileURL: async () => Promise.reject(new Error('temporary failure')) },
    { status: 'published', images: ['cloud://cover.jpg'], group_qr_code: 'cloud://group.jpg' },
  );
  assert.deepEqual(failed.image_preview_urls, ['']);
  assert.equal(failed.group_qr_preview_url, '');
});

test('保存仅接受当前用户目录的新媒体并兼容活动已有历史文件', () => {
  const openid = 'owner-openid';
  const current = {
    images: ['cloud://env/profiles/activity-media/legacy.jpg'],
    cover_image: 'cloud://env/profiles/activity-media/legacy.jpg',
  };
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      {
        images: [
          'cloud://env/profiles/activity-media/legacy.jpg',
          'cloud://env/profiles/activity-media/owner-openid/new.jpg',
        ],
        group_qr_code: 'cloud://env/profiles/activity-group-qr/owner-openid/group.jpg',
        route: {
          gpx_file_id: 'cloud://env/activity-routes/owner-openid/hash.gpx',
          generated_preview_file_id: 'cloud://env/activity-routes/owner-openid/hash.png',
        },
      },
      current,
    ),
    true,
  );
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { images: ['cloud://env/profiles/activity-media/other-openid/private.jpg'] },
      current,
    ),
    false,
  );
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { group_qr_code: 'cloud://env/another-domain/private.jpg' },
      current,
    ),
    false,
  );
});

test('草稿详情不签发非当前用户目录的历史 fileId', async () => {
  const requested = [];
  const result = await resolveActivityMedia(
    {
      getTempFileURL: async ({ fileList }) => {
        requested.push(...fileList);
        return {
          fileList: fileList.map((fileID) => ({
            fileID,
            tempFileURL: `https://signed.example/${encodeURIComponent(fileID)}`,
          })),
        };
      },
    },
    {
      status: 'draft',
      images: [
        'cloud://env/profiles/activity-media/owner-openid/owned.jpg',
        'cloud://env/profiles/activity-media/other-openid/private.jpg',
        'cloud://env/profiles/activity-media/legacy.jpg',
      ],
      group_qr_code: 'cloud://env/profiles/activity-group-qr/owner-openid/group.jpg',
    },
    'owner-openid',
  );

  assert.deepEqual(requested, [
    'cloud://env/profiles/activity-media/owner-openid/owned.jpg',
    'cloud://env/profiles/activity-group-qr/owner-openid/group.jpg',
  ]);
  assert.match(result.image_preview_urls[0], /^https:\/\//);
  assert.equal(result.image_preview_urls[1], '');
  assert.equal(result.image_preview_urls[2], '');
  assert.match(result.group_qr_preview_url, /^https:\/\//);
});

test('历史草稿发布前必须重新验证媒体归属', () => {
  const openid = 'owner-openid';
  const foreignFile = 'cloud://env/profiles/activity-media/other-openid/private.jpg';
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { status: 'draft', images: [foreignFile] },
      { status: 'draft', images: [foreignFile] },
    ),
    true,
  );
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { status: 'published', images: [foreignFile] },
      { status: 'draft', images: [foreignFile] },
    ),
    false,
  );
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { status: 'published', images: [foreignFile] },
      { status: 'published', images: [foreignFile] },
    ),
    true,
  );
});
