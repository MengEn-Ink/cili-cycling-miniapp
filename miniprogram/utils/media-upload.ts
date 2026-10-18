import { reportMediaDiagnostic } from './media-diagnostic';

export type MediaCategory =
  | 'profile-avatar'
  | 'profile-background'
  | 'activity-image'
  | 'activity-group-qr'
  | 'activity-route-preview'
  | 'club-avatar'
  | 'club-cover';
export type MediaUploadStage = 'authorize' | 'upload' | 'finalize' | 'cleanup';

export type UploadTaskLike = {
  abort?(): void;
  onProgressUpdate?(callback: (event: { progress?: unknown }) => void): void;
  offProgressUpdate?(callback: (event: { progress?: unknown }) => void): void;
  then?: Promise<{ fileID: string }>['then'];
};

type CloudUploadApi = {
  uploadFile(options: {
    cloudPath: string;
    filePath: string;
    success?: (result: { fileID: string }) => void;
    fail?: (error: unknown) => void;
  }): UploadTaskLike;
  deleteFile?(options: { fileList: string[] }): Promise<unknown>;
};

export class MediaUploadError extends Error {
  readonly stage: MediaUploadStage;
  readonly code: string;
  readonly cause?: unknown;

  constructor(stage: MediaUploadStage, code: string, cause?: unknown) {
    const value = cause && typeof cause === 'object' ? (cause as Record<string, unknown>) : {};
    const detail = typeof value.message === 'string' ? value.message : value.errMsg;
    super(typeof detail === 'string' && detail ? detail : '媒体上传失败');
    this.name = 'MediaUploadError';
    this.stage = stage;
    this.code = code;
    this.cause = cause;
  }
}

const errorDetail = (error: unknown) => {
  const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  return `${String(value.code || '')} ${String(value.errMsg || '')} ${String(value.message || '')}`;
};

export const isRetryableUploadError = (error: unknown) =>
  /network|timeout|timed\s*out|connection|socket|econn|enet|eai_again|request:\s*fail|网络|连接中断/i.test(
    errorDetail(error),
  );

const retryReason = (error: unknown) => {
  const detail = errorDetail(error);
  if (/timeout|timed\s*out|MEDIA_UPLOAD_TIMEOUT/i.test(detail)) return 'timeout';
  if (/network|connection|socket|econn|enet|eai_again|request:\s*fail|网络|连接中断/i.test(detail))
    return 'network';
  return 'unknown';
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function uploadAttempt(
  cloud: CloudUploadApi,
  input: { cloudPath: string; filePath: string },
  timeoutMs: number,
  onProgress?: (progress: number) => void,
  onTask?: (task: UploadTaskLike | null) => void,
): Promise<{ fileID: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let task: UploadTaskLike | undefined;
    let lastProgress = -1;
    const progress = (event: { progress?: unknown }) => {
      const next = Math.max(0, Math.min(100, Math.round(Number(event.progress))));
      if (!settled && Number.isFinite(next) && next > lastProgress) {
        lastProgress = next;
        onProgress?.(next);
      }
    };
    const finish = (handler: (value: any) => void, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      task?.offProgressUpdate?.(progress);
      onTask?.(null);
      handler(value);
    };
    const timer = setTimeout(() => {
      try {
        task?.abort?.();
      } catch {
        // 超时仍必须结算；abort 异常不覆盖统一超时错误。
      }
      finish(reject, Object.assign(new Error('upload timeout'), { code: 'MEDIA_UPLOAD_TIMEOUT' }));
    }, timeoutMs);
    try {
      task = cloud.uploadFile({
        ...input,
        success: (result) => finish(resolve, result),
        fail: (error) => finish(reject, error),
      });
      onTask?.(task);
      task?.onProgressUpdate?.(progress);
      if (typeof task?.then === 'function') {
        void Promise.resolve(task).then(
          (result) => finish(resolve, result),
          (error) => finish(reject, error),
        );
      }
    } catch (error) {
      finish(reject, error);
    }
  });
}

