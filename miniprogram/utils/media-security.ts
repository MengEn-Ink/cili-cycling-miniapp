import type { MediaCheckStatus } from '../models';

type WaitForMediaPassOptions = {
  fileId: string;
  generation: number;
  maxAttempts?: number;
  getStatus(fileId: string): Promise<MediaCheckStatus>;
  retry(fileId: string, generation: number): Promise<MediaCheckStatus>;
  sleep?(milliseconds: number): Promise<void>;
  onPending?(attempt: number, maxAttempts: number): void;
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function securityError(status: MediaCheckStatus['securityStatus']): Error {
  const code =
    {
      missing: 'MEDIA_SECURITY_REQUIRED',
      pending: 'MEDIA_SECURITY_PENDING',
      retryable: 'MEDIA_SECURITY_RETRY_REQUIRED',
      pass: 'MEDIA_SECURITY_REQUIRED',
      review: 'MEDIA_SECURITY_REVIEW_REQUIRED',
      risky: 'MEDIA_SECURITY_RISKY',
    }[status] || 'MEDIA_SECURITY_REQUIRED';
  return Object.assign(new Error('图片安全审核未通过'), { code });
}

export async function waitForMediaPass({
  fileId,
  generation,
  maxAttempts = 5,
  getStatus,
  retry,
  sleep = wait,
  onPending,
}: WaitForMediaPassOptions): Promise<MediaCheckStatus> {
  if (!fileId || !Number.isSafeInteger(generation) || generation < 1 || maxAttempts < 1)
    throw Object.assign(new Error('图片审核参数无效'), { code: 'MEDIA_CHECK_INPUT_INVALID' });
  let retried = false;
  let current = await getStatus(fileId);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (current.generation !== generation)
      throw Object.assign(new Error('资料版本已变化'), {
        code: 'PROFILE_GENERATION_MISMATCH',
      });
    if (current.securityStatus === 'pass') return current;
    if (current.securityStatus === 'retryable' && !retried) {
      retried = true;
      current = await retry(fileId, generation);
      continue;
    }
    if (['missing', 'review', 'risky'].includes(current.securityStatus))
      throw securityError(current.securityStatus);
    if (attempt === maxAttempts) throw securityError(current.securityStatus);
    onPending?.(attempt, maxAttempts);
    await sleep(Math.min(250 * 2 ** (attempt - 1), 1_500));
    current = await getStatus(fileId);
  }
  throw securityError('pending');
}
