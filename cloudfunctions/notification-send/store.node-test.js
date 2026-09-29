'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let createNotificationStore;
try {
  ({ createNotificationStore } = require('./store'));
} catch {}

test('notification store 提供独立的 fenced persistence 边界', () => {
  assert.equal(typeof createNotificationStore, 'function');
});

test('notification store 暴露完整状态机边界', () => {
  const store = createNotificationStore({});
  for (const method of [
    'requireAdmin',
    'listReady',
    'claim',
    'beginDispatch',
    'recordDispatchOutcome',
    'markSent',
    'markRetryable',
    'markTerminal',
    'markDeliveryUnknown',
    'recoverExpiredDispatching',
  ]) {
    assert.equal(typeof store[method], 'function', method);
  }
});

function memoryDb(seed = {}) {
  const REMOVE = Symbol('remove');
  const state = Object.fromEntries(
    Object.entries(seed).map(([name, values]) => [name, new Map(Object.entries(values))]),
  );
  const calls = [];
  const ensure = (target, name) => (target[name] ||= new Map());
  const applyData = (current, data) => {
    const next = { ...current };
    for (const [key, value] of Object.entries(data)) {
      if (value === REMOVE) delete next[key];
      else next[key] = value;
    }
    return next;
  };
  const matches = (value, condition) => {
    if (!condition || typeof condition !== 'object' || !condition.kind) return value === condition;
    if (condition.kind === 'in') return condition.values.includes(value);
    if (condition.kind === 'lt') return Number(value || 0) < condition.value;
    if (condition.kind === 'lte') return new Date(value).getTime() <= condition.value.getTime();
    return false;
  };
  const collection = (target, name, scope) => ({
    doc: (id) => ({
      get: async () => {
        calls.push({ scope, operation: 'get', collection: name, id });
        if (!ensure(target, name).has(id)) throw { errCode: -502001, errMsg: 'not found' };
        return { data: ensure(target, name).get(id) };
      },
      update: async ({ data }) => {
        calls.push({ scope, operation: 'update', collection: name, id });
        ensure(target, name).set(id, applyData(ensure(target, name).get(id) || {}, data));
      },
    }),
    where: (query) => {
      const cursor = {
        orderBy: () => cursor,
        limit: (limit) => ({
          get: async () => ({
            data: [...ensure(target, name).values()]
              .filter((item) =>
                Object.entries(query).every(([key, condition]) => matches(item[key], condition)),
              )
              .slice(0, limit),
          }),
        }),
      };
      return cursor;
    },
  });
  const db = {
    command: {
      in: (values) => ({ kind: 'in', values }),
      lt: (value) => ({ kind: 'lt', value }),
      lte: (value) => ({ kind: 'lte', value }),
      remove: () => REMOVE,
    },
    collection: (name) => collection(state, name, 'db'),
    async runTransaction(work) {
      calls.push({ scope: 'db', operation: 'transaction' });
      const draft = Object.fromEntries(
        Object.entries(state).map(([name, values]) => [name, new Map(values)]),
      );
      const result = await work({ collection: (name) => collection(draft, name, 'tx') });
      for (const [name, values] of Object.entries(draft)) state[name] = values;
      return result;
    },
  };
  return { db, state, calls };
}

const item = (overrides = {}) => ({
  _id: 'o1',
  status: 'pending',
  attempts: 0,
  attempt_no: 0,
  lease_id: null,
  lease_expires_at: null,
  ...overrides,
});
const lease = (overrides = {}) => ({
  claimant: 'timer-worker',
  leaseId: 'lease-new',
  now: new Date('2026-09-29T00:00:00.000Z'),
  maxAttempts: 5,
  leaseMs: 120_000,
  ...overrides,
});

test('expired claimed 可用新 lease_id 重领并递增 attempt_no', async () => {
  const fixture = memoryDb({
    notification_outbox: {
      o1: item({
        status: 'claimed',
        attempts: 1,
        attempt_no: 1,
        lease_id: 'lease-old',
        lease_expires_at: new Date('2026-09-28T23:59:00.000Z'),
      }),
    },
  });

  const result = await createNotificationStore(fixture.db).claim('o1', lease());

  assert.equal(result?.claimed, true);
  assert.equal(result?.status, 'claimed');
  assert.equal(result?.lease_id, 'lease-new');
  assert.equal(result?.attempt_no, 2);
  assert.equal(fixture.state.notification_outbox.get('o1').attempt_no, 2);
});

test('未过期 claimed 不可被第二个 worker 接管', async () => {
  const fixture = memoryDb({
    notification_outbox: {
      o1: item({
        status: 'claimed',
        attempt_no: 1,
        lease_id: 'lease-current',
        lease_expires_at: new Date('2026-09-29T00:01:00.000Z'),
      }),
    },
  });

  const result = await createNotificationStore(fixture.db).claim('o1', lease());

  assert.equal(result?.claimed, false);
  assert.equal(fixture.state.notification_outbox.get('o1').lease_id, 'lease-current');
});

test('expired dispatching 恢复为 delivery_unknown 且不会进入 ready 列表', async () => {
  const fixture = memoryDb({
    notification_outbox: {
      o1: item({
        status: 'dispatching',
        attempts: 1,
        attempt_no: 1,
        lease_id: 'lease-old',
        lease_expires_at: new Date('2026-09-28T23:59:00.000Z'),
      }),
      o2: item({ _id: 'o2' }),
    },
  });
  const store = createNotificationStore(fixture.db);

  assert.equal(await store.recoverExpiredDispatching(lease().now, 20), 1);
  assert.equal(fixture.state.notification_outbox.get('o1').status, 'delivery_unknown');
  assert.deepEqual(await store.listReady(20), ['o2']);
});

