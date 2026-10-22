'use strict';

const Module = require('node:module');
const { privacyDatabase } = require('../profile/privacy-fixture');
const core = require('./core');
const ENV = {
  STRAVA_CLIENT_ID: '12345',
  STRAVA_CLIENT_SECRET: 'synthetic-application-secret',
  STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  STRAVA_CALLBACK_URL: 'https://example.test/strava/callback',
};
const NOW = new Date('2026-10-21T12:00:00Z');
const OWNER = 'synthetic-owner';
function loadRuntime(path, cloud) {
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    return request === 'wx-server-sdk' ? cloud : original.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(path)];
    return require(path);
  } finally {
    Module._load = original;
  }
}
function token(extra = {}) {
  return {
    access_token: 'synthetic-access',
    refresh_token: 'synthetic-refresh',
    expires_at: Math.floor(NOW.getTime() / 1000) + 3600,
    athlete: { id: 42, firstname: 'Synthetic' },
    ...extra,
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((accept) => (resolve = accept));
  return { promise, resolve };
}
function fixture(seed = {}) {
  const database = privacyDatabase({
    admins: [{ _id: OWNER, enabled: true }],
    profiles: [{ _id: OWNER, generation: 1, deletion_status: 'active' }],
    ...seed,
  });
  const cloud = {
    init() {},
    DYNAMIC_CURRENT_ENV: 'synthetic',
    database: () => database.db,
    getWXContext: () => ({ OPENID: OWNER }),
    uploadFile: async ({ cloudPath }) => ({ fileID: `cloud://synthetic/${cloudPath}` }),
  };
  const bridge = loadRuntime('./index', cloud);
  const callback = loadRuntime('../strava-callback/index', cloud);
  const callbackStore = callback.callbackStore(database.db);
  const call = (action, extra = {}, now = NOW) => bridge.handle({ action, ...extra }, OWNER, now);
  return {
    ...database,
    bridge,
    callback,
    callbackStore,
    cloud,
    call,
    start: async () => {
      const result = await call('start');
      return new URL(result.authorization_url).searchParams.get('state');
    },
    finish: (state, fetchImpl = async () => new Response(JSON.stringify(token()))) =>
      core.callbackFlow({
        query: { state, code: 'synthetic-code' },
        env: ENV,
        store: callbackStore,
        fetchImpl,
        now: NOW,
      }),
  };
}
module.exports = { ENV, NOW, OWNER, fixture, token, deferred, loadRuntime };
