'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { submitReservedMediaReview } = require('./media-review');

const mediaRecord = {
  _id: 'media-1',
  owner_openid: 'owner-1',
  category: 'profile-avatar',
  generation: 2,
  canonical_file_id: 'cloud://env/canonical.jpg',
  sha256: 'a'.repeat(64),
};

test('外部审核调用前完成 operation 预占，成功后按同 operation ACK', async () => {
  const calls = [];
  const store = {
    reserveMediaCheck: async (...args) => {
      calls.push(['reserve', ...args]);
      return { attempt: 1 };
    },
    recordMediaCheckSubmission: async (...args) => {
      calls.push(['record', ...args]);
      return { status: 'submitted', trace_id: args[4].trace_id };
    },
    ackMediaCheckSubmission: async (...args) => {
      calls.push(['ack', ...args]);
      return { status: 'pending', operationId: args[2], traceId: args[4].trace_id };
    },
    failMediaCheckOperation: async () => assert.fail('success path must not fail operation'),
  };
  const result = await submitReservedMediaReview({
    openid: 'owner-1',
    mediaRecord,
    store,
    operationId: 'operation_1234',
    getMediaUrl: async () => {
      calls.push(['url']);
      return 'https://storage.example/canonical.jpg';
    },
    mediaCheckAsync: async () => {
      calls.push(['external']);
      return { errCode: 0, traceId: 'trace-1' };
    },
  });
  assert.deepEqual(
    calls.map(([name]) => name),
    ['reserve', 'url', 'external', 'record', 'ack'],
  );
  assert.deepEqual(result, {
    status: 'pending',
    operationId: 'operation_1234',
    traceId: 'trace-1',
  });
});

test('外部调用失败只结算匹配 operation，且预算已由预占消耗', async () => {
  const calls = [];
  const store = {
    reserveMediaCheck: async () => {
      calls.push('reserve');
      return { attempt: 2 };
    },
    ackMediaCheckSubmission: async () => assert.fail('failure path must not ACK'),
    failMediaCheckOperation: async (...args) => {
      calls.push('fail');
      assert.equal(args[2], 'operation_5678');
      return { status: 'retryable' };
    },
  };
  await assert.rejects(
    () =>
      submitReservedMediaReview({
        openid: 'owner-1',
        mediaRecord,
        store,
        operationId: 'operation_5678',
        getMediaUrl: async () => 'https://storage.example/canonical.jpg',
        mediaCheckAsync: async () => {
          throw Object.assign(new Error('unavailable'), { code: 'PLATFORM_DOWN' });
        },
      }),
    { code: 'MEDIA_CHECK_RETRY' },
  );
  assert.deepEqual(calls, ['reserve', 'fail']);
});

test('同 operation 重放不会再次调用微信', async () => {
  let externalCalls = 0;
  await assert.rejects(
    () =>
      submitReservedMediaReview({
        openid: 'owner-1',
        mediaRecord,
        operationId: 'operation_replay',
        store: {
          reserveMediaCheck: async () => ({ attempt: 1, replayed: true }),
        },
        getMediaUrl: async () => {
          externalCalls += 1;
          return 'https://storage.example/canonical.jpg';
        },
        mediaCheckAsync: async () => {
          externalCalls += 1;
        },
      }),
    { code: 'MEDIA_CHECK_OPERATION_IN_PROGRESS' },
  );
  assert.equal(externalCalls, 0);
});

test('ACK 瞬时失败后同 operation 仅恢复 ACK，不重复调用微信', async () => {
  let phase = 'new';
  let externalCalls = 0;
  let recordedTrace;
  let ackCalls = 0;
  const store = {
    reserveMediaCheck: async () => {
      if (phase === 'new') return { attempt: 1 };
      return { attempt: 1, recoverable: true, trace: recordedTrace };
    },
    recordMediaCheckSubmission: async (_openid, _binding, _operationId, _attempt, trace) => {
      recordedTrace = trace;
      phase = 'submitted';
    },
    ackMediaCheckSubmission: async (_openid, _binding, operationId, attempt, trace) => {
      ackCalls += 1;
      if (ackCalls === 1) throw new Error('database temporarily unavailable');
      phase = 'pending';
      return { status: 'pending', operationId, traceId: trace.trace_id, attempts: attempt };
    },
    failMediaCheckOperation: async () =>
      assert.fail('ACK failure must not fail external submission'),
  };
  const request = {
    openid: 'owner-1',
    mediaRecord,
    store,
    operationId: 'operation_ack_recovery',
    getMediaUrl: async () => 'https://storage.example/canonical.jpg',
    mediaCheckAsync: async () => {
      externalCalls += 1;
      return { errCode: 0, traceId: 'trace-recovery' };
    },
  };

  await assert.rejects(
    () => submitReservedMediaReview(request),
    /database temporarily unavailable/u,
  );
  assert.equal(phase, 'submitted');
  assert.equal(externalCalls, 1);

  assert.deepEqual(await submitReservedMediaReview(request), {
    status: 'pending',
    operationId: 'operation_ack_recovery',
    traceId: 'trace-recovery',
    attempts: 1,
  });
  assert.equal(externalCalls, 1);
  assert.equal(ackCalls, 2);
});

test('已完成 operation 重复恢复直接返回既有 ACK，不重复调用微信或写 ACK', async () => {
  let externalCalls = 0;
  let ackCalls = 0;
  const result = await submitReservedMediaReview({
    openid: 'owner-1',
    mediaRecord,
    operationId: 'operation_completed',
    store: {
      reserveMediaCheck: async () => ({
        attempt: 1,
        completed: true,
        trace_id: 'trace-completed',
      }),
      ackMediaCheckSubmission: async () => {
        ackCalls += 1;
      },
    },
    getMediaUrl: async () => {
      externalCalls += 1;
    },
    mediaCheckAsync: async () => {
      externalCalls += 1;
    },
  });

  assert.deepEqual(result, {
    status: 'pending',
    operationId: 'operation_completed',
    traceId: 'trace-completed',
    attempts: 1,
  });
  assert.equal(externalCalls, 0);
  assert.equal(ackCalls, 0);
});
