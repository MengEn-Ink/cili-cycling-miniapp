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
