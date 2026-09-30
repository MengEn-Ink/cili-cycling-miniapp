'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const { canonicalMediaPath, mediaDocumentId, mediaOwnerPrefix } = require('./core');

let subject = {};
try {
  subject = require('./avatar-import');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const missing = (name) => () => {
  throw new Error(`${name} not implemented`);
};
const {
  MAX_AVATAR_BYTES,
  CONNECT_TIMEOUT_MS,
  TOTAL_TIMEOUT_MS,
  validateAvatarUrl = missing('validateAvatarUrl'),
  isPublicAddress = missing('isPublicAddress'),
  boundedRequest = missing('boundedRequest'),
  downloadAvatar = missing('downloadAvatar'),
  assertImportRequest = missing('assertImportRequest'),
  importStravaAvatar = missing('importStravaAvatar'),
} = subject;

test('下载预算为 10 秒云函数保留最终上传与事务时间', () => {
  assert.ok(TOTAL_TIMEOUT_MS <= 5000);
});

const allowedUrl = 'https://dgalywyr863hv.cloudfront.net/pictures/athletes/42/large.jpg';
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Buffer.from('RIFFxxxxWEBP', 'ascii');

test('导入请求不接受任何客户端 URL 字段', () => {
  assert.doesNotThrow(() => assertImportRequest({ action: 'importStravaAvatar' }));
  for (const field of [
    'url',
    'avatarUrl',
    'avatar_url',
    'athlete_avatar_url',
    'profile',
    'profile_medium',
    'credential',
  ]) {
    assert.throws(
      () => assertImportRequest({ action: 'importStravaAvatar', [field]: allowedUrl }),
      { code: 'FORBIDDEN_FIELD' },
    );
  }
});

test('头像 URL 只允许 HTTPS、无凭证的明确 Strava CDN host', () => {
  assert.equal(validateAvatarUrl(allowedUrl).hostname, 'dgalywyr863hv.cloudfront.net');
  for (const value of [
    allowedUrl.replace('https:', 'http:'),
    'https://evil.example/avatar.jpg',
    'https://127.0.0.1/avatar.jpg',
    'https://[::1]/avatar.jpg',
    'https://user:secret@dgalywyr863hv.cloudfront.net/avatar.jpg',
    'https://dgalywyr863hv.cloudfront.net:8443/avatar.jpg',
  ]) {
    assert.throws(() => validateAvatarUrl(value), { code: 'STRAVA_AVATAR_URL_INVALID' });
  }
});

test('DNS 结果中任一私网或保留地址都会 fail closed', async () => {
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '192.88.99.1',
    '198.18.0.1',
    '203.0.113.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2001:0db8:0:0:0:0:0:1',
    '::ffff:127.0.0.1',
    '3fff::1',
  ]) {
    assert.equal(isPublicAddress(address), false, address);
    await assert.rejects(
      downloadAvatar(allowedUrl, {
        lookup: async () => [{ address, family: address.includes(':') ? 6 : 4 }],
        request: async () => {
          throw new Error('request must not run');
        },
      }),
      { code: 'STRAVA_AVATAR_ADDRESS_BLOCKED' },
    );
  }
  assert.equal(isPublicAddress('93.184.216.34'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('下载允许白名单 CDN 间有界重定向并拒绝非白名单目标', async () => {
  let crossHostCalls = 0;
  const result = await downloadAvatar(allowedUrl, {
    lookup: publicLookup,
    request: async () => {
      crossHostCalls += 1;
      return crossHostCalls === 1
        ? {
            statusCode: 302,
            headers: { location: 'https://dgtzuqphqg23d.cloudfront.net/avatar.jpg' },
            body: Buffer.alloc(0),
          }
        : { statusCode: 200, headers: { 'content-type': 'image/jpeg' }, body: jpeg };
    },
  });
  assert.equal(result.extension, 'jpg');
  assert.equal(crossHostCalls, 2);
  await assert.rejects(
    downloadAvatar(allowedUrl, {
      lookup: publicLookup,
      request: async () => ({
        statusCode: 302,
        headers: { location: 'https://evil.example/avatar.jpg' },
        body: Buffer.alloc(0),
      }),
    }),
    { code: 'STRAVA_AVATAR_REDIRECT_BLOCKED' },
  );

  let calls = 0;
  await assert.rejects(
    downloadAvatar(allowedUrl, {
      lookup: publicLookup,
      request: async ({ url }) => {
        calls += 1;
        return {
          statusCode: 302,
          headers: { location: new URL(`/redirect-${calls}`, url).toString() },
          body: Buffer.alloc(0),
        };
      },
    }),
    { code: 'STRAVA_AVATAR_REDIRECT_LIMIT' },
  );
  assert.equal(calls, 3);
});

test('重定向链共享一个总超时预算且缺少 Location 时拒绝', async () => {
  let now = 0;
  let calls = 0;
  await assert.rejects(
    downloadAvatar(allowedUrl, {
      now: () => now,
      lookup: publicLookup,
      request: async ({ totalTimeoutMs }) => {
        calls += 1;
        assert.ok(totalTimeoutMs > 0 && totalTimeoutMs <= TOTAL_TIMEOUT_MS);
        now += TOTAL_TIMEOUT_MS + 1;
        return {
          statusCode: 302,
          headers: { location: '/next.jpg' },
          body: Buffer.alloc(0),
        };
      },
    }),
    { code: 'STRAVA_AVATAR_TOTAL_TIMEOUT' },
  );
  assert.equal(calls, 1);

  await assert.rejects(
    downloadAvatar(allowedUrl, {
      lookup: publicLookup,
      request: async () => ({ statusCode: 302, headers: {}, body: Buffer.alloc(0) }),
    }),
    { code: 'STRAVA_AVATAR_REDIRECT_BLOCKED' },
  );
});

test('DNS lookup 永不返回时仍受总 deadline 限制', async () => {
  const startedAt = Date.now();
  await assert.rejects(
    Promise.race([
      downloadAvatar(allowedUrl, {
        totalTimeoutMs: 10,
        lookup: async () => new Promise(() => {}),
        request: async () => {
          throw new Error('request must not run');
        },
      }),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(Object.assign(new Error('test deadline exceeded'), { code: 'TEST_TIMEOUT' })),
          100,
        ),
      ),
    ]),
    { code: 'STRAVA_AVATAR_TOTAL_TIMEOUT' },
  );
  assert.ok(Date.now() - startedAt < 500);
});

test('下载强制大小、MIME 与 JPEG/PNG/WebP magic 一致', async () => {
  for (const [contentType, body, extension] of [
    ['image/jpeg', jpeg, 'jpg'],
    ['image/png', png, 'png'],
    ['image/webp', webp, 'webp'],
  ]) {
    const result = await downloadAvatar(allowedUrl, {
      lookup: publicLookup,
      request: async ({ maxBytes, connectTimeoutMs, totalTimeoutMs, addresses }) => {
        assert.equal(maxBytes, MAX_AVATAR_BYTES);
        assert.equal(connectTimeoutMs, CONNECT_TIMEOUT_MS);
        assert.ok(totalTimeoutMs > 0 && totalTimeoutMs <= TOTAL_TIMEOUT_MS);
        assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]);
        return { statusCode: 200, headers: { 'content-type': contentType }, body };
      },
    });
    assert.deepEqual(result, { bytes: body, contentType, extension });
  }
  for (const response of [
    { headers: { 'content-type': 'text/html' }, body: jpeg },
    { headers: { 'content-type': 'image/png' }, body: jpeg },
    { headers: { 'content-type': 'image/jpeg' }, body: Buffer.from('not-an-image') },
    { headers: { 'content-type': 'image/jpeg' }, body: Buffer.alloc(5 * 1024 * 1024 + 1) },
  ]) {
    await assert.rejects(
      downloadAvatar(allowedUrl, {
        lookup: publicLookup,
        request: async () => ({ statusCode: 200, ...response }),
      }),
      { code: /STRAVA_AVATAR_(TYPE_INVALID|TOO_LARGE)/ },
    );
  }
});

