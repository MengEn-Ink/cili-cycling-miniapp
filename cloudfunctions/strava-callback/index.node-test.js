'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCredentialStore } = require('./index');

function memoryDatabase({
  failProfileSet = false,
  failProfileGet = false,
  failCredentialGet = false,
  failMediaGet = false,
  failStateGet = false,
} = {}) {
  const state = {
    oauth_states: new Map(),
    strava_credentials: new Map([['openid', { athlete_id: 'old-athlete' }]]),
    strava_snapshots: new Map([['openid', { athlete_id: 'old-athlete' }]]),
    profiles: new Map([['openid', { _id: 'openid', nickname: 'Rider' }]]),
    profile_media: new Map(),
  };
  let transactionCount = 0;
  const calls = [];
  const collectionFor = (target, name, scope) => ({
    doc: (id) => ({
      get: async () => {
        calls.push({ scope, operation: 'get', collection: name, id });
        if (failProfileGet && name === 'profiles')
          throw { errCode: -502001, errMsg: 'database request fail: profile read failed' };
        if (failCredentialGet && name === 'strava_credentials')
          throw { errCode: -502001, errMsg: 'database request fail: credential read failed' };
        if (failMediaGet && name === 'profile_media')
          throw { errCode: -502001, errMsg: 'database request fail: media read failed' };
        if (failStateGet && name === 'oauth_states')
          throw { errCode: -502001, errMsg: 'database request fail: state read failed' };
        return { data: target[name].get(id) };
      },
      set: async ({ data }) => {
        calls.push({ scope, operation: 'set', collection: name, id });
        if (failProfileSet && name === 'profiles') throw new Error('profile update failed');
        target[name].set(id, { ...data });
      },
      remove: async () => {
        calls.push({ scope, operation: 'remove', collection: name, id });
        target[name].delete(id);
      },
      update: async ({ data }) => {
        calls.push({ scope, operation: 'update', collection: name, id });
        target[name].set(id, { ...target[name].get(id), ...data });
      },
    }),
  });
  return {
    state,
    get transactionCount() {
      return transactionCount;
    },
    calls,
    serverDate: () => new Date('2026-09-29T04:00:00.000Z'),
    collection: (name) => collectionFor(state, name, 'db'),
    runTransaction: async (work) => {
      transactionCount += 1;
      calls.push({ scope: 'db', operation: 'transaction' });
      const draft = {
        oauth_states: new Map(state.oauth_states),
        strava_credentials: new Map(state.strava_credentials),
        strava_snapshots: new Map(state.strava_snapshots),
        profiles: new Map(state.profiles),
        profile_media: new Map(state.profile_media),
      };
      const tx = { collection: (name) => collectionFor(draft, name, 'tx') };
      const result = await work(tx);
      state.strava_credentials = draft.strava_credentials;
      state.oauth_states = draft.oauth_states;
      state.strava_snapshots = draft.strava_snapshots;
      state.profiles = draft.profiles;
      state.profile_media = draft.profile_media;
      return result;
    },
  };
}

test('consumeState 仅把明确 not-found 当缺失，通用数据库错误必须 fail closed', async () => {
  const database = memoryDatabase({ failStateGet: true });
  await assert.rejects(createCredentialStore(database).consumeState('state-hash'), {
    errCode: -502001,
  });
});

test('保存新 OAuth credential 在同一事务删除旧账号 snapshot', async () => {
  const database = memoryDatabase();
  const store = createCredentialStore(database);

  await store.saveCredential({
    _id: 'openid',
    openid: 'openid',
    athlete_id: 'new-athlete',
    athlete_avatar_url: 'https://dgalywyr863hv.cloudfront.net/avatar.jpg',
  });

  assert.equal(database.transactionCount, 1);
  assert.equal(database.state.strava_credentials.get('openid').athlete_id, 'new-athlete');
  assert.equal(database.state.strava_credentials.get('openid').credential_generation, 1);
  assert.equal(
    database.state.strava_credentials.get('openid').athlete_avatar_url,
    'https://dgalywyr863hv.cloudfront.net/avatar.jpg',
  );
  assert.equal(database.state.strava_snapshots.has('openid'), false);
  assert.deepEqual(database.state.profiles.get('openid'), {
    nickname: 'Rider',
    strava: { status: 'connected' },
    updated_at: new Date('2026-09-29T04:00:00.000Z'),
  });
  assert.deepEqual(database.calls, [
    { scope: 'db', operation: 'transaction' },
    { scope: 'tx', operation: 'get', collection: 'profiles', id: 'openid' },
    { scope: 'tx', operation: 'get', collection: 'strava_credentials', id: 'openid' },
    { scope: 'tx', operation: 'set', collection: 'strava_credentials', id: 'openid' },
    { scope: 'tx', operation: 'remove', collection: 'strava_snapshots', id: 'openid' },
    { scope: 'tx', operation: 'set', collection: 'profiles', id: 'openid' },
  ]);
});

test('每次保存 OAuth credential 都推进 generation 并清除旧 import lease', async () => {
  const database = memoryDatabase();
  database.state.strava_credentials.set('openid', {
    athlete_id: 'old-athlete',
    credential_generation: 4,
    avatar_import_lease_id: 'stale-import',
    avatar_import_lease_expires_at: new Date('2026-09-29T04:10:00.000Z'),
  });

  await createCredentialStore(database).saveCredential({
    _id: 'openid',
    openid: 'openid',
    athlete_id: 'old-athlete',
  });

  assert.equal(database.state.strava_credentials.get('openid').credential_generation, 5);
  assert.equal(database.state.strava_credentials.get('openid').avatar_import_lease_id, undefined);
  assert.equal(
    database.state.strava_credentials.get('openid').avatar_import_lease_expires_at,
    undefined,
  );
});

