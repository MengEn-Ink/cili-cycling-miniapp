'use strict';

const core = require('./core.cjs');
const { createStravaStore } = require('./store.cjs');
const ENV = {
  STRAVA_CLIENT_ID: '12345',
  STRAVA_CLIENT_SECRET: 'synthetic-application-secret',
  STRAVA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  STRAVA_CALLBACK_URL: 'https://example.test/strava/callback',
};
const NOW = new Date('2026-10-26T00:00:00Z');
const OWNER = 'synthetic-owner';

// This is a synthetic contract, not a second runtime privacy implementation.
const privacy = {
  profileGeneration(profile) {
    const generation = profile?.generation === undefined ? 1 : profile.generation;
    if (!Number.isSafeInteger(generation) || generation < 1)
      throw new core.StravaError('PROFILE_GENERATION_INVALID', 'Invalid generation');
    return generation;
  },
  isProfileDeleted: (profile) =>
    Boolean(profile?.deletion_status && profile.deletion_status !== 'active'),
  assertProfileWritable(profile, expected) {
    if (privacy.isProfileDeleted(profile))
      throw new core.StravaError('PROFILE_DELETION_IN_PROGRESS', 'Deletion pending');
    const generation = privacy.profileGeneration(profile);
    if (
      (expected === undefined && generation !== 1) ||
      (expected !== undefined && expected !== generation)
    )
      throw new core.StravaError('PROFILE_GENERATION_MISMATCH', 'Generation mismatch');
  },
};

function database(seed = {}) {
  const state = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [
      name,
      new Map(rows.map((row) => [row._id, structuredClone(row)])),
    ]),
  );
  const ensure = (tables, name) => (tables[name] ||= new Map());
  let fault;
  const check = (name, action, id) => {
    if (fault && fault.name === name && fault.action === action && (!fault.id || fault.id === id)) {
      const error = fault.error;
      fault = undefined;
      throw error;
    }
  };
  const matches = (row, condition) =>
    Object.entries(condition).every(([key, expected]) => {
      const actual = row[key];
      if (expected?.op === 'lte') return actual != null && actual <= expected.value;
      if (expected?.op === 'in') return expected.value.includes(actual);
      if (expected?.op === 'neq') return actual !== expected.value;
      return actual === expected;
    });
  const collection = (tables, name) => ({
    doc: (id) => ({
      get: async () => {
        check(name, 'get', id);
        return { data: structuredClone(ensure(tables, name).get(id)) };
      },
      set: async ({ data }) => {
        check(name, 'set', id);
        ensure(tables, name).set(id, { ...structuredClone(data), _id: id });
      },
      update: async ({ data }) => {
        check(name, 'update', id);
        if (!ensure(tables, name).has(id))
          throw Object.assign(new Error('missing document'), { errCode: -502001 });
        ensure(tables, name).set(id, { ...ensure(tables, name).get(id), ...structuredClone(data) });
      },
      remove: async () => {
        check(name, 'remove', id);
        ensure(tables, name).delete(id);
      },
    }),
    where: (condition) => {
      const orders = [];
      let limit = 100;
      const query = {
        orderBy: (field, direction) => {
          orders.push([field, direction]);
          return query;
        },
        limit: (value) => {
          limit = value;
          return query;
        },
        get: async () => {
          check(name, 'query');
          return {
            data: [...ensure(tables, name).values()]
              .filter((row) => matches(row, condition))
              .sort((left, right) => {
                for (const [field, direction] of orders) {
                  if (left[field] !== right[field])
                    return (left[field] > right[field] ? 1 : -1) * (direction === 'desc' ? -1 : 1);
                }
                return 0;
              })
              .slice(0, limit)
              .map((row) => structuredClone(row)),
          };
        },
      };
      return query;
    },
  });
  let queue = Promise.resolve();
  let retry = false;
  const db = {
    command: Object.fromEntries(['lte', 'in', 'neq'].map((op) => [op, (value) => ({ op, value })])),
    collection: (name) => collection(state, name),
    runTransaction(work) {
      const run = queue.then(async () => {
        if (retry) {
          retry = false;
          await work({ collection: (name) => collection(structuredClone(state), name) });
        }
        const draft = structuredClone(state);
        const result = await work({ collection: (name) => collection(draft, name) });
        Object.assign(state, draft);
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
  return {
    db,
    state,
    retryNext: () => {
      retry = true;
    },
    failNext: (name, action, error = new Error('synthetic-db-failure'), id) => {
      fault = { name, action, error, id };
    },
  };
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
  const data = database({
    profiles: [{ _id: OWNER, generation: 1, deletion_status: 'active' }],
    ...seed,
  });
  const cloud = {
    uploadFile: async ({ cloudPath }) => ({ fileID: `cloud://synthetic/${cloudPath}` }),
  };
  const store = createStravaStore(data.db, { env: ENV, cloud, privacy });
  const start = async (now = NOW, generation = 1) => {
    const state = core.createState(now.getTime());
    await store.start(OWNER, state, now, generation);
    return state.raw;
  };
  const callback = (
    query,
    fetchImpl = async () => new Response(JSON.stringify(token())),
    now = NOW,
  ) => core.callbackFlow({ query, env: ENV, store, fetchImpl, now });
  return {
    ...data,
    store,
    cloud,
    start,
    callback,
    finish: (state, fetchImpl, now) =>
      callback({ state, code: 'synthetic-code', scope: 'read' }, fetchImpl, now),
  };
}

async function connected(extra = {}) {
  const f = fixture();
  await f.finish(await f.start(), async () => new Response(JSON.stringify(token(extra))));
  return f;
}

module.exports = { ENV, NOW, OWNER, privacy, database, fixture, connected, token, deferred };
