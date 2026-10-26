'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ContentCheckError,
  assertCheckedContent,
  checkTextContent,
  submitMediaCheck,
} = require('./content.cjs');

const expectCode = async (work, code) =>
  assert.rejects(work, (error) => error instanceof ContentCheckError && error.code === code);

test('msgSecCheck v2 sends only normalized whitelist fields and binds stored digest/version', async () => {
  let request;
  const checked = await checkTextContent({
    openid: 'trusted-openid',
    scene: 1,
    fields: { nickname: '  山海骑手  ', ignored: 'private' },
    whitelist: { nickname: 40 },
    currentVersion: 7,
    msgSecCheck: async (value) => {
      request = value;
      return { errCode: 0, result: { suggest: 'pass' }, traceId: 'text-trace-1' };
    },
  });
  assert.deepEqual(request, {
    openid: 'trusted-openid',
    scene: 1,
    version: 2,
    content: '{"nickname":"山海骑手"}',
  });
  assert.deepEqual(checked.fields, { nickname: '山海骑手' });
  assertCheckedContent(checked, checked.fields, 7);
  assert.throws(() => assertCheckedContent(checked, { nickname: 'changed' }, 7), {
    code: 'CONTENT_CHECK_STALE',
  });
});

test('legacy empty string version remains digest-bound for migration-safe updates', async () => {
  const checked = await checkTextContent({
    openid: 'trusted-openid',
    scene: 4,
    fields: { name: '存量俱乐部' },
    whitelist: { name: 30 },
    currentVersion: '',
    msgSecCheck: async () => ({ errCode: 0, result: { suggest: 'pass' } }),
  });
  assertCheckedContent(checked, { name: '存量俱乐部' }, '');
  assert.throws(() => assertCheckedContent(checked, { name: '存量俱乐部' }, 'new-version'), {
    code: 'CONTENT_CHECK_STALE',
  });
});

test('review/risky/quota/permission/timeout/malformed all fail closed without original text', async () => {
  const base = {
    openid: 'trusted-openid',
    scene: 4,
    fields: { title: '周末骑行' },
    whitelist: { title: 100 },
    currentVersion: 1,
  };
  for (const [response, code] of [
    [{ errCode: 0, result: { suggest: 'review' } }, 'CONTENT_REVIEW_REQUIRED'],
    [{ errCode: 0, result: { suggest: 'risky' } }, 'CONTENT_RISKY'],
    [{ errCode: 44991 }, 'CONTENT_CHECK_RETRY'],
    [{ errCode: 48001 }, 'CONTENT_CHECK_UNAVAILABLE'],
    [{ errCode: 0, result: {} }, 'CONTENT_CHECK_INVALID_RESPONSE'],
    [{ errCode: null, result: { suggest: 'pass' } }, 'CONTENT_CHECK_INVALID_RESPONSE'],
    [{ errCode: '', result: { suggest: 'pass' } }, 'CONTENT_CHECK_INVALID_RESPONSE'],
    [{ errCode: false, result: { suggest: 'pass' } }, 'CONTENT_CHECK_INVALID_RESPONSE'],
  ])
    await expectCode(() => checkTextContent({ ...base, msgSecCheck: async () => response }), code);
  await expectCode(
    () =>
      checkTextContent({
        ...base,
        msgSecCheck: async () => {
          throw new Error('upstream secret body');
        },
      }),
    'CONTENT_CHECK_RETRY',
  );
});

test('5000-character business field is fully checked in bounded chunks', async () => {
  const description = '骑'.repeat(5000);
  const requests = [];
  const checked = await checkTextContent({
    openid: 'trusted-openid',
    scene: 4,
    fields: { title: '长途骑行', description },
    whitelist: { title: 100, description: 5000 },
    currentVersion: 0,
    msgSecCheck: async (request) => {
      requests.push(request);
      return {
        errCode: 0,
        result: { suggest: 'pass' },
        traceId: `text-trace-${requests.length}`,
      };
    },
  });

  assert.ok(requests.length >= 3);
  assert.ok(requests.every((request) => request.content.length <= 2500));
  assert.equal(
    requests.map((request) => JSON.parse(request.content).description || '').join(''),
    description,
  );
  assertCheckedContent(checked, { title: '长途骑行', description }, 0);
});

test('configured business field boundary is enforced before external call', async () => {
  let calls = 0;
  await expectCode(
    () =>
      checkTextContent({
        openid: 'trusted-openid',
        scene: 4,
        fields: { description: '骑'.repeat(5001) },
        whitelist: { description: 5000 },
        currentVersion: 0,
        msgSecCheck: async () => {
          calls += 1;
        },
      }),
    'CONTENT_FIELD_TOO_LONG',
  );
  assert.equal(calls, 0);
});

test('media API acceptance remains pending and binds exact trace/generation/digest', async () => {
  let request;
  const pending = await submitMediaCheck({
    mediaId: 'media-1',
    ownerOpenid: 'trusted-openid',
    category: 'profile-avatar',
    generation: 3,
    canonicalFileId: 'cloud://env/profile-canonical/file.jpg',
    sha256: 'a'.repeat(64),
    scene: 1,
    mediaUrl: 'https://temp.example/file.jpg',
    mediaCheckAsync: async (value) => {
      request = value;
      return { errCode: 0, traceId: 'media-trace-1' };
    },
  });
  assert.deepEqual(request, {
    openid: 'trusted-openid',
    scene: 1,
    version: 2,
    mediaType: 2,
    mediaUrl: 'https://temp.example/file.jpg',
  });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.trace_id, 'media-trace-1');
  assert.equal(pending.generation, 3);
  assert.equal(pending.sha256, 'a'.repeat(64));
});

test('media acceptance without trace and stale-visit/quota failures never become pass', async () => {
  const base = {
    mediaId: 'media-1',
    ownerOpenid: 'trusted-openid',
    category: 'profile-avatar',
    generation: 3,
    canonicalFileId: 'cloud://env/profile-canonical/file.jpg',
    sha256: 'a'.repeat(64),
    scene: 1,
    mediaUrl: 'https://temp.example/file.jpg',
  };
  await expectCode(
    () => submitMediaCheck({ ...base, mediaCheckAsync: async () => ({ errCode: 0 }) }),
    'MEDIA_CHECK_INVALID_RESPONSE',
  );
  await expectCode(
    () => submitMediaCheck({ ...base, mediaCheckAsync: async () => ({ errCode: 61010 }) }),
    'MEDIA_CHECK_USER_VISIT_REQUIRED',
  );
  await expectCode(
    () => submitMediaCheck({ ...base, mediaCheckAsync: async () => ({ errCode: 44991 }) }),
    'MEDIA_CHECK_RETRY',
  );
});