export async function uploadWithRetry(input: {
  cloud?: CloudUploadApi;
  cloudPath: string;
  filePath: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  onProgress?: (progress: number) => void;
  onRetry?: (attempt: number, maxAttempts: number) => void;
  onTask?: (task: UploadTaskLike | null) => void;
}): Promise<{ fileID: string }> {
  const cloud = input.cloud || (wx.cloud as unknown as CloudUploadApi | undefined);
  if (!cloud?.uploadFile) throw new MediaUploadError('upload', 'MEDIA_CLOUD_UNAVAILABLE');
  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);
  const timeoutMs = Math.max(1, input.timeoutMs ?? 20_000);
  const retryBaseMs = Math.max(0, input.retryBaseMs ?? 250);
  let generation = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = ++generation;
    try {
      const result = await uploadAttempt(
        cloud,
        { cloudPath: input.cloudPath, filePath: input.filePath },
        timeoutMs,
        (value) => {
          if (current === generation) input.onProgress?.(value);
        },
        input.onTask,
      );
      if (!result?.fileID)
        throw Object.assign(new Error('empty fileID'), { code: 'MEDIA_UPLOAD_EMPTY' });
      reportMediaDiagnostic('media-upload', 'upload-success', { attempt, total: maxAttempts });
      return result;
    } catch (error) {
      generation += 1;
      if (attempt >= maxAttempts || !isRetryableUploadError(error))
        throw error instanceof MediaUploadError
          ? error
          : new MediaUploadError('upload', 'MEDIA_UPLOAD_FAILED', error);
      input.onRetry?.(attempt + 1, maxAttempts);
      reportMediaDiagnostic('media-upload', 'upload-retry', {
        attempt: attempt + 1,
        total: maxAttempts,
        reason: retryReason(error),
      });
      await wait(retryBaseMs * 2 ** (attempt - 1));
    }
  }
  throw new MediaUploadError('upload', 'MEDIA_UPLOAD_FAILED');
}

const newRequestId = () => `media_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

export async function cleanupUploadedFile(
  fileId: string,
  cloud = wx.cloud as unknown as CloudUploadApi,
) {
  if (!fileId || typeof cloud?.deleteFile !== 'function') return false;
  try {
    await cloud.deleteFile({ fileList: [fileId] });
    return true;
  } catch (error) {
    reportMediaDiagnostic('media-upload', 'cleanup-failed', {
      reason: errorDetail(error).slice(0, 80),
    });
    return false;
  }
}

export async function uploadMedia(input: {
  filePath: string;
  category: MediaCategory;
  requestId?: string;
  extension?: 'jpg' | 'png' | 'webp';
  cloud?: CloudUploadApi;
  authorize: (category: MediaCategory, requestId: string, extension: string) => Promise<string>;
  finalize: (
    sourceFileId: string,
    category: MediaCategory,
    requestId: string,
  ) => Promise<{ canonicalFileId?: string } | void>;
  onProgress?: (progress: number) => void;
  onRetry?: (attempt: number, maxAttempts: number) => void;
  onTask?: (task: UploadTaskLike | null) => void;
  timeoutMs?: number;
}): Promise<{ sourceFileId: string; canonicalFileId: string; requestId: string }> {
  const requestId = input.requestId || newRequestId();
  let cloudPath: string;
  try {
    cloudPath = await input.authorize(input.category, requestId, input.extension || 'jpg');
  } catch (error) {
    throw new MediaUploadError('authorize', 'MEDIA_AUTHORIZE_FAILED', error);
  }
  let uploaded: { fileID: string };
  try {
    uploaded = await uploadWithRetry({
      cloud: input.cloud,
      cloudPath,
      filePath: input.filePath,
      timeoutMs: input.timeoutMs,
      onProgress: input.onProgress,
      onRetry: input.onRetry,
      onTask: input.onTask,
    });
  } catch (error) {
    if (error instanceof MediaUploadError) throw error;
    throw new MediaUploadError('upload', 'MEDIA_UPLOAD_FAILED', error);
  }
  try {
    const registered = await input.finalize(uploaded.fileID, input.category, requestId);
    const canonicalFileId = registered?.canonicalFileId;
    if (typeof canonicalFileId !== 'string' || !canonicalFileId.startsWith('cloud://'))
      throw Object.assign(new Error('canonical fileID missing'), {
        code: 'MEDIA_CANONICAL_MISSING',
      });
    return { sourceFileId: uploaded.fileID, canonicalFileId, requestId };
  } catch (error) {
    await cleanupUploadedFile(
      uploaded.fileID,
      input.cloud || (wx.cloud as unknown as CloudUploadApi),
    );
    throw new MediaUploadError('finalize', 'MEDIA_FINALIZE_FAILED', error);
  }
}