test('所有 completion 写按 status、lease_id、attempt_no fencing', async () => {
  const fixture = memoryDb({
    notification_outbox: { o1: item() },
  });
  const store = createNotificationStore(fixture.db);
  const first = await store.claim('o1', lease({ leaseId: 'lease-a' }));
  const expired = new Date('2026-09-29T00:03:00.000Z');
  fixture.state.notification_outbox.get('o1').status = 'claimed';
  fixture.state.notification_outbox.get('o1').lease_expires_at = new Date(expired.getTime() - 1);
  const second = await store.claim(
    'o1',
    lease({ leaseId: 'lease-b', claimant: 'worker-b', now: expired }),
  );

  assert.equal(
    await store.beginDispatch('o1', {
      leaseId: first?.lease_id || 'lease-a',
      attemptNo: first?.attempt_no || 1,
      now: expired,
    }),
    false,
  );
  assert.equal(
    await store.beginDispatch('o1', {
      leaseId: second?.lease_id || 'lease-b',
      attemptNo: second?.attempt_no || 2,
      now: expired,
    }),
    true,
  );
  for (const method of [
    'recordDispatchOutcome',
    'markSent',
    'markRetryable',
    'markTerminal',
    'markDeliveryUnknown',
  ]) {
    assert.equal(
      await store[method]('o1', {
        leaseId: first?.lease_id || 'lease-a',
        attemptNo: first?.attempt_no || 1,
        errorCode: 'STALE',
        now: expired,
      }),
      false,
      method,
    );
  }
  assert.equal(fixture.state.notification_outbox.get('o1').status, 'dispatching');
  assert.equal(
    await store.markSent('o1', {
      leaseId: second?.lease_id || 'lease-b',
      attemptNo: second?.attempt_no || 2,
      now: expired,
    }),
    true,
  );
  assert.equal(fixture.state.notification_outbox.get('o1').status, 'sent');
});

test('显式拒绝可 fenced 转为 retryable 或 failed_terminal', async () => {
  const fixture = memoryDb({ notification_outbox: { o1: item(), o2: item({ _id: 'o2' }) } });
  const store = createNotificationStore(fixture.db);

  for (const [id, terminal] of [
    ['o1', false],
    ['o2', true],
  ]) {
    const claimed = await store.claim(id, lease({ leaseId: `lease-${id}` }));
    const fence = {
      leaseId: claimed?.lease_id || `lease-${id}`,
      attemptNo: claimed?.attempt_no || 1,
      errorCode: 'WECHAT_REJECTED',
      now: lease().now,
    };
    assert.equal(await store.beginDispatch(id, fence), true);
    assert.equal(
      terminal ? await store.markTerminal(id, fence) : await store.markRetryable(id, fence),
      true,
    );
    assert.equal(
      fixture.state.notification_outbox.get(id).status,
      terminal ? 'failed_terminal' : 'retryable',
    );
  }
});

test('retryable 写入指数且有上限的 next_retry_at，时间到前 listReady 不返回', async () => {
  const now = lease().now;
  for (const [attemptNo, delayMs] of [
    [1, 60_000],
    [2, 120_000],
    [5, 900_000],
  ]) {
    const id = `o${attemptNo}`;
    const fixture = memoryDb({
      notification_outbox: {
        [id]: item({
          _id: id,
          status: 'dispatching',
          attempts: attemptNo,
          attempt_no: attemptNo,
          lease_id: `lease-${attemptNo}`,
          lease_expires_at: new Date(now.getTime() + 120_000),
        }),
      },
    });
    const store = createNotificationStore(fixture.db);
    const fence = {
      leaseId: `lease-${attemptNo}`,
      attemptNo,
      errorCode: 'WECHAT_45009',
      now,
    };

    assert.equal(await store.markRetryable(id, fence), true);
    const nextRetryAt = fixture.state.notification_outbox.get(id).next_retry_at;
    assert.equal(nextRetryAt instanceof Date, true);
    assert.equal(nextRetryAt.getTime(), now.getTime() + delayMs);
    assert.deepEqual(await store.listReady(20, new Date(now.getTime() + delayMs - 1)), []);
    assert.deepEqual(
      await store.listReady(20, new Date(now.getTime() + delayMs)),
      attemptNo < 5 ? [id] : [],
    );
  }
});

test('expired dispatching 按持久化 outcome 恢复且不重新发送', async () => {
  const now = lease().now;
  const fixture = memoryDb({
    notification_outbox: {
      retry: item({
        _id: 'retry',
        status: 'dispatching',
        attempts: 2,
        attempt_no: 2,
        lease_id: 'lease-retry',
        lease_expires_at: new Date(now.getTime() - 1),
        dispatch_outcome: {
          disposition: 'retryable',
          error_code: 'WECHAT_45009',
          recorded_at: new Date(now.getTime() - 60_000),
        },
      }),
      terminal: item({
        _id: 'terminal',
        status: 'dispatching',
        attempts: 1,
        attempt_no: 1,
        lease_id: 'lease-terminal',
        lease_expires_at: new Date(now.getTime() - 1),
        dispatch_outcome: {
          disposition: 'terminal',
          error_code: 'WECHAT_43101',
          recorded_at: new Date(now.getTime() - 60_000),
        },
      }),
    },
  });
  const store = createNotificationStore(fixture.db);

  assert.equal(await store.recoverExpiredDispatching(now, 20), 2);
  assert.equal(fixture.state.notification_outbox.get('retry').status, 'retryable');
  assert.equal(
    fixture.state.notification_outbox.get('retry').next_retry_at.getTime(),
    now.getTime() + 120_000,
  );
  assert.equal(fixture.state.notification_outbox.get('terminal').status, 'failed_terminal');
  assert.deepEqual(await store.listReady(20, now), []);
});