function fakeRequest(onEnd) {
  return (_url, options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = (milliseconds, handler) => {
      request.connectTimeout = milliseconds;
      request.connectTimeoutHandler = handler;
    };
    request.destroy = (error) => queueMicrotask(() => request.emit('error', error));
    request.end = () => onEnd({ request, options, callback });
    return request;
  };
}

test('底层请求固定 DNS 结果，并限制连接超时、总超时与流式 body 大小', async () => {
  let pinned;
  await assert.rejects(
    boundedRequest(new URL(allowedUrl), [{ address: '93.184.216.34', family: 4 }], {
      maxBytes: 4,
      connectTimeoutMs: 20,
      totalTimeoutMs: 50,
      requestFactory: fakeRequest(({ request, options, callback }) => {
        options.lookup('ignored', {}, (_error, address, family) => {
          pinned = { address, family };
        });
        assert.equal(request.connectTimeout, 20);
        callback(
          Object.assign(Readable.from([Buffer.alloc(3), Buffer.alloc(2)]), {
            statusCode: 200,
            headers: { 'content-type': 'image/jpeg' },
          }),
        );
      }),
    }),
    { code: 'STRAVA_AVATAR_TOO_LARGE' },
  );
  assert.deepEqual(pinned, { address: '93.184.216.34', family: 4 });

  await assert.rejects(
    boundedRequest(new URL(allowedUrl), [{ address: '93.184.216.34', family: 4 }], {
      connectTimeoutMs: 1,
      totalTimeoutMs: 50,
      requestFactory: fakeRequest(({ request }) => request.connectTimeoutHandler()),
    }),
    { code: 'STRAVA_AVATAR_CONNECT_TIMEOUT' },
  );

  await assert.rejects(
    boundedRequest(new URL(allowedUrl), [{ address: '93.184.216.34', family: 4 }], {
      connectTimeoutMs: 50,
      totalTimeoutMs: 1,
      requestFactory: fakeRequest(() => {}),
    }),
    { code: 'STRAVA_AVATAR_TOTAL_TIMEOUT' },
  );
});

