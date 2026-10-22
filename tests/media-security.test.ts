import { describe, expect, it, vi } from 'vitest';
import { waitForMediaPass } from '../miniprogram/utils/media-security';

const status = (securityStatus: string, generation = 3) =>
  ({
    mediaId: 'media-1',
    fileId: 'cloud://env/source.jpg',
    canonicalFileId: 'cloud://env/canonical.jpg',
    category: 'profile-avatar',
    generation,
    securityStatus,
    traceId: 'trace-1',
    retryable: securityStatus === 'retryable',
    activated: false,
  }) as any;

describe('媒体异步审核轮询', () => {
  it('pending 有限等待后通过', async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(status('pending'))
      .mockResolvedValueOnce(status('pass'));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForMediaPass({
        fileId: 'cloud://env/canonical.jpg',
        generation: 3,
        getStatus,
        retry: vi.fn(),
        sleep,
      }),
    ).resolves.toMatchObject({ securityStatus: 'pass' });
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('retryable 只重提一次并继续轮询', async () => {
    const retry = vi.fn().mockResolvedValue(status('pending'));
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(status('retryable'))
      .mockResolvedValueOnce(status('pass'));

    await waitForMediaPass({
      fileId: 'cloud://env/canonical.jpg',
      generation: 3,
      getStatus,
      retry,
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('risky 立即失败且不继续查询', async () => {
    const getStatus = vi.fn().mockResolvedValue(status('risky'));
    await expect(
      waitForMediaPass({
        fileId: 'cloud://env/canonical.jpg',
        generation: 3,
        getStatus,
        retry: vi.fn(),
        sleep: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_SECURITY_RISKY' });
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('达到轮询上限后保持 fail closed', async () => {
    const getStatus = vi.fn().mockResolvedValue(status('pending'));
    await expect(
      waitForMediaPass({
        fileId: 'cloud://env/canonical.jpg',
        generation: 3,
        maxAttempts: 3,
        getStatus,
        retry: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_SECURITY_PENDING' });
    expect(getStatus).toHaveBeenCalledTimes(3);
  });
});
