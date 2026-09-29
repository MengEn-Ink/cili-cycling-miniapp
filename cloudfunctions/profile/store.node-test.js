'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let subject = {};
try {
  subject = require('./store');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const createProfileStore = subject.createProfileStore || (() => ({}));

function fakeDb(seed) {
  const updates = [];
  const sets = [];
  const serverDate = new Date('2026-09-29T12:00:00.000Z');
  const collection = (name) => ({
    doc: (id) => ({
      get: async () => ({ data: seed[name]?.[id] }),
      update: async ({ data }) => updates.push({ name, id, data }),
      set: async ({ data }) => sets.push({ name, id, data }),
    }),
  });
  return {
    updates,
    sets,
    serverDate: () => serverDate,
    collection,
    runTransaction: (work) => work({ collection }),
  };
}

test('registerMedia 事务内重读且不把 concurrent active 覆盖回 unreferenced', async () => {
  const active = {
    _id: 'media-1',
    file_id: 'cloud://env/photo.jpg',
    owner_openid: 'owner',
    category: 'other',
    status: 'active',
  };
  const db = fakeDb({ profile_media: { 'media-1': active } });
  const result = await createProfileStore(db).registerMedia('media-1', (existing) => {
    assert.equal(existing, active);
    return existing;
  });
  assert.equal(result, active);
  assert.deepEqual(db.sets, []);
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
