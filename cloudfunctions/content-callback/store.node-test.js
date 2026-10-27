'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { get, missing } = require('./store');

test('only explicit document absence is swallowed', async () => {
  assert.equal(missing({ errCode: -502001, errMsg: 'document with _id x does not exist' }), true);
  assert.equal(missing({ errCode: -502001, errMsg: 'database request fail' }), false);
  assert.equal(missing({ errCode: -1, errMsg: 'document with _id x does not exist' }), true);
  assert.equal(missing({ errCode: -1, errMsg: 'not found' }), false);

  const absent = {
    doc: () => ({
      get: async () => {
        throw { errCode: -502001, errMsg: 'document with _id x does not exist' };
      },
    }),
  };
  assert.equal(await get(absent, 'x'), undefined);

  const unavailable = new Error('database request fail');
  unavailable.errCode = -502001;
  const broken = { doc: () => ({ get: async () => Promise.reject(unavailable) }) };
  await assert.rejects(() => get(broken, 'x'), unavailable);
});
