'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { applyMediaDecision } = require('./core');

function fixture({ trace, media } = {}) {
  const state = {
    trace: trace ? structuredClone(trace) : undefined,
    media: media ? structuredClone(media) : undefined,
    writes: [],
  };
  return {
    state,
    store: {
      transaction: (work) =>
        work({
          getTrace: async () => state.trace,
          getMedia: async () => state.media,
          updateTrace: async (value) => {
            state.trace = { ...state.trace, ...value };
            state.writes.push(['trace', value]);
          },
          updateMedia: async (value) => {
            state.media = { ...state.media, ...value };
            state.writes.push(['media', value]);
          },
        }),
    },
  };
}

const trace = {
  _id: 'trace-1',
  trace_id: 'trace-1',
  media_id: 'media-1',
  owner_openid: 'owner',
  category: 'profile-avatar',
  generation: 3,
  canonical_file_id: 'cloud://env/file.jpg',
  sha256: 'a'.repeat(64),
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
};

test('pass callback updates the exact current binding without activating media', async () => {
  const value = fixture({ trace, media });
  const result = await applyMediaDecision(
    value.store,
    { traceId: 'trace-1', suggest: 'pass', detail: [] },
    new Date('2026-10-21T02:00:00.000Z'),
  );
  assert.equal(result.status, 'pass');
  assert.equal(value.state.media.security_status, 'pass');
  assert.equal(value.state.media.status, 'unreferenced');
});

test('review and risky remain unavailable, and duplicate delivery is idempotent', async () => {
  for (const suggest of ['review', 'risky']) {
    const value = fixture({ trace, media });
    const first = await applyMediaDecision(value.store, {
      traceId: 'trace-1',
      suggest,
      detail: [{ strategy: 'public-vector' }],
    });
    const writes = value.state.writes.length;
    const duplicate = await applyMediaDecision(value.store, {
      traceId: 'trace-1',
      suggest,
      detail: [],
    });
    assert.equal(first.status, suggest);
    assert.equal(duplicate.status, suggest);
    assert.equal(value.state.media.security_status, suggest);
    assert.equal(value.state.writes.length, writes);
  }
});

test('unknown trace remains retryable until the submission transaction is visible', async () => {
  const value = fixture();
  await assert.rejects(
    () =>
      applyMediaDecision(value.store, {
        traceId: 'trace-1',
        suggest: 'pass',
        detail: [],
      }),
    { code: 'CALLBACK_TRACE_NOT_READY', retryable: true },
  );
  assert.equal(value.state.writes.length, 0);
});

test('deleted and superseded bindings are acknowledged without writes', async () => {
  for (const value of [
    fixture({ trace, media: { ...media, status: 'deleted' } }),
    fixture({ trace, media: { ...media, generation: 4 } }),
    fixture({ trace, media: { ...media, sha256: 'b'.repeat(64) } }),
  ]) {
    const result = await applyMediaDecision(value.store, {
      traceId: 'trace-1',
      suggest: 'pass',
      detail: [],
    });
    assert.equal(result.status, 'ignored');
    assert.equal(value.state.writes.length, 0);
  }
});
