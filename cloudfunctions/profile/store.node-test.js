'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

let subject = {};
try {
  subject = require('./store');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const createProfileStore = subject.createProfileStore || (() => ({}));
const missing = subject.missing || (() => true);
const profileReferencesMedia = subject.profileReferencesMedia || (() => false);

test('仅明确文档不存在可降级，通用 -502001 数据库错误必须抛出', () => {
  assert.equal(missing({ errCode: -502001, errMsg: 'document with _id x does not exist' }), true);
  assert.equal(missing({ errCode: -502001, errMsg: 'database request fail' }), false);
  assert.equal(missing({ errCode: -1, errMsg: 'document with _id x does not exist' }), true);
  assert.equal(missing({ errCode: -1, errMsg: 'not found' }), false);
  assert.equal(missing({ errCode: -1, errMsg: 'database request fail' }), false);
});

test('profile 媒体引用判定包含显式背景槽位', () => {
  const fileId = 'cloud://env/profiles/owner/background.jpg';
  assert.equal(
    profileReferencesMedia(
      { background_photo: { file_id: fileId, category: 'other' }, photos: [] },
      fileId,
    ),
    true,
  );
});

function fakeDb(seed) {
  const updates = [];
  const sets = [];
  const gets = [];
  let transactions = 0;
  const serverDate = new Date('2026-09-29T12:00:00.000Z');
  const collection = (name) => ({
    doc: (id) => ({
      get: async () => {
        gets.push({ name, id });
        return { data: seed[name]?.[id] };
      },
      update: async ({ data }) => updates.push({ name, id, data }),
      set: async ({ data }) => sets.push({ name, id, data }),
    }),
    where: (query) => ({
      limit: () => ({
        get: async () => ({
          data: Object.values(seed[name] || {}).filter((record) =>
            Object.entries(query).every(([key, value]) => record[key] === value),
          ),
        }),
      }),
    }),
  });
  return {
    updates,
    sets,
    gets,
    get transactions() {
      return transactions;
    },
    serverDate: () => serverDate,
    collection,
    runTransaction: (work) => {
      transactions += 1;
      return work({ collection });
    },
  };
}

function statefulDb(seed) {
  const REMOVE = Symbol('remove');
  const serverDate = new Date('2026-09-29T12:00:00.000Z');
  const state = Object.fromEntries(
    Object.entries(seed).map(([name, records]) => [name, new Map(Object.entries(records))]),
  );
  const ensure = (name) => (state[name] ||= new Map());
  const apply = (current, data) => {
    const next = { ...current };
    for (const [key, value] of Object.entries(data)) {
      if (value === REMOVE) delete next[key];
      else next[key] = value;
    }
    return next;
  };
  const collection = (name) => ({
    doc: (id) => ({
      get: async () => ({ data: ensure(name).get(id) }),
      set: async ({ data }) => ensure(name).set(id, { _id: id, ...data }),
      update: async ({ data }) => ensure(name).set(id, apply(ensure(name).get(id), data)),
    }),
  });
  return {
    state,
    db: {
      command: { remove: () => REMOVE },
      serverDate: () => serverDate,
      runTransaction: (work) => work({ collection }),
      collection,
    },
  };
}

test('客户端上传 intent 先持久化，registerMedia 再原子登记并完成 intent', async () => {
  const {
    canonicalMediaBinding,
    canonicalMediaPath,
    canonicalUploadIntent,
    clientUploadIntent,
    mediaDocumentId,
    mediaOwnerPrefix,
    mediaRegistration,
  } = require('./core');
  const owner = 'owner';
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const now = new Date('2026-09-30T00:00:00.000Z');
  const cloudPath = `${mediaOwnerPrefix(owner, secret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const fileId = `cloud://env/${cloudPath}`;
  const fixture = statefulDb({ profile_media: {}, profile_media_imports: {} });
  const store = createProfileStore(fixture.db);
  const intent = clientUploadIntent(owner, cloudPath, secret, now);
  const sha256 = 'a'.repeat(64);
  const canonicalPath = canonicalMediaPath(owner, fileId, sha256, 'jpg', secret);
  const canonicalFileId = `cloud://env/${canonicalPath}`;
  const binding = canonicalMediaBinding(
    owner,
    fileId,
    canonicalFileId,
    { sha256, size: 5, mime: 'image/jpeg', extension: 'jpg' },
    secret,
  );
  const canonicalIntent = canonicalUploadIntent(
    owner,
    fileId,
    { sha256, size: 5, mime: 'image/jpeg', extension: 'jpg' },
    secret,
    now,
  );

  await store.prepareClientUpload(owner, intent, secret);
  assert.equal(fixture.state.profile_media_imports.get(intent._id).status, 'prepared');
  await store.prepareCanonicalUpload(owner, intent._id, canonicalIntent, secret);

  const registered = await store.completeClientMedia(
    owner,
    fileId,
    intent._id,
    canonicalIntent._id,
    binding,
    secret,
    (existing) =>
      mediaRegistration(fileId, 'other', 'wechat', owner, secret, now, existing, binding),
    now,
  );

  assert.equal(registered.file_id, fileId);
  assert.equal(fixture.state.profile_media.get(mediaDocumentId(fileId)).status, 'unreferenced');
  assert.deepEqual(fixture.state.profile_media_imports.get(intent._id), {
    ...intent,
    canonical_intent_id: canonicalIntent._id,
    canonical_path: canonicalIntent.cloud_path,
    sha256,
    size: 5,
    mime: 'image/jpeg',
    status: 'uploaded',
    file_id: fileId,
    media_id: mediaDocumentId(fileId),
    canonical_file_id: canonicalFileId,
    completed_at: now,
    cleanup_after: new Date('2026-10-01T00:00:00.000Z'),
    updated_at: fixture.db.serverDate(),
  });
  assert.equal(fixture.state.profile_media_imports.get(canonicalIntent._id).status, 'completed');
});

test('存量媒体补 canonical 时 source intent 立即绑定已知对象与 media 记录', async () => {
  const {
    canonicalMediaPath,
    canonicalUploadIntent,
    clientUploadIntentId,
    mediaDocumentId,
    mediaOwnerPrefix,
  } = require('./core');
  const owner = 'owner';
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const now = new Date('2026-09-30T00:00:00.000Z');
  const cloudPath = `${mediaOwnerPrefix(owner, secret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const fileId = `cloud://env/${cloudPath}`;
  const sha256 = 'b'.repeat(64);
  const canonicalPath = canonicalMediaPath(owner, fileId, sha256, 'jpg', secret);
  const canonicalIntent = canonicalUploadIntent(
    owner,
    fileId,
    { sha256, size: 5, mime: 'image/jpeg', extension: 'jpg' },
    secret,
    now,
  );
  const fixture = statefulDb({ profile_media_imports: {} });
  const store = createProfileStore(fixture.db);

  await store.prepareCanonicalUpload(
    owner,
    clientUploadIntentId(cloudPath),
    canonicalIntent,
    secret,
    now,
  );

  const sourceIntent = fixture.state.profile_media_imports.get(clientUploadIntentId(cloudPath));
  assert.equal(sourceIntent.file_id, fileId);
  assert.equal(sourceIntent.media_id, mediaDocumentId(fileId));
  assert.equal(sourceIntent.canonical_path, canonicalPath);
});

test('存量 active canonical 响应未知经 cleanup 后可用确定性 intents 安全重开', async () => {
  const {
    canonicalMediaBinding,
    canonicalUploadIntent,
    clientUploadIntentId,
    mediaDocumentId,
    mediaOwnerPrefix,
    mediaRegistration,
  } = require('./core');
  const { createCleanupStore } = require('../profile-media-cleanup/store');
  const owner = 'owner';
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const createdAt = new Date('2026-09-30T00:00:00.000Z');
  const cleanupAt = new Date('2026-09-30T00:31:00.000Z');
  const confirmAt = new Date('2026-09-30T00:37:00.000Z');
  const retryAt = new Date('2026-09-30T00:40:00.000Z');
  const cloudPath = `${mediaOwnerPrefix(owner, secret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const fileId = `cloud://env/${cloudPath}`;
  const mediaId = mediaDocumentId(fileId);
  const verified = { sha256: 'c'.repeat(64), size: 5, mime: 'image/jpeg', extension: 'jpg' };
  const initialCanonical = canonicalUploadIntent(owner, fileId, verified, secret, createdAt);
  const sourceIntentId = clientUploadIntentId(cloudPath);
  const fixture = statefulDb({
    profiles: { owner: { _id: owner, avatar_file_id: fileId, avatar_source: 'custom' } },
    profile_media: {
      [mediaId]: {
        _id: mediaId,
        file_id: fileId,
        owner_openid: owner,
        category: 'other',
        origin: 'custom',
        status: 'active',
      },
    },
    profile_media_imports: {},
  });
  const profileStore = createProfileStore(fixture.db);
  const cleanupStore = createCleanupStore(fixture.db, secret);

  await profileStore.prepareCanonicalUpload(
    owner,
    sourceIntentId,
    initialCanonical,
    secret,
    createdAt,
  );
  const sourceClaim = await cleanupStore.claimImportIntent(sourceIntentId, {
    leaseId: 'source-cleanup',
    now: cleanupAt,
  });
  assert.equal(sourceClaim.completed, true);
  assert.equal(fixture.state.profile_media_imports.get(sourceIntentId).status, 'completed');

  const canonicalClaim = await cleanupStore.claimImportIntent(initialCanonical._id, {
    leaseId: 'canonical-cleanup',
    now: cleanupAt,
  });
  assert.equal(canonicalClaim.resolve_target, true);
  const canonicalFileId = `cloud://env/${initialCanonical.cloud_path}`;
  assert.equal(
    await cleanupStore.attachImportDeleteTarget(initialCanonical._id, {
      leaseId: 'canonical-cleanup',
      now: cleanupAt,
      fileId: canonicalFileId,
    }),
    true,
  );
  assert.equal(
    await cleanupStore.markImportDeleted(initialCanonical._id, {
      leaseId: 'canonical-cleanup',
      now: cleanupAt,
      deferCompletion: true,
      confirmAfter: confirmAt,
    }),
    true,
  );
  const confirmClaim = await cleanupStore.claimImportIntent(initialCanonical._id, {
    leaseId: 'canonical-confirm',
    now: confirmAt,
  });
  assert.equal(confirmClaim.confirm_delete, true);
  assert.equal(
    await cleanupStore.markImportDeleted(initialCanonical._id, {
      leaseId: 'canonical-confirm',
      now: confirmAt,
      deferCompletion: false,
    }),
    true,
  );
  assert.equal(fixture.state.profile_media_imports.get(initialCanonical._id).status, 'deleted');

  const retryCanonical = canonicalUploadIntent(owner, fileId, verified, secret, retryAt);
  await profileStore.prepareCanonicalUpload(owner, sourceIntentId, retryCanonical, secret, retryAt);

  assert.equal(fixture.state.profile_media_imports.get(sourceIntentId).status, 'prepared');
  assert.equal(fixture.state.profile_media_imports.get(retryCanonical._id).status, 'prepared');

  const binding = canonicalMediaBinding(owner, fileId, canonicalFileId, verified, secret);
  await profileStore.completeClientMedia(
    owner,
    fileId,
    sourceIntentId,
    retryCanonical._id,
    binding,
    secret,
    (existing) =>
      mediaRegistration(fileId, 'other', 'custom', owner, secret, retryAt, existing, binding),
    retryAt,
  );

  assert.equal(fixture.state.profile_media.get(mediaId).canonical_file_id, canonicalFileId);
  assert.equal(fixture.state.profile_media_imports.get(sourceIntentId).status, 'uploaded');
  assert.equal(fixture.state.profile_media_imports.get(retryCanonical._id).status, 'completed');
});

test('setAvatar 事务重读 owner registry 并原子激活新头像、降级旧头像', async () => {
  const { mediaDocumentId, mediaOwnerPrefix } = require('./core');
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const owner = 'owner';
  const prefix = mediaOwnerPrefix(owner, secret);
  const previousFileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const nextFileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const previousId = mediaDocumentId(previousFileId);
  const nextId = mediaDocumentId(nextFileId);
  const db = fakeDb({
    profiles: {
      owner: {
        _id: owner,
        nickname: '并发昵称',
        avatar_file_id: previousFileId,
        avatar_source: 'custom',
      },
    },
    profile_media: {
      [previousId]: {
        _id: previousId,
        file_id: previousFileId,
        owner_openid: owner,
        category: 'other',
        origin: 'custom',
        status: 'active',
      },
      [nextId]: {
        _id: nextId,
        file_id: nextFileId,
        owner_openid: owner,
        category: 'other',
        origin: 'wechat',
        status: 'unreferenced',
      },
    },
  });
  const now = new Date('2026-09-29T13:00:00.000Z');

  const result = await createProfileStore(db).setAvatar(owner, 'wechat', nextFileId, secret, now);

  assert.equal(db.transactions, 1);
  assert.deepEqual(db.gets, [
    { name: 'profiles', id: owner },
    { name: 'profile_media', id: nextId },
    { name: 'profile_media', id: previousId },
  ]);
  assert.deepEqual(result, {
    nickname: '并发昵称',
    avatar_file_id: nextFileId,
    avatar_source: 'wechat',
    avatar_revision: 1,
    avatar_visibility: 'public',
    avatar_visibility_revision: 1,
    updated_at: db.serverDate(),
  });
  assert.deepEqual(db.sets, [{ name: 'profiles', id: owner, data: result }]);
  assert.deepEqual(db.updates, [
    {
      name: 'profile_media',
      id: nextId,
      data: { status: 'active', referenced_at: db.serverDate(), cleanup_after: null },
    },
    {
      name: 'profile_media',
      id: previousId,
      data: {
        status: 'unreferenced',
        referenced_at: null,
        cleanup_after: new Date('2026-09-30T13:00:00.000Z'),
        delete_lease_id: '',
        updated_at: db.serverDate(),
      },
    },
  ]);
});

test('setAvatar 不降级仍被 photos 引用的旧头像', async () => {
  const { mediaDocumentId, mediaOwnerPrefix } = require('./core');
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const owner = 'owner';
  const prefix = mediaOwnerPrefix(owner, secret);
  const previousFileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const nextFileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const previousId = mediaDocumentId(previousFileId);
  const nextId = mediaDocumentId(nextFileId);
  const db = fakeDb({
    profiles: {
      owner: {
        _id: owner,
        avatar_file_id: previousFileId,
        avatar_source: 'custom',
        photos: [{ file_id: previousFileId, category: 'other' }],
      },
    },
    profile_media: {
      [previousId]: {
        _id: previousId,
        file_id: previousFileId,
        owner_openid: owner,
        category: 'other',
        origin: 'custom',
        status: 'active',
      },
      [nextId]: {
        _id: nextId,
        file_id: nextFileId,
        owner_openid: owner,
        category: 'other',
        origin: 'wechat',
        status: 'unreferenced',
      },
    },
  });

  await createProfileStore(db).setAvatar(owner, 'wechat', nextFileId, secret);

  assert.equal(
    db.updates.some((update) => update.id === previousId && update.data.status === 'unreferenced'),
    false,
  );
});

test('setAvatar 不降级仍被 background_photo 引用的旧头像', async () => {
  const { mediaDocumentId, mediaOwnerPrefix } = require('./core');
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const owner = 'owner';
  const prefix = mediaOwnerPrefix(owner, secret);
  const previousFileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const nextFileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174001.jpg`;
  const previousId = mediaDocumentId(previousFileId);
  const nextId = mediaDocumentId(nextFileId);
  const db = fakeDb({
    profiles: {
      owner: {
        _id: owner,
        avatar_file_id: previousFileId,
        avatar_source: 'custom',
        background_photo: { file_id: previousFileId, category: 'other' },
        photos: [],
      },
    },
    profile_media: {
      [previousId]: {
        _id: previousId,
        file_id: previousFileId,
        owner_openid: owner,
        category: 'other',
        origin: 'custom',
        status: 'active',
      },
      [nextId]: {
        _id: nextId,
        file_id: nextFileId,
        owner_openid: owner,
        category: 'other',
        origin: 'wechat',
        status: 'unreferenced',
      },
    },
  });

  await createProfileStore(db).setAvatar(owner, 'wechat', nextFileId, secret);

  assert.equal(
    db.updates.some((update) => update.id === previousId && update.data.status === 'unreferenced'),
    false,
  );
});

test('setAvatar 为 owner-bound custom 存量 registry 安全回填缺失 origin', async () => {
  const { mediaDocumentId, mediaOwnerPrefix } = require('./core');
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const owner = 'owner';
  const fileId = `cloud://env/${mediaOwnerPrefix(owner, secret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const mediaId = mediaDocumentId(fileId);
  const db = fakeDb({
    profiles: { owner: { _id: owner } },
    profile_media: {
      [mediaId]: {
        _id: mediaId,
        file_id: fileId,
        owner_openid: owner,
        category: 'other',
        status: 'unreferenced',
      },
    },
  });

  await createProfileStore(db).setAvatar(owner, 'custom', fileId, secret);

  assert.deepEqual(db.updates[0], {
    name: 'profile_media',
    id: mediaId,
    data: {
      origin: 'custom',
      status: 'active',
      referenced_at: db.serverDate(),
      cleanup_after: null,
    },
  });
});

test('手机号合并在事务内只 update phone 字段并保留并发 profile/media 内容', async () => {
  const current = {
    _id: 'owner',
    nickname: '并发昵称',
    photos: [{ file_id: 'cloud://env/photo.jpg', category: 'other' }],
  };
  const db = fakeDb({ profiles: { owner: current } });
  const fields = {
    phone_cipher: { ciphertext: 'encrypted' },
    phone_masked: '138****5678',
    phone_source: 'wechat',
    phone_verified: true,
  };
  const result = await createProfileStore(db).mergePhone('owner', fields);
  assert.equal(db.updates.length, 1);
  assert.deepEqual(db.updates[0], {
    name: 'profiles',
    id: 'owner',
    data: { ...fields, updated_at: db.serverDate() },
  });
  assert.deepEqual(db.sets, []);
  assert.deepEqual(result, { ...current, ...fields, updated_at: db.serverDate() });
});

test('setAvatar 以 canonical fileId 写入业务资料并只激活 source registry', async () => {
  const { canonicalMediaPath, mediaDocumentId, mediaOwnerPrefix } = require('./core');
  const secret = 'profile-media-secret-for-tests-32-bytes';
  const owner = 'owner';
  const sourceFileId = `cloud://env/${mediaOwnerPrefix(owner, secret)}profile-avatar/123e4567-e89b-42d3-a456-426614174001.jpg`;
  const sha256 = 'f'.repeat(64);
  const canonicalFileId = `cloud://env/${canonicalMediaPath(
    owner,
    sourceFileId,
    sha256,
    'jpg',
    secret,
    'profile-avatar',
  )}`;
  const mediaId = mediaDocumentId(sourceFileId);
  const db = fakeDb({
    profiles: { owner: { _id: owner } },
    profile_media: {
      [mediaId]: {
        _id: mediaId,
        file_id: sourceFileId,
        source_file_id: sourceFileId,
        canonical_file_id: canonicalFileId,
        canonical_category: 'profile-avatar',
        sha256,
        size: 5,
        mime: 'image/jpeg',
        owner_openid: owner,
        category: 'profile-avatar',
        origin: 'wechat',
        status: 'unreferenced',
      },
    },
  });

  const result = await createProfileStore(db).setAvatar(owner, 'wechat', canonicalFileId, secret);

  assert.equal(result.avatar_file_id, canonicalFileId);
  assert.notEqual(result.avatar_file_id, sourceFileId);
  assert.equal(db.sets[0].data.avatar_file_id, canonicalFileId);
  assert.equal(db.updates[0].id, mediaId);
  assert.equal(db.updates[0].data.status, 'active');
});
