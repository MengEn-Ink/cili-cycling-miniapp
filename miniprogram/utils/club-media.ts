import { rideService } from '../services/ride-service';
import { uploadMedia } from './media-upload';

export type ClubMediaKind = 'avatar' | 'cover';

const MEDIA_SPEC = {
  avatar: { cropScale: '1:1', width: 512, height: 512 },
  cover: { cropScale: '16:9', width: 1280, height: 720 },
} as const;

type MediaSpec = (typeof MEDIA_SPEC)[ClubMediaKind];
type Scope = NonNullable<Parameters<typeof wx.createCanvasContext>[1]>;
type TempCallbacks = {
  success: (result: { tempFilePath?: string }) => void;
  fail: (error: unknown) => void;
};

const errorText = (error: unknown) => String((error as { errMsg?: string })?.errMsg || '');
const mediaError = (message: string, cause: unknown) =>
  Object.assign(new Error(message), { cause });

export const mediaCancelled = (error: unknown) => /cancel/i.test(errorText(error));

function tempFile(invoke: (callbacks: TempCallbacks) => void) {
  return new Promise<string>((resolve, reject) =>
    invoke({
      success: ({ tempFilePath }) => (tempFilePath ? resolve(tempFilePath) : reject(new Error())),
      fail: reject,
    }),
  );
}

async function hasExactSize(src: string, { width, height }: MediaSpec) {
  try {
    const info = await new Promise<{ width?: number; height?: number }>((resolve, reject) =>
      wx.getImageInfo({ src, success: resolve, fail: reject }),
    );
    return info.width === width && info.height === height;
  } catch {
    return false;
  }
}

async function canvasResize(src: string, { width, height }: MediaSpec, scope: Scope) {
  const context = wx.createCanvasContext('clubMediaCanvas', scope);
  context.clearRect(0, 0, 1280, 720);
  context.drawImage(src, 0, 0, width, height);
  await new Promise<void>((resolve) => context.draw(false, resolve));
  return tempFile((callbacks) =>
    wx.canvasToTempFilePath(
      {
        canvasId: 'clubMediaCanvas',
        x: 0,
        y: 0,
        width,
        height,
        destWidth: width,
        destHeight: height,
        fileType: 'jpg',
        quality: 0.9,
        ...callbacks,
      },
      scope,
    ),
  );
}

export async function chooseAndUploadClubMedia(
  kind: ClubMediaKind,
  scope: Scope,
  onProgress?: (progress: number) => void,
) {
  const [file] = (
    await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    })
  ).tempFiles;
  if (!file?.tempFilePath) return null;
  if (typeof file.size === 'number' && file.size > 5_242_880) throw new Error('图片不能超过 5MB');

  const spec = MEDIA_SPEC[kind];
  if (typeof wx.cropImage !== 'function')
    throw new Error('当前微信版本不支持图片裁剪，请升级微信后重试');

  let cropped: string;
  try {
    cropped = await tempFile((callbacks) =>
      wx.cropImage({ src: file.tempFilePath, cropScale: spec.cropScale, ...callbacks }),
    );
  } catch (error) {
    if (mediaCancelled(error)) return null;
    throw mediaError('图片裁剪失败，请重新选择', error);
  }

  let filePath = cropped;
  let useCanvas = true;
  if (typeof wx.compressImage === 'function') {
    try {
      const compressed = await tempFile((callbacks) =>
        wx.compressImage({
          src: cropped,
          quality: 90,
          compressedWidth: spec.width,
          compressedHeight: spec.height,
          ...callbacks,
        }),
      );
      useCanvas = !(await hasExactSize(compressed, spec));
      if (!useCanvas) filePath = compressed;
    } catch (error) {
      if (
        !/not support|unsupported|compressed(Width|Height)|invalid.*(width|height)/i.test(
          errorText(error),
        )
      )
        throw mediaError('图片压缩失败，请重新选择', error);
    }
  }
  if (useCanvas) {
    try {
      filePath = await canvasResize(cropped, spec, scope);
    } catch {
      // 忽略并回退裁剪图。
    }
  }

  const uploaded = await uploadMedia({
    filePath: filePath,
    category: kind === 'avatar' ? 'club-avatar' : 'club-cover',
    authorize: (category, requestId, extension) =>
      rideService.issueMediaUploadPath(category, requestId, extension as 'jpg'),
    finalize: (fileId, category, requestId) =>
      rideService.finalizeMediaUpload(fileId, category, requestId),
    onProgress,
  });
  return { fileId: uploaded.canonicalFileId, previewUrl: filePath };
}
