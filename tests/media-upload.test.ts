import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaUploadError, uploadMedia, uploadWithRetry } from '../miniprogram/utils/media-upload';

const task = (run: (options: any) => void) => (options: any) => {
  const value = { abort: vi.fn(), onProgressUpdate: vi.fn(), offProgressUpdate: vi.fn() };
  queueMicrotask(() => run({ ...options, task: value }));
  return value;
};

describe('统一媒体上传 orchestrator', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('网络失败按同一授权路径重试并转发单调进度', async () => {
    const progress: number[] = [];
    let attempt = 0;
    const uploadFile = vi.fn(
      task(({ success, fail, task }) => {
        attempt += 1;
        const callback = task.onProgressUpdate.mock.calls[0]?.[0];
        callback?.({ progress: 20 });
        callback?.({ progress: 10 });
        if (attempt === 1) fail({ errMsg: 'request:fail network' });
        else success({ fileID: 'cloud://env/source.jpg' });
      }),
    );
    const result = await uploadWithRetry({
      cloud: { uploadFile },
      cloudPath: 'profiles/alias/activity-image/id.jpg',
      filePath: '/tmp/a.jpg',
      retryBaseMs: 0,
      onProgress: (value) => progress.push(value),
    });
    expect(result.fileID).toBe('cloud://env/source.jpg');
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(uploadFile.mock.calls.map(([value]) => value.cloudPath)).toEqual([
      'profiles/alias/activity-image/id.jpg',
      'profiles/alias/activity-image/id.jpg',
    ]);
    expect(progress).toEqual([20, 20]);
  });

  it('超时会 abort 并报告 upload 阶段', async () => {
    vi.useFakeTimers();
    const abort = vi.fn();
    const promise = uploadWithRetry({
      cloud: { uploadFile: vi.fn(() => ({ abort })) },
      cloudPath: 'path',
      filePath: 'file',
      timeoutMs: 10,
      maxAttempts: 1,
    });
    const rejection = expect(promise).rejects.toMatchObject({
      stage: 'upload',
      code: 'MEDIA_UPLOAD_FAILED',
    });
    await vi.advanceTimersByTimeAsync(11);
    await rejection;
    expect(abort).toHaveBeenCalledOnce();
  });

  it('授权、上传、登记返回 canonical fileId，登记失败清理 source', async () => {
    const deleteFile = vi.fn(async () => ({}));
    const authorize = vi.fn(async () => 'profiles/alias/club-avatar/id.jpg');
    const finalize = vi.fn(async () => ({
      canonicalFileId: 'cloud://env/profile-canonical/id.jpg',
    }));
    const success = await uploadMedia({
      filePath: '/tmp/club.jpg',
      category: 'club-avatar',
      requestId: 'request_12345678',
      cloud: {
        uploadFile: task(({ success }) => success({ fileID: 'cloud://env/source.jpg' })),
        deleteFile,
      },
      authorize,
      finalize,
    });
    expect(success.canonicalFileId).toContain('profile-canonical');
    expect(authorize).toHaveBeenCalledWith('club-avatar', 'request_12345678', 'jpg');
    expect(finalize).toHaveBeenCalledWith(
      'cloud://env/source.jpg',
      'club-avatar',
      'request_12345678',
    );

    await expect(
      uploadMedia({
        filePath: '/tmp/club.jpg',
        category: 'club-cover',
        requestId: 'request_87654321',
        cloud: {
          uploadFile: task(({ success }) => success({ fileID: 'cloud://env/orphan.jpg' })),
          deleteFile,
        },
        authorize,
        finalize: async () => {
          throw new Error('registry unavailable');
        },
      }),
    ).rejects.toBeInstanceOf(MediaUploadError);
    expect(deleteFile).toHaveBeenCalledWith({ fileList: ['cloud://env/orphan.jpg'] });
  });
});
