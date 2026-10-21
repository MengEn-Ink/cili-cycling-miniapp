'use strict';

// Stateful, serialized transactions with rollback, matching the repository's memory DB tests.
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
    serverDate: () => new Date('2026-10-21T10:00:00Z'),
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

module.exports = { privacyDatabase };