test('真实 boundedRequest 路径保留瞬时网络码并按剩余总预算重试', async () => {
  let calls = 0;
  let clock = 0;
  const connectBudgets = [];
  const result = await downloadAvatar(allowedUrl, {
    totalTimeoutMs: 100,
    now: () => clock,
    lookup: publicLookup,
    requestFactory: fakeRequest(({ request, callback }) => {
      calls += 1;
      connectBudgets.push(request.connectTimeout);
      if (calls === 1) {
        clock = 40;
        request.emit('error', Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }));
        return;
      }
      callback(
        Object.assign(Readable.from([jpeg]), {
          statusCode: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      );
    }),
  });

  assert.equal(result.extension, 'jpg');
  assert.equal(calls, 2);
  assert.deepEqual(connectBudgets, [100, 60]);
});

test('真实 boundedRequest 路径在同一总预算内重试瞬时 DNS 失败', async () => {
  let lookupCalls = 0;
  let clock = 0;
  const connectBudgets = [];
  const result = await downloadAvatar(allowedUrl, {
    totalTimeoutMs: 100,
    now: () => clock,
    lookup: async () => {
      lookupCalls += 1;
      if (lookupCalls === 1) {
        clock = 35;
        throw Object.assign(new Error('temporary dns failure'), { code: 'EAI_AGAIN' });
      }
      return [{ address: '93.184.216.34', family: 4 }];
    },
    requestFactory: fakeRequest(({ request, callback }) => {
      connectBudgets.push(request.connectTimeout);
      callback(
        Object.assign(Readable.from([jpeg]), {
          statusCode: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      );
    }),
  });

  assert.equal(result.extension, 'jpg');
  assert.equal(lookupCalls, 2);
  assert.deepEqual(connectBudgets, [65]);
});

test('导入只使用当前用户 credential URL，并按 strava origin 登记后切换', async () => {
  const openid = 'owner';
  const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
  const prefix = mediaOwnerPrefix(openid, mediaSecret);
  const fileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.png`;
  const sha256 = require('node:crypto').createHash('sha256').update(png).digest('hex');
  const canonicalPath = canonicalMediaPath(openid, fileId, sha256, 'png', mediaSecret);
  const canonicalFileId = `cloud://env/${canonicalPath}`;
  const calls = [];
  const store = {
    prepareAvatarImport: async (_openid, credential, intent) => {
      calls.push({ operation: 'prepare', credential, intent });
      return intent;
    },
    prepareAvatarUpload: async (...args) => {
      calls.push({ operation: 'prepare-upload', args });
    },
    markAvatarImportUploaded: async (...args) => {
      calls.push({ operation: 'uploaded', args });
    },
    prepareCanonicalUpload: async (...args) => {
      calls.push({ operation: 'prepare-canonical', args });
    },
    completeAvatarImport: async (...args) => {
      calls.push({ operation: 'complete', args });
      return { nickname: 'Rider', avatar_file_id: fileId, avatar_source: 'strava' };
    },
  };
  const result = await importStravaAvatar({
    openid,
    credential: {
      _id: openid,
      openid,
      athlete_id: '42',
      credential_generation: 7,
      athlete_avatar_url: allowedUrl,
    },
    mediaSecret,
    download: async (url) => {
      calls.push({ operation: 'download' });
      assert.equal(url, allowedUrl);
      return { bytes: png, contentType: 'image/png', extension: 'png' };
    },
    uploadFile: async ({ cloudPath, fileContent }) => {
      calls.push({ operation: cloudPath === canonicalPath ? 'upload-canonical' : 'upload-source' });
      assert.equal(fileContent, png);
      if (cloudPath === canonicalPath) return { fileID: canonicalFileId };
      assert.equal(cloudPath, `${prefix}123e4567-e89b-42d3-a456-426614174000.png`);
      return { fileID: fileId };
    },
    deleteFile: async () => ({ fileList: [] }),
    store,
    randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
    now: new Date('2026-09-29T12:00:00.000Z'),
  });
  assert.equal(result.avatar_source, 'strava');
  assert.equal(calls[0].operation, 'prepare');
  assert.equal(calls[0].credential.credential_generation, 7);
  assert.equal(calls[0].intent.status, 'leased');
  assert.match(calls[0].intent.avatar_url_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(calls[0].intent).includes(allowedUrl), false);
  assert.equal(calls[1].operation, 'download');
  assert.equal(calls[2].operation, 'prepare-upload');
  assert.equal(calls[3].operation, 'upload-source');
  assert.equal(calls[4].operation, 'uploaded');
  assert.equal(calls[5].operation, 'prepare-canonical');
  assert.equal(calls[6].operation, 'upload-canonical');
  assert.equal(calls[7].operation, 'complete');
  const fence = calls[2].args[1];
  assert.deepEqual(calls[4].args[1], fence);
  assert.deepEqual(calls[7].args[1], fence);
  assert.equal(calls[7].args[5].canonical_file_id, canonicalFileId);
  assert.equal(JSON.stringify(fence).includes(allowedUrl), false);
});

test('并发导入只有 lease winner 进入下载，loser 不得清除 winner lease', async () => {
  const openid = 'owner';
  const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
  const prefix = mediaOwnerPrefix(openid, mediaSecret);
  let activeIntent = '';
  let downloadCalls = 0;
  let releaseDownload;
  const downloadGate = new Promise((resolve) => {
    releaseDownload = resolve;
  });
  const failedIntents = [];
  const store = {
    prepareAvatarImport: async (_openid, _credential, intent) => {
      if (activeIntent && activeIntent !== intent._id)
        throw Object.assign(new Error('busy'), { code: 'STRAVA_AVATAR_BUSY' });
      activeIntent = intent._id;
      return intent;
    },
    prepareAvatarUpload: async () => true,
    markAvatarImportUploaded: async () => true,
    prepareCanonicalUpload: async () => true,
    completeAvatarImport: async (_openid, fence) => {
      activeIntent = '';
      return {
        avatar_source: 'strava',
        avatar_file_id: `cloud://env/${prefix}${fence.intent_id}.jpg`,
      };
    },
    failAvatarImport: async (_openid, fence) => {
      failedIntents.push(fence.intent_id);
      if (activeIntent === fence.intent_id) activeIntent = '';
      return { aborted: true };
    },
  };
  const credential = {
    _id: openid,
    openid,
    athlete_id: '42',
    credential_generation: 7,
    athlete_avatar_url: allowedUrl,
  };
  const run = (uuid) =>
    importStravaAvatar({
      openid,
      credential,
      mediaSecret,
      download: async () => {
        downloadCalls += 1;
        await downloadGate;
        return { bytes: jpeg, contentType: 'image/jpeg', extension: 'jpg' };
      },
      uploadFile: async ({ cloudPath }) => ({ fileID: `cloud://env/${cloudPath}` }),
      deleteFile: async () => ({ fileList: [] }),
      store,
      randomUUID: () => uuid,
    });

  const first = run('123e4567-e89b-42d3-a456-426614174000');
  await new Promise((resolve) => setImmediate(resolve));
  const second = run('123e4567-e89b-42d3-a456-426614174001');
  const settled = Promise.allSettled([first, second]);
  await new Promise((resolve) => setImmediate(resolve));
  releaseDownload();
  const [, loser] = await settled;

  assert.equal(loser.status, 'rejected');
  assert.equal(loser.reason.code, 'STRAVA_AVATAR_BUSY');
  assert.equal(downloadCalls, 1);
  assert.deepEqual(failedIntents, []);
});

test('导入拒绝非当前用户 credential，下载失败不上传', async () => {
  let uploaded = false;
  await assert.rejects(
    importStravaAvatar({
      openid: 'owner',
      credential: { _id: 'other', openid: 'other', athlete_avatar_url: allowedUrl },
      mediaSecret: 'profile-media-secret-for-tests-32-bytes',
      download: async () => ({ bytes: jpeg, contentType: 'image/jpeg', extension: 'jpg' }),
      uploadFile: async () => {
        uploaded = true;
      },
      store: {
        prepareAvatarImport: async (_openid, _credential, intent) => intent,
        failAvatarImport: async () => ({ aborted: true }),
      },
    }),
    { code: 'STRAVA_NOT_CONNECTED' },
  );
  assert.equal(uploaded, false);

  await assert.rejects(
    importStravaAvatar({
      openid: 'owner',
      credential: {
        _id: 'owner',
        openid: 'owner',
        athlete_id: '42',
        credential_generation: 7,
        athlete_avatar_url: allowedUrl,
      },
      mediaSecret: 'profile-media-secret-for-tests-32-bytes',
      download: async () => {
        throw Object.assign(new Error('timeout'), { code: 'STRAVA_AVATAR_TOTAL_TIMEOUT' });
      },
      uploadFile: async () => {
        uploaded = true;
      },
      store: {
        prepareAvatarImport: async (_openid, _credential, intent) => intent,
        failAvatarImport: async () => ({ aborted: true }),
      },
    }),
    { code: 'STRAVA_AVATAR_TOTAL_TIMEOUT' },
  );
  assert.equal(uploaded, false);
});

test('上传后登记或头像事务失败时保留旧头像并补偿 orphan', async () => {
  const openid = 'owner';
  const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
  const prefix = mediaOwnerPrefix(openid, mediaSecret);
  const fileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  const intentState = {};
  const calls = [];
  const store = {
    prepareAvatarImport: async (_openid, _credential, intent) => {
      Object.assign(intentState, intent);
      calls.push('prepare');
      return intent;
    },
    prepareAvatarUpload: async () => true,
    markAvatarImportUploaded: async (_openid, _fence, uploadedFileId) => {
      Object.assign(intentState, { status: 'uploaded', file_id: uploadedFileId });
      calls.push('uploaded');
    },
    prepareCanonicalUpload: async () => true,
    completeAvatarImport: async () => {
      calls.push('complete');
      throw new Error('registry transaction unavailable');
    },
    failAvatarImport: async (_openid, _fence, uploadedFileId, errorCode) => {
      Object.assign(intentState, {
        status: 'orphaned',
        file_id: uploadedFileId,
        last_error_code: errorCode,
      });
      calls.push('orphaned');
      return { orphaned: true };
    },
  };
  await assert.rejects(
    importStravaAvatar({
      openid,
      credential: {
        _id: openid,
        openid,
        athlete_id: '42',
        credential_generation: 7,
        athlete_avatar_url: allowedUrl,
      },
      mediaSecret,
      download: async () => ({ bytes: jpeg, contentType: 'image/jpeg', extension: 'jpg' }),
      uploadFile: async ({ cloudPath }) => ({ fileID: `cloud://env/${cloudPath}` }),
      deleteFile: async () => {
        calls.push('delete-failed');
        throw new Error('delete unavailable');
      },
      store,
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
    }),
    /registry transaction unavailable/,
  );
  assert.deepEqual(calls, ['prepare', 'uploaded', 'complete', 'orphaned']);
  assert.equal(intentState.status, 'orphaned');
  assert.equal(intentState.file_id, fileId);
  assert.equal(intentState.last_error_code, 'STRAVA_AVATAR_IMPORT_FAILED');
});

test('上传返回非法 fileId 时不把它送入特权删除路径', async () => {
  const deleted = [];
  let registered = false;
  let selected = false;
  let orphaned = false;
  await assert.rejects(
    importStravaAvatar({
      openid: 'owner',
      credential: {
        _id: 'owner',
        openid: 'owner',
        athlete_id: '42',
        credential_generation: 7,
        athlete_avatar_url: allowedUrl,
      },
      mediaSecret: 'profile-media-secret-for-tests-32-bytes',
      download: async () => ({ bytes: jpeg, contentType: 'image/jpeg', extension: 'jpg' }),
      uploadFile: async () => ({ fileID: 'cloud://env/not-owner/avatar.jpg' }),
      deleteFile: async ({ fileList }) => {
        deleted.push(...fileList);
        return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) };
      },
      store: {
        prepareAvatarImport: async (_openid, _credential, intent) => intent,
        prepareAvatarUpload: async () => true,
        markAvatarImportUploaded: async () => {},
        prepareCanonicalUpload: async () => true,
        completeAvatarImport: async () => {
          registered = true;
          selected = true;
        },
        failAvatarImport: async () => {
          orphaned = true;
          return { orphaned: true };
        },
      },
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
    }),
    { code: 'MEDIA_NOT_OWNED' },
  );
  assert.deepEqual(deleted, []);
  assert.equal(registered, false);
  assert.equal(selected, false);
  assert.equal(orphaned, true);
});

