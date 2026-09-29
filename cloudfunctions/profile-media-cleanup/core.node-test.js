'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

let subject = {};
try {
  subject = require('./core');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const authorizeCleanup = subject.authorizeCleanup || (() => 'missing');
const claimDecision = subject.claimDecision || (() => ({ kind: 'missing' }));
const importClaimDecision = subject.importClaimDecision || (() => ({ kind: 'missing' }));
const failureDecision = subject.failureDecision || (() => ({ status: 'missing' }));
const drainMediaCleanup = subject.drainMediaCleanup || (async () => ({ deleted: -1 }));

const now = new Date('2026-09-29T12:00:00.000Z');
const mediaSecret = 'profile-media-secret-for-tests-32-bytes';
const ownerAlias = crypto
  .createHmac('sha256', mediaSecret)
  .update('owner')
  .digest('hex')
  .slice(0, 32);
const importCloudPath = `profiles/${ownerAlias}/123e4567-e89b-42d3-a456-426614174000.jpg`;
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

test('持久化 avatar import intent 可被 cleanup 收敛', async () => {
  const intent = {
    _id: 'intent-1',
    owner_openid: 'owner',
    cloud_path: importCloudPath,
    file_id: `cloud://env/${importCloudPath}`,
    status: 'orphaned',
    cleanup_after: new Date('2026-09-29T11:00:00.000Z'),
  };
  assert.equal(importClaimDecision(intent, undefined, now, 'lease-1', mediaSecret).kind, 'claimed');
  assert.equal(
    importClaimDecision(
      {
        ...intent,
        status: 'prepared',
        file_id: undefined,
        cloud_path: importCloudPath,
      },
      undefined,
      now,
      'lease-1',
      mediaSecret,
    ).kind,
    'resolve',
  );
  const deleted = [];
  const result = await drainMediaCleanup({
    now,
    randomUUID: () => 'lease-1',
    store: {
      listEligible: async () => [],
      listImportIntents: async () => ['intent-1'],
      claimImportIntent: async () => ({ ...intent, claimed: true, delete_lease_id: 'lease-1' }),
      markImportDeleted: async (id, fence) => {
        deleted.push({ id, deferCompletion: fence.deferCompletion });
        return true;
      },
      markImportFailed: async () => true,
      isImportRecoveryLeaseCurrent: async () => true,
    },
    deleteFile: async ({ fileList }) => ({ fileList: [{ fileID: fileList[0], status: 0 }] }),
  });
  assert.deepEqual(deleted, [{ id: 'intent-1', deferCompletion: false }]);
  assert.equal(result.discovered, 1);
  assert.equal(result.deleted, 1);
});

test('prepared intent 通过 owner cloudPath 恢复删除目标后完成 cleanup', async () => {
  const cloudPath = importCloudPath;
  const fileId = `cloud://env/${cloudPath}`;
  const deleted = [];
  const attached = [];
  const result = await drainMediaCleanup({
    now,
    randomUUID: () => 'lease-1',
    store: {
      listEligible: async () => [],
      listImportIntents: async () => ['intent-prepared'],
      claimImportIntent: async () => ({
        _id: 'intent-prepared',
        owner_openid: 'owner',
        cloud_path: cloudPath,
        status: 'recovering',
        claimed: false,
        resolve_target: true,
        delete_lease_id: 'lease-1',
      }),
      attachImportDeleteTarget: async (id, fence) => {
        attached.push({ id, fileId: fence.fileId });
        return true;
      },
      markImportDeleted: async (id, fence) => {
        deleted.push({ id, deferCompletion: fence.deferCompletion });
        return true;
      },
      markImportFailed: async () => true,
      isImportRecoveryLeaseCurrent: async () => true,
    },
    uploadFile: async ({ cloudPath: target, fileContent }) => {
      assert.equal(target, cloudPath);
      assert.equal(fileContent.length, 1);
      return { fileID: fileId };
    },
    deleteFile: async ({ fileList }) => ({ fileList: [{ fileID: fileList[0], status: 0 }] }),
  });
  assert.deepEqual(attached, [{ id: 'intent-prepared', fileId }]);
  assert.deepEqual(deleted, [{ id: 'intent-prepared', deferCompletion: true }]);
  assert.equal(result.deleted, 1);
});

test('路径不匹配的 intent fileId 不会进入特权删除', async () => {
  for (const fileId of [
    'cloud://env/profiles/other/avatar.jpg',
    `https://evil.example/${importCloudPath}`,
  ]) {
    assert.equal(
      importClaimDecision(
        {
          _id: 'intent-invalid',
          owner_openid: 'owner',
          cloud_path: importCloudPath,
          file_id: fileId,
          status: 'orphaned',
          cleanup_after: new Date('2026-09-29T11:00:00.000Z'),
        },
        undefined,
        now,
        'lease-1',
        mediaSecret,
      ).kind,
      'invalid',
    );
  }
});

test('过期 recovering intent 可重新领取并恢复删除目标', () => {
  const decision = importClaimDecision(
    {
      _id: 'intent-recovering',
      owner_openid: 'owner',
      cloud_path: importCloudPath,
      status: 'recovering',
      delete_attempts: 1,
      delete_lease_expires_at: new Date('2026-09-29T11:59:59.000Z'),
    },
    undefined,
    now,
    'lease-next',
    mediaSecret,
  );
  assert.equal(decision.kind, 'resolve');
  assert.equal(decision.update.delete_lease_id, 'lease-next');
  assert.equal(decision.update.delete_attempts, 2);
});

test('recovering intent 达到最大尝试次数后进入 terminal', () => {
  const decision = importClaimDecision(
    {
      _id: 'intent-recovering-exhausted',
      owner_openid: 'owner',
      cloud_path: importCloudPath,
      status: 'recovering',
      delete_attempts: 3,
      delete_lease_expires_at: new Date('2026-09-29T11:59:59.000Z'),
    },
    undefined,
    now,
    'lease-next',
    mediaSecret,
  );
  assert.equal(decision.kind, 'terminal');
  assert.equal(decision.update.status, 'delete_failed_terminal');
  assert.equal(decision.update.last_error_code, 'DELETE_LEASE_EXHAUSTED');
});

test('下载阶段遗留的 leased intent 到期后直接终止且不触碰存储', () => {
  const decision = importClaimDecision(
    {
      _id: 'intent-leased',
      owner_openid: 'owner',
      athlete_id: 'athlete-1',
      credential_generation: 7,
      avatar_url_fingerprint: 'a'.repeat(64),
      status: 'leased',
      cleanup_after: new Date('2026-09-29T11:59:59.000Z'),
    },
    undefined,
    now,
    'lease-next',
    mediaSecret,
  );
  assert.equal(decision.kind, 'aborted');
  assert.equal(decision.update.status, 'aborted');
  assert.equal(decision.update.cleanup_after, null);
});

test('recovery 首次删除后必须经过延迟确认才能进入 deleted', () => {
  const decision = importClaimDecision(
    {
      _id: 'intent-confirming',
      owner_openid: 'owner',
      cloud_path: importCloudPath,
      file_id: `cloud://env/${importCloudPath}`,
      status: 'delete_confirming',
      cleanup_after: new Date('2026-09-29T11:59:59.000Z'),
      delete_attempts: 0,
    },
    undefined,
    now,
    'lease-confirm',
    mediaSecret,
  );
  assert.equal(decision.kind, 'claimed');
  assert.equal(decision.finalize_delete, true);
  assert.equal(decision.update.delete_confirmation_pending, true);
});

test('恢复路径必须匹配 owner HMAC 前缀', () => {
  const decision = importClaimDecision(
    {
      _id: 'intent-cross-owner',
      owner_openid: 'different-owner',
      cloud_path: importCloudPath,
      status: 'orphaned',
      cleanup_after: new Date('2026-09-29T11:59:59.000Z'),
    },
    undefined,
    now,
    'lease-next',
    mediaSecret,
  );
  assert.equal(decision.kind, 'invalid');
});

test('stale recovery 在 newer lease 已完成后不会重建对象', async () => {
  let uploadCalls = 0;
  const result = await drainMediaCleanup({
    now,
    mediaSecret,
    randomUUID: () => 'lease-old',
    store: {
      listEligible: async () => [],
      listImportIntents: async () => ['intent-stale'],
      claimImportIntent: async () => ({
        _id: 'intent-stale',
        owner_openid: 'owner',
        cloud_path: importCloudPath,
        status: 'recovering',
        resolve_target: true,
        delete_lease_id: 'lease-old',
      }),
      isImportRecoveryLeaseCurrent: async () => false,
    },
    uploadFile: async () => {
      uploadCalls += 1;
      return { fileID: `cloud://env/${importCloudPath}` };
    },
    deleteFile: async () => ({ fileList: [] }),
  });
  assert.equal(uploadCalls, 0);
  assert.equal(result.claimed, 1);
  assert.equal(result.deleted, 0);
});

test('recovery 上传期间丢失 lease 会重新持久化删除 fence 后删除对象', async () => {
  const fileId = `cloud://env/${importCloudPath}`;
  const events = [];
  const result = await drainMediaCleanup({
    now,
    mediaSecret,
    randomUUID: () => 'lease-old',
    store: {
      listEligible: async () => [],
      listImportIntents: async () => ['intent-race'],
      claimImportIntent: async () => ({
        _id: 'intent-race',
        owner_openid: 'owner',
        cloud_path: importCloudPath,
        status: 'recovering',
        resolve_target: true,
        delete_lease_id: 'lease-old',
      }),
      isImportRecoveryLeaseCurrent: async () => true,
      attachImportDeleteTarget: async () => false,
      reclaimImportDeleteTarget: async (_id, fence) => {
        events.push(['reclaim', fence.fileId]);
        return true;
      },
      markImportDeleted: async (_id, fence) => {
        events.push(['marked']);
        assert.equal(fence.deferCompletion, true);
        return true;
      },
      markImportFailed: async () => true,
    },
    uploadFile: async () => {
      events.push(['uploaded']);
      return { fileID: fileId };
    },
    deleteFile: async ({ fileList }) => {
      events.push(['deleted', fileList[0]]);
      return { fileList: [{ fileID: fileList[0], status: 0 }] };
    },
  });
  assert.deepEqual(events, [['uploaded'], ['reclaim', fileId], ['deleted', fileId], ['marked']]);
  assert.equal(result.deleted, 1);
});

test('两个 recovery worker 交错时最后一个外部操作仍为删除', async () => {
  const fileId = `cloud://env/${importCloudPath}`;
  let state = { status: 'prepared', leaseId: '', fileId: '' };
  let objectExists = false;
  let releaseOldUpload;
  let signalOldUploadStarted;
  const oldUploadStarted = new Promise((resolve) => {
    signalOldUploadStarted = resolve;
  });
  const oldUploadRelease = new Promise((resolve) => {
    releaseOldUpload = resolve;
  });
  const store = {
    listEligible: async () => [],
    listImportIntents: async () => ['intent-race'],
    claimImportIntent: async (_id, fence) => {
      if (state.status === 'delete_confirming') {
        state = { ...state, status: 'deleting', leaseId: fence.leaseId };
        return {
          _id: 'intent-race',
          owner_openid: 'owner',
          cloud_path: importCloudPath,
          file_id: fileId,
          status: 'deleting',
          claimed: true,
          confirm_delete: true,
          delete_lease_id: fence.leaseId,
        };
      }
      state = { ...state, status: 'recovering', leaseId: fence.leaseId };
      return {
        _id: 'intent-race',
        owner_openid: 'owner',
        cloud_path: importCloudPath,
        status: 'recovering',
        resolve_target: true,
        delete_lease_id: fence.leaseId,
      };
    },
    isImportRecoveryLeaseCurrent: async (_id, fence) =>
      state.status === 'recovering' && state.leaseId === fence.leaseId,
    attachImportDeleteTarget: async (_id, fence) => {
      if (state.status !== 'recovering' || state.leaseId !== fence.leaseId) return false;
      state = { status: 'deleting', leaseId: fence.leaseId, fileId: fence.fileId };
      return true;
    },
    reclaimImportDeleteTarget: async (_id, fence) => {
      state = { status: 'deleting', leaseId: fence.leaseId, fileId: fence.fileId };
      return true;
    },
    markImportDeleted: async (_id, fence) => {
      if (state.status !== 'deleting' || state.leaseId !== fence.leaseId) return false;
      state = {
        ...state,
        status: fence.deferCompletion ? 'delete_confirming' : 'deleted',
        leaseId: '',
      };
      return true;
    },
    markImportFailed: async () => true,
  };
  const run = (leaseId, delayed) =>
    drainMediaCleanup({
      now,
      randomUUID: () => leaseId,
      store,
      uploadFile: async () => {
        if (delayed) {
          signalOldUploadStarted();
          await oldUploadRelease;
        }
        objectExists = true;
        return { fileID: fileId };
      },
      deleteFile: async () => {
        objectExists = false;
        return { fileList: [{ fileID: fileId, status: 0 }] };
      },
    });

  const oldWorker = run('lease-old', true);
  await oldUploadStarted;
  const newerResult = await run('lease-new', false);
  assert.equal(newerResult.deleted, 1);
  assert.equal(state.status, 'delete_confirming');
  releaseOldUpload();
  const oldResult = await oldWorker;
  assert.equal(oldResult.deleted, 1);
  assert.equal(state.status, 'delete_confirming');
  assert.equal(objectExists, false);
  const confirmationResult = await run('lease-confirm', false);
  assert.equal(confirmationResult.deleted, 1);
  assert.equal(state.status, 'deleted');
  assert.equal(objectExists, false);
});

test('旧 recovery 上传在首轮删除后迟到且无回调仍由确认阶段收敛', async () => {
  const fileId = `cloud://env/${importCloudPath}`;
  let objectExists = false;
  let state = 'recovering';
  let triggerLateStorageWrite;
  const lateStorageWrite = new Promise(() => {});
  const staleWorker = drainMediaCleanup({
    now,
    randomUUID: () => 'lease-old',
    store: {
      listEligible: async () => [],
      listImportIntents: async () => ['intent-late'],
      claimImportIntent: async () => ({
        owner_openid: 'owner',
        cloud_path: importCloudPath,
        resolve_target: true,
      }),
      isImportRecoveryLeaseCurrent: async () => true,
    },
    uploadFile: async () => {
      triggerLateStorageWrite = () => {
        objectExists = true;
      };
      return lateStorageWrite;
    },
    deleteFile: async () => ({ fileList: [] }),
  });
  void staleWorker;
  await new Promise((resolve) => setImmediate(resolve));

  objectExists = false;
  state = 'delete_confirming';
  triggerLateStorageWrite();
  assert.equal(objectExists, true);

  const confirmation = await drainMediaCleanup({
    now,
    randomUUID: () => 'lease-confirm',
    store: {
      listEligible: async () => [],
      listImportIntents: async () => ['intent-late'],
      claimImportIntent: async () => ({
        owner_openid: 'owner',
        cloud_path: importCloudPath,
        file_id: fileId,
        status: 'deleting',
        claimed: true,
        confirm_delete: true,
      }),
      markImportDeleted: async () => {
        state = 'deleted';
        return true;
      },
      markImportFailed: async () => true,
    },
    deleteFile: async () => {
      objectExists = false;
      return { fileList: [{ fileID: fileId, status: 0 }] };
    },
  });
  assert.equal(confirmation.deleted, 1);
  assert.equal(state, 'deleted');
  assert.equal(objectExists, false);
});

test('recovery 删除抛出可信 not-found 仍必须进入 delete_confirming', async () => {
  const fileId = `cloud://env/${importCloudPath}`;
  const completions = [];
  const result = await drainMediaCleanup({
    now,
    randomUUID: () => 'lease-recovery',
    store: {
      listEligible: async () => [],
      listImportIntents: async () => ['intent-missing'],
      claimImportIntent: async () => ({
        owner_openid: 'owner',
        cloud_path: importCloudPath,
        resolve_target: true,
      }),
      isImportRecoveryLeaseCurrent: async () => true,
      attachImportDeleteTarget: async () => true,
      markImportDeleted: async (_id, fence) => {
        completions.push(fence);
        return true;
      },
      markImportFailed: async () => true,
    },
    uploadFile: async () => ({ fileID: fileId }),
    deleteFile: async () => {
      throw { errCode: -503003, errMsg: 'STORAGE_FILE_NONEXIST' };
    },
  });
  assert.equal(result.deleted, 1);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].deferCompletion, true);
  assert.equal(completions[0].confirmAfter.getTime(), now.getTime() + 5 * 60 * 1000);
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
  const exhausted = claimDecision(
    {
      ...record,
      status: 'deleting',
      delete_attempts: 3,
      delete_lease_expires_at: new Date('2026-09-29T11:59:59.000Z'),
    },
    { _id: 'owner', photos: [] },
    now,
    'lease-3',
  );
  assert.equal(exhausted.kind, 'terminal');
  assert.equal(exhausted.update.status, 'delete_failed_terminal');
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

test('重领 deleting 后 CloudBase reject 明确对象不存在时按幂等成功标记 deleted', async () => {
  const deleted = [];
  const failed = [];
  const result = await drainMediaCleanup({
    now,
    randomUUID: () => 'lease-reclaimed',
    store: {
      listEligible: async () => ['media-1'],
      claim: async () => ({ ...record, claimed: true, delete_lease_id: 'lease-reclaimed' }),
      markDeleted: async (id) => {
        deleted.push(id);
        return true;
      },
      markFailed: async (id) => {
        failed.push(id);
        return true;
      },
    },
    deleteFile: async () => {
      throw { errCode: -503003, errMsg: 'STORAGE_FILE_NONEXIST' };
    },
  });
  assert.deepEqual(deleted, ['media-1']);
  assert.deepEqual(failed, []);
  assert.equal(result.deleted, 1);
  assert.equal(result.failed, 0);
});

test('包含模糊 not found 文案但非可信对象不存在码时记录删除失败', async () => {
  const deleted = [];
  const failed = [];
  const result = await drainMediaCleanup({
    now,
    randomUUID: () => 'lease-reclaimed',
    store: {
      listEligible: async () => ['media-1'],
      claim: async () => ({ ...record, claimed: true, delete_lease_id: 'lease-reclaimed' }),
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
          status: -1,
          errMsg: 'storage bucket not found',
        },
      ],
    }),
  });
  assert.deepEqual(deleted, []);
  assert.deepEqual(failed, ['media-1']);
  assert.equal(result.deleted, 0);
  assert.equal(result.failed, 1);
});
