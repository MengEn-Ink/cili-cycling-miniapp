'use strict';

const { existsSync } = require('node:fs');
const { join } = require('node:path');

const DELETION_STATES = [
  'requested',
  'processing',
  'awaiting_media',
  'restricted',
  'retryable',
  'manual_review',
  'completed',
];
const fileId = (name) => `cloud://synthetic-env.bucket/profiles/owner-a/${name}`;
const profile = (overrides = {}) => ({
  _id: 'owner-a',
  generation: 1,
  deletion_status: 'active',
  nickname: 'Rider A',
  nickname_revision: 1,
  media_revision: 1,
  avatar_file_id: fileId('avatar.png'),
  avatar_source: 'custom',
  avatar_revision: 1,
  background_photo: { file_id: fileId('background.png'), category: 'ride' },
  photos: [{ file_id: fileId('bike.png'), category: 'bike' }],
  ...overrides,
});
const registration = (overrides = {}) => ({
  _id: 'registration-a',
  profile_generation: 1,
  status: 'approved',
  profile_snapshot: { nickname: 'Old Rider', avatar_file_id: fileId('snapshot.png') },
  ...overrides,
});
const request = (overrides = {}) => ({
  _id: 'request-a',
  owner_openid: 'owner-a',
  generation: 1,
  status: 'processing',
  media_targets: [],
  lease_id: 'synthetic-lease',
  replay_epoch: 'synthetic-replay',
  ...overrides,
});
const optionalContract = (name) => {
  const path = join(__dirname, name);
  return existsSync(path) ? require(path) : {};
};
const referenceFixture = (referencedCollection) => {
  const queries = [];
  const command = {
    in: (values) => ({ operator: 'in', values }),
    or: (conditions) => ({ operator: 'or', conditions }),
  };
  const tx = {
    collection(name) {
      return {
        where(condition) {
          return {
            limit(limit) {
              return {
                async get() {
                  queries.push({ name, condition, limit });
                  return { data: name === referencedCollection ? [{ _id: 'reference-a' }] : [] };
                },
              };
            },
          };
        },
      };
    },
  };
  return { tx, command, queries };
};

// Serialized, rollback-capable memory DB from the source privacy fixture.
function privacyDatabase(seed = {}) {
  const state = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [
      name,
      new Map(rows.map((row) => [row._id, structuredClone(row)])),
    ]),
  );
  const ensure = (tables, name) => (tables[name] ||= new Map());
  const path = (value, keys) => {
    if (!keys.length) return value;
    if (Array.isArray(value)) return value.flatMap((item) => path(item, keys));
    return path(value?.[keys[0]], keys.slice(1));
  };
  const matches = (row, condition) => {
    if (condition?.op === 'or') return condition.value.some((item) => matches(row, item));
    return Object.entries(condition).every(([key, expected]) => {
      const actual = path(row, key.split('.'));
      const values = Array.isArray(actual) ? actual : [actual];
      return values.some((value) => {
        if (expected?.op === 'gt') return value > expected.value;
        if (expected?.op === 'lte') return value != null && value <= expected.value;
        if (expected?.op === 'in') return expected.value.includes(value);
        return value === expected;
      });
    });
  };
  const collection = (tables, name) => ({
    doc: (id) => ({
      get: async () => ({ data: structuredClone(ensure(tables, name).get(id)) }),
      set: async ({ data }) => ensure(tables, name).set(id, { ...structuredClone(data), _id: id }),
      update: async ({ data }) => {
        if (!ensure(tables, name).has(id)) throw new Error('document does not exist');
        ensure(tables, name).set(id, { ...ensure(tables, name).get(id), ...structuredClone(data) });
      },
      remove: async () => ensure(tables, name).delete(id),
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
        get: async () => ({
          data: [...ensure(tables, name).values()]
            .filter((row) => matches(row, condition))
            .sort((left, right) => {
              for (const [field, direction] of orders) {
                const a = path(left, field.split('.'));
                const b = path(right, field.split('.'));
                if (a !== b) return (a > b ? 1 : -1) * (direction === 'desc' ? -1 : 1);
              }
              return 0;
            })
            .slice(0, limit)
            .map((row) => structuredClone(row)),
        }),
      };
      return query;
    },
  });
  let queue = Promise.resolve();
  const db = {
    command: Object.fromEntries(
      ['gt', 'lte', 'in', 'or'].map((op) => [op, (value) => ({ op, value })]),
    ),
    collection: (name) => collection(state, name),
    serverDate: () => new Date('2026-10-26T08:00:00Z'),
    runTransaction: (work) => {
      const run = queue.then(async () => {
        const draft = structuredClone(state);
        const result = await work({ collection: (name) => collection(draft, name) });
        Object.assign(state, draft);
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
  return { db, state };
}

module.exports = {
  DELETION_STATES,
  fileId,
  profile,
  registration,
  request,
  optionalContract,
  referenceFixture,
  privacyDatabase,
};