test('最终事务已提交但响应丢失时不删除已激活头像', async () => {
  const openid = 'owner';
  const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
  const prefix = mediaOwnerPrefix(openid, mediaSecret);
  const fileId = `cloud://env/${prefix}123e4567-e89b-42d3-a456-426614174000.jpg`;
  let deleted = false;
  await assert.rejects(
    importStravaAvatar({
      openid,
      credential: {
        _id: openid,
        openid,
        athlete_id: '42',
        credential_generation: 7,
        athlete_avatar_url: allowedUrl,
      },
      mediaSecret,
      download: async () => ({ bytes: jpeg, contentType: 'image/jpeg', extension: 'jpg' }),
      uploadFile: async ({ cloudPath }) => ({ fileID: `cloud://env/${cloudPath}` }),
      deleteFile: async () => {
        deleted = true;
      },
      store: {
        prepareAvatarImport: async (_openid, _credential, intent) => intent,
        prepareAvatarUpload: async () => true,
        markAvatarImportUploaded: async () => {},
        prepareCanonicalUpload: async () => true,
        completeAvatarImport: async () => {
          throw new Error('transaction response lost');
        },
        failAvatarImport: async () => ({ completed: true }),
      },
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
    }),
    /transaction response lost/,
  );
  assert.equal(deleted, false);
});

