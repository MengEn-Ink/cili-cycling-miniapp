'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let subject = {};
try {
  subject = require('./core');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const authorizeCleanup = subject.authorizeCleanup || (() => 'missing');
const claimDecision = subject.claimDecision || (() => ({ kind: 'missing' }));
const failureDecision = subject.failureDecision || (() => ({ status: 'missing' }));
const drainMediaCleanup = subject.drainMediaCleanup || (async () => ({ deleted: -1 }));

const now = new Date('2026-09-29T12:00:00.000Z');
const record = {
  _id: 'media-1',
  file_id: 'cloud://env/profiles/owner/photo.jpg',
  owner_openid: 'owner',
  category: 'other',
  status: 'unreferenced',
  cleanup_after: new Date('2026-09-29T11:00:00.000Z'),
};

test('清理 worker 只接受配置的无用户定时触发器', () => {
  assert.equal(
    authorizeCleanup({ Type: 'Timer', TriggerName: 'profile-media-cleanup-worker' }, ''),
    'timer-worker',
  );
  assert.throws(() => authorizeCleanup({}, ''), { code: 'SERVICE_IDENTITY_REQUIRED' });
  assert.throws(
    () =>
      authorizeCleanup(
        { Type: 'Timer', TriggerName: 'profile-media-cleanup-worker' },
        'forged-user',
      ),
    { code: 'SERVICE_IDENTITY_REQUIRED' },
  );
});

test('claim 前重查 owner profile；仍引用则恢复 active，不引用才加删除 fence', () => {
  assert.deepEqual(
    claimDecision(record, { _id: 'owner', photos: [{ file_id: record.file_id }] }, now, 'lease-1'),
    {
      kind: 'referenced',
      update: {
        status: 'active',
        referenced_at: now,
        cleanup_after: null,
        delete_lease_id: '',
        updated_at: now,
      },
    },
  );
  const claimed = claimDecision(record, { _id: 'owner', photos: [] }, now, 'lease-1');
  assert.equal(claimed.kind, 'claimed');
  assert.deepEqual(claimed.update, {
    status: 'deleting',
    delete_lease_id: 'lease-1',
    delete_claimed_at: now,
    delete_lease_expires_at: new Date('2026-09-29T12:05:00.000Z'),
    delete_attempts: 1,
    updated_at: now,
  });
  assert.equal(
    claimDecision(
      { ...record, cleanup_after: new Date('2026-09-29T13:00:00.000Z') },
      { _id: 'owner', photos: [] },
      now,
      'lease-1',
    ),
    null,
  );
  assert.equal(claimDecision(record, { _id: 'another', photos: [] }, now, 'lease-1'), null);
});

test('过期 deleting 可 fenced 重领，未过期 lease 不重复删除', () => {
  const expired = claimDecision(
    {
      ...record,
      status: 'deleting',
      delete_attempts: 1,
      delete_lease_expires_at: new Date('2026-09-29T11:59:59.000Z'),
    },
    { _id: 'owner', photos: [] },
    now,
    'lease-2',
  );
  assert.equal(expired.kind, 'claimed');
  assert.equal(expired.update.delete_lease_id, 'lease-2');
  assert.equal(expired.update.delete_attempts, 2);
  assert.equal(
    claimDecision(
      {
        ...record,
        status: 'deleting',
        delete_lease_expires_at: new Date('2026-09-29T12:00:01.000Z'),
      },
      { _id: 'owner', photos: [] },
      now,
      'lease-2',
    ),
    null,
  );
});

test('delete_failed 按退避重试并在最大次数后进入 terminal', () => {
  const retry = claimDecision(
    {
      ...record,
      status: 'delete_failed',
      delete_attempts: 2,
      retry_at: new Date('2026-09-29T11:59:59.000Z'),
    },
    { _id: 'owner', photos: [] },
    now,
    'lease-3',
  );
  assert.equal(retry.kind, 'claimed');
  assert.equal(retry.update.delete_attempts, 3);
  assert.equal(
    claimDecision(
      {
        ...record,
        status: 'delete_failed',
        delete_attempts: 2,
        retry_at: new Date('2026-09-29T12:00:01.000Z'),
      },
      { _id: 'owner', photos: [] },
      now,
      'lease-3',
    ),
    null,
  );
  assert.deepEqual(failureDecision({ delete_attempts: 2 }, now, 'DELETE_FAILED'), {
    status: 'delete_failed',
    delete_lease_id: '',
    delete_lease_expires_at: null,
    retry_at: new Date('2026-09-29T12:20:00.000Z'),
    last_error_code: 'DELETE_FAILED',
    delete_failed_at: now,
    updated_at: now,
  });
  assert.deepEqual(failureDecision({ delete_attempts: 3 }, now, 'DELETE_FAILED'), {
    status: 'delete_failed_terminal',
    delete_lease_id: '',
    delete_lease_expires_at: null,
    retry_at: null,
    last_error_code: 'DELETE_FAILED',
    delete_failed_at: now,
    updated_at: now,
  });
});

test('executor 有界发现并记录 deleted/delete_failed，不泄漏底层错误', async () => {
  const listed = Array.from({ length: 25 }, (_, index) => `media-${index}`);
  const deleted = [];
  const failed = [];
  let requestedLimit;
  const result = await drainMediaCleanup({
    now,
    randomUUID: () => 'lease',
    limit: 99,
    store: {
      listEligible: async (_now, limit) => {
        requestedLimit = limit;
        return listed;
      },
      claim: async (id, fence) => ({
        claimed: true,
        _id: id,
        file_id: `cloud://env/${id}`,
        delete_lease_id: fence.leaseId,
      }),
      markDeleted: async (id) => {
        deleted.push(id);
        return true;
      },
      markFailed: async (id, fence) => {
        failed.push({ id, errorCode: fence.errorCode });
        return true;
      },
    },
    deleteFile: async ({ fileList }) => {
      if (fileList[0].endsWith('media-1')) throw new Error('token=secret storage failure');
      return { fileList: [{ fileID: fileList[0], status: 0 }] };
    },
  });
  assert.equal(requestedLimit, 20);
  assert.equal(result.discovered, 20);
  assert.equal(result.claimed, 20);
  assert.equal(result.deleted, 19);
  assert.equal(result.failed, 1);
  assert.equal(deleted.length, 19);
  assert.deepEqual(failed, [{ id: 'media-1', errorCode: 'DELETE_FAILED' }]);
});

test('重领 deleting 后 CloudBase 返回文件不存在时按幂等成功标记 deleted', async () => {
  const deleted = [];
  const failed = [];
  const result = await drainMediaCleanup({
    now,
    randomUUID: () => 'lease-reclaimed',
    store: {
      listEligible: async () => ['media-1'],
      claim: async () => ({
        ...record,
        status: 'deleting',
        claimed: true,
        delete_attempts: 2,
        delete_lease_id: 'lease-reclaimed',
      }),
      markDeleted: async (id) => {
        deleted.push(id);
        return true;
      },
      markFailed: async (id) => {
        failed.push(id);
        return true;
      },
    },
    deleteFile: async () => ({
      fileList: [
        {
          fileID: record.file_id,
          status: -503003,
          errMsg: 'STORAGE_FILE_NONEXIST',
        },
      ],
    }),
  });
  assert.deepEqual(deleted, ['media-1']);
  assert.deepEqual(failed, []);
  assert.equal(result.deleted, 1);
  assert.equal(result.failed, 0);
});
