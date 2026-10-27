'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { TIMER_TRIGGER, authorizeWorker, runWorker } = require('./index');

test('只允许固定 timer 身份，无需用户再次操作', () => {
  assert.doesNotThrow(() => authorizeWorker({ Type: 'Timer', TriggerName: TIMER_TRIGGER }, ''));
  for (const [event, openid] of [
    [{ Type: 'Timer', TriggerName: 'other' }, ''],
    [{ Type: 'API', TriggerName: TIMER_TRIGGER }, ''],
    [{ Type: 'Timer', TriggerName: TIMER_TRIGGER }, 'user-openid'],
  ])
    assert.throws(() => authorizeWorker(event, openid), { code: 'SERVICE_IDENTITY_REQUIRED' });
});

test('持久消费者透传积压与 manual_review 可观测指标且不记录 owner/token', async () => {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    const expected = {
      attempted: 2,
      completed: 1,
      isolated: 2,
      uncertain: 0,
      backlog_pending_visible: 7,
      backlog_pending_truncated: false,
      manual_review_visible: 3,
      manual_review_truncated: true,
    };
    let input;
    const actual = await runWorker(
      {
        drainRevocations: async (value) => {
          input = value;
          return expected;
        },
      },
      new Date('2026-10-27T14:00:00Z'),
    );
    assert.deepEqual(actual, expected);
    assert.equal(input.now.toISOString(), '2026-10-27T14:00:00.000Z');
    assert.equal(input.owner, undefined);
    assert.match(lines.join('\n'), /"backlog_pending_visible":7/);
    assert.match(lines.join('\n'), /"manual_review_visible":3/);
    assert.match(lines.join('\n'), /"isolated":2/);
    assert.doesNotMatch(lines.join('\n'), /openid|token_cipher/);
  } finally {
    console.log = original;
  }
});
