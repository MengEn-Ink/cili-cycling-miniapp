'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { applyMediaDecision } = require('./core');

function fixture({ trace, operation, media } = {}) {
  const state = {
    trace: trace ? structuredClone(trace) : undefined,
    operation: operation ? structuredClone(operation) : undefined,
    media: media ? structuredClone(media) : undefined,
    writes: [],
  };
  return {
    state,
    store: {
      transaction: (work) =>
        work({
          getTrace: async () => state.trace,
          getOperation: async () => state.operation,
          getMedia: async () => state.media,
          updateTrace: async (value) => {
            state.trace = { ...state.trace, ...value };
            state.writes.push(['trace', value]);
          },
          updateOperation: async (value) => {
            state.operation = { ...state.operation, ...value };
            state.writes.push(['operation', value]);
          },
          updateMedia: async (value) => {
            state.media = { ...state.media, ...value };
            state.writes.push(['media', value]);
          },
        }),
    },
  };
}

const binding = {
  media_id: 'media-1',
  owner_openid: 'owner',
  category: 'profile-avatar',
  generation: 3,
  canonical_file_id: 'cloud://env/file.jpg',
  sha256: 'a'.repeat(64),
};
const trace = {
  _id: 'trace-1',
  trace_id: 'trace-1',
  operation_id: 'operation-1',
  ...binding,
  status: 'pending',
};
const operation = {
  _id: 'operation-1',
  operation_id: 'operation-1',
  trace_id: 'trace-1',
  ...binding,
  status: 'pending',
};
const media = {
  _id: 'media-1',
  owner_openid: 'owner',
  category: 'profile-avatar',
  generation: 3,
  canonical_file_id: 'cloud://env/file.jpg',
  sha256: 'a'.repeat(64),
  status: 'unreferenced',
  security_status: 'pending',
  security_trace_id: 'trace-1',
  security_operation_id: 'operation-1',
};

test('pass callback updates the exact operation and binding without activating media', async () => {
  const value = fixture({ trace, operation, media });
  const result = await applyMediaDecision(
    value.store,
    { traceId: 'trace-1', outcome: 'decision', suggest: 'pass', detail: [] },
    new Date('2026-10-21T02:00:00.000Z'),
  );
  assert.equal(result.status, 'pass');
  assert.equal(value.state.media.security_status, 'pass');
  assert.equal(value.state.operation.status, 'pass');
  assert.equal(value.state.media.status, 'unreferenced');
});

test('review and risky remain unavailable, and duplicate delivery is terminal-idempotent', async () => {
  for (const suggest of ['review', 'risky']) {
    const value = fixture({ trace, operation, media });
    const first = await applyMediaDecision(value.store, {
      traceId: 'trace-1',
      outcome: 'decision',
      suggest,
      detail: [{ strategy: 'public-vector' }],
    });
    const writes = value.state.writes.length;
    const duplicate = await applyMediaDecision(value.store, {
      traceId: 'trace-1',
      outcome: 'decision',
      suggest,
      detail: [],
    });
    assert.equal(first.status, suggest);
    assert.equal(duplicate.status, suggest);
    assert.equal(value.state.media.security_status, suggest);
    assert.equal(value.state.writes.length, writes);
  }
});

test('authenticated download failure becomes recoverable and duplicate delivery is idempotent', async () => {
  const value = fixture({ trace, operation, media });
  const decision = { traceId: 'trace-1', outcome: 'retryable', errorCode: -1008 };
  assert.deepEqual(await applyMediaDecision(value.store, decision), { status: 'retryable' });
  const writes = value.state.writes.length;
  assert.deepEqual(await applyMediaDecision(value.store, decision), { status: 'retryable' });
  assert.equal(value.state.media.security_status, 'retryable');
  assert.equal(value.state.operation.status, 'retryable');
  assert.equal(value.state.writes.length, writes);
});

test('callback 先于 ACK 时保持可重试，submitted operation 不会被误判为终态', async () => {
  const value = fixture({
    operation: { ...operation, status: 'submitted' },
    media: { ...media, security_status: 'submitting', security_trace_id: '' },
  });
  await assert.rejects(
    () =>
      applyMediaDecision(value.store, {
        traceId: 'trace-1',
        outcome: 'decision',
        suggest: 'pass',
        detail: [],
      }),
    { code: 'CALLBACK_TRACE_NOT_READY', retryable: true },
  );
  assert.equal(value.state.writes.length, 0);
});

test('deleted, superseded and cross-operation bindings are acknowledged without writes', async () => {
  for (const value of [
    fixture({ trace, operation, media: { ...media, status: 'deleted' } }),
    fixture({ trace, operation, media: { ...media, generation: 4 } }),
    fixture({ trace, operation, media: { ...media, sha256: 'b'.repeat(64) } }),
    fixture({ trace, operation: { ...operation, operation_id: 'operation-2' }, media }),
  ]) {
    const result = await applyMediaDecision(value.store, {
      traceId: 'trace-1',
      outcome: 'decision',
      suggest: 'pass',
      detail: [],
    });
    assert.equal(result.status, 'ignored');
    assert.equal(value.state.writes.length, 0);
  }
});

test('legacy media without generation is narrowly bound to generation one', async () => {
  const legacyTrace = { ...trace, generation: 1 };
  const legacyOperation = { ...operation, generation: 1 };
  const legacyMedia = { ...media };
  delete legacyMedia.generation;
  const value = fixture({ trace: legacyTrace, operation: legacyOperation, media: legacyMedia });
  assert.deepEqual(
    await applyMediaDecision(value.store, {
      traceId: 'trace-1',
      outcome: 'decision',
      suggest: 'pass',
      detail: [],
    }),
    { status: 'pass' },
  );
});
