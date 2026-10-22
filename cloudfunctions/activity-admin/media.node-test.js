'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.PROFILE_MEDIA_PATH_SECRET = 'profile-media-secret-for-tests-32-bytes';
const { resolveActivityMedia, validateActivityMediaOwnership } = require('./media');

const canonicalMedia = (openid, category, extension = 'jpg') => {
  const alias = crypto
    .createHmac('sha256', process.env.PROFILE_MEDIA_PATH_SECRET)
    .update(openid)
    .digest('hex')
    .slice(0, 32);
  return `cloud://env/profile-canonical/${alias}/${category}/${'a'.repeat(64)}/${'b'.repeat(64)}.${extension}`;
};

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

test('活动图片仅接受 canonical 新写，并精确兼容未改动的存量值', () => {
  const openid = 'owner-openid';
  const legacyImage = 'https://legacy.example/activity.jpg';
  const legacyImage2 = 'cloud://env/profiles/activity-media/legacy-second.jpg';
  const legacyCover = 'cloud://env/profiles/activity-media/legacy-cover.jpg';
  const legacyQr = 'https://legacy.example/group-qr.jpg';
  const current = {
    images: [legacyImage, legacyImage2],
    cover_image: legacyCover,
    group_qr_code: legacyQr,
  };

  // 更新时允许每个对应字段保持存量 legacy 原值。
  assert.equal(validateActivityMediaOwnership(openid, { ...current }, current), true);
  // 新建不得写入任意外链。
  assert.equal(
    validateActivityMediaOwnership(openid, { images: ['https://evil.example/new.jpg'] }),
    false,
  );
  // 替换 cover / QR 的外链均不得绕过 canonical registry。
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { ...current, cover_image: 'https://evil.example/replacement.jpg' },
      current,
    ),
    false,
  );
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { ...current, group_qr_code: 'https://evil.example/replacement-qr.jpg' },
      current,
    ),
    false,
  );
  // legacy 数组中混入新值或换序都不是“原值保持”。
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { ...current, images: [legacyImage2, legacyImage] },
      current,
    ),
    false,
  );
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { ...current, images: [legacyImage, 'https://evil.example/injected.jpg'] },
      current,
    ),
    false,
  );
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { ...current, images: [legacyImage, canonicalMedia(openid, 'activity-image')] },
      current,
    ),
    false,
  );
  // 全量 canonical 图片及 GPX 独立 owner 路径正常通过。
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      {
        images: [canonicalMedia(openid, 'activity-image')],
        cover_image: canonicalMedia(openid, 'activity-image'),
        group_qr_code: canonicalMedia(openid, 'activity-group-qr'),
        route: {
          gpx_file_id: 'cloud://env/activity-routes/owner-openid/hash.gpx',
          generated_preview_file_id: canonicalMedia(openid, 'activity-route-preview', 'png'),
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

test('发布入口允许按字段精确保持存量 legacy 媒体', () => {
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
    true,
  );
  assert.equal(
    validateActivityMediaOwnership(
      openid,
      { status: 'published', images: [foreignFile, 'https://evil.example/injected.jpg'] },
      { status: 'draft', images: [foreignFile] },
    ),
    false,
  );
});

test('活动保存激活 owner/category 匹配的 staged canonical 媒体', async () => {
  process.env.PROFILE_MEDIA_PATH_SECRET = 'profile-media-secret-for-tests-32-bytes';
  const crypto = require('node:crypto');
  const { activateActivityMediaReferences } = require('./media');
  const owner = 'activity-owner';
  const alias = crypto
    .createHmac('sha256', process.env.PROFILE_MEDIA_PATH_SECRET)
    .update(owner)
    .digest('hex')
    .slice(0, 32);
  const fileId = `cloud://env/profile-canonical/${alias}/activity-image/${'a'.repeat(64)}/${'b'.repeat(64)}.jpg`;
  const activated = [];
  await activateActivityMediaReferences(
    {
      getProfileMediaByCanonical: async () => ({
        _id: 'media-1',
        canonical_file_id: fileId,
        owner_openid: owner,
        category: 'activity-image',
        status: 'unreferenced',
        security_status: 'pass',
      }),
      activateProfileMedia: async (id, at) => activated.push([id, at]),
    },
    owner,
    { images: [fileId], cover_image: fileId },
    new Date('2026-10-18T00:00:00.000Z'),
  );
  assert.equal(activated.length, 1);
  assert.equal(activated[0][0], 'media-1');
});

test('活动媒体只激活审核通过的新引用并兼容当前 active 存量引用', async () => {
  process.env.PROFILE_MEDIA_PATH_SECRET = 'profile-media-secret-for-tests-32-bytes';
  const crypto = require('node:crypto');
  const { activateActivityMediaReferences } = require('./media');
  const owner = 'activity-security-owner';
  const alias = crypto
    .createHmac('sha256', process.env.PROFILE_MEDIA_PATH_SECRET)
    .update(owner)
    .digest('hex')
    .slice(0, 32);
  const fileId = `cloud://env/profile-canonical/${alias}/activity-image/${'c'.repeat(64)}/${'d'.repeat(64)}.jpg`;
  const record = {
    _id: 'media-security',
    canonical_file_id: fileId,
    owner_openid: owner,
    category: 'activity-image',
    status: 'unreferenced',
    security_status: 'pending',
  };
  const tx = {
    getProfileMediaByCanonical: async () => record,
    activateProfileMedia: async () => assert.fail('pending 媒体不得激活'),
  };

  await assert.rejects(
    activateActivityMediaReferences(
      tx,
      owner,
      { images: [fileId] },
      new Date('2026-10-18T00:00:00.000Z'),
    ),
    { code: 'MEDIA_SECURITY_PENDING' },
  );

  record.status = 'active';
  delete record.security_status;
  await activateActivityMediaReferences(
    tx,
    owner,
    { images: [fileId] },
    new Date('2026-10-18T00:00:00.000Z'),
    { images: [fileId] },
  );
  await assert.rejects(
    activateActivityMediaReferences(
      tx,
      owner,
      { images: [fileId] },
      new Date('2026-10-18T00:00:00.000Z'),
      { images: [] },
    ),
    { code: 'MEDIA_SECURITY_REQUIRED' },
  );
});