test('最终事务已发出且 intent 对账失败时保留对象等待服务端收敛', async () => {
  const openid = 'owner';
  const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
  const fileId = `cloud://env/${mediaOwnerPrefix(openid, mediaSecret)}123e4567-e89b-42d3-a456-426614174000.jpg`;
  let deleted = false;
  await assert.rejects(
    importStravaAvatar({
      openid,
      credential: {
        _id: openid,
        openid,
        athlete_id: '42',
        credential_generation: 7,
        athlete_avatar_url: allowedUrl,
      },
      mediaSecret,
      download: async () => ({ bytes: jpeg, contentType: 'image/jpeg', extension: 'jpg' }),
      uploadFile: async ({ cloudPath }) => ({ fileID: `cloud://env/${cloudPath}` }),
      deleteFile: async () => {
        deleted = true;
      },
      store: {
        prepareAvatarImport: async (_openid, _credential, intent) => intent,
        prepareAvatarUpload: async () => true,
        markAvatarImportUploaded: async () => {},
        prepareCanonicalUpload: async () => true,
        completeAvatarImport: async () => {
          throw new Error('transaction response lost');
        },
        failAvatarImport: async () => {
          throw new Error('reconciliation unavailable');
        },
      },
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
    }),
    { code: 'STRAVA_AVATAR_STATE_UNKNOWN' },
  );
  assert.equal(deleted, false);
});