test('换绑 Strava 时清除当前 Strava 头像并把媒体降级到 cleanup', async () => {
  const avatarFileId = 'cloud://env/profiles/owner/strava-avatar.jpg';
  const avatarMediaId = require('node:crypto')
    .createHash('sha256')
    .update(avatarFileId)
    .digest('hex');
  const database = memoryDatabase();
  database.state.profiles.set('openid', {
    _id: 'openid',
    nickname: 'Rider',
    avatar_source: 'strava',
    avatar_file_id: avatarFileId,
    avatar_revision: 4,
  });
  database.state.profile_media.set(avatarMediaId, {
    _id: avatarMediaId,
    file_id: avatarFileId,
    owner_openid: 'openid',
    origin: 'strava',
    status: 'active',
  });

  await createCredentialStore(database).saveCredential(
    {
      _id: 'openid',
      openid: 'openid',
      athlete_id: 'new-athlete',
    },
    new Date('2026-09-29T04:00:00.000Z'),
  );

  assert.equal(database.state.profiles.get('openid').avatar_source, undefined);
  assert.equal(database.state.profiles.get('openid').avatar_file_id, undefined);
  assert.equal(database.state.profiles.get('openid').avatar_revision, 5);
  assert.equal(database.state.profile_media.get(avatarMediaId).status, 'unreferenced');
  assert.equal(
    database.state.profile_media.get(avatarMediaId).cleanup_after.toISOString(),
    '2026-09-30T04:00:00.000Z',
  );
});

test('换绑不得让 avatar revision 越过安全整数上限', async () => {
  const database = memoryDatabase();
  database.state.profiles.set('openid', {
    _id: 'openid',
    avatar_source: 'strava',
    avatar_file_id: 'cloud://env/profiles/owner/avatar.jpg',
    avatar_revision: Number.MAX_SAFE_INTEGER,
  });

  await assert.rejects(
    createCredentialStore(database).saveCredential({
      _id: 'openid',
      openid: 'openid',
      athlete_id: 'new-athlete',
    }),
    { code: 'AVATAR_REVISION_EXHAUSTED' },
  );
});

test('换绑清除头像槽位时保留仍被 photos 引用的媒体', async () => {
  const avatarFileId = 'cloud://env/profiles/owner/shared-strava-avatar.jpg';
  const avatarMediaId = require('node:crypto')
    .createHash('sha256')
    .update(avatarFileId)
    .digest('hex');
  const database = memoryDatabase();
  database.state.profiles.set('openid', {
    _id: 'openid',
    avatar_source: 'strava',
    avatar_file_id: avatarFileId,
    photos: [{ file_id: avatarFileId, category: 'other' }],
  });
  database.state.profile_media.set(avatarMediaId, {
    _id: avatarMediaId,
    file_id: avatarFileId,
    owner_openid: 'openid',
    origin: 'strava',
    status: 'active',
  });

  await createCredentialStore(database).saveCredential(
    { _id: 'openid', openid: 'openid', athlete_id: 'new-athlete' },
    new Date('2026-09-29T04:00:00.000Z'),
  );

  assert.equal(database.state.profiles.get('openid').avatar_file_id, undefined);
  assert.equal(database.state.profile_media.get(avatarMediaId).status, 'active');
});

test('profile compatibility cache 写失败会回滚 credential 和 snapshot', async () => {
  const database = memoryDatabase({ failProfileSet: true });
  const store = createCredentialStore(database);

  await assert.rejects(
    store.saveCredential({
      _id: 'openid',
      openid: 'openid',
      athlete_id: 'new-athlete',
    }),
    /profile update failed/,
  );

  assert.deepEqual(database.state.strava_credentials.get('openid'), {
    athlete_id: 'old-athlete',
  });
  assert.deepEqual(database.state.strava_snapshots.get('openid'), {
    athlete_id: 'old-athlete',
  });
  assert.deepEqual(database.state.profiles.get('openid'), {
    _id: 'openid',
    nickname: 'Rider',
  });
});

test('OAuth 事务仅把明确 not-found 当缺失，其余 credential/media 读取错误 fail closed', async () => {
  for (const options of [{ failProfileGet: true }, { failCredentialGet: true }]) {
    const database = memoryDatabase(options);
    await assert.rejects(
      createCredentialStore(database).saveCredential({
        _id: 'openid',
        openid: 'openid',
        athlete_id: 'new-athlete',
      }),
      { errCode: -502001 },
    );
    assert.equal(database.state.strava_credentials.get('openid').athlete_id, 'old-athlete');
  }

  const mediaFailure = memoryDatabase({ failMediaGet: true });
  mediaFailure.state.profiles.set('openid', {
    _id: 'openid',
    avatar_source: 'strava',
    avatar_file_id: 'cloud://env/profiles/owner/avatar.jpg',
  });
  await assert.rejects(
    createCredentialStore(mediaFailure).saveCredential({
      _id: 'openid',
      openid: 'openid',
      athlete_id: 'new-athlete',
    }),
    { errCode: -502001 },
  );
  assert.equal(mediaFailure.state.profiles.get('openid').avatar_source, 'strava');
});
