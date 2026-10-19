'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { applicationId } = require('./core');

function loadHandler(application) {
  const applications = new Map([[application._id, { ...application }]]);
  const audits = [];
  const collection = (name) => ({
    doc: (id) => ({
      get: async () => {
        const value = name === 'club_applications' ? applications.get(id) : undefined;
        if (!value) throw Object.assign(new Error('not found'), { errCode: -502001 });
        return { data: { ...value } };
      },
      set: async ({ data }) => {
        if (name === 'club_applications') applications.set(id, { _id: id, ...data });
      },
    }),
    add: async ({ data }) => {
      if (name === 'audit_logs') audits.push(data);
    },
  });
  const db = {
    collection,
    runTransaction: async (work) => work({ collection }),
  };
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => db,
    getWXContext: () => ({ OPENID: 'user-handler' }),
  };
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = require.resolve('./index');
  delete require.cache[modulePath];
  try {
    return { main: require('./index').main, applications, audits };
  } finally {
    Module._load = originalLoad;
  }
}

test('withdraw handler 接线 requestId 与 expectedReviewVersion 并返回 draft', async () => {
  const id = applicationId('user-handler');
  const { main, applications, audits } = loadHandler({
    _id: id,
    applicant_openid: 'user-handler',
    status: 'pending_review',
    review_version: 4,
    club_name: '山海骑行会',
    city: '深圳',
    join_mode: 'public_apply',
    expected_size: 30,
  });
  const response = await main({
    action: 'withdraw',
    requestId: 'handler-withdraw-1',
    expectedReviewVersion: 4,
  });
  assert.equal(response.ok, true);
  assert.equal(response.data.status, 'draft');
  assert.equal(response.data.review_version, 4);
  assert.equal(applications.get(id).status, 'draft');
  assert.equal(audits[0].action, 'club_application_withdrawn');
});

test('withdraw handler 将版本冲突映射为稳定错误响应', async () => {
  const id = applicationId('user-handler');
  const { main } = loadHandler({
    _id: id,
    applicant_openid: 'user-handler',
    status: 'pending_review',
    review_version: 4,
  });
  const response = await main({
    action: 'withdraw',
    requestId: 'handler-withdraw-2',
    expectedReviewVersion: 3,
  });
  assert.deepEqual(response, {
    ok: false,
    error: { code: 'VERSION_CONFLICT', message: '申请版本已变化，请刷新后重试' },
  });
});