test('ECONNRESET 等瞬时网络错误在总超时内复用已验证地址重试一次后成功', async () => {
  let calls = 0;
  const seenAddresses = [];
  const result = await downloadAvatar(allowedUrl, {
    lookup: publicLookup,
    request: async ({ addresses }) => {
      calls += 1;
      seenAddresses.push(addresses);
      if (calls === 1) throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
      return { statusCode: 200, headers: { 'content-type': 'image/jpeg' }, body: jpeg };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.extension, 'jpg');
  // 重试不重新做 DNS，两次复用同一已验证地址，避免重试间隙被重绑定。
  assert.deepEqual(seenAddresses[0], seenAddresses[1]);
});

test('连续两次底层网络错误最终报下载失败', async () => {
  let calls = 0;
  await assert.rejects(
    downloadAvatar(allowedUrl, {
      lookup: publicLookup,
      request: async () => {
        calls += 1;
        throw new Error('socket hang up');
      },
    }),
    { code: 'STRAVA_AVATAR_DOWNLOAD_FAILED' },
  );
  assert.equal(calls, 2);
});

test('下载总超时等显式错误码不做网络重试', async () => {
  let calls = 0;
  await assert.rejects(
    downloadAvatar(allowedUrl, {
      lookup: publicLookup,
      request: async () => {
        calls += 1;
        throw Object.assign(new Error('total timeout'), { code: 'STRAVA_AVATAR_TOTAL_TIMEOUT' });
      },
    }),
    { code: 'STRAVA_AVATAR_TOTAL_TIMEOUT' },
  );
  assert.equal(calls, 1);
});
