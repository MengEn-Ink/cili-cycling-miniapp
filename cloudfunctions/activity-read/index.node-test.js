'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadMain(activity, list = []) {
  const calls = [];
  const database = {
    collection(name) {
      assert.equal(name, 'activities');
      return {
        where(condition) {
          calls.push({ type: 'where', condition });
          return {
            orderBy() {
              return {
                limit() {
                  return { get: async () => ({ data: list }) };
                },
              };
            },
          };
        },
        doc() {
          return { get: async () => ({ data: activity }) };
        },
      };
    },
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => database,
    getWXContext: () => ({ OPENID: 'member-openid' }),
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('./index')];
    return { main: require('./index').main, calls };
  } finally {
    Module._load = originalLoad;
  }
}

test('详情允许读取已结束活动', async () => {
  const activity = {
    _id: 'finished-activity',
    title: '已结束骑行',
    status: 'finished',
    is_deleted: false,
  };
  const { main } = loadMain(activity);

  const result = await main({ action: 'detail', activityId: activity._id });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, 'finished');
});

test('列表仍只查询 published 活动', async () => {
  const { main, calls } = loadMain(undefined, []);

  const result = await main({ action: 'list' });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ type: 'where', condition: { status: 'published' } }]);
});
